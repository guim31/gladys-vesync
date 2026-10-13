// -----------------------------------------------------------------------------
// VeSync error codes.
//
// Ported from pyvesync (`src/pyvesync/utils/errors.py`, MIT, Mark Perdue and
// contributors): the cloud answers HTTP 200 with a `code` in the body, 0 on
// success. Codes not listed exactly are looked up with their last three digits
// zeroed (-11201022 → -11201000, "invalid password"), as pyvesync does. Only
// the codes this integration acts upon are kept, grouped by what to do:
//   - auth        : the e-mail or the password is wrong — say it, stop trying;
//   - token       : the session expired — log in again, once;
//   - cross_region: the account lives on the other regional server;
//   - rate_limit  : too many requests — wait for the next cycle;
//   - offline     : the device is not connected to the cloud;
//   - device      : the device refused the command (water tank, motor...);
//   - request     : a parameter the device does not accept;
//   - server      : the VeSync cloud itself failed.
// -----------------------------------------------------------------------------

const CODES = new Map([
  [-11260022, 'cross_region'],
  [-11001000, 'token'],
  [-11201000, 'auth'], // invalid password
  [-11202000, 'auth'], // account does not exist
  [-11200000, 'auth'], // malformed account
  [-11003000, 'rate_limit'],
  [-16906000, 'rate_limit'], // request too frequent
  [11, 'offline'],
  [4041004, 'offline'],
  [-11300000, 'offline'],
  [-11300027, 'offline'],
  [-11302000, 'offline'], // device timeout: the cloud got no answer from it
  [-11100000, 'server'],
  [-11101000, 'server'],
  [-11102000, 'server'],
  [-11103000, 'server'],
  [-11104000, 'server'],
  [-11105000, 'server'],
  [-11106000, 'server'],
  [-11107000, 'server'],
  [-11108000, 'server'],
  [77777777, 'server'],
  [88888888, 'server'],
  [-11004000, 'request'], // method not found
  [-11005000, 'request'], // no device with this id
  [-11305000, 'request'], // config module does not exist
  [11000000, 'request'], // invalid bypass parameter
  [11017000, 'request'], // not supported
  [-11301000, 'request'], // device does not exist (removed from the account)
]);

/** Error kinds a bypass command reports from the device itself (11xxxxxx, 12xxxxxx). */
const DEVICE_ERROR_MIN = 11000000;

/**
 * The kind of a VeSync result code.
 * @param {number|string|null|undefined} code
 * @returns {'success'|'auth'|'token'|'cross_region'|'rate_limit'|'offline'|'server'|'device'|'request'|'unknown'}
 */
export function errorKind(code) {
  const number = Number(code);
  if (code === null || code === undefined || !Number.isFinite(number)) {
    return 'unknown';
  }
  if (number === 0) {
    return 'success';
  }
  if (CODES.has(number)) {
    return CODES.get(number);
  }
  const rounded = Math.trunc(number / 1000) * 1000;
  if (CODES.has(rounded)) {
    return CODES.get(rounded);
  }
  if (number >= DEVICE_ERROR_MIN) {
    return 'device';
  }
  return 'unknown';
}

/**
 * An error of the VeSync cloud or of the way to it. `kind` drives the reaction
 * (see the header); `code` is VeSync's, when it answered one. The message never
 * carries a credential: it is logged.
 */
export class VeSyncError extends Error {
  /**
   * @param {string} kind errorKind(), or 'network' | 'http' | 'bad_response' | 'unsupported'
   * @param {string} message
   * @param {{ code?: number, status?: number, result?: object }} [details]
   */
  constructor(kind, message, details = {}) {
    super(message);
    this.name = 'VeSyncError';
    this.kind = kind;
    this.code = details.code;
    this.status = details.status;
    // The `result` of a cross-region answer carries where to log in instead.
    this.result = details.result;
  }
}

/**
 * Build the error of a VeSync answer whose code is not 0.
 * @param {number} code
 * @param {string|null|undefined} msg the cloud's own message
 * @param {string} what the request, for the log ("login", "device list"...)
 */
export function codeError(code, msg, what, result) {
  const kind = errorKind(code);
  const text = msg ? `${what}: VeSync code ${code} (${msg})` : `${what}: VeSync code ${code}`;
  return new VeSyncError(kind, text, { code: Number(code), result });
}
