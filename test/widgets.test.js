// -----------------------------------------------------------------------------
// The "Air quality" widget: valid for the core (validateWidgetContent), within
// its budget, bound to features that exist, localized from the request.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildAirQualityContent, summarize } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

test('the content is valid, within budget, and its tiles are bound to real features', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const featureIds = new Set(
    world.gladys.fake.discoveredDevices.flatMap((device) =>
      device.features.map((feature) => feature.external_id),
    ),
  );

  for (const language of LANGUAGES) {
    const ack = await world.gladys.fake.widgetGet('air_quality', { language });
    assert.equal(ack.success, true);
    const content = ack.data.content;
    assert.deepEqual(validateWidgetContent(content), [], `${language}: rendered as sent`);

    const tiles = content.components.filter((component) => component.type === 'value');
    assert.equal(tiles.length, 4, '2 purifiers with a sensor (not the Core 200S) + 2 humidifiers');
    for (const tile of tiles) {
      assert.ok(featureIds.has(tile.device_feature), `${tile.device_feature} exists`);
    }
    const [status] = content.components.filter((component) => component.type === 'status');
    assert.equal(status.items.length, 7, 'one row per added device');
  }

  const fr = (await world.gladys.fake.widgetGet('air_quality', { language: 'fr' })).data.content;
  const rows = Object.fromEntries(
    fr.components
      .find((component) => component.type === 'status')
      .items.map((item) => [item.label, item]),
  );
  assert.deepEqual(rows.Salon, { label: 'Salon', value: 'Bonne · Manuel', color: 'success' });
  assert.deepEqual(rows['Humidificateur salon'], {
    label: 'Humidificateur salon',
    value: '50 % · Manuel',
    color: 'info',
  });
  assert.deepEqual(rows['Prise lampe'], {
    label: 'Prise lampe',
    value: 'En marche · 20 W',
    color: 'success',
  });
});

test('the device setting narrows the card to one device', async (t) => {
  const world = await createWorld();
  t.after(() => world.stop());
  const device = world.ids('humidifier', 'cid-oasis1000').device;
  const ack = await world.gladys.fake.widgetGet('air_quality', {
    language: 'es',
    settings: { device },
  });
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components.map((component) => component.type),
    ['value', 'status'],
  );
  assert.equal(content.components[1].items[0].value, '50 % · Manual');
});

test('an empty tank, a filter to replace, an offline device are said in the rows', () => {
  const filterThreshold = 10;
  assert.deepEqual(
    summarize(
      { kind: 'humidifier', state: { on: true, waterLacks: true }, online: true },
      'fr',
      filterThreshold,
    ),
    { value: 'Réservoir vide', color: 'danger' },
  );
  assert.deepEqual(
    summarize(
      {
        kind: 'purifier',
        state: { on: true, airQuality: 1, mode: 'auto', filterLife: 8 },
        online: true,
      },
      'de',
      filterThreshold,
    ),
    { value: 'Ausgezeichnet · Auto · Filter 8 %', color: 'warning' },
  );
  assert.deepEqual(
    summarize({ kind: 'purifier', state: { on: true, airQuality: 4 }, online: true }, 'en', 10),
    { value: 'Poor', color: 'danger' },
  );
  assert.deepEqual(summarize({ kind: 'outlet', state: { on: true }, online: false }, 'es', 10), {
    value: 'Sin conexión',
    color: 'neutral',
  });
  assert.deepEqual(summarize({ kind: 'purifier', state: { on: false }, online: true }, 'fr', 10), {
    value: 'Arrêté',
    color: 'neutral',
  });
});

test('not configured, no device: a sentence, valid content', () => {
  for (const language of LANGUAGES) {
    const notConfigured = buildAirQualityContent({
      configured: false,
      entries: [],
      language,
      filterThreshold: 10,
    });
    assert.deepEqual(validateWidgetContent(notConfigured), []);
    const empty = buildAirQualityContent({
      configured: true,
      entries: [],
      language,
      filterThreshold: 10,
    });
    assert.deepEqual(validateWidgetContent(empty), []);
    assert.equal(empty.components[0].type, 'text');
  }
});

test('many devices: six tiles and ten rows at most, long names cut', () => {
  const entries = Array.from({ length: 14 }, (_, index) => ({
    name: `Purificateur de la chambre numéro ${index} au fond du couloir`,
    kind: 'purifier',
    state: { on: true, airQuality: 2, mode: 'auto' },
    online: true,
    tile: `ext:test:purifier:cid-${index}:pm25`,
  }));
  const content = buildAirQualityContent({
    configured: true,
    entries,
    language: 'fr',
    filterThreshold: 10,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components.filter((component) => component.type === 'value').length, 6);
  const status = content.components.find((component) => component.type === 'status');
  assert.equal(status.items.length, 10);
  for (const component of content.components) {
    if (component.type === 'value') {
      assert.ok(component.label.length <= 24);
    }
  }
  for (const item of status.items) {
    assert.ok(item.label.length <= 40 && item.value.length <= 40);
  }
});
