// -----------------------------------------------------------------------------
// A whole integration under test: the SDK's fake Gladys
// (`@gladysassistant/integration-sdk/testing`), the fake VeSync cloud, the
// real wiring of src/app.js — and the log lines it writes.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { buildDevice, describe } from '../../src/devices/index.js';
import { normalizeListedDevice } from '../../src/vesync/client.js';
import { createMemoryStore } from '../../src/vesync/session.js';
import { createFakeVesync, listed, pyvesyncDetail } from './fakeVesync.js';

export const EMAIL = 'someone@example.com';
export const PASSWORD = 'Sup3r-s3cret!';
export const CONFIG = { email: EMAIL, password: PASSWORD, region: 'eu', language: 'fr' };

/** A household: purifiers, humidifiers, a plug, and two devices not supported. */
export function household() {
  const devices = [
    listed('Core400S', { cid: 'cid-core400s', name: 'Salon' }),
    listed('LAP-V201S-WEU', { cid: 'cid-vital200s', name: 'Chambre' }),
    listed('Core200S', { cid: 'cid-core200s', name: 'Bureau' }),
    listed('LUH-O451S-WEU', { cid: 'cid-oasis450', name: 'Humidificateur salon' }),
    listed('LUH-M101S-WEUR', { cid: 'cid-oasis1000', name: 'Chambre bébé' }),
    listed('ESW01-EU', { cid: 'cid-esw01', name: 'Prise lampe' }),
    listed('ESW10-EU', { cid: 'cid-esw10', name: 'Prise radiateur' }),
    listed('ESL100', { cid: 'cid-bulb', name: 'Ampoule' }),
    listed('LV-PUR131S', { cid: 'cid-pur131', name: 'Vieux purificateur' }),
  ];
  const details = {
    'cid-core400s': pyvesyncDetail('Core400S'),
    'cid-vital200s': pyvesyncDetail('LAP-V201S'),
    'cid-core200s': pyvesyncDetail('Core200S'),
    'cid-oasis450': pyvesyncDetail('LUH-O451S-WEU'),
    'cid-oasis1000': pyvesyncDetail('LUH-M101S-WEUR'),
    'cid-esw01': pyvesyncDetail('ESW03'),
    'cid-esw10': pyvesyncDetail('ESW10-USA'),
  };
  return { devices: structuredClone(devices), details: structuredClone(details) };
}

/**
 * @param {object} [options]
 * @param {object} [options.config] merged into CONFIG
 * @param {'all'|string[]} [options.created] cids the user added to Gladys
 * @param {boolean} [options.timers] run the polling timer
 * @param {boolean} [options.connect] connect at once (default true)
 * @param {object} [options.vesync] options of createFakeVesync
 */
export async function createWorld({
  config = {},
  created = 'all',
  timers = false,
  connect = true,
  vesync = {},
} = {}) {
  const { devices, details } = household();
  const fake = createFakeVesync({
    email: EMAIL,
    password: PASSWORD,
    devices,
    details,
    ...vesync,
  });
  const fullConfig = { ...CONFIG, ...config };

  // The devices the user added, as Gladys stores them.
  const probe = createFakeGladys();
  const gladysDevices = fake.devices
    .map(normalizeListedDevice)
    .map(describe)
    .filter(Boolean)
    .filter((item) => created === 'all' || created.includes(item.info.cid))
    .map((item) => buildDevice(probe, item, fullConfig.language ?? 'fr'));

  const lines = [];
  const capture =
    (level) =>
    (prefix, ...args) =>
      lines.push({ level, text: [prefix, ...args].join(' ') });
  const logger = createLogger({ name: 'vesync', level: 'debug' });
  const gladys = createFakeGladys({ config: fullConfig, devices: gladysDevices });
  const originalLog = console.log;
  const originalError = console.error;
  console.log = capture('out');
  console.error = capture('err');
  const restoreConsole = () => {
    console.log = originalLog;
    console.error = originalError;
  };

  const app = createApp(gladys, {
    store: createMemoryStore(),
    fetchImpl: fake.fetch,
    timers,
    logger,
  });
  if (connect) {
    await gladys.connect();
  }

  const ids = (kind, cid) => gladys.externalIds(kind, cid);
  return {
    gladys,
    fake,
    app,
    hub: app.hub,
    lines,
    ids,
    /** The Gladys device of a cid. */
    device: (cid) => gladysDevices.find((device) => device.external_id.endsWith(`:${cid}`)),
    /** Log lines at info level or above. */
    infoLines: () => lines.filter((line) => /\[(INFO|WARN|ERROR)\]/.test(line.text)),
    async stop() {
      app.stop();
      restoreConsole();
      await gladys.disconnect().catch(() => {});
    },
  };
}
