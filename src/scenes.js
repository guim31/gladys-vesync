// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`; keys are forever).
//
//   filter_change_needed : a purifier filter went down to the alert threshold
//                          of the configuration (10 % by default);
//   water_tank_empty     : a humidifier reports its tank empty.
//
// Both are already visible as device states; what the triggers add is one
// scene for every device, fired ONCE per transition with the device name as a
// variable ("{{triggerEvent.data.device_name}}: replace the filter") — where
// a state condition would need one scene per device and fire on every read
// below the threshold. A transition is only seen between two reads of the
// running container: a restart while the filter is already low does not fire
// again, a new filter (back above the threshold) re-arms the trigger.
// -----------------------------------------------------------------------------

export const TRIGGER = {
  FILTER_CHANGE_NEEDED: 'filter_change_needed',
  WATER_TANK_EMPTY: 'water_tank_empty',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGER);

/**
 * The events a new reading fires, compared to the previous one.
 * @param {object|undefined} previous the previous state (undefined: first read)
 * @param {object} next
 * @param {{ kind: string, threshold: number, deviceExternalId: string, deviceName: string }} context
 * @returns {{ key: string, data: object }[]}
 */
export function detectEvents(previous, next, { kind, threshold, deviceExternalId, deviceName }) {
  if (!previous) {
    return [];
  }
  const events = [];
  if (
    kind === 'purifier' &&
    previous.filterLife !== undefined &&
    next.filterLife !== undefined &&
    previous.filterLife > threshold &&
    next.filterLife <= threshold
  ) {
    events.push({
      key: TRIGGER.FILTER_CHANGE_NEEDED,
      data: { device: deviceExternalId, device_name: deviceName, filter_life: next.filterLife },
    });
  }
  if (kind === 'humidifier' && previous.waterLacks === false && next.waterLacks === true) {
    events.push({
      key: TRIGGER.WATER_TANK_EMPTY,
      data: { device: deviceExternalId, device_name: deviceName },
    });
  }
  return events;
}
