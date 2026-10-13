// -----------------------------------------------------------------------------
// VeSync cloud client.
//
// A port of the requests pyvesync sends (`auth.py`, `vesync.py`,
// `utils/device_mixins.py`, `models/*`; MIT, Mark Perdue and contributors),
// itself what the VeSync mobile application sends. Four calls are enough:
//   - login, in two steps: `authByPWDOrOTM` trades the e-mail and the MD5 of
//     the password for an authorization code, `loginByAuthorizeCode4Vesync`
//     trades the code for a token. An account that lives on the other regional
//     server answers -11260022 with that region and a `bizToken`: the exchange
//     is retried there, once;
//   - the device list (`/cloud/v1/deviceManaged/devices`);
//   - `bypassV2`, the envelope of the purifiers, the humidifiers and the ESW10
//     outlet: `{ payload: { method, source: 'APP', data } }`, answered with a
//     result nested in a result, each with its own `code`;
//   - the v1 device calls of the 10 A / 15 A outlets
//     (`/cloud/v1/deviceManaged/deviceDetail`, `deviceStatus`).
// Every answer is HTTP 200 with a `code`, 0 on success (see errors.js). An
// expired token (-11001xxx) logs in again, once per request.
//
// The token is kept in /data (session.js) so a restart does not log in again:
// VeSync has no published quota, logging in once is the polite way.
// Nothing here logs: the caller does, without the token nor the password.
// -----------------------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto';
import { VeSyncError, codeError } from './errors.js';

export const BASE_URLS = {
  us: 'https://smartapi.vesync.com',
  eu: 'https://smartapi.vesync.eu',
};

// The identity pyvesync presents (const.py): the values the cloud is known to
// accept. APP_ID is an 8-letter string the app draws at random.
export const APP_VERSION = '5.6.60';
const APP_ID = 'eldodkfj';
const PHONE_BRAND = 'pyvesync';
const PHONE_OS = 'Android';
const CLIENT_TYPE = 'vesyncApp';
const BYPASS_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'User-Agent': 'okhttp/3.12.1',
};

const CROSS_REGION = -11260022;
const REQUEST_TIMEOUT_MS = 10_000;

// pyvesync sends the countries below to the US server, any other to the EU
// one. The country the login sends first only picks the server: the answer
// carries the account's own country, used from then on.
const NON_EU_COUNTRIES = ['US', 'CA', 'MX', 'JP'];
const COUNTRY_BY_TIME_ZONE = {
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Brussels': 'BE',
  'Europe/Amsterdam': 'NL',
  'Europe/Luxembourg': 'LU',
  'Europe/Zurich': 'CH',
  'Europe/Vienna': 'AT',
  'Europe/Lisbon': 'PT',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Warsaw': 'PL',
  'Europe/Stockholm': 'SE',
  'Europe/Copenhagen': 'DK',
  'Europe/Oslo': 'NO',
  'Europe/Helsinki': 'FI',
  'Europe/Prague': 'CZ',
};

/** The country the first login request announces for a configured region. */
export function initialCountry(region, timeZone) {
  if (region === 'us') {
    return 'US';
  }
  return COUNTRY_BY_TIME_ZONE[timeZone] ?? 'FR';
}

/** The region of a country, as pyvesync decides it. */
export function regionOfCountry(country) {
  return NON_EU_COUNTRIES.includes(String(country).toUpperCase()) ? 'us' : 'eu';
}

/** MD5 of the password, hex: what the login sends instead of the password. */
export function hashPassword(password) {
  return createHash('md5').update(password, 'utf8').digest('hex');
}

/** A short, stable digest of the e-mail: tells whether a stored session is this account's. */
export function accountKey(email) {
  return createHash('sha256').update(String(email).trim().toLowerCase(), 'utf8').digest('hex');
}

/**
 * @param {object} options
 * @param {string} options.email
 * @param {string} options.password
 * @param {'eu'|'us'} options.region the region configured by the user
 * @param {{ load(): Promise<object|null>, save(data: object): Promise<void> }} [options.store]
 *   where the token is kept between restarts (session.js); none in memory only
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.timeZone] IANA zone sent with every request
 * @param {() => number} [options.now]
 */
export function createClient({
  email,
  password,
  region,
  store,
  fetchImpl = globalThis.fetch,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  now = () => Date.now(),
}) {
  const key = accountKey(email);
  /** @type {{ token: string, accountID: string, countryCode: string, region: string } | null} */
  let session = null;
  let terminalId = null;
  let loaded = false;
  let loginInFlight = null;
  let traceCounter = 0;

  async function loadStore() {
    if (loaded) {
      return;
    }
    loaded = true;
    const data = (await store?.load().catch(() => null)) ?? null;
    terminalId = typeof data?.terminalId === 'string' ? data.terminalId : null;
    const saved = data?.account;
    if (
      saved?.key === key &&
      typeof saved.token === 'string' &&
      typeof saved.accountID === 'string' &&
      BASE_URLS[saved.region]
    ) {
      session = {
        token: saved.token,
        accountID: saved.accountID,
        countryCode: saved.countryCode || initialCountry(region, timeZone),
        region: saved.region,
      };
    }
    if (!terminalId) {
      // The app's install id: '2' + 32 hex digits, kept for the installation.
      terminalId = `2${randomUUID().replaceAll('-', '')}`;
      await saveStore();
    }
  }

  async function saveStore() {
    if (!store) {
      return;
    }
    const account = session ? { key, ...session } : null;
    await store.save({ terminalId, account }).catch(() => {});
  }

  /** pyvesync's `newTraceId`, used by the login requests. */
  function loginTraceId() {
    traceCounter += 1;
    const seconds = Math.floor(now() / 1000);
    return `APP${terminalId.slice(-5, -1)}${seconds}-${String(traceCounter).padStart(5, '0')}`;
  }

  /** pyvesync's `traceId`: the time, in seconds. */
  function traceId() {
    return String(Math.floor(now() / 1000));
  }

  /**
   * POST a JSON body, parse the JSON answer. Throws a VeSyncError of kind
   * 'network' (no answer), 'http' (not 200) or 'bad_response' (not JSON).
   */
  async function post(base, path, body, headers, what) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
      throw new VeSyncError('network', `${what}: VeSync unreachable (${reason})`);
    }
    if (response.status !== 200) {
      throw new VeSyncError('http', `${what}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    try {
      const json = await response.json();
      // Every VeSync answer carries its `code`: anything else is not VeSync.
      if (!json || typeof json !== 'object' || !Number.isFinite(Number(json.code ?? NaN))) {
        throw new Error('not a VeSync answer');
      }
      return { ...json, code: Number(json.code) };
    } catch {
      throw new VeSyncError('bad_response', `${what}: unreadable answer`);
    }
  }

  /** The fields every login request carries (RequestGetTokenModel / RequestLoginTokenModel). */
  function loginBase(countryCode) {
    return {
      acceptLanguage: 'en',
      accountID: '',
      clientInfo: PHONE_BRAND,
      clientType: CLIENT_TYPE,
      clientVersion: `VeSync ${APP_VERSION}`,
      debugMode: false,
      osInfo: PHONE_OS,
      terminalId,
      timeZone,
      token: '',
      userCountryCode: countryCode,
      traceId: loginTraceId(),
    };
  }

  async function doLogin() {
    await loadStore();
    let loginRegion = region;
    let countryCode = initialCountry(region, timeZone);

    // Step 1: e-mail and password for an authorization code.
    const auth = await post(
      BASE_URLS[loginRegion],
      '/globalPlatform/api/accountAuth/v1/authByPWDOrOTM',
      {
        ...loginBase(countryCode),
        email,
        method: 'authByPWDOrOTM',
        password: hashPassword(password),
        authProtocolType: 'generic',
        appID: APP_ID,
        sourceAppID: APP_ID,
      },
      { 'Content-Type': 'application/json' },
      'login',
    );
    if (auth.code !== 0) {
      throw codeError(auth.code, auth.msg, 'login');
    }
    const authorizeCode = auth.result?.authorizeCode;
    if (typeof authorizeCode !== 'string' || authorizeCode === '') {
      throw new VeSyncError('bad_response', 'login: no authorization code');
    }

    // Step 2: the code for a token, on the account's own server.
    let bizToken = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const body = {
        ...loginBase(countryCode),
        method: 'loginByAuthorizeCode4Vesync',
        authorizeCode,
        emailSubscriptions: false,
      };
      if (bizToken) {
        body.bizToken = bizToken;
        body.regionChange = 'lastRegion';
      }
      const answer = await post(
        BASE_URLS[loginRegion],
        '/user/api/accountManage/v1/loginByAuthorizeCode4Vesync',
        body,
        { 'Content-Type': 'application/json' },
        'login',
      );
      if (answer.code === CROSS_REGION && attempt === 0 && answer.result?.bizToken) {
        // The account lives on the other server: retry there with its country.
        countryCode = answer.result.countryCode || countryCode;
        const announced = String(answer.result.currentRegion ?? '').toLowerCase();
        loginRegion = BASE_URLS[announced] ? announced : regionOfCountry(countryCode);
        bizToken = answer.result.bizToken;
        continue;
      }
      if (answer.code !== 0) {
        throw codeError(answer.code, answer.msg, 'login', answer.result);
      }
      const result = answer.result ?? {};
      if (typeof result.token !== 'string' || typeof result.accountID !== 'string') {
        throw new VeSyncError('bad_response', 'login: no token in the answer');
      }
      session = {
        token: result.token,
        accountID: result.accountID,
        countryCode: result.countryCode || countryCode,
        region: loginRegion,
      };
      await saveStore();
      return { ...session, regionChanged: loginRegion !== region };
    }
    throw new VeSyncError('cross_region', 'login: the account region could not be resolved');
  }

  /** Log in now, whatever the stored session. Concurrent callers share one login. */
  function login() {
    if (!loginInFlight) {
      loginInFlight = doLogin().finally(() => {
        loginInFlight = null;
      });
    }
    return loginInFlight;
  }

  async function ensureSession() {
    await loadStore();
    if (!session) {
      await login();
    }
    return session;
  }

  /**
   * Run an authenticated request; an expired token logs in again and retries once.
   * @param {(session: object) => Promise<object>} request returns the parsed answer
   * @param {string} what
   */
  async function authenticated(request, what) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await ensureSession();
      const answer = await request(current);
      if (answer.code === 0) {
        return answer;
      }
      const error = codeError(answer.code, answer.msg, what);
      if (error.kind === 'token' && attempt === 0) {
        session = null;
        await saveStore();
        await login();
        continue;
      }
      throw error;
    }
    throw new VeSyncError('token', `${what}: the new token was refused too`);
  }

  /** The fields of a device request (BypassV2Mixin / BypassV1Mixin `request_keys`). */
  function deviceBase(current, device) {
    return {
      acceptLanguage: 'en',
      accountID: current.accountID,
      appVersion: APP_VERSION,
      cid: device.cid,
      configModel: device.configModule,
      configModule: device.configModule,
      debugMode: false,
      deviceId: device.cid,
      phoneBrand: PHONE_BRAND,
      phoneOS: PHONE_OS,
      timeZone,
      token: current.token,
      traceId: traceId(),
      userCountryCode: current.countryCode,
    };
  }

  return {
    login,

    /** The session in use, without its token (for the status and the logs). */
    sessionInfo() {
      return session ? { region: session.region, countryCode: session.countryCode } : null;
    },

    /**
     * Every device of the account, as the cloud lists them (all pages).
     * @returns {Promise<object[]>}
     */
    async listDevices() {
      const devices = [];
      for (let pageNo = 1; pageNo <= 10; pageNo += 1) {
        const answer = await authenticated(
          (current) =>
            post(
              BASE_URLS[current.region],
              '/cloud/v1/deviceManaged/devices',
              {
                acceptLanguage: 'en',
                accountID: current.accountID,
                appVersion: APP_VERSION,
                method: 'devices',
                pageNo,
                pageSize: 100,
                phoneBrand: PHONE_BRAND,
                phoneOS: PHONE_OS,
                timeZone,
                token: current.token,
                traceId: traceId(),
              },
              BYPASS_HEADERS,
              'device list',
            ),
          'device list',
        );
        const list = Array.isArray(answer.result?.list) ? answer.result.list : [];
        devices.push(...list.map(normalizeListedDevice));
        const total = Number(answer.result?.total ?? list.length);
        if (list.length < 100 || devices.length >= total) {
          break;
        }
      }
      return devices;
    },

    /**
     * A `bypassV2` request: `payload.method` with its `data`.
     * @returns {Promise<object>} the inner result (`result.result`), {} when there is none
     */
    async bypassV2(device, method, data = {}, payloadExtra = {}) {
      const what = `${method} (${device.deviceType})`;
      const answer = await authenticated(
        (current) =>
          post(
            BASE_URLS[current.region],
            '/cloud/v2/deviceManaged/bypassV2',
            {
              ...deviceBase(current, device),
              method: 'bypassV2',
              payload: { method, source: 'APP', data, ...payloadExtra },
            },
            BYPASS_HEADERS,
            what,
          ),
        what,
      );
      const outer = answer.result;
      if (!outer || typeof outer !== 'object') {
        throw new VeSyncError('bad_response', `${what}: no result`);
      }
      if (outer.code !== undefined && Number(outer.code) !== 0) {
        throw codeError(outer.code, outer.msg, what);
      }
      return outer.result && typeof outer.result === 'object' ? outer.result : {};
    },

    /**
     * A v1 device request (`/cloud/v1/deviceManaged/<method>`), the 10 A / 15 A outlets.
     * @returns {Promise<object>} the result, {} when there is none
     */
    async deviceV1(device, method, extra = {}) {
      const what = `${method} (${device.deviceType})`;
      const answer = await authenticated(
        (current) =>
          post(
            BASE_URLS[current.region],
            `/cloud/v1/deviceManaged/${method}`,
            { ...deviceBase(current, device), uuid: device.uuid, method, ...extra },
            BYPASS_HEADERS,
            what,
          ),
        what,
      );
      return answer.result && typeof answer.result === 'object' ? answer.result : {};
    },
  };
}

/**
 * One entry of the device list, reduced to what the integration uses. Some
 * models carry their status in `deviceProp` (pyvesync `_flatten_device_prop`),
 * and a few have no `cid`: pyvesync falls back on the uuid, then the MAC.
 */
export function normalizeListedDevice(entry) {
  const prop = entry.deviceProp && typeof entry.deviceProp === 'object' ? entry.deviceProp : {};
  let deviceStatus = entry.deviceStatus;
  if (prop.powerSwitch !== undefined && prop.powerSwitch !== null) {
    deviceStatus = Number(prop.powerSwitch) === 1 ? 'on' : 'off';
  }
  return {
    cid: entry.cid ?? entry.uuid ?? entry.macID ?? prop.wifiMac ?? null,
    uuid: entry.uuid ?? null,
    configModule: entry.configModule ?? '',
    deviceType: entry.deviceType ?? '',
    deviceName: entry.deviceName ?? entry.deviceType ?? '',
    deviceRegion: entry.deviceRegion ?? null,
    connectionStatus: prop.connectionStatus ?? entry.connectionStatus ?? null,
    deviceStatus: deviceStatus ?? null,
    subDeviceNo: entry.subDeviceNo ?? null,
  };
}
