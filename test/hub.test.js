// -----------------------------------------------------------------------------
// The integration as Gladys sees it: the SDK's fake Gladys, the fake VeSync
// cloud, the real wiring (src/app.js). Discovery, the container's own polling
// timer (Gladys#3198), states published on change with a 12 h heartbeat,
// commands, scene triggers, transports, statuses — and quiet logs without a
// secret.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATE_HEARTBEAT_MS } from '../src/hub.js';
import { hashPassword } from '../src/vesync/client.js';
import { CONFIG, EMAIL, PASSWORD, createWorld } from './helpers/world.js';

/** Let the work started by a fired timer run to its end. */
async function settle() {
  for (let i = 0; i < 100; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function useClock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-13T08:00:00Z') });
}

/** The getXxxStatus / deviceDetail reads of one device, in order. */
function reads(fake, cid) {
  return fake.calls.filter(
    (call) =>
      call.body.cid === cid &&
      (call.path.endsWith('/deviceDetail') ||
        (call.path.endsWith('/bypassV2') && call.body.payload.method.startsWith('get'))),
  );
}

const feature = (device, key) =>
  device.features.find((item) => item.external_id === `${device.external_id}:${key}`);

test('start: the supported devices are discovered, the added ones read and published', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const { gladys, ids } = world;

  const discovered = gladys.fake.discoveredDevices;
  assert.equal(discovered.length, 7, 'the bulb and the LV-PUR131S are not supported');
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });

  const core = ids('purifier', 'cid-core400s');
  assert.equal(gladys.fake.lastState(core.feature('power')), 1);
  assert.equal(gladys.fake.lastState(core.feature('mode')), 'manual');
  assert.equal(gladys.fake.lastState(core.feature('fan_speed')), 1);
  assert.equal(gladys.fake.lastState(core.feature('pm25')), 3);
  assert.equal(gladys.fake.lastState(core.feature('filter_life')), 80);

  const humidifier = ids('humidifier', 'cid-oasis450');
  assert.equal(gladys.fake.lastState(humidifier.feature('humidity')), 50);
  assert.equal(gladys.fake.lastState(humidifier.feature('target_humidity')), '60');
  assert.equal(gladys.fake.lastState(humidifier.feature('water_tank')), 1);

  const plug = ids('outlet', 'cid-esw01');
  assert.equal(gladys.fake.lastState(plug.feature('active_power')), 20);
  assert.equal(gladys.fake.lastState(plug.feature('voltage')), 120);

  // Every device read is on the cloud: its badge says so.
  const transports = gladys.fake.transports.filter((item) => item.transport === 'cloud');
  assert.equal(transports.length, 7);
});

test('the container reads the added devices by itself, every period, without onPoll (Gladys#3198)', async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true, created: ['cid-core400s', 'cid-oasis1000'] });
  t.after(() => world.stop());
  const { fake } = world;

  assert.equal(reads(fake, 'cid-core400s').length, 1, 'read at once');
  assert.equal(reads(fake, 'cid-oasis1000').length, 1);
  assert.equal(
    reads(fake, 'cid-vital200s').length,
    0,
    'a device the user did not add is never read',
  );

  world.fake.details['cid-core400s'].result.result.air_quality_value = 42;
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(reads(fake, 'cid-core400s').length, 2, 'read again one period later, no onPoll');
  assert.equal(
    world.gladys.fake.lastState(world.ids('purifier', 'cid-core400s').feature('pm25')),
    42,
  );

  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(reads(fake, 'cid-core400s').length, 3);
  assert.equal(reads(fake, 'cid-oasis1000').length, 3);
});

test('the configured interval paces the timer', async (t) => {
  useClock(t);
  const world = await createWorld({
    timers: true,
    config: { poll_interval: 300 },
    created: ['cid-esw01'],
  });
  t.after(() => world.stop());
  t.mock.timers.tick(299_000);
  await settle();
  assert.equal(reads(world.fake, 'cid-esw01').length, 1);
  t.mock.timers.tick(1_000);
  await settle();
  assert.equal(reads(world.fake, 'cid-esw01').length, 2);
});

test("the core's onPoll is a fallback: no second read within a period", async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true, created: ['cid-core400s'] });
  t.after(() => world.stop());
  const device = world.device('cid-core400s');

  t.mock.timers.tick(10_000);
  assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
  assert.equal(reads(world.fake, 'cid-core400s').length, 1, 'the timer read it 10 s ago');

  // The timer stalls: the core takes over, once a period.
  world.app.stop();
  t.mock.timers.tick(40_000);
  await world.gladys.fake.poll(device);
  assert.equal(reads(world.fake, 'cid-core400s').length, 1, '50 s: within 90 % of a period');
  t.mock.timers.tick(5_000);
  await world.gladys.fake.poll(device);
  assert.equal(reads(world.fake, 'cid-core400s').length, 2);
});

test('only the changed states are published, and every value again after 12 h', async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true, created: ['cid-esw10'] });
  t.after(() => world.stop());
  const posts = () => world.gladys.fake.bodies('POST', '/state').length;

  const first = posts();
  assert.ok(first >= 1);
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(posts(), first, 'nothing changed: nothing sent');

  world.fake.details['cid-esw10'].result.result.enabled = false;
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(posts(), first + 1);
  assert.equal(world.gladys.fake.lastState(world.ids('outlet', 'cid-esw10').feature('power')), 0);

  // A value that never changes is sent again after 12 h (Gladys: "no recent value" past 48 h).
  const before = posts();
  t.mock.timers.tick(STATE_HEARTBEAT_MS);
  await settle();
  assert.equal(posts(), before + 1);
});

test('a device added to Gladys gets all its states at once, and the widget a refresh', async (t) => {
  const world = await createWorld({ created: [] });
  t.after(() => world.stop());
  const { gladys, fake } = world;
  assert.equal(reads(fake, 'cid-vital200s').length, 0);

  const [vital] = gladys.fake.discoveredDevices.filter((device) =>
    device.external_id.endsWith(':cid-vital200s'),
  );
  await gladys.fake.deviceCreated(vital);
  assert.equal(reads(fake, 'cid-vital200s').length, 1);
  const ids = world.ids('purifier', 'cid-vital200s');
  assert.equal(gladys.fake.lastState(ids.feature('pm25')), 3);
  assert.equal(gladys.fake.lastState(ids.feature('fan_speed')), 2);
  assert.ok(gladys.fake.widgetRefreshes.includes('air_quality'));
  assert.ok(
    gladys.fake.transports.some(
      (item) => item.device_external_id === ids.device && item.transport === 'cloud',
    ),
  );
});

test('commands: the request is sent, the new state published at once, one info line', async (t) => {
  const world = await createWorld({ created: ['cid-core400s', 'cid-oasis1000'] });
  t.after(() => world.stop());
  const { gladys, fake } = world;
  const core = world.device('cid-core400s');
  const ids = world.ids('purifier', 'cid-core400s');

  assert.deepEqual(await gladys.fake.setValue(core, feature(core, 'mode'), 'sleep'), {
    success: true,
  });
  assert.deepEqual(fake.calls.at(-1).body.payload, {
    method: 'setPurifierMode',
    source: 'APP',
    data: { mode: 'sleep' },
  });
  assert.equal(gladys.fake.lastState(ids.feature('mode')), 'sleep');

  await gladys.fake.setValue(core, feature(core, 'fan_speed'), 4);
  assert.deepEqual(fake.calls.at(-1).body.payload.data, { id: 0, level: 4, type: 'wind' });
  assert.equal(gladys.fake.lastState(ids.feature('mode')), 'manual', 'a speed is manual mode');
  assert.equal(gladys.fake.lastState(ids.feature('fan_speed')), 4);

  await gladys.fake.setValue(core, feature(core, 'child_lock'), 0);
  assert.deepEqual(fake.calls.at(-1).body.payload.data, { child_lock: false });

  const oasis = world.device('cid-oasis1000');
  await gladys.fake.setValue(oasis, feature(oasis, 'target_humidity'), '55');
  assert.deepEqual(fake.calls.at(-1).body.payload, {
    method: 'setTargetHumidity',
    source: 'APP',
    data: { targetHumidity: 55 },
  });
  assert.equal(
    gladys.fake.lastState(world.ids('humidifier', 'cid-oasis1000').feature('target_humidity')),
    '55',
  );

  const commandLines = world.infoLines().filter((line) => / = /.test(line.text));
  assert.equal(commandLines.length, 4, 'one info line per command');
  assert.match(commandLines[0].text, /\[INFO\].*Salon: mode = sleep/);
});

test('a refused command fails with a message for the user, in the configured language', async (t) => {
  const world = await createWorld({ created: ['cid-core200s', 'cid-oasis450'] });
  t.after(() => world.stop());
  const { gladys, fake } = world;

  // The Core 200S has no auto mode: refused before any request.
  const core200 = world.device('cid-core200s');
  const before = fake.calls.length;
  const ack = await gladys.fake.setValue(core200, feature(core200, 'mode'), 'auto');
  assert.equal(ack.success, false);
  assert.match(ack.error, /^La commande a échoué : Valeur refusée par cet appareil : auto/);
  assert.equal(fake.calls.length, before);

  // A humidifier gone offline: the badge goes unreachable.
  fake.deviceErrors.set('cid-oasis450', -11300030);
  const oasis = world.device('cid-oasis450');
  const offline = await gladys.fake.setValue(oasis, feature(oasis, 'power'), 1);
  assert.equal(offline.success, false);
  assert.match(offline.error, /n'est pas connecté au cloud VeSync/);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
});

test('"filter to replace" fires once when the filter reaches the threshold, re-armed by a new filter', async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true, created: ['cid-vital200s'] });
  t.after(() => world.stop());
  const raw = world.fake.details['cid-vital200s'].result.result;
  const events = () =>
    world.gladys.fake.sceneEvents.filter((event) => event.key === 'filter_change_needed');
  const cycle = async (filter) => {
    raw.filterLifePercent = filter;
    t.mock.timers.tick(60_000);
    await settle();
  };

  await cycle(11);
  assert.equal(events().length, 0);
  await cycle(10);
  assert.equal(events().length, 1);
  assert.deepEqual(events()[0].data, {
    device: world.ids('purifier', 'cid-vital200s').device,
    device_name: 'Chambre',
    filter_life: 10,
  });
  await cycle(9);
  await cycle(8);
  assert.equal(events().length, 1, 'once per filter');
  await cycle(100);
  await cycle(10);
  assert.equal(events().length, 2, 'a new filter re-arms the trigger');
});

test('"water tank empty" fires once per empty tank, never on the first read', async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true, created: ['cid-oasis450', 'cid-oasis1000'] });
  t.after(() => world.stop());
  const classic = world.fake.details['cid-oasis450'].result.result;
  const v2 = world.fake.details['cid-oasis1000'].result.result;
  const events = () =>
    world.gladys.fake.sceneEvents.filter((event) => event.key === 'water_tank_empty');
  const cycle = async () => {
    t.mock.timers.tick(60_000);
    await settle();
  };

  classic.water_lacks = true;
  v2.waterLacksState = 1;
  await cycle();
  assert.equal(events().length, 2);
  assert.deepEqual(
    events()
      .map((event) => event.data.device_name)
      .sort(),
    ['Chambre bébé', 'Humidificateur salon'],
  );
  assert.equal(
    world.gladys.fake.lastState(world.ids('humidifier', 'cid-oasis450').feature('water_tank')),
    0,
  );
  await cycle();
  assert.equal(events().length, 2, 'still empty: no new event');
  classic.water_lacks = false;
  await cycle();
  classic.water_lacks = true;
  await cycle();
  assert.equal(events().length, 3);
});

test('a tank already empty at start fires nothing', async (t) => {
  const world = await createWorld({ created: ['cid-oasis450'], connect: false });
  t.after(() => world.stop());
  world.fake.details['cid-oasis450'].result.result.water_lacks = true;
  await world.gladys.connect();
  assert.equal(world.gladys.fake.sceneEvents.length, 0);
});

test('an offline device: unreachable badge, one warning, one info line when it is back', async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true, created: ['cid-esw01'] });
  t.after(() => world.stop());
  const { gladys, fake } = world;
  const id = world.ids('outlet', 'cid-esw01').device;
  const cycle = async () => {
    t.mock.timers.tick(60_000);
    await settle();
  };

  fake.deviceErrors.set('cid-esw01', -11300030);
  await cycle();
  await cycle();
  await cycle();
  const badges = gladys.fake.transports.filter((item) => item.device_external_id === id);
  assert.equal(badges.at(-1).transport, 'unreachable');
  assert.equal(
    badges.filter((item) => item.transport === 'unreachable').length,
    1,
    'published once',
  );

  fake.deviceErrors.delete('cid-esw01');
  await cycle();
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');

  const lines = world.infoLines().map((line) => line.text);
  assert.equal(lines.filter((line) => /Prise lampe: offline/.test(line)).length, 1);
  assert.equal(lines.filter((line) => /Prise lampe: back online/.test(line)).length, 1);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true }, 'the cloud itself answers');
});

test('a v1 plug the cloud says offline is unreachable too', async (t) => {
  const world = await createWorld({ created: ['cid-esw01'], connect: false });
  t.after(() => world.stop());
  world.fake.details['cid-esw01'] = {
    code: 0,
    msg: null,
    result: { deviceStatus: 'off', connectionStatus: 'offline', activeTime: 0 },
  };
  await world.gladys.connect();
  assert.equal(world.gladys.fake.transports.at(-1).transport, 'unreachable');
});

test('the cloud down: status with the reason, once; back: connected', async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true, created: ['cid-core400s', 'cid-esw10'] });
  t.after(() => world.stop());
  const { gladys, fake } = world;
  const down = () => ({
    throws: Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }),
  });

  for (let i = 0; i < 3; i += 1) {
    fake.queue('/bypassV2', down());
    fake.queue('/bypassV2', down());
    t.mock.timers.tick(60_000);
    await settle();
  }
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /VeSync est injoignable : .*ECONNRESET/);
  assert.equal(
    gladys.fake.connectionStatuses.filter((item) => item.connected === false).length,
    1,
    'said once',
  );
  const warnings = world.lines.filter((line) => /\[WARN\].*VeSync unreachable/.test(line.text));
  assert.equal(warnings.length, 1, 'one warning, then debug');
  const core = world.ids('purifier', 'cid-core400s').device;
  const badge = () =>
    gladys.fake.transports.filter((item) => item.device_external_id === core).at(-1).transport;
  assert.equal(badge(), 'unreachable', 'the cloud down: every device is unreachable');

  t.mock.timers.tick(60_000);
  await settle();
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(badge(), 'cloud', 'back on the cloud');
  assert.equal(
    world.infoLines().filter((line) => /VeSync answers again/.test(line.text)).length,
    1,
  );
});

test('a wrong password: said in the status, then no request until a new configuration', async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true, vesync: { password: 'changed-in-the-app' } });
  t.after(() => world.stop());
  const { gladys, fake } = world;
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /refusé l'e-mail ou le mot de passe/);

  const count = fake.calls.length;
  for (let i = 0; i < 5; i += 1) {
    t.mock.timers.tick(60_000);
    await settle();
  }
  assert.equal(fake.calls.length, count, 'no login attempt every minute');

  await gladys.fake.configUpdated({ ...CONFIG, password: 'changed-in-the-app' });
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('not configured: a status that says what to do, no request', async (t) => {
  const world = await createWorld({ config: { email: '', password: '' } });
  t.after(() => world.stop());
  assert.equal(world.fake.calls.length, 0);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(
    world.gladys.fake.connectionStatus.message.fr,
    /Saisissez l'e-mail et le mot de passe/,
  );
  const ack = await world.gladys.fake.action('test_connection');
  assert.equal(ack.success, false, 'the action fails: shown in red');
});

test('"Test the connection" lists the account, its unsupported models, its region', async (t) => {
  const world = await createWorld({ config: { region: 'us' } });
  t.after(() => world.stop());
  const ack = await world.gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  const message = ack.data.message;
  assert.match(
    message.fr,
    /Connecté \(serveur EU\) : 9 appareil\(s\) sur le compte, 7 pris en charge\./,
  );
  assert.match(message.fr, /Non pris en charge : ESL100, LV-PUR131S\./);
  assert.match(message.fr, /Le compte est sur le serveur EU : choisissez cette région\./);
  assert.match(message.de, /Verbunden/);
  assert.match(message.es, /Conectado/);
  assert.match(message.en, /Connected/);
});

test('"Test the connection" with a wrong password fails, in red, with the reason', async (t) => {
  const world = await createWorld({ vesync: { password: 'other' } });
  t.after(() => world.stop());
  const ack = await world.gladys.fake.action('test_connection');
  assert.equal(ack.success, false);
  assert.equal(ack.error, "VeSync a refusé l'e-mail ou le mot de passe.");
});

test('quiet logs: a normal cycle writes nothing at info, and no line carries a secret', async (t) => {
  useClock(t);
  const world = await createWorld({ timers: true });
  t.after(() => world.stop());
  const startLines = world.infoLines().length;
  assert.ok(startLines <= 3, `start: ${startLines} lines at info`);

  for (let i = 0; i < 3; i += 1) {
    world.fake.details['cid-core400s'].result.result.air_quality_value = 10 + i;
    t.mock.timers.tick(60_000);
    await settle();
  }
  assert.equal(world.infoLines().length, startLines, 'reads and published states stay in debug');
  assert.ok(
    world.lines.some((line) => /\[DEBUG\]/.test(line.text)),
    'LOG_LEVEL=debug shows them',
  );

  // Failures too: a wrong password, a command, an unreachable cloud.
  world.fake.queue('/bypassV2', { throws: new Error('fetch failed') });
  t.mock.timers.tick(60_000);
  await settle();
  await world.gladys.fake.action('test_connection');
  const core = world.device('cid-core400s');
  await world.gladys.fake.setValue(core, feature(core, 'power'), 0);

  const everything = world.lines.map((line) => line.text).join('\n');
  for (const secret of [PASSWORD, hashPassword(PASSWORD), EMAIL, 'token-1', 'token-2']) {
    assert.ok(!everything.includes(secret), `"${secret}" appears in the logs`);
  }
});

test('a new language republishes the devices with their names and option labels', async (t) => {
  const world = await createWorld({ created: [] });
  t.after(() => world.stop());
  const { gladys } = world;
  const names = () => gladys.fake.discoveredDevices[0].features.map((item) => item.name);
  assert.ok(names().includes('Vitesse du ventilateur'));
  await gladys.fake.configUpdated({ ...CONFIG, language: 'de' });
  assert.ok(names().includes('Lüfterstufe'));
  const mode = gladys.fake.discoveredDevices[0].features.find((item) =>
    item.external_id.endsWith(':mode'),
  );
  assert.deepEqual(
    mode.supported_options.map((option) => option.label),
    ['Auto', 'Manuell', 'Schlaf'],
  );
});

test('a scan reads the account again: a new device appears', async (t) => {
  const world = await createWorld({ created: [] });
  t.after(() => world.stop());
  world.fake.devices.push({ ...world.fake.devices[0], cid: 'cid-new', deviceName: 'Nouveau' });
  await world.gladys.fake.scanRequest();
  assert.equal(world.gladys.fake.discoveredDevices.length, 8);
});
