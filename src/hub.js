// -----------------------------------------------------------------------------
// The hub: one VeSync account, its devices, and what Gladys sees of them.
//
//   - the device list (`listDevices`) is read at start, on a scan, on a new
//     configuration and every 30 minutes; the supported devices are published
//     to the Discovery screen;
//   - the devices the user ADDED to Gladys are read on the container's own
//     timer, every `poll_interval` seconds (60 by default, the pace of the
//     Home Assistant integration). The core cannot be trusted to poll an
//     external device (Gladys#3198): its onPoll is a fallback, skipped when
//     the timer read the device less than 90 % of a period ago, and the timer
//     skips a device read less than half a period ago. Devices are read one
//     after the other: a handful of requests a minute;
//   - only the changed states are published (publishChangedStates), each one
//     again after 12 h (heartbeat: Gladys says "no recent value" past 48 h);
//   - a device that stops answering goes `unreachable` on its transport badge,
//     a cloud that stops answering sets the connection status;
//   - a wrong password stops every request until the configuration changes:
//     retrying it every minute could get the account locked.
//
// Logs: info for the lifecycle only (start, connection, loss and return of
// the cloud or of a device, one line per user command); a failure that
// repeats is written once, then debug until it ends (issues.js). Never the
// password, the token nor the e-mail.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './config.js';
import { MESSAGES, TEXT, pick } from './i18n.js';
import { createIssueLog } from './issues.js';
import { buildDevice, describe, idsOf, statesOf } from './devices/index.js';
import { detectEvents } from './scenes.js';
import { WIDGET, buildAirQualityContent, summarize } from './widgets.js';
import { createClient } from './vesync/client.js';
import { VeSyncError } from './vesync/errors.js';

export const STATE_HEARTBEAT_MS = 12 * 60 * 60 * 1000;
export const LIST_REFRESH_MS = 30 * 60 * 1000;

// Failures about the way to VeSync, not about one device.
const CLOUD_KINDS = new Set([
  'network',
  'http',
  'server',
  'rate_limit',
  'bad_response',
  'token',
  'cross_region',
]);

/** The reason of an error, without the request it came from ("login: ..."). */
function reasonOf(err) {
  return String(err?.message ?? err).replace(/^[^:]+: /, '');
}

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {object} [options.store] where the VeSync session is kept (session.js)
 * @param {typeof fetch} [options.fetchImpl]
 * @param {boolean} [options.timers] run the polling timer (tests may turn it off)
 * @param {() => number} [options.now]
 * @param {object} [options.logger]
 */
export function createHub({
  gladys,
  store,
  fetchImpl,
  timers = true,
  now = () => Date.now(),
  logger = createLogger({ name: 'vesync' }),
}) {
  const issues = createIssueLog(logger);
  let config = normalizeConfig();
  let client = null;
  /** Supported devices of the account, by external id. */
  const entries = new Map();
  let listedAt = null;
  let authFailed = false;
  let lastStatusKey = null;
  let timer = null;
  let stopped = false;
  let widgetSummaries = new Map();

  const periodMs = () => config.poll_interval * 1000;

  function credentialsKey(c) {
    return `${c.email}\n${c.password}\n${c.region}`;
  }

  function makeClient() {
    client = isConfigured(config)
      ? createClient({
          email: config.email,
          password: config.password,
          region: config.region,
          store,
          fetchImpl,
          now,
        })
      : null;
    authFailed = false;
  }

  /** The application-level status of the Configuration screen, sent on change only. */
  async function setStatus(connected, message) {
    const key = `${connected}:${JSON.stringify(message ?? null)}`;
    if (key === lastStatusKey) {
      return;
    }
    lastStatusKey = key;
    await gladys.setConnectionStatus(connected, message).catch((err) => {
      lastStatusKey = null;
      issues.fail('status', `Connection status refused by Gladys (${err.message})`);
    });
  }

  /** The devices the user added to Gladys, as hub entries. */
  function createdEntries() {
    const created = new Set((gladys.devices ?? []).map((device) => device.external_id));
    return [...entries.values()].filter((entry) => created.has(entry.ids.device));
  }

  /** Text of an error for the user, in the configured language. */
  function describeError(err, language = config.language) {
    switch (err?.kind) {
      case 'auth':
        return pick(TEXT.authFailed, language);
      case 'offline':
        return pick(TEXT.deviceOffline, language);
      case 'rate_limit':
        return pick(TEXT.rateLimited, language);
      case 'invalid_value':
        return pick(
          MESSAGES.invalidValue(err.message.replace(/^value not accepted: /, '')),
          language,
        );
      default:
        return pick(MESSAGES.unreachable(reasonOf(err)), language);
    }
  }

  /** A failure that concerns the whole cloud (or the account), not one device. */
  async function cloudFailed(err) {
    if (err.kind === 'auth') {
      authFailed = true;
      issues.fail(
        'cloud',
        `VeSync refused the credentials (${err.message}): waiting for a new configuration`,
      );
      await setStatus(false, TEXT.authFailed);
    } else {
      issues.fail('cloud', `VeSync unreachable (${err.message})`);
      // Without the request name: the same outage is one status, whatever was asked.
      await setStatus(false, MESSAGES.unreachable(reasonOf(err)));
    }
    await publishTransports(createdEntries(), DEVICE_TRANSPORTS.UNREACHABLE);
  }

  async function cloudWorks() {
    issues.ok('cloud', 'VeSync answers again');
    await setStatus(true);
  }

  /** Publish the transport of some entries, the ones whose transport changed. */
  async function publishTransports(list, transport) {
    const changed = list.filter((entry) => entry.transport !== transport);
    if (changed.length === 0) {
      return;
    }
    try {
      await gladys.publishTransports(
        changed.map((entry) => ({ external_id: entry.ids.device, transport })),
      );
      for (const entry of changed) {
        entry.transport = transport;
      }
      issues.ok('transports', 'Transports accepted by Gladys again');
    } catch (err) {
      issues.fail('transports', `Transports refused by Gladys (${err.message})`);
    }
  }

  /**
   * Read the device list and publish the supported devices to the Discovery
   * screen. Throws the VeSync error (the caller decides how to report it).
   */
  async function refreshDevices() {
    const listed = await client.listDevices();
    listedAt = now();
    const seen = new Set();
    let unsupported = 0;
    for (const item of listed) {
      const described = describe(item);
      if (!described) {
        unsupported += 1;
        continue;
      }
      const ids = idsOf(gladys, described);
      seen.add(ids.device);
      const existing = entries.get(ids.device);
      if (existing) {
        existing.info = described.info;
      } else {
        entries.set(ids.device, {
          ...described,
          ids,
          state: {},
          read: false,
          online: undefined,
          transport: undefined,
          polledAt: undefined,
          inFlight: null,
        });
      }
    }
    for (const key of [...entries.keys()]) {
      if (!seen.has(key)) {
        // Removed from the VeSync account: Gladys keeps the device, we stop reading it.
        entries.delete(key);
      }
    }
    logger.debug(`Device list: ${entries.size} supported, ${unsupported} not supported`);
    await publishDiscovered();
    return { total: listed.length, supported: entries.size, listed };
  }

  async function publishDiscovered() {
    const devices = [...entries.values()].map((entry) =>
      buildDevice(gladys, entry, config.language),
    );
    try {
      await gladys.publishDiscoveredDevices(devices);
      issues.ok('discovery', 'Devices accepted by Gladys again');
    } catch (err) {
      issues.fail('discovery', `Publishing the devices failed (${err.message})`);
    }
  }

  /**
   * Merge new state fields into an entry, publish the changed states, fire
   * the scene events of a new reading, refresh the widget when a summary moved.
   */
  async function applyState(entry, fields, { fromRead }) {
    const previous = entry.read ? entry.state : undefined;
    const next = { ...entry.state };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        next[key] = value;
      }
    }
    entry.state = next;
    if (fromRead) {
      entry.read = true;
    }

    try {
      await gladys.publishChangedStates(statesOf(entry.ids, entry.module, next), {
        heartbeat: STATE_HEARTBEAT_MS,
      });
      issues.ok('states', 'States accepted by Gladys again');
    } catch (err) {
      issues.fail('states', `States refused by Gladys (${err.message})`);
    }

    if (fromRead) {
      const events = detectEvents(previous, next, {
        kind: entry.model.kind,
        threshold: config.filter_alert_percent,
        deviceExternalId: entry.ids.device,
        deviceName: entry.info.deviceName,
      });
      for (const event of events) {
        try {
          await gladys.publishSceneEvent(event.key, event.data);
          logger.info(`${entry.info.deviceName}: scene event ${event.key}`);
        } catch (err) {
          issues.fail('scene', `Scene event ${event.key} refused by Gladys (${err.message})`);
        }
      }
    }
    refreshWidgetIfNeeded();
  }

  function refreshWidgetIfNeeded() {
    const summaries = new Map(
      createdEntries().map((entry) => [
        entry.ids.device,
        JSON.stringify(summarize(widgetEntry(entry), 'en', config.filter_alert_percent)),
      ]),
    );
    const changed =
      summaries.size !== widgetSummaries.size ||
      [...summaries].some(([key, value]) => widgetSummaries.get(key) !== value);
    widgetSummaries = summaries;
    if (changed) {
      nudgeWidget();
    }
  }

  /** "Re-pull the widget now": fire and forget, rate-limited by the core. */
  function nudgeWidget() {
    try {
      Promise.resolve(gladys.requestWidgetRefresh(WIDGET.AIR_QUALITY)).catch(() => {});
    } catch {
      // Dropped while Gladys is unreachable: the widget's ttl catches up.
    }
  }

  /**
   * Mark a device online or not: its transport badge (published when it
   * differs, a cloud outage may have set it), one log line on change.
   */
  async function setOnline(entry, online) {
    const changed = entry.online !== online;
    const wasKnown = entry.online !== undefined;
    entry.online = online;
    if (changed && online && wasKnown) {
      logger.info(`${entry.info.deviceName}: back online`);
    } else if (changed && !online) {
      logger.warn(`${entry.info.deviceName}: offline`);
    }
    await publishTransports(
      [entry],
      online ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
    );
    if (changed) {
      refreshWidgetIfNeeded();
    }
  }

  /**
   * Read one device, unless it was read less than `minGap` periods ago.
   * A read in progress is shared. Errors are reported here, never thrown.
   */
  async function pollEntry(entry, { force = false, minGap = 0.5 } = {}) {
    if (entry.inFlight) {
      return entry.inFlight;
    }
    if (!force && entry.polledAt !== undefined && now() - entry.polledAt < periodMs() * minGap) {
      logger.debug(`${entry.info.deviceName}: read ${now() - entry.polledAt} ms ago, skipped`);
      return undefined;
    }
    entry.polledAt = now();
    entry.inFlight = (async () => {
      try {
        const state = await entry.module.read(client, entry.info, entry.model);
        await cloudWorks();
        issues.ok(`device:${entry.ids.device}`, `${entry.info.deviceName}: reading works again`);
        const { offline, ...fields } = state;
        await setOnline(entry, offline !== true);
        if (offline !== true) {
          // An offline v1 plug still answers its last values: stale, not published.
          await applyState(entry, fields, { fromRead: true });
        }
      } catch (err) {
        await readFailed(entry, err);
      } finally {
        entry.inFlight = null;
      }
    })();
    return entry.inFlight;
  }

  async function readFailed(entry, err) {
    const kind = err instanceof VeSyncError ? err.kind : 'unknown';
    if (kind === 'auth' || CLOUD_KINDS.has(kind)) {
      await cloudFailed(err);
      return;
    }
    // The cloud answered: it works, the device does not.
    await cloudWorks();
    if (kind === 'offline') {
      await setOnline(entry, false);
      return;
    }
    issues.fail(
      `device:${entry.ids.device}`,
      `${entry.info.deviceName}: reading failed (${err.message})`,
    );
  }

  /** One cycle: refresh the list when due, then read every added device. */
  async function cycle({ force = false } = {}) {
    if (!client || authFailed || stopped) {
      return;
    }
    if (gladys.connected === false) {
      logger.debug('Gladys unreachable: cycle skipped');
      return;
    }
    if (listedAt === null || now() - listedAt >= LIST_REFRESH_MS) {
      try {
        await refreshDevices();
        await cloudWorks();
      } catch (err) {
        listedAt = now();
        await cloudFailed(err);
        return;
      }
    }
    for (const entry of createdEntries()) {
      if (authFailed || stopped) {
        return;
      }
      await pollEntry(entry, { force });
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await cycle();
      } catch (err) {
        issues.fail('cycle', `Polling cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, periodMs());
  }

  /** The entry of a Gladys device, undefined for a device we do not know (yet). */
  function entryOf(device) {
    return entries.get(device?.external_id);
  }

  function widgetEntry(entry) {
    const tileKey =
      entry.model.kind === 'purifier' && entry.model.airQuality
        ? 'pm25'
        : entry.model.kind === 'humidifier'
          ? 'humidity'
          : null;
    return {
      name: entry.info.deviceName,
      kind: entry.model.kind,
      state: entry.state,
      online: entry.online,
      tile: tileKey ? entry.ids.feature(tileKey) : undefined,
    };
  }

  return {
    /** (Re)start with a configuration: new account → new client; list, publish, read. */
    async start(rawConfig) {
      const previous = config;
      config = normalizeConfig(rawConfig ?? previous);
      stopped = false;
      if (!client || credentialsKey(previous) !== credentialsKey(config)) {
        entries.clear();
        widgetSummaries = new Map();
        makeClient();
      }
      clearTimeout(timer);
      timer = null;
      listedAt = null;
      authFailed = false;
      if (!client) {
        logger.info('Not configured yet: waiting for the VeSync e-mail and password');
        await setStatus(false, TEXT.notConfigured);
        return;
      }
      try {
        const { supported } = await refreshDevices();
        const session = client.sessionInfo();
        logger.info(
          `Connected to VeSync (${session?.region?.toUpperCase() ?? '?'} server): ${supported} supported device(s)`,
        );
        await cloudWorks();
      } catch (err) {
        listedAt = now();
        await cloudFailed(err);
      }
      schedule();
      // Read the added devices now (Gladys may have restarted), then on the timer.
      for (const entry of createdEntries()) {
        entry.polledAt = undefined;
      }
      await cycle({ force: true });
    },

    /** The user asked for a scan: read the list again and publish it. */
    async scan() {
      if (!client || authFailed) {
        return;
      }
      try {
        await refreshDevices();
        await cloudWorks();
      } catch (err) {
        await cloudFailed(err);
      }
    },

    /** The core's onPoll (fallback): read the device unless the timer just did. */
    async pollFromCore(device) {
      const entry = entryOf(device);
      if (!entry || !client || authFailed) {
        logger.debug(`onPoll ignored for ${device?.external_id}`);
        return;
      }
      await pollEntry(entry, { minGap: 0.9 });
    },

    /** A device was just added (or updated) in Gladys: send everything now. */
    async deviceCreated(device) {
      const entry = entryOf(device);
      if (!entry || !client || authFailed) {
        return;
      }
      // The SDK forgot what was published for it: the read publishes it all,
      // the transport badge included.
      entry.transport = undefined;
      await pollEntry(entry, { force: true });
      nudgeWidget();
    },

    /** The user acts on a feature. Throws a message for the user on failure. */
    async setValue(device, feature, value) {
      const entry = entryOf(device);
      if (!entry || !client) {
        throw new Error(pick(MESSAGES.unreachable('unknown device'), config.language));
      }
      const featureKey = String(feature.external_id).slice(entry.ids.device.length + 1);
      const name = entry.info.deviceName;
      let fields;
      try {
        fields = await entry.module.command(
          { client, device: entry.info, model: entry.model, state: entry.state },
          featureKey,
          value,
        );
      } catch (err) {
        logger.warn(`${name}: ${featureKey} = ${value} failed (${err.message})`);
        if (err instanceof VeSyncError && err.kind === 'offline') {
          await setOnline(entry, false);
        }
        throw new Error(pick(MESSAGES.commandFailed(describeError(err)), config.language), {
          cause: err,
        });
      }
      logger.info(`${name}: ${featureKey} = ${value}`);
      await setOnline(entry, true);
      await applyState(entry, fields, { fromRead: false });
    },

    /** "Test the connection": log in again, list the account. Throws the error to show. */
    async testConnection() {
      const language = config.language;
      if (!client) {
        throw new Error(pick(TEXT.notConfigured, language));
      }
      let result;
      try {
        authFailed = false;
        await client.login();
        result = await refreshDevices();
        await cloudWorks();
      } catch (err) {
        await cloudFailed(err);
        throw new Error(describeError(err, language), { cause: err });
      }
      logger.info(`Connection test: ${result.supported} supported device(s)`);
      const session = client.sessionInfo();
      const unsupported = [
        ...new Set(result.listed.filter((item) => !describe(item)).map((item) => item.deviceType)),
      ];
      const message = {};
      for (const lang of ['en', 'fr', 'de', 'es']) {
        const lines = [
          pick(
            MESSAGES.connected({
              total: result.total,
              supported: result.supported,
              region: session?.region ?? config.region,
            }),
            lang,
          ),
        ];
        if (unsupported.length > 0) {
          lines.push(pick(MESSAGES.unsupported(unsupported.join(', ')), lang));
        }
        if (session && session.region !== config.region) {
          lines.push(pick(MESSAGES.regionChanged(session.region), lang));
        }
        message[lang] = lines.join('\n');
      }
      // A failed configuration was waiting: it works now, resume the timer.
      schedule();
      return message;
    },

    /** The content of the "Air quality" widget. */
    widgetContent({ settings = {}, language = 'en' } = {}) {
      let list = createdEntries();
      if (settings.device) {
        list = list.filter((entry) => entry.ids.device === settings.device);
      }
      return buildAirQualityContent({
        configured: Boolean(client),
        entries: list.map(widgetEntry),
        language,
        filterThreshold: config.filter_alert_percent,
      });
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },

    /** For the tests. */
    get config() {
      return config;
    },
    get entries() {
      return entries;
    },
  };
}
