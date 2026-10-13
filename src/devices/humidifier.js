// -----------------------------------------------------------------------------
// Levoit humidifiers: Classic 200S/300S, Dual 200S, LV600S (A602S), OasisMist
// 450S (`classic` API), and OasisMist 1000S, LV600S (A603S), Superior 6000S,
// Sprout (`v2` API).
//
// Features (keys are forever: they are part of the external ids):
//   power            switch/binary
//   humidity         humidity-sensor/decimal, %
//   target_humidity  text/select "30 %" to "80 %"
//   mode             text/select                    auto, manual, sleep, humidity
//   mist_level       fan/speed 1..levels
//   water_tank       level-sensor/liquid-state      0 = low (empty), 1 = normal
//
// Why `text/select` for the target humidity: Gladys has no humidity setpoint
// (`SetpointDeviceFeature` serves thermostats, air conditioners, water heaters
// only), and a read-only number could not be changed from a dashboard or a
// scene. The options are every percent the devices accept (pyvesync
// `target_minmax`), so a value set from the VeSync app always has its option.
// Why `level-sensor/liquid-state` for the tank: it is the core's "liquid
// level" state (LOW 0, NORMAL 1, HIGH 2), labelled "Faible"/"Normal".
//
// Field and payload names come from pyvesync (`devices/vesynchumidifier.py`,
// `models/humidifier_models.py`, MIT).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { MODE_LABELS, namesFor } from '../i18n.js';
import { TARGET_HUMIDITY, apiMode, modeKey, modeKeys } from '../vesync/models.js';
import { binary, invalidValue, toInteger, toNumber } from './common.js';

export const KIND = 'humidifier';

// A level above the model's maximum is shown as it is (display-only bounds).
const MAX_READ_LEVEL = 12;

export const FEATURE = {
  POWER: 'power',
  HUMIDITY: 'humidity',
  TARGET_HUMIDITY: 'target_humidity',
  MODE: 'mode',
  MIST_LEVEL: 'mist_level',
  WATER_TANK: 'water_tank',
};

/** Values of `level-sensor/liquid-state` (core LIQUID_STATE). */
export const LIQUID_STATE = { LOW: 0, NORMAL: 1 };

/** "45 %", the label of a target humidity option. */
function percentLabel(value, language) {
  return language === 'en' ? `${value}%` : `${value} %`;
}

/** The Gladys features of one humidifier. */
export function buildFeatures(ids, model, language) {
  const names = namesFor(language);
  const labels = MODE_LABELS[language] ?? MODE_LABELS.fr;
  const targets = [];
  for (let value = TARGET_HUMIDITY.min; value <= TARGET_HUMIDITY.max; value += 1) {
    targets.push({
      value: String(value),
      label: percentLabel(value, language),
      sort_order: value - TARGET_HUMIDITY.min,
    });
  }
  return [
    {
      name: names.power,
      external_id: ids.feature(FEATURE.POWER),
      category: CATEGORIES.SWITCH,
      type: TYPES.SWITCH.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    },
    {
      name: names.humidity,
      external_id: ids.feature(FEATURE.HUMIDITY),
      category: CATEGORIES.HUMIDITY_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.PERCENT,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 100,
    },
    {
      name: names.target_humidity,
      external_id: ids.feature(FEATURE.TARGET_HUMIDITY),
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.SELECT,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 0,
      supported_options: targets,
    },
    {
      name: names.mode,
      external_id: ids.feature(FEATURE.MODE),
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.SELECT,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 0,
      supported_options: modeKeys(model).map((key, index) => ({
        value: key,
        label: labels[key],
        sort_order: index,
      })),
    },
    {
      name: names.mist_level,
      external_id: ids.feature(FEATURE.MIST_LEVEL),
      category: CATEGORIES.FAN,
      type: TYPES.FAN.SPEED,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 1,
      max: model.mistLevels,
    },
    {
      name: names.water_tank,
      external_id: ids.feature(FEATURE.WATER_TANK),
      category: CATEGORIES.LEVEL_SENSOR,
      type: TYPES.LEVEL_SENSOR.LIQUID_STATE,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 2,
    },
  ];
}

/** The state of a humidifier, from its `getHumidifierStatus` inner result. */
export function parseState(model, raw) {
  if (model.api === 'classic') {
    return {
      on: binary(raw.enabled),
      mode: modeKey(model, raw.mode),
      humidity: toInteger(raw.humidity, 0, 100),
      targetHumidity: target(raw.configuration?.auto_target_humidity),
      mistLevel: toInteger(raw.mist_virtual_level, 1, MAX_READ_LEVEL),
      waterLacks: binary(raw.water_lacks),
    };
  }
  return {
    on: binary(raw.powerSwitch),
    mode: modeKey(model, raw.workMode),
    humidity: toInteger(raw.humidity, 0, 100),
    targetHumidity: target(raw.targetHumidity),
    mistLevel: toInteger(raw.virtualLevel, 1, MAX_READ_LEVEL),
    waterLacks: binary(raw.waterLacksState),
  };
}

function target(value) {
  const number = toNumber(value);
  // 0 is what the classic models answer before a target was ever set.
  return toInteger(number, TARGET_HUMIDITY.min, TARGET_HUMIDITY.max);
}

/** The value of each feature, as Gladys stores it. */
export function featureValues(state) {
  return {
    [FEATURE.POWER]: state.on === undefined ? undefined : state.on ? 1 : 0,
    [FEATURE.HUMIDITY]: state.humidity,
    [FEATURE.TARGET_HUMIDITY]:
      state.targetHumidity === undefined ? undefined : { text: String(state.targetHumidity) },
    [FEATURE.MODE]: state.mode === undefined ? undefined : { text: state.mode },
    [FEATURE.MIST_LEVEL]: state.mistLevel,
    [FEATURE.WATER_TANK]:
      state.waterLacks === undefined
        ? undefined
        : state.waterLacks
          ? LIQUID_STATE.LOW
          : LIQUID_STATE.NORMAL,
  };
}

/** Read the device. */
export async function read(client, device, model) {
  return parseState(model, await client.bypassV2(device, 'getHumidifierStatus'));
}

/** Run a command; resolves the state fields the device now has. */
export async function command({ client, device, model }, featureKey, value) {
  const classic = model.api === 'classic';
  switch (featureKey) {
    case FEATURE.POWER: {
      const on = Number(value) === 1;
      await client.bypassV2(
        device,
        'setSwitch',
        classic ? { enabled: on, id: 0 } : { powerSwitch: on ? 1 : 0, switchIdx: 0 },
      );
      return { on };
    }
    case FEATURE.MODE: {
      const key = String(value);
      if (!modeKeys(model).includes(key)) {
        throw invalidValue(value);
      }
      const mode = apiMode(model, key);
      await client.bypassV2(device, 'setHumidityMode', classic ? { mode } : { workMode: mode });
      return { mode: key, on: true };
    }
    case FEATURE.MIST_LEVEL: {
      const level = Number(value);
      if (!Number.isInteger(level) || level < 1 || level > model.mistLevels) {
        throw invalidValue(value);
      }
      if (classic) {
        await client.bypassV2(device, 'setVirtualLevel', { id: 0, level, type: 'mist' });
      } else {
        await client.bypassV2(device, model.mistMethod ?? 'setVirtualLevel', {
          levelIdx: 0,
          virtualLevel: level,
          levelType: 'mist',
        });
      }
      return { mistLevel: level };
    }
    case FEATURE.TARGET_HUMIDITY: {
      // "45", or "45 %" typed in a scene: the number is what counts.
      const humidity = Number.parseInt(String(value), 10);
      if (
        !Number.isInteger(humidity) ||
        humidity < TARGET_HUMIDITY.min ||
        humidity > TARGET_HUMIDITY.max
      ) {
        throw invalidValue(value);
      }
      await client.bypassV2(
        device,
        'setTargetHumidity',
        classic ? { target_humidity: humidity } : { targetHumidity: humidity },
      );
      return { targetHumidity: humidity };
    }
    default:
      throw invalidValue(featureKey);
  }
}
