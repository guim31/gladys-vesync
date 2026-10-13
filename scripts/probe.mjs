#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only check of the VeSync client against the real cloud, outside Gladys.
//
//   VESYNC_EMAIL=you@example.com VESYNC_PASSWORD=… VESYNC_REGION=eu node scripts/probe.mjs
//
// Logs in, lists the devices of the account, and reads each supported device
// once (getPurifierStatus, getHumidifierStatus, getSwitch, deviceDetail):
// never a command. It prints what the integration would see — models, the
// fields each answer carries, the parsed values — and never the e-mail, the
// password, the token, the device ids nor the device names (a name is often
// a room or a person). The session is kept in memory only.
// -----------------------------------------------------------------------------

import { pathToFileURL } from 'node:url';
import { createClient } from '../src/vesync/client.js';
import { describe } from '../src/devices/index.js';
import { createMemoryStore } from '../src/vesync/session.js';

/** The raw answer the module reads, for its field names (same requests as `read`). */
async function rawRead(client, info, model) {
  if (model.kind === 'purifier') {
    return client.bypassV2(info, 'getPurifierStatus');
  }
  if (model.kind === 'humidifier') {
    return client.bypassV2(info, 'getHumidifierStatus');
  }
  if (model.api === 'esw10') {
    return client.bypassV2(info, 'getSwitch', { id: 0 });
  }
  return client.deviceV1(info, 'deviceDetail');
}

/**
 * @param {object} options
 * @param {Record<string, string|undefined>} options.env
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(line: string) => void} [options.print]
 * @returns {Promise<number>} the exit code
 */
export async function runProbe({ env, fetchImpl = globalThis.fetch, print = console.log }) {
  const email = env.VESYNC_EMAIL ?? '';
  const password = env.VESYNC_PASSWORD ?? '';
  const region = (env.VESYNC_REGION ?? 'eu').toLowerCase() === 'us' ? 'us' : 'eu';
  if (!email || !password) {
    print('Set VESYNC_EMAIL and VESYNC_PASSWORD (and VESYNC_REGION=eu|us, eu by default).');
    return 2;
  }

  const client = createClient({ email, password, region, store: createMemoryStore(), fetchImpl });
  try {
    const session = await client.login();
    print(
      `Login: OK on the ${session.region.toUpperCase()} server (configured: ${region.toUpperCase()}), ` +
        `country ${session.countryCode}${session.regionChanged ? ', after a cross-region retry' : ''}.`,
    );
  } catch (err) {
    print(
      `Login: FAILED (${err.kind ?? 'error'}${err.code ? `, code ${err.code}` : ''}): ${err.message}`,
    );
    return 1;
  }

  let devices;
  try {
    devices = await client.listDevices();
  } catch (err) {
    print(`Device list: FAILED (${err.kind ?? 'error'}): ${err.message}`);
    return 1;
  }
  print(`Device list: ${devices.length} device(s).`);

  let failures = 0;
  for (const [index, info] of devices.entries()) {
    const described = describe(info);
    const label = `#${index + 1} ${info.deviceType || '(no type)'}`;
    if (!described) {
      print(`${label}: not supported (${info.connectionStatus ?? 'unknown'}).`);
      continue;
    }
    const { model, module } = described;
    try {
      const raw = await rawRead(client, info, model);
      const state = module.parseState(model, raw);
      print(
        `${label}: ${model.name} (${model.kind}, ${model.api} API), ${info.connectionStatus ?? '?'}.`,
      );
      print(`   fields: ${Object.keys(raw).sort().join(', ') || '(none)'}`);
      print(`   values: ${JSON.stringify(module.featureValues(state))}`);
    } catch (err) {
      failures += 1;
      print(`${label}: ${model.name}, read FAILED (${err.kind ?? 'error'}): ${err.message}`);
    }
  }
  return failures === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await runProbe({ env: process.env });
}
