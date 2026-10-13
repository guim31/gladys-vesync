import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('defaults when nothing is configured', () => {
  const config = normalizeConfig();
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(isConfigured(config), false);
});

test('values from the form are typed and bounded', () => {
  const config = normalizeConfig({
    email: '  someone@example.com ',
    password: ' with spaces ',
    region: 'US',
    poll_interval: '30',
    filter_alert_percent: '15',
    language: 'DE',
  });
  assert.equal(config.email, 'someone@example.com');
  assert.equal(config.password, ' with spaces ', 'a password is never trimmed');
  assert.equal(config.region, 'us');
  assert.equal(config.poll_interval, 60, 'one minute at least');
  assert.equal(config.filter_alert_percent, 15);
  assert.equal(config.language, 'de');
  assert.equal(isConfigured(config), true);

  assert.equal(normalizeConfig({ poll_interval: 99999 }).poll_interval, 3600);
  assert.equal(normalizeConfig({ poll_interval: 'abc' }).poll_interval, 60);
  assert.equal(normalizeConfig({ region: 'asia' }).region, 'eu');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
  assert.equal(normalizeConfig({ filter_alert_percent: -5 }).filter_alert_percent, 0);
});
