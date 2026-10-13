// -----------------------------------------------------------------------------
// Entry point of the VeSync (Levoit) integration for Gladys Assistant.
//
// SDK wiring only: the handlers live in src/app.js, the VeSync work in
// src/hub.js and src/vesync/. The supervisor provides GLADYS_HOST_API_URL,
// GLADYS_INTEGRATION_TOKEN and GLADYS_INTEGRATION_SELECTOR; the SDK reads them.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { createSessionStore } from './src/vesync/session.js';

const gladys = new GladysIntegration();
const app = createApp(gladys, { store: createSessionStore() });

// The SDK disconnects cleanly and exits with code 0 on SIGTERM/SIGINT.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal}: shutting down`);
  app.stop();
});

logger.info('Starting the VeSync integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection to Gladys failed', err);
  process.exit(1);
});
