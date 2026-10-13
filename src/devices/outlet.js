// -----------------------------------------------------------------------------
// Etekcity smart plugs: 10 A ESW01/ESW03 (EU and US) and 15 A ESW15 (`v1`
// API, with power metering), ESW10 (`esw10`, on/off only).
//
// Features (keys are forever: they are part of the external ids):
//   power         switch/binary
//   active_power  switch/power, W          metering models
//   voltage       switch/voltage, V        metering models
//   energy_today  switch/energy, kWh       metering models; back to 0 every day
//
// The 10 A outlets answer `power` and `voltage` as strings ("20", "120"): they
// are parsed. `energy` is the energy of the current day (Home Assistant names
// it "Energy use today").
//
// Field and payload names come from pyvesync (`devices/vesyncoutlet.py`,
// `models/outlet_models.py`, MIT).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { namesFor } from '../i18n.js';
import { binary, invalidValue, toNumber } from './common.js';

export const KIND = 'outlet';

export const FEATURE = {
  POWER: 'power',
  ACTIVE_POWER: 'active_power',
  VOLTAGE: 'voltage',
  ENERGY_TODAY: 'energy_today',
};

/** The Gladys features of one outlet. */
export function buildFeatures(ids, model, language) {
  const names = namesFor(language);
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
  ];
  if (model.energy) {
    features.push(
      {
        name: names.active_power,
        external_id: ids.feature(FEATURE.ACTIVE_POWER),
        category: CATEGORIES.SWITCH,
        type: TYPES.SWITCH.POWER,
        unit: UNITS.WATT,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 3680,
      },
      {
        name: names.voltage,
        external_id: ids.feature(FEATURE.VOLTAGE),
        category: CATEGORIES.SWITCH,
        type: TYPES.SWITCH.VOLTAGE,
        unit: UNITS.VOLT,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 300,
      },
      {
        name: names.energy_today,
        external_id: ids.feature(FEATURE.ENERGY_TODAY),
        category: CATEGORIES.SWITCH,
        type: TYPES.SWITCH.ENERGY,
        unit: UNITS.KILOWATT_HOUR,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 100,
      },
    );
  }
  return features;
}

/** The state of an outlet, from its `deviceDetail` result or its `getSwitch` inner result. */
export function parseState(model, raw) {
  if (model.api === 'esw10') {
    return { on: binary(raw.enabled) };
  }
  return {
    on: binary(raw.deviceStatus),
    // A v1 outlet answers its own cloud link: "offline" while it is unplugged.
    offline: raw.connectionStatus === 'offline' ? true : undefined,
    power: round(toNumber(raw.power), 1),
    voltage: round(toNumber(raw.voltage), 1),
    energyToday: round(toNumber(raw.energy), 3),
  };
}

function round(value, digits) {
  if (value === undefined || value < 0) {
    return undefined;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** The value of each feature, as Gladys stores it. */
export function featureValues(state) {
  return {
    [FEATURE.POWER]: state.on === undefined ? undefined : state.on ? 1 : 0,
    [FEATURE.ACTIVE_POWER]: state.power,
    [FEATURE.VOLTAGE]: state.voltage,
    [FEATURE.ENERGY_TODAY]: state.energyToday,
  };
}

/** Read the device. */
export async function read(client, device, model) {
  if (model.api === 'esw10') {
    return parseState(model, await client.bypassV2(device, 'getSwitch', { id: 0 }));
  }
  return parseState(model, await client.deviceV1(device, 'deviceDetail'));
}

/** Run a command; resolves the state fields the device now has. */
export async function command({ client, device, model }, featureKey, value) {
  if (featureKey !== FEATURE.POWER) {
    throw invalidValue(featureKey);
  }
  const on = Number(value) === 1;
  if (model.api === 'esw10') {
    await client.bypassV2(device, 'setSwitch', { id: 0, enabled: on });
  } else {
    await client.deviceV1(device, 'deviceStatus', { status: on ? 'on' : 'off' });
  }
  return { on };
}
