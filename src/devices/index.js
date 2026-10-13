// -----------------------------------------------------------------------------
// Device registry: from a device of the VeSync list to its Gladys device.
//
// One module per kind (purifier.js, humidifier.js, outlet.js), same shape:
//   KIND, FEATURE        the feature keys (part of the external ids: forever)
//   buildFeatures(ids, model, language)
//   parseState(model, raw) / read(client, device, model)
//   featureValues(state)  feature key → number, { text } or undefined
//   command(context, featureKey, value) → the state fields now true
//
// The external id of a device is built from its VeSync `cid`, the id the cloud
// gives the device: `ext:<selector>:<kind>:<cid>`.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { findModel } from '../vesync/models.js';
import * as purifier from './purifier.js';
import * as humidifier from './humidifier.js';
import * as outlet from './outlet.js';

export const MODULES = { purifier, humidifier, outlet };

/**
 * A device of the VeSync list, with its model and module; undefined when this
 * integration does not drive it.
 * @param {object} listed normalizeListedDevice()
 */
export function describe(listed) {
  const model = findModel(listed.deviceType);
  if (!model || !listed.cid) {
    return undefined;
  }
  return { info: listed, model, module: MODULES[model.kind] };
}

/** The external ids of a described device. */
export function idsOf(gladys, described) {
  return gladys.externalIds(described.model.kind, described.info.cid);
}

/** The discovery payload of a described device. */
export function buildDevice(gladys, described, language) {
  const ids = idsOf(gladys, described);
  return {
    name: described.info.deviceName || described.model.name,
    external_id: ids.device,
    // The container reads the devices on its own timer (src/hub.js); the
    // core's poll is the fallback, at the pace it accepts.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: described.module.buildFeatures(ids, described.model, language),
  };
}

/**
 * The states to publish for a device: one per feature whose value is known.
 * @returns {{ device_feature_external_id: string, state?: number, text?: string }[]}
 */
export function statesOf(ids, module, state) {
  const states = [];
  for (const [key, value] of Object.entries(module.featureValues(state))) {
    if (value === undefined) {
      continue;
    }
    const id = ids.feature(key);
    states.push(
      typeof value === 'object'
        ? { device_feature_external_id: id, text: value.text }
        : { device_feature_external_id: id, state: value },
    );
  }
  return states;
}
