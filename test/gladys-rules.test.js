// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures: one device of every supported VeSync type (purifiers, humidifiers,
// plugs), in every feature-name language, and the household of
// test/helpers/world.js as the fake Gladys receives it.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { LANGUAGES } from '../src/config.js';
import { buildDevice, describe } from '../src/devices/index.js';
import { normalizeListedDevice } from '../src/vesync/client.js';
import { MODELS } from '../src/vesync/models.js';
import { listed } from './helpers/fakeVesync.js';
import { createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

/** One device per supported deviceType. */
function everyType(language) {
  const gladys = createFakeGladys();
  return MODELS.flatMap((model) => model.types).map((deviceType, index) =>
    buildDevice(
      gladys,
      describe(normalizeListedDevice(listed(deviceType, { cid: `cid-${index}` }))),
      language,
    ),
  );
}

function checkDevice(device) {
  const where = device.name;

  // should_poll: true if and only if poll_frequency is provided, in ms.
  if (device.poll_frequency === undefined) {
    assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
  } else {
    assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
    assert.ok(
      table.poll_frequencies_ms.includes(device.poll_frequency),
      `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
    );
  }

  assert.ok(device.features.length > 0, `${where}: no feature`);
  const externalIds = new Set();
  const names = new Set();
  for (const feature of device.features) {
    const at = `${where} / ${feature.name}`;
    const pair = table.pairs[`${feature.category}/${feature.type}`];
    assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
    assert.ok(pair.label_en && pair.label_fr && pair.icon, `${at}: couple without label or icon`);

    assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
    assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
    assert.ok(
      Number.isFinite(feature.min) && Number.isFinite(feature.max),
      `${at}: finite min/max`,
    );
    assert.ok(feature.min <= feature.max, `${at}: min > max`);
    assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${at}: has_feedback must be a boolean`);
    if (feature.unit !== undefined) {
      assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
      const allowed = table.units_by_category[feature.category];
      if (allowed) {
        assert.ok(allowed.flat().includes(feature.unit), `${at}: ${feature.unit} not allowed`);
      }
    }

    // A string option is only accepted on text/select (400 otherwise); labels
    // non-empty, values unique.
    if (feature.supported_options !== undefined) {
      const values = feature.supported_options.map((option) => String(option.value));
      assert.equal(new Set(values).size, values.length, `${at}: duplicate option values`);
      for (const option of feature.supported_options) {
        assert.ok(option.label && typeof option.label === 'string', `${at}: option without label`);
        if (typeof option.value === 'string') {
          assert.equal(
            `${feature.category}/${feature.type}`,
            'text/select',
            `${at}: string option`,
          );
        }
      }
    }

    assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
    externalIds.add(feature.external_id);
    assert.ok(
      feature.external_id.startsWith(`${device.external_id}:`),
      `${at}: the feature id extends the device id`,
    );
    assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
    names.add(feature.name);
  }
}

for (const language of LANGUAGES) {
  test(`every supported VeSync type follows the Gladys rules (${language} names)`, () => {
    const devices = everyType(language);
    assert.equal(devices.length, MODELS.flatMap((model) => model.types).length);
    for (const device of devices) {
      checkDevice(device);
    }
    const ids = devices.map((device) => device.external_id);
    assert.equal(new Set(ids).size, ids.length, 'device external ids are unique');
  });
}

test('the devices the fake Gladys accepted follow the rules too', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const devices = world.gladys.fake.discoveredDevices;
  assert.ok(devices.length >= 7, `expected the household, got ${devices.length}`);
  for (const device of devices) {
    checkDevice(device);
  }
  // The fake Gladys refuses (400) what the core refuses: nothing was refused.
  const refused = world.gladys.fake.requests.filter((request) => request.status !== 200);
  assert.deepEqual(refused, []);
});
