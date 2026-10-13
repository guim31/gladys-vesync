// -----------------------------------------------------------------------------
// Reading the devices: every recorded answer of pyvesync's and Home
// Assistant's tests, parsed into the values Gladys receives.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES } from '../src/devices/index.js';
import { LIQUID_STATE } from '../src/devices/humidifier.js';
import { findModel, MODELS, modeKeys } from '../src/vesync/models.js';
import {
  FIXTURE_TYPES,
  HOME_ASSISTANT,
  innerResult,
  pyvesyncDetail,
} from './helpers/fakeVesync.js';

function parse(deviceType, answer) {
  const model = findModel(deviceType);
  assert.ok(model, `${deviceType} is supported`);
  const module = MODULES[model.kind];
  const state = module.parseState(model, innerResult(answer));
  return { state, values: module.featureValues(state), model };
}

const fromPyvesync = (key) => parse(FIXTURE_TYPES[key], pyvesyncDetail(key));

test('Core purifiers (pyvesync answers)', () => {
  const core200 = fromPyvesync('Core200S');
  assert.deepEqual(core200.values, {
    power: 1,
    mode: { text: 'manual' },
    fan_speed: 1,
    pm25: undefined,
    filter_life: 80,
    child_lock: 1,
    display: 1,
  });
  for (const key of ['Core300S', 'Core400S', 'Core600S']) {
    const { values, state } = fromPyvesync(key);
    assert.equal(values.pm25, 3, key);
    assert.equal(state.airQuality, 2, `${key}: "good"`);
    assert.equal(values.filter_life, 80, key);
  }
});

test('Vital, EverestAir and Sprout Air purifiers (pyvesync answers)', () => {
  for (const key of ['LAP-V102S', 'LAP-V201S', 'EL551S']) {
    const { values, state } = fromPyvesync(key);
    assert.equal(values.power, 1, key);
    assert.deepEqual(values.mode, { text: 'manual' }, key);
    // Manual: the slider shows the setting (manualSpeedLevel), not the motor.
    assert.equal(values.fan_speed, 2, key);
    assert.equal(values.pm25, 3, key);
    assert.equal(values.filter_life, 80, key);
    assert.equal(values.child_lock, 1, `${key}: 1 or "on"`);
    assert.equal(values.display, 1, key);
    assert.equal(state.airQuality, 2, key);
  }
  const sprout = fromPyvesync('LAP-B851S-WUS');
  assert.equal(sprout.values.pm25, 3);
  assert.equal(sprout.values.filter_life, undefined, 'the Sprout Air reports no filter life');
});

test('purifiers (Home Assistant answers)', () => {
  const core = parse('LAP-C401S-WJP', HOME_ASSISTANT.purifier);
  assert.deepEqual(core.values, {
    power: 1,
    mode: { text: 'manual' },
    fan_speed: 1,
    pm25: 5,
    filter_life: 99,
    child_lock: 0,
    display: 1,
  });
  assert.equal(core.state.airQuality, 1);

  const vital = parse('LAP-V201S-WUS', HOME_ASSISTANT.purifierV2);
  assert.equal(vital.values.fan_speed, 1, 'manualSpeedLevel, the motor being at 0');
  assert.equal(vital.values.pm25, 5);
  assert.equal(vital.values.child_lock, 0);
});

test('a purifier the device stopped: 255 is no speed (pyvesync)', () => {
  const model = findModel('LAP-V201S-WEU');
  const state = MODULES.purifier.parseState(model, {
    powerSwitch: 0,
    workMode: 'auto',
    fanSpeedLevel: 255,
    manualSpeedLevel: 3,
  });
  assert.equal(state.on, false);
  assert.equal(state.fanLevel, undefined);
  assert.equal(state.mode, 'auto');
});

test('an unknown mode is not published', () => {
  const model = findModel('Core400S');
  const state = MODULES.purifier.parseState(model, { enabled: true, mode: 'turbo' });
  assert.equal(state.mode, undefined);
  assert.equal(MODULES.purifier.featureValues(state).mode, undefined);
});

test('classic humidifiers (pyvesync answers)', () => {
  for (const key of [
    'Classic200S',
    'Classic300S',
    'Dual200S',
    'LUH-A602S-WUS',
    'LUH-O451S-WEU',
    'LUH-O451S-WUS',
  ]) {
    const { values } = fromPyvesync(key);
    assert.deepEqual(
      values,
      {
        power: 1,
        humidity: 50,
        target_humidity: { text: '60' },
        mode: { text: 'manual' },
        mist_level: 3,
        water_tank: LIQUID_STATE.NORMAL,
      },
      key,
    );
  }
});

test('V2 humidifiers (pyvesync answers)', () => {
  for (const key of [
    'LUH-A603S-WUS',
    'LUH-M101S-WEUR',
    'LUH-M101S-WUS',
    'LEH-S601S',
    'LEH-B381S',
  ]) {
    const { values } = fromPyvesync(key);
    assert.deepEqual(
      values,
      {
        power: 1,
        humidity: 50,
        target_humidity: { text: '60' },
        mode: { text: 'manual' },
        mist_level: 3,
        water_tank: LIQUID_STATE.NORMAL,
      },
      key,
    );
  }
});

test('humidifiers (Home Assistant answers): empty tank, "humidity" mode', () => {
  const classic = parse('Classic200S', HOME_ASSISTANT.humidifier);
  assert.deepEqual(classic.values, {
    power: 1,
    humidity: 35,
    target_humidity: { text: '40' },
    mode: { text: 'manual' },
    mist_level: 6,
    water_tank: LIQUID_STATE.LOW,
  });

  const superior = parse('LEH-S601S-WUS', HOME_ASSISTANT.humidifier6000s);
  assert.deepEqual(superior.values.mode, { text: 'humidity' });
  assert.equal(superior.values.humidity, 36);
  assert.deepEqual(superior.values.target_humidity, { text: '40' });
  assert.equal(superior.values.water_tank, LIQUID_STATE.NORMAL);
});

test('the API words of the modes are mapped back to stable keys', () => {
  const lv600 = findModel('LUH-A603S-WUS');
  assert.equal(MODULES.humidifier.parseState(lv600, { workMode: 'humidity' }).mode, 'auto');
  const superior = findModel('LEH-S601S-WEUR');
  assert.equal(MODULES.humidifier.parseState(superior, { workMode: 'autoPro' }).mode, 'auto');
  assert.equal(MODULES.humidifier.parseState(superior, { workMode: 'humidity' }).mode, 'humidity');
});

test('a target of 0 (never set) is not published', () => {
  const model = findModel('Classic300S');
  const state = MODULES.humidifier.parseState(model, {
    configuration: { auto_target_humidity: 0 },
  });
  assert.equal(state.targetHumidity, undefined);
});

test('outlets (pyvesync answers): numbers sent as strings are parsed', () => {
  assert.deepEqual(fromPyvesync('ESW03').values, {
    power: 1,
    active_power: 20,
    voltage: 120,
    energy_today: 10,
  });
  assert.deepEqual(fromPyvesync('ESW15-USA').values, {
    power: 1,
    active_power: 20,
    voltage: 120,
    energy_today: 10,
  });
  assert.deepEqual(fromPyvesync('ESW10-USA').values, {
    power: 1,
    active_power: undefined,
    voltage: undefined,
    energy_today: undefined,
  });
  const offline = parse('ESW01-EU', {
    result: { deviceStatus: 'off', connectionStatus: 'offline', power: '0', voltage: '0' },
  });
  assert.equal(offline.state.offline, true);
});

test('every model has its modes labelled and a level range', () => {
  for (const model of MODELS) {
    if (model.kind === 'outlet') {
      continue;
    }
    assert.ok(modeKeys(model).length >= 2, model.name);
    assert.ok((model.levels ?? model.mistLevels) >= 2, model.name);
  }
  // Every deviceType belongs to one model only.
  const types = MODELS.flatMap((model) => model.types);
  assert.equal(new Set(types).size, types.length);
});

test('commands refuse what the device does not accept, without a request', async () => {
  const requests = [];
  const client = { bypassV2: async (...args) => requests.push(args) };
  const purifier = findModel('Core200S');
  const context = { client, device: { cid: 'x' }, model: purifier, state: {} };
  await assert.rejects(MODULES.purifier.command(context, 'mode', 'auto'), {
    kind: 'invalid_value',
  });
  await assert.rejects(MODULES.purifier.command(context, 'fan_speed', 4), {
    kind: 'invalid_value',
  });
  const humidifier = findModel('Classic300S');
  const hContext = { client, device: { cid: 'y' }, model: humidifier, state: {} };
  await assert.rejects(MODULES.humidifier.command(hContext, 'target_humidity', '85'), {
    kind: 'invalid_value',
  });
  await assert.rejects(MODULES.humidifier.command(hContext, 'mist_level', 10), {
    kind: 'invalid_value',
  });
  assert.equal(requests.length, 0);

  // "45 %" typed in a scene is 45.
  await MODULES.humidifier.command(hContext, 'target_humidity', '45 %');
  assert.deepEqual(requests[0].slice(1), ['setTargetHumidity', { target_humidity: 45 }]);
});
