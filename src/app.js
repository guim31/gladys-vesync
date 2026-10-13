// -----------------------------------------------------------------------------
// Wiring of the Gladys handlers to the hub. Kept apart from index.js so the
// tests run the real wiring against the SDK's fake Gladys.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { TEXT } from './i18n.js';
import { createHub } from './hub.js';
import { WIDGET } from './widgets.js';

export const ACTION = { TEST_CONNECTION: 'test_connection' };

/**
 * Register every handler on a Gladys client. Call before `connect()`.
 * @param {object} gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {object} [options] passed to createHub (store, fetchImpl, timers, now, logger)
 */
export function createApp(gladys, options = {}) {
  const logger = options.logger ?? createLogger({ name: 'vesync' });
  const hub = createHub({ gladys, logger, ...options });

  gladys.onScanRequest(() => hub.scan());
  gladys.onSetValue((device, feature, value) => hub.setValue(device, feature, value));
  gladys.onPoll((device) => hub.pollFromCore(device));
  gladys.onDeviceCreated((device) => hub.deviceCreated(device));
  gladys.onDeviceUpdated((device) => hub.deviceCreated(device));
  gladys.onConfigUpdated(async (config) => {
    logger.info('New configuration received');
    await hub.start(normalizeConfig(config));
  });
  gladys.onAction(ACTION.TEST_CONNECTION, () => hub.testConnection());
  gladys.onWidgetGet(WIDGET.AIR_QUALITY, async (request) => hub.widgetContent(request));

  gladys.on('connected', async () => {
    try {
      await hub.start(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error(`Initialization failed (${err.message})`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  return { hub, stop: () => hub.stop() };
}
