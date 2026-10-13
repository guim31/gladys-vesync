// -----------------------------------------------------------------------------
// Levoit air purifiers: Core 200S/300S/400S/600S (`core` API), Vital 100S/200S,
// EverestAir and Sprout Air (`v2` API).
//
// Features (keys are forever: they are part of the external ids):
//   power        switch/binary                     on/off
//   mode         text/select                       auto, manual, sleep, pet, turbo
//   fan_speed    fan/speed 1..levels               setting it switches to manual
//   pm25         pm25-sensor/decimal µg/m³         models with a particle sensor
//   filter_life  hepa-filter-monitoring/filter-life-remaining, %
//   child_lock   child-lock/binary
//   display      switch/binary                     the screen setting
//
// Why `text/select` for the mode: Gladys has no purifier mode, and `fan/mode`
// (off/low/medium/high/auto) is rendered by the 5.2 front without honouring
// `supported_options`, so sleep, pet and turbo could not be offered. The mode
// keys are stable, their labels follow the configured language.
//
// Field and payload names come from pyvesync (`devices/vesyncpurifier.py`,
// `models/purifier_models.py`, MIT).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { MODE_LABELS, namesFor } from '../i18n.js';
import { modeKeys } from '../vesync/models.js';
import { binary, invalidValue, toInteger } from './common.js';

export const KIND = 'purifier';

const MAX_READ_LEVEL = 12;

export const FEATURE = {
  POWER: 'power',
  MODE: 'mode',
  FAN_SPEED: 'fan_speed',
  PM25: 'pm25',
  FILTER_LIFE: 'filter_life',
  CHILD_LOCK: 'child_lock',
  DISPLAY: 'display',
};

/** The Gladys features of one purifier. */
export function buildFeatures(ids, model, language) {
  const names = namesFor(language);
  const labels = MODE_LABELS[language] ?? MODE_LABELS.fr;
  const features = [
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
      name: names.fan_speed,
      external_id: ids.feature(FEATURE.FAN_SPEED),
      category: CATEGORIES.FAN,
      type: TYPES.FAN.SPEED,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 1,
      max: model.levels,
    },
  ];
  if (model.airQuality) {
    features.push({
      name: names.pm25,
      external_id: ids.feature(FEATURE.PM25),
      category: CATEGORIES.PM25_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.MICROGRAM_PER_CUBIC_METER,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1000,
    });
  }
  features.push(
    {
      name: names.filter_life,
      external_id: ids.feature(FEATURE.FILTER_LIFE),
      category: CATEGORIES.HEPA_FILTER_MONITORING,
      type: TYPES.FILTER_MONITORING.FILTER_LIFE_REMAINING,
      unit: UNITS.PERCENT,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 100,
    },
    {
      name: names.child_lock,
      external_id: ids.feature(FEATURE.CHILD_LOCK),
      category: CATEGORIES.CHILD_LOCK,
      type: TYPES.CHILD_LOCK.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 1,
    },
    {
      name: names.display,
      external_id: ids.feature(FEATURE.DISPLAY),
      category: CATEGORIES.SWITCH,
      type: TYPES.SWITCH.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 1,
    },
  );
  return features;
}

/**
 * The state of a purifier, from its `getPurifierStatus` inner result.
 * A field the answer lacks stays undefined: nothing is published for it.
 */
export function parseState(model, raw) {
  if (model.api === 'core') {
    const mode = model.modes.includes(raw.mode) ? raw.mode : undefined;
    const display = raw.configuration?.display ?? raw.display;
    return {
      on: binary(raw.enabled),
      mode,
      fanLevel: level(raw.level),
      pm25: model.airQuality ? toInteger(raw.air_quality_value, 0, 1000) : undefined,
      airQuality: toInteger(raw.air_quality, 1, 4),
      filterLife: toInteger(raw.filter_life, 0, 100),
      childLock: binary(raw.child_lock),
      display: binary(display),
    };
  }
  const mode = model.modes.includes(raw.workMode) ? raw.workMode : undefined;
  // In manual mode the setting is what the slider shows; in the other modes
  // the device picks its speed (255 = stopped, pyvesync).
  const fanLevel = mode === 'manual' ? level(raw.manualSpeedLevel) : level(raw.fanSpeedLevel);
  return {
    on: binary(raw.powerSwitch),
    mode,
    fanLevel,
    pm25: model.airQuality ? toInteger(raw.PM25, 0, 1000) : undefined,
    airQuality: toInteger(raw.AQLevel, 1, 4),
    filterLife: toInteger(raw.filterLifePercent, 0, 100),
    childLock: binary(raw.childLockSwitch),
    display: binary(raw.screenSwitch),
  };
}

// 0 and 255 mean "stopped" (pyvesync): no speed to show. A level above the
// model's maximum is shown as it is: the slider bounds are for display only.
function level(value) {
  return toInteger(value, 1, MAX_READ_LEVEL);
}

/** The value of each feature, as Gladys stores it. */
export function featureValues(state) {
  return {
    [FEATURE.POWER]: bit(state.on),
    [FEATURE.MODE]: state.mode === undefined ? undefined : { text: state.mode },
    [FEATURE.FAN_SPEED]: state.fanLevel,
    [FEATURE.PM25]: state.pm25,
    [FEATURE.FILTER_LIFE]: state.filterLife,
    [FEATURE.CHILD_LOCK]: bit(state.childLock),
    [FEATURE.DISPLAY]: bit(state.display),
  };
}

function bit(value) {
  return value === undefined ? undefined : value ? 1 : 0;
}

/** Read the device. */
export async function read(client, device, model) {
  return parseState(model, await client.bypassV2(device, 'getPurifierStatus'));
}

/**
 * Run a command; resolves the state fields the device now has, so they are
 * published at once instead of a poll later.
 * @param {object} context { client, device, model, state } — `state` is the last read
 */
export async function command({ client, device, model, state }, featureKey, value) {
  const core = model.api === 'core';
  switch (featureKey) {
    case FEATURE.POWER: {
      const on = Number(value) === 1;
      await client.bypassV2(
        device,
        'setSwitch',
        core ? { enabled: on, id: 0 } : { powerSwitch: on ? 1 : 0, switchIdx: 0 },
      );
      return { on };
    }
    case FEATURE.MODE: {
      const mode = String(value);
      if (!model.modes.includes(mode)) {
        throw invalidValue(value);
      }
      if (mode === 'manual') {
        // The device has no "manual" mode command: setting a speed is how the
        // app switches to it (pyvesync does the same).
        return setSpeed(client, device, model, state?.fanLevel ?? 1);
      }
      await client.bypassV2(device, 'setPurifierMode', core ? { mode } : { workMode: mode });
      return { mode, on: true };
    }
    case FEATURE.FAN_SPEED:
      return setSpeed(client, device, model, value);
    case FEATURE.CHILD_LOCK: {
      const on = Number(value) === 1;
      await client.bypassV2(
        device,
        'setChildLock',
        core ? { child_lock: on } : { childLockSwitch: on ? 1 : 0 },
      );
      return { childLock: on };
    }
    case FEATURE.DISPLAY: {
      const on = Number(value) === 1;
      await client.bypassV2(
        device,
        'setDisplay',
        core ? { state: on } : { screenSwitch: on ? 1 : 0 },
      );
      return { display: on };
    }
    default:
      throw invalidValue(featureKey);
  }
}

async function setSpeed(client, device, model, value) {
  const speed = Number(value);
  if (!Number.isInteger(speed) || speed < 1 || speed > model.levels) {
    throw invalidValue(value);
  }
  await client.bypassV2(
    device,
    'setLevel',
    model.api === 'core'
      ? { id: 0, level: speed, type: 'wind' }
      : { levelIdx: 0, manualSpeedLevel: speed, levelType: 'wind' },
  );
  return { fanLevel: speed, mode: 'manual', on: true };
}
