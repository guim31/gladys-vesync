// -----------------------------------------------------------------------------
// The VeSync client against the fake cloud: login (two steps, cross-region),
// token kept in /data and renewed, error codes, and the requests themselves,
// compared field by field with the ones pyvesync recorded in its tests
// (test/fixtures/pyvesync/requests/, from src/tests/api/ of pyvesync).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  accountKey,
  createClient,
  hashPassword,
  initialCountry,
  normalizeListedDevice,
} from '../src/vesync/client.js';
import { errorKind, VeSyncError } from '../src/vesync/errors.js';
import { findModel } from '../src/vesync/models.js';
import { createMemoryStore, createSessionStore } from '../src/vesync/session.js';
import { MODULES } from '../src/devices/index.js';
import { FIXTURE_TYPES, HOME_ASSISTANT, createFakeVesync, listed } from './helpers/fakeVesync.js';

const EMAIL = 'user@example.com';
const PASSWORD = 'p4ssw0rd';

function setup({ region = 'eu', accountRegion = 'eu', store = createMemoryStore(), ...rest } = {}) {
  const fake = createFakeVesync({ email: EMAIL, password: PASSWORD, accountRegion, ...rest });
  const client = createClient({
    email: EMAIL,
    password: PASSWORD,
    region,
    store,
    fetchImpl: fake.fetch,
    timeZone: 'Europe/Paris',
  });
  return { fake, client, store };
}

test('the login sends the e-mail and the MD5 of the password, never the password', async () => {
  const { fake, client } = setup();
  const session = await client.login();
  assert.equal(session.token, 'token-1');
  assert.equal(session.region, 'eu');

  const [auth] = fake.callsTo('/authByPWDOrOTM');
  assert.equal(auth.origin, 'https://smartapi.vesync.eu');
  assert.equal(auth.body.email, EMAIL);
  assert.equal(auth.body.password, hashPassword(PASSWORD));
  assert.ok(!JSON.stringify(fake.calls).includes(PASSWORD), 'the clear password never leaves');
  // The fields pyvesync sends (RequestGetTokenModel).
  assert.deepEqual(Object.keys(auth.body).sort(), [
    'acceptLanguage',
    'accountID',
    'appID',
    'authProtocolType',
    'clientInfo',
    'clientType',
    'clientVersion',
    'debugMode',
    'email',
    'method',
    'osInfo',
    'password',
    'sourceAppID',
    'terminalId',
    'timeZone',
    'token',
    'traceId',
    'userCountryCode',
  ]);
  assert.equal(auth.body.method, 'authByPWDOrOTM');
  assert.equal(auth.body.userCountryCode, 'FR', 'Europe/Paris → France, on the EU server');
  assert.match(auth.body.terminalId, /^2[0-9a-f]{32}$/);

  const [exchange] = fake.callsTo('/loginByAuthorizeCode4Vesync');
  assert.equal(exchange.body.method, 'loginByAuthorizeCode4Vesync');
  assert.equal(exchange.body.authorizeCode, 'AUTHORIZATION_CODE');
  assert.equal(exchange.body.bizToken, undefined);
  assert.equal(exchange.body.terminalId, auth.body.terminalId);
});

test('MD5 is the hash pyvesync sends', () => {
  assert.equal(hashPassword('PASSWORD'), '319f4d26e3c536b5dd871bb2c52e3178');
});

test('an account on the other server: the exchange is retried there with the bizToken', async () => {
  const { fake, client } = setup({ region: 'us', accountRegion: 'eu' });
  const session = await client.login();
  assert.equal(session.region, 'eu');
  assert.equal(session.countryCode, 'FR');
  assert.equal(session.regionChanged, true);

  const exchanges = fake.callsTo('/loginByAuthorizeCode4Vesync');
  assert.equal(exchanges.length, 2);
  assert.equal(exchanges[0].origin, 'https://smartapi.vesync.com');
  assert.equal(exchanges[1].origin, 'https://smartapi.vesync.eu');
  assert.equal(exchanges[1].body.bizToken, 'BIZ_TOKEN');
  assert.equal(exchanges[1].body.regionChange, 'lastRegion');
  assert.equal(exchanges[1].body.userCountryCode, 'FR');

  // And the devices are then read on the account's server.
  await client.listDevices();
  assert.equal(fake.callsTo('/devices')[0].origin, 'https://smartapi.vesync.eu');
});

test('a wrong password is an auth error, tried once', async () => {
  const fake = createFakeVesync({ email: EMAIL, password: 'other' });
  const client = createClient({
    email: EMAIL,
    password: PASSWORD,
    region: 'eu',
    fetchImpl: fake.fetch,
  });
  await assert.rejects(client.listDevices(), (err) => {
    assert.ok(err instanceof VeSyncError);
    assert.equal(err.kind, 'auth');
    assert.equal(err.code, -11201022);
    assert.ok(!err.message.includes(PASSWORD));
    return true;
  });
  assert.equal(fake.callsTo('/authByPWDOrOTM').length, 1);
});

test('an expired token logs in again, once, and the request is retried', async () => {
  const { fake, client } = setup({ devices: [listed('Core400S')] });
  await client.listDevices();
  fake.expireTokens();
  const devices = await client.listDevices();
  assert.equal(devices.length, 1);
  assert.equal(fake.callsTo('/loginByAuthorizeCode4Vesync').length, 2);
  assert.equal(fake.callsTo('/devices').at(-1).body.token, 'token-2');
});

test('the session is kept in /data and reused after a restart, for that account only', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'vesync-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createSessionStore(dir);
  const first = setup({ store, devices: [listed('Core400S')] });
  await first.client.listDevices();

  const file = join(dir, 'vesync-session.json');
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.account.token, 'token-1');
  assert.equal(saved.account.key, accountKey(EMAIL));
  assert.ok(!JSON.stringify(saved).includes(PASSWORD), 'the password is never written');
  assert.ok(!JSON.stringify(saved).includes(EMAIL), 'nor the e-mail');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(dir), ['vesync-session.json'], 'no temporary file left');

  // A restart: same file, a new client, which tries the saved token first.
  const fake = createFakeVesync({
    email: EMAIL,
    password: PASSWORD,
    devices: [listed('Core400S')],
    tokenPrefix: 'second',
  });
  const again = createClient({
    email: EMAIL,
    password: PASSWORD,
    region: 'eu',
    store: createSessionStore(dir),
    fetchImpl: fake.fetch,
  });
  // This fake never issued token-1: it answers -11001000, the client logs in again.
  await again.listDevices();
  const lists = fake.callsTo('/devices');
  assert.equal(lists[0].body.token, 'token-1', 'the saved token is tried first');
  assert.equal(lists[1].body.token, 'second-1');
  assert.equal(fake.callsTo('/authByPWDOrOTM').length, 1);

  // Another account never reuses it.
  const other = createFakeVesync({
    email: 'other@example.com',
    password: PASSWORD,
    tokenPrefix: 'other',
  });
  const otherClient = createClient({
    email: 'other@example.com',
    password: PASSWORD,
    region: 'eu',
    store: createSessionStore(dir),
    fetchImpl: other.fetch,
  });
  await otherClient.listDevices();
  assert.equal(other.calls[0].path, '/globalPlatform/api/accountAuth/v1/authByPWDOrOTM');
  assert.equal(other.callsTo('/devices')[0].body.token, 'other-1', 'its own fresh token');
});

test('an unreachable cloud, an HTTP error and an unreadable answer are typed errors', async () => {
  const { fake, client } = setup();
  fake.queue('/authByPWDOrOTM', {
    throws: Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
  });
  await assert.rejects(client.login(), {
    kind: 'network',
    message: 'login: VeSync unreachable (ENOTFOUND)',
  });
  fake.queue('/authByPWDOrOTM', { status: 503 });
  await assert.rejects(client.login(), { kind: 'http', status: 503 });
  fake.queue('/authByPWDOrOTM', { answer: { unexpected: true } });
  await assert.rejects(client.login(), { kind: 'bad_response' });
});

test('error codes are read like pyvesync does (last three digits dropped)', () => {
  assert.equal(errorKind(0), 'success');
  assert.equal(errorKind(-11201022), 'auth');
  assert.equal(errorKind(-11202000), 'auth');
  assert.equal(errorKind(-11001000), 'token');
  assert.equal(errorKind(-11001999), 'token');
  assert.equal(errorKind(-11260022), 'cross_region');
  assert.equal(errorKind(-11300030), 'offline');
  assert.equal(errorKind(-11000086), 'unknown');
  assert.equal(errorKind(-11302000), 'offline');
  assert.equal(errorKind(-16906000), 'rate_limit');
  assert.equal(errorKind(11607000), 'device', 'a humidifier fault');
  assert.equal(errorKind(11000000), 'request');
  assert.equal(errorKind('not a number'), 'unknown');
});

test('a bypassV2 error inside the result is an error too', async () => {
  const device = listed('Core400S');
  const { fake, client } = setup({ devices: [device] });
  fake.queue('/bypassV2', {
    answer: { code: 0, result: { code: -11300030, msg: 'device offline', result: {} } },
  });
  await assert.rejects(client.bypassV2(normalizeListedDevice(device), 'getPurifierStatus'), {
    kind: 'offline',
    code: -11300030,
  });
});

test('the first country sent follows the region and the time zone', () => {
  assert.equal(initialCountry('us', 'Europe/Paris'), 'US');
  assert.equal(initialCountry('eu', 'Europe/Berlin'), 'DE');
  assert.equal(initialCountry('eu', 'Europe/Madrid'), 'ES');
  assert.equal(initialCountry('eu', 'UTC'), 'FR');
});

test('the device list is flattened like pyvesync does (deviceProp)', () => {
  const devices = HOME_ASSISTANT.devices.result.list.map(normalizeListedDevice);
  const superior = devices.find((device) => device.deviceType === 'LEH-S601S-WUS');
  assert.equal(superior.connectionStatus, 'online');
  assert.equal(superior.deviceStatus, 'on');
  assert.equal(superior.cid, '6000s');
  assert.equal(superior.configModule, 'VS_WFON_AHM_LEH-S601S-WUS_US');
  assert.deepEqual(
    normalizeListedDevice({ uuid: 'uuid-1', deviceType: 'Core200S' }).cid,
    'uuid-1',
    'no cid: the uuid',
  );
});

// --- Parity with pyvesync's recorded requests --------------------------------

const REQUESTS_DIR = new URL('./fixtures/pyvesync/requests/', import.meta.url);

/** pyvesync method name → [feature key, value] in this integration (null: a read). */
const ACTIONS = {
  update: null,
  turn_on: ['power', 1],
  turn_off: ['power', 0],
  set_auto_mode: ['mode', 'auto'],
  set_sleep_mode: ['mode', 'sleep'],
  set_pet_mode: ['mode', 'pet'],
  set_turbo_mode: ['mode', 'turbo'],
  set_manual_mode: ['mode', 'manual'],
  turn_on_display: ['display', 1],
  turn_off_display: ['display', 0],
  set_fan_speed: ['fan_speed', (data) => data.level ?? data.manualSpeedLevel],
  set_mist_level: ['mist_level', (data) => data.level ?? data.virtualLevel],
  set_humidity: ['target_humidity', (data) => data.target_humidity ?? data.targetHumidity],
};

/** A client logged in with pyvesync's test identity, recording its requests. */
function recordingClient() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const { pathname } = new URL(url);
    const body = JSON.parse(init.body);
    calls.push({ path: pathname, body, headers: init.headers });
    if (pathname.endsWith('/authByPWDOrOTM')) {
      return answer({ code: 0, result: { accountID: 'sample_id', authorizeCode: 'code' } });
    }
    if (pathname.endsWith('/loginByAuthorizeCode4Vesync')) {
      return answer({
        code: 0,
        result: { accountID: 'sample_id', token: 'sample_tk', countryCode: 'US' },
      });
    }
    return answer({ code: 0, result: { code: 0, result: {} } });
  };
  const client = createClient({
    email: EMAIL,
    password: PASSWORD,
    region: 'us',
    fetchImpl,
    timeZone: 'America/New_York',
  });
  return { client, calls };
}

function answer(json) {
  return { status: 200, json: async () => json };
}

const files = (await readdir(REQUESTS_DIR)).filter((file) => file !== 'VeSync.json');

for (const file of files) {
  const fixtureKey = file.replace(/\.json$/, '');
  const deviceType = FIXTURE_TYPES[fixtureKey];
  test(`${fixtureKey}: every request matches pyvesync's, field by field`, async () => {
    const recorded = JSON.parse(await readFile(new URL(file, REQUESTS_DIR), 'utf8'));
    const model = findModel(deviceType);
    assert.ok(model, `${deviceType} is supported`);
    const module = MODULES[model.kind];
    const device = {
      cid: `${fixtureKey}-CID`,
      uuid: `${fixtureKey}-UUID`,
      configModule: 'ConfigModule',
      deviceType,
      deviceName: fixtureKey,
    };
    let compared = 0;
    for (const [action, expected] of Object.entries(recorded)) {
      if (!(action in ACTIONS)) {
        continue; // night lights, timers, warm mist, automatic stop: not driven here
      }
      const mapping = ACTIONS[action];
      if (mapping?.[0] === 'display' && model.kind !== 'purifier') {
        continue;
      }
      const { client, calls } = recordingClient();
      await client.login();
      calls.length = 0;
      if (mapping === null) {
        await module.read(client, device, model).catch(() => {});
      } else {
        const [featureKey, value] = mapping;
        const data = expected.json_object.payload?.data ?? {};
        await module.command(
          { client, device, model, state: {} },
          featureKey,
          typeof value === 'function' ? value(data) : value,
        );
      }
      assert.equal(calls.length, 1, `${action}: one request`);
      const [call] = calls;
      assert.equal(call.path, expected.url, `${action}: path`);
      assert.deepEqual(call.headers, expected.headers, `${action}: headers`);
      const body = { ...call.body, traceId: 'TRACE_ID' };
      assert.deepEqual(body, expected.json_object, `${action}: body`);
      compared += 1;
    }
    assert.ok(compared >= 3, `${fixtureKey}: only ${compared} requests compared`);
  });
}

test('the device list request matches pyvesync', async () => {
  const recorded = JSON.parse(await readFile(new URL('VeSync.json', REQUESTS_DIR), 'utf8'));
  const { client, calls } = recordingClient();
  await client.login();
  calls.length = 0;
  await client.listDevices();
  const expected = recorded.get_devices;
  assert.equal(calls[0].path, expected.url);
  assert.deepEqual(calls[0].headers, expected.headers);
  assert.deepEqual({ ...calls[0].body, traceId: 'TRACE_ID' }, expected.json_object);
});
