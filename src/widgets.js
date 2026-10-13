// -----------------------------------------------------------------------------
// The "Air quality" dashboard widget (manifest `widgets`; the key is forever).
//
// One card for the main devices: a live tile per purifier (PM2.5) and per
// humidifier (humidity), up to six, then one status row per device (up to
// ten) — air quality and mode, tank empty, filter to replace, offline. The
// optional `device` setting narrows the card to one device.
//
// The core budget (8 components, 6 tiles, 1 status, 2 texts) is applied before
// anything else: the content is built to fit it. The tiles are bound to the
// device features, so they follow the published states with no refresh; the
// status rows are refreshed by requestWidgetRefresh when a summary changes.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { AIR_QUALITY, MESSAGES, MODE_LABELS, TEXT, pick } from './i18n.js';

export const WIDGET = { AIR_QUALITY: 'air_quality' };

export const WIDGET_TTL_SECONDS = 60;
const MAX_TILES = 6;
const MAX_ROWS = 10;
const LABEL_MAX = 24;
const ROW_LABEL_MAX = 40;

const KIND_ORDER = { purifier: 0, humidifier: 1, outlet: 2 };

/** A text cut to `max` characters, with an ellipsis. */
function cut(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * The summary of a device: its status row value and color. Shared by the
 * widget and by the hub, which refreshes the widget when it changes.
 * @param {{ kind: string, state: object, online: boolean|undefined }} entry
 * @param {string} language
 * @param {number} filterThreshold
 */
export function summarize(entry, language, filterThreshold) {
  const { state, kind } = entry;
  if (entry.online === false) {
    return { value: pick(TEXT.offline, language), color: WIDGET_COLORS.NEUTRAL };
  }
  if (state.on === false) {
    return { value: pick(TEXT.off, language), color: WIDGET_COLORS.NEUTRAL };
  }
  const labels = MODE_LABELS[language] ?? MODE_LABELS.en;
  const parts = [];
  let color = WIDGET_COLORS.SUCCESS;
  if (kind === 'purifier') {
    if (state.airQuality !== undefined) {
      parts.push(pick(AIR_QUALITY[state.airQuality], language));
      color =
        state.airQuality >= 4
          ? WIDGET_COLORS.DANGER
          : state.airQuality === 3
            ? WIDGET_COLORS.WARNING
            : WIDGET_COLORS.SUCCESS;
    }
    if (state.mode) {
      parts.push(labels[state.mode]);
    }
    if (state.filterLife !== undefined && state.filterLife <= filterThreshold) {
      parts.push(pick(MESSAGES.filter(state.filterLife), language));
      if (color === WIDGET_COLORS.SUCCESS) {
        color = WIDGET_COLORS.WARNING;
      }
    }
  } else if (kind === 'humidifier') {
    if (state.waterLacks) {
      return { value: pick(TEXT.tankEmpty, language), color: WIDGET_COLORS.DANGER };
    }
    if (state.humidity !== undefined) {
      parts.push(`${state.humidity} %`);
    }
    if (state.mode) {
      parts.push(labels[state.mode]);
    }
    color = WIDGET_COLORS.INFO;
  } else {
    parts.push(pick(TEXT.on, language));
    if (state.power !== undefined) {
      parts.push(`${state.power} W`);
    }
  }
  const value = parts.length > 0 ? parts.join(' · ') : pick(TEXT.on, language);
  return { value: cut(value, ROW_LABEL_MAX), color };
}

/**
 * The widget content.
 * @param {object} options
 * @param {boolean} options.configured are the credentials set?
 * @param {{ name: string, kind: string, state: object, online: boolean|undefined, tile?: string }[]} options.entries
 *   the devices added to Gladys; `tile` is the external id of the feature of its tile
 * @param {string} options.language
 * @param {number} options.filterThreshold
 */
export function buildAirQualityContent({ configured, entries, language, filterThreshold }) {
  if (!configured) {
    return {
      ttl_seconds: WIDGET_TTL_SECONDS,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.notConfigured, language) }],
    };
  }
  if (entries.length === 0) {
    return {
      ttl_seconds: WIDGET_TTL_SECONDS,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.noDevice, language) }],
    };
  }
  const sorted = [...entries].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
  );
  const components = [];
  for (const entry of sorted) {
    if (entry.tile && components.length < MAX_TILES) {
      components.push({
        type: 'value',
        label: cut(entry.name, LABEL_MAX),
        device_feature: entry.tile,
        icon: entry.kind === 'purifier' ? 'wind' : 'droplet',
      });
    }
  }
  const items = sorted.slice(0, MAX_ROWS).map((entry) => {
    const { value, color } = summarize(entry, language, filterThreshold);
    return { label: cut(entry.name, ROW_LABEL_MAX), value, color };
  });
  components.push({ type: 'status', items });
  return { ttl_seconds: WIDGET_TTL_SECONDS, components };
}
