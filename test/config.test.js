import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults, and keeps a known language only', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(normalizeConfig({ language: 'es' }).language, 'es');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
