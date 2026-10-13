// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it
// (`gladys.getConfig()`) and notifies every change (`gladys.onConfigUpdated()`).
// This module only provides the defaults and normalizes the received object, so
// the rest of the code never deals with `undefined` or with strings typed in a
// form.
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface: every text the integration shows exists in each. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** The VeSync cloud regions, as offered in the configuration. */
export const REGIONS = ['eu', 'us'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it). The
// password is a `secret` field: the store refuses a default on it.
export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  region: 'eu',
  // Seconds between two reads of the added devices. VeSync has no published
  // quota: one read a minute is what the Home Assistant integration does, and
  // the floor here.
  poll_interval: 60,
  // A purifier filter at or below this percentage fires "filter to replace".
  filter_alert_percent: 10,
  // Language of the feature names and of the texts the container produces.
  language: 'fr',
};

export const POLL_INTERVAL_MIN = 60;
export const POLL_INTERVAL_MAX = 3600;

/**
 * Merge the user config with the defaults and force the types.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const region = String(raw.region ?? DEFAULT_CONFIG.region).toLowerCase();
  const language = String(raw.language ?? DEFAULT_CONFIG.language).toLowerCase();
  return {
    email: String(raw.email ?? DEFAULT_CONFIG.email).trim(),
    // Never trimmed: a password may legitimately start or end with a space.
    password: String(raw.password ?? DEFAULT_CONFIG.password),
    region: REGIONS.includes(region) ? region : DEFAULT_CONFIG.region,
    poll_interval: clampInteger(
      raw.poll_interval,
      POLL_INTERVAL_MIN,
      POLL_INTERVAL_MAX,
      DEFAULT_CONFIG.poll_interval,
    ),
    filter_alert_percent: clampInteger(
      raw.filter_alert_percent,
      0,
      50,
      DEFAULT_CONFIG.filter_alert_percent,
    ),
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
  };
}

/** The integration can only reach VeSync once both credentials are set. */
export function isConfigured(config) {
  return Boolean(config.email && config.password);
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (value === undefined || value === null || value === '' || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
