// -----------------------------------------------------------------------------
// Entry point of the Gladys ComEd Hourly Pricing integration.
//
// SDK wiring only: the handlers are registered by src/app.js BEFORE connect().
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
// /data is the one writable volume of the container; COMED_DATA_DIR
// points elsewhere to run it outside Gladys.
const app = createApp(gladys, { dataDir: process.env.COMED_DATA_DIR });

// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT).
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

logger.info('Starting the ComEd Hourly Pricing integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
