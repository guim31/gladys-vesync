// -----------------------------------------------------------------------------
// A fake VeSync cloud, as a `fetch` implementation: the client under test
// talks to it like to smartapi.vesync.eu / .com. Its answers are the recorded
// ones of pyvesync's tests (MIT) and of Home Assistant's (Apache-2.0), in
// test/fixtures/; nothing goes to the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { hashPassword } from '../../src/vesync/client.js';

const fixture = (path) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8'));

export const PYVESYNC = {
  purifiers: fixture('pyvesync/purifiers.json'),
  humidifiers: fixture('pyvesync/humidifiers.json'),
  outlets: fixture('pyvesync/outlets.json'),
  login: fixture('pyvesync/login.json'),
  deviceList: fixture('pyvesync/device-list.json'),
};

export const HOME_ASSISTANT = {
  devices: fixture('home-assistant/vesync-devices.json'),
  purifier: fixture('home-assistant/air-purifier-detail.json'),
  purifierV2: fixture('home-assistant/air-purifier-detail-v2.json'),
  humidifier: fixture('home-assistant/humidifier-detail.json'),
  humidifier6000s: fixture('home-assistant/humidifier-6000s-detail.json'),
  outlet: fixture('home-assistant/outlet-detail.json'),
};

/** pyvesync fixture key (its `setup_entry`) → a `deviceType` the cloud lists. */
export const FIXTURE_TYPES = {
  Core200S: 'Core200S',
  Core300S: 'Core300S',
  Core400S: 'Core400S',
  Core600S: 'Core600S',
  'LAP-V102S': 'LAP-V102S-AASR',
  'LAP-V201S': 'LAP-V201S-AASR',
  EL551S: 'LAP-EL551S-AUS',
  'LAP-B851S-WUS': 'LAP-B851S-WUS',
  Classic200S: 'Classic200S',
  Classic300S: 'Classic300S',
  Dual200S: 'Dual200S',
  'LEH-B381S': 'LEH-B381S-WUS',
  'LEH-S601S': 'LEH-S601S-WUS',
  'LUH-A602S-WUS': 'LUH-A602S-WUS',
  'LUH-A603S-WUS': 'LUH-A603S-WUS',
  'LUH-M101S-WEUR': 'LUH-M101S-WEUR',
  'LUH-M101S-WUS': 'LUH-M101S-WUS',
  'LUH-O451S-WEU': 'LUH-O451S-WEU',
  'LUH-O451S-WUS': 'LUH-O451S-WUS',
  ESW03: 'ESW01-EU',
  'ESW10-USA': 'ESW10-USA',
  'ESW15-USA': 'ESW15-USA',
};

/** The recorded `getXxxStatus` / `deviceDetail` answer of a pyvesync fixture key. */
export function pyvesyncDetail(key) {
  return PYVESYNC.purifiers[key] ?? PYVESYNC.humidifiers[key] ?? PYVESYNC.outlets[key];
}

/** The inner result of a recorded bypassV2 answer, or the result of a v1 one. */
export function innerResult(answer) {
  return answer.result?.result ?? answer.result;
}

/** A device-list entry, as the cloud lists it. */
export function listed(deviceType, { cid, name, connectionStatus = 'online', ...rest } = {}) {
  return {
    cid: cid ?? `${deviceType}-CID`,
    uuid: `${deviceType}-UUID`,
    configModule: 'ConfigModule',
    connectionStatus,
    connectionType: 'wifi',
    deviceName: name ?? `${deviceType} name`,
    deviceRegion: 'EU',
    deviceStatus: 'on',
    deviceType,
    isOwner: true,
    macID: '02:00:00:00:00:00',
    ...rest,
  };
}

const ok = (result) => ({ traceId: 'TRACE_ID', code: 0, msg: 'request success', result });
const v2 = (inner) => ok({ traceId: 'TRACE_ID', code: 0, result: inner });

/**
 * @param {object} options
 * @param {string} [options.email]
 * @param {string} [options.password]
 * @param {'eu'|'us'} [options.accountRegion] where the account lives
 * @param {object[]} [options.devices] device-list entries
 * @param {Record<string, object>} [options.details] cid → recorded detail answer
 * @param {string} [options.tokenPrefix] tokens issued: `<prefix>-1`, `<prefix>-2`...
 */
export function createFakeVesync({
  email = 'user@example.com',
  password = 'p4ssw0rd',
  accountRegion = 'eu',
  devices = [],
  details = {},
  tokenPrefix = 'token',
} = {}) {
  const calls = [];
  let tokenCounter = 0;
  const validTokens = new Set();
  /** Answers forced on the next requests, by path suffix: [{ path, answer | status | throws }]. */
  const queued = [];
  /** cid → error code answered by any bypass call on that device. */
  const deviceErrors = new Map();

  const fake = {
    calls,
    devices,
    details,
    deviceErrors,

    /** Requests to a path (suffix match), in order. */
    callsTo(path) {
      return calls.filter((call) => call.path.endsWith(path));
    },

    /** The bypassV2 payload methods sent, in order. */
    payloadMethods() {
      return calls
        .filter((call) => call.path.endsWith('/bypassV2'))
        .map((call) => call.body.payload.method);
    },

    /** Make every token issued so far expire (the next call answers -11001000). */
    expireTokens() {
      validTokens.clear();
    },

    /** Force the answer of the next request to `path`. */
    queue(path, response) {
      queued.push({ path, ...response });
    },

    async fetch(url, init) {
      const { origin, pathname } = new URL(url);
      const body = JSON.parse(init.body);
      const call = { origin, path: pathname, body, headers: init.headers };
      calls.push(call);

      const forced = queued.findIndex((item) => pathname.endsWith(item.path));
      if (forced !== -1) {
        const [item] = queued.splice(forced, 1);
        if (item.throws) {
          throw item.throws;
        }
        return response(item.answer ?? {}, item.status);
      }

      const region = origin.endsWith('.eu') ? 'eu' : 'us';
      switch (pathname) {
        case '/globalPlatform/api/accountAuth/v1/authByPWDOrOTM':
          if (body.email !== email || body.password !== hashPassword(password)) {
            return response({ traceId: 'TRACE_ID', code: -11201022, msg: 'password error' });
          }
          return response(PYVESYNC.login.GET_TOKEN_RESPONSE_SUCCESS);
        case '/user/api/accountManage/v1/loginByAuthorizeCode4Vesync': {
          if (region !== accountRegion && !body.bizToken) {
            return response({
              ...PYVESYNC.login.LOGIN_RESPONSE_CROSS_REGION,
              result: {
                ...PYVESYNC.login.LOGIN_RESPONSE_CROSS_REGION.result,
                currentRegion: accountRegion.toUpperCase(),
                countryCode: accountRegion === 'eu' ? 'FR' : 'US',
              },
            });
          }
          tokenCounter += 1;
          const token = `${tokenPrefix}-${tokenCounter}`;
          validTokens.add(token);
          return response({
            ...PYVESYNC.login.LOGIN_RESPONSE_SUCCESS,
            result: {
              ...PYVESYNC.login.LOGIN_RESPONSE_SUCCESS.result,
              token,
              accountID: 'account-1',
              countryCode: accountRegion === 'eu' ? 'FR' : 'US',
              currentRegion: accountRegion.toUpperCase(),
            },
          });
        }
        default:
          break;
      }

      if (!validTokens.has(body.token)) {
        return response({ traceId: 'TRACE_ID', code: -11001000, msg: 'token expired' });
      }
      if (region !== accountRegion) {
        // The other server does not know the account's devices.
        return response({ traceId: 'TRACE_ID', code: -11005000, msg: 'no device' });
      }

      if (pathname === '/cloud/v1/deviceManaged/devices') {
        return response(ok({ total: devices.length, pageSize: 100, pageNo: 1, list: devices }));
      }

      const device = devices.find((item) => item.cid === body.cid);
      if (!device) {
        return response({ traceId: 'TRACE_ID', code: -11005000, msg: 'no device' });
      }
      if (deviceErrors.has(device.cid)) {
        return response({ traceId: 'TRACE_ID', code: deviceErrors.get(device.cid), msg: 'error' });
      }

      if (pathname === '/cloud/v2/deviceManaged/bypassV2') {
        const method = body.payload.method;
        if (method.startsWith('get')) {
          return response(details[device.cid]);
        }
        return response(v2({}));
      }
      if (pathname === '/cloud/v1/deviceManaged/deviceDetail') {
        return response(details[device.cid]);
      }
      if (pathname === '/cloud/v1/deviceManaged/deviceStatus') {
        return response(ok({}));
      }
      return response({ traceId: 'TRACE_ID', code: -11004000, msg: 'method not found' });
    },
  };
  fake.fetch = fake.fetch.bind(fake);
  return fake;
}

function response(json, status = 200) {
  return {
    status,
    async json() {
      return structuredClone(json);
    },
  };
}
