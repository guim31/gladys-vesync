// -----------------------------------------------------------------------------
// Helpers shared by the device modules: reading the loosely typed answers of
// the cloud (booleans as true/1/"on", numbers as strings), and the error of a
// value a device does not accept.
// -----------------------------------------------------------------------------

import { VeSyncError } from '../vesync/errors.js';

/** true/false from true, 1, "1", "on"; undefined for anything else (absent field). */
export function binary(value) {
  if (value === true || value === 1 || value === '1' || value === 'on') {
    return true;
  }
  if (value === false || value === 0 || value === '0' || value === 'off') {
    return false;
  }
  return undefined;
}

/** A finite number from a number or a numeric string, undefined otherwise. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** An integer within [min, max], undefined when absent or outside. */
export function toInteger(value, min, max) {
  const number = toNumber(value);
  if (number === undefined || !Number.isInteger(number) || number < min || number > max) {
    return undefined;
  }
  return number;
}

/** The error of a command value the device does not accept. */
export function invalidValue(value) {
  return new VeSyncError('invalid_value', `value not accepted: ${String(value).slice(0, 40)}`);
}
