// -----------------------------------------------------------------------------
// scripts/probe.mjs, against the fake cloud: it reads, never commands, and
// never prints a credential, a device id nor a device name.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProbe } from '../scripts/probe.mjs';
import { hashPassword } from '../src/vesync/client.js';
import { createFakeVesync } from './helpers/fakeVesync.js';
import { household } from './helpers/world.js';

const EMAIL = 'probe@example.com';
const PASSWORD = 'Pr0be-secret';

test('the probe reads every supported device once and prints nothing sensitive', async () => {
  const fake = createFakeVesync({ email: EMAIL, password: PASSWORD, ...household() });
  const lines = [];
  const code = await runProbe({
    env: { VESYNC_EMAIL: EMAIL, VESYNC_PASSWORD: PASSWORD, VESYNC_REGION: 'us' },
    fetchImpl: fake.fetch,
    print: (line) => lines.push(line),
  });
  assert.equal(code, 0);
  const output = lines.join('\n');
  assert.match(
    output,
    /Login: OK on the EU server \(configured: US\), country FR, after a cross-region retry/,
  );
  assert.match(output, /Device list: 9 device\(s\)/);
  assert.match(output, /#1 Core400S: Core 400S \(purifier, core API\), online/);
  assert.match(output, /#8 ESL100: not supported/);
  assert.match(output, /"pm25":3/);

  for (const secret of [
    EMAIL,
    PASSWORD,
    hashPassword(PASSWORD),
    'token-1',
    'cid-core400s',
    'Salon',
  ]) {
    assert.ok(!output.includes(secret), `"${secret}" printed`);
  }
  // Only reads.
  const methods = fake.payloadMethods();
  assert.ok(
    methods.every((method) => method.startsWith('get')),
    methods.join(', '),
  );
  assert.equal(fake.callsTo('/deviceStatus').length, 0);
});

test('the probe says what is missing, and a refused login', async () => {
  const lines = [];
  assert.equal(await runProbe({ env: {}, print: (line) => lines.push(line) }), 2);
  assert.match(lines[0], /Set VESYNC_EMAIL and VESYNC_PASSWORD/);

  const fake = createFakeVesync({ email: EMAIL, password: 'other' });
  const refused = [];
  const code = await runProbe({
    env: { VESYNC_EMAIL: EMAIL, VESYNC_PASSWORD: PASSWORD },
    fetchImpl: fake.fetch,
    print: (line) => refused.push(line),
  });
  assert.equal(code, 1);
  assert.match(refused[0], /Login: FAILED \(auth, code -11201022\)/);
  assert.ok(!refused.join('\n').includes(PASSWORD));
});
