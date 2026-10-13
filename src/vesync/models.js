// -----------------------------------------------------------------------------
// The VeSync models this integration drives.
//
// Ported from pyvesync (`src/pyvesync/device_map.py`, MIT, Mark Perdue and
// contributors). The cloud names a device by its `deviceType` (`Core400S`,
// `LAP-V201S-WEU`...); one entry groups the types of one model and says which
// API family speaks to it:
//   - purifier `core`   : Core 200S/300S/400S/600S, snake_case fields
//                         (`enabled`, `filter_life`, `air_quality_value`);
//   - purifier `v2`     : Vital 100S/200S, EverestAir, Sprout Air, camelCase
//                         fields (`powerSwitch`, `filterLifePercent`, `PM25`);
//   - humidifier `classic`: Classic 200S/300S, Dual 200S, LV600S (A602S),
//                         OasisMist 450S, snake_case fields;
//   - humidifier `v2`   : OasisMist 1000S, LV600S (A603S), Superior 6000S,
//                         Sprout, camelCase fields;
//   - outlet `v1`       : Etekcity 10 A (ESW01/ESW03, EU and US) and 15 A,
//                         the `/cloud/v1/deviceManaged/deviceDetail` API;
//   - outlet `esw10`    : Etekcity ESW10, on/off only.
//
// A mode is a stable key (the `text/select` option value Gladys stores) mapped
// to the word the device API uses: `auto` is `humidity` on the LV600S A603S and
// `autoPro` on the Superior 6000S.
// -----------------------------------------------------------------------------

/** @typedef {'purifier'|'humidifier'|'outlet'} Kind */

const CLASSIC_MODES = { auto: 'auto', sleep: 'sleep', manual: 'manual' };

export const MODELS = [
  // --- Purifiers -------------------------------------------------------------
  {
    kind: 'purifier',
    api: 'core',
    name: 'Core 200S',
    types: ['Core200S', 'LAP-C201S-AUSR', 'LAP-C202S-WUSR'],
    // No particle sensor: no auto mode either.
    modes: ['manual', 'sleep'],
    levels: 3,
    airQuality: false,
  },
  {
    kind: 'purifier',
    api: 'core',
    name: 'Core 300S',
    types: ['Core300S', 'LAP-C301S-WJP', 'LAP-C302S-WUSB', 'LAP-C301S-WAAA', 'LAP-C302S-WGC'],
    modes: ['auto', 'manual', 'sleep'],
    levels: 3,
    airQuality: true,
  },
  {
    kind: 'purifier',
    api: 'core',
    name: 'Core 400S',
    types: ['Core400S', 'LAP-C401S-WJP', 'LAP-C401S-WUSR', 'LAP-C401S-WAAA'],
    modes: ['auto', 'manual', 'sleep'],
    levels: 4,
    airQuality: true,
  },
  {
    kind: 'purifier',
    api: 'core',
    name: 'Core 600S',
    types: ['Core600S', 'LAP-C601S-WUS', 'LAP-C601S-WUSR', 'LAP-C601S-WEU'],
    modes: ['auto', 'manual', 'sleep'],
    levels: 4,
    airQuality: true,
  },
  {
    kind: 'purifier',
    api: 'v2',
    name: 'Vital 100S',
    types: [
      'LAP-V102S-AASR',
      'LAP-V102S-WUS',
      'LAP-V102S-WEU',
      'LAP-V102S-AUSR',
      'LAP-V102S-WJP',
      'LAP-V102S-AJPR',
      'LAP-V102S-AEUR',
    ],
    modes: ['auto', 'manual', 'sleep', 'pet'],
    levels: 4,
    airQuality: true,
  },
  {
    kind: 'purifier',
    api: 'v2',
    name: 'Vital 200S',
    types: [
      'LAP-V201S-AASR',
      'LAP-V201S-WJP',
      'LAP-V201S-WEU',
      'LAP-V201S-WUS',
      'LAP-V201-AUSR',
      'LAP-V201S-AUSR',
      'LAP-V201S-AEUR',
    ],
    modes: ['auto', 'manual', 'sleep', 'pet'],
    levels: 4,
    airQuality: true,
  },
  {
    kind: 'purifier',
    api: 'v2',
    name: 'EverestAir',
    types: ['LAP-EL551S-AUS', 'LAP-EL551S-AEUR', 'LAP-EL551S-WEU', 'LAP-EL551S-WUS'],
    modes: ['auto', 'manual', 'sleep', 'turbo'],
    levels: 3,
    airQuality: true,
  },
  {
    kind: 'purifier',
    api: 'v2',
    name: 'Sprout Air',
    types: [
      'LAP-B851S-WEU',
      'LAP-B851S-WNA',
      'LAP-B851S-AEUR',
      'LAP-B851S-AUS',
      'LAP-B851S-WUS',
      'LAP-BAY-MAX01S',
    ],
    modes: ['auto', 'manual', 'sleep'],
    levels: 3,
    airQuality: true,
  },

  // --- Humidifiers -----------------------------------------------------------
  {
    kind: 'humidifier',
    api: 'classic',
    name: 'Classic 300S',
    types: ['Classic300S', 'LUH-A601S-WUSB', 'LUH-A601S-AUSW'],
    modes: CLASSIC_MODES,
    mistLevels: 9,
  },
  {
    kind: 'humidifier',
    api: 'classic',
    name: 'Classic 200S',
    types: ['Classic200S'],
    modes: { auto: 'auto', manual: 'manual' },
    mistLevels: 9,
  },
  {
    kind: 'humidifier',
    api: 'classic',
    name: 'Dual 200S',
    types: ['Dual200S', 'LUH-D301S-WUSR', 'LUH-D301S-WJP', 'LUH-D301S-WEU', 'LUH-D301S-KEUR'],
    modes: { auto: 'auto', manual: 'manual' },
    mistLevels: 2,
  },
  {
    kind: 'humidifier',
    api: 'classic',
    name: 'LV600S',
    types: [
      'LUH-A602S-WUSR',
      'LUH-A602S-WUS',
      'LUH-A602S-WEUR',
      'LUH-A602S-WEU',
      'LUH-A602S-WJP',
      'LUH-A602S-WUSC',
    ],
    modes: CLASSIC_MODES,
    mistLevels: 9,
  },
  {
    kind: 'humidifier',
    api: 'classic',
    name: 'OasisMist 450S',
    types: ['LUH-O451S-WEU'],
    modes: CLASSIC_MODES,
    mistLevels: 9,
  },
  {
    kind: 'humidifier',
    api: 'classic',
    name: 'OasisMist 450S',
    types: ['LUH-O451S-WUS', 'LUH-O451S-WUSR', 'LUH-O601S-WUS', 'LUH-O601S-KUS'],
    modes: { ...CLASSIC_MODES, humidity: 'humidity' },
    mistLevels: 9,
  },
  {
    kind: 'humidifier',
    api: 'v2',
    name: 'LV600S',
    types: ['LUH-A603S-WUS'],
    modes: { auto: 'humidity', sleep: 'sleep', manual: 'manual' },
    mistLevels: 9,
  },
  {
    kind: 'humidifier',
    api: 'v2',
    name: 'OasisMist 1000S',
    types: ['LUH-M101S-WUS', 'LUH-M101S-WUSR', 'LUH-M101S-WEUR'],
    modes: CLASSIC_MODES,
    mistLevels: 9,
    // pyvesync sends the mist level of this model under another method name.
    mistMethod: 'virtualLevel',
  },
  {
    kind: 'humidifier',
    api: 'v2',
    name: 'Superior 6000S',
    types: ['LEH-S601S-WUS', 'LEH-S601S-WUSR', 'LEH-S601S-WEUR', 'LEH-S602S-WUS'],
    modes: { auto: 'autoPro', sleep: 'sleep', humidity: 'humidity', manual: 'manual' },
    mistLevels: 9,
  },
  {
    kind: 'humidifier',
    api: 'v2',
    name: 'Sprout Humidifier',
    types: ['LEH-B381S-WUS', 'LEH-B381S-WEU'],
    modes: { auto: 'autoPro', sleep: 'sleep', manual: 'manual' },
    mistLevels: 2,
  },

  // --- Outlets ---------------------------------------------------------------
  {
    kind: 'outlet',
    api: 'v1',
    name: 'Etekcity 10A',
    types: ['ESW01-EU', 'ESW01-USA', 'ESW03-USA', 'ESW03-EU'],
    energy: true,
  },
  {
    kind: 'outlet',
    api: 'v1',
    name: 'Etekcity 15A',
    types: ['ESW15-USA'],
    energy: true,
  },
  {
    kind: 'outlet',
    api: 'esw10',
    name: 'Etekcity ESW10',
    types: ['ESW10-USA', 'ESW10-EU'],
    energy: false,
  },
];

/** The target humidity every supported humidifier accepts (pyvesync `target_minmax`). */
export const TARGET_HUMIDITY = { min: 30, max: 80 };

const BY_TYPE = new Map(MODELS.flatMap((model) => model.types.map((type) => [type, model])));

/**
 * The model of a VeSync `deviceType`, undefined when this integration does not
 * drive it (bulbs, fans, air fryers, older purifiers...).
 * @param {string} deviceType
 */
export function findModel(deviceType) {
  return BY_TYPE.get(deviceType);
}

/** The stable mode keys of a model, in display order. */
export function modeKeys(model) {
  return Array.isArray(model.modes) ? model.modes : Object.keys(model.modes);
}

/** The API word of a mode key. */
export function apiMode(model, key) {
  return Array.isArray(model.modes) ? key : model.modes[key];
}

/** The mode key of an API word, undefined for a mode this integration does not know. */
export function modeKey(model, apiValue) {
  if (Array.isArray(model.modes)) {
    return model.modes.includes(apiValue) ? apiValue : undefined;
  }
  return Object.keys(model.modes).find((key) => model.modes[key] === apiValue);
}
