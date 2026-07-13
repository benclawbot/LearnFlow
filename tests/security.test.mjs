import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BODY_BYTES,
  enforceRateLimit,
  readJsonBody,
  validateAnalyzeBody,
  validateExploreBody
} from '../server/security.mjs';

test('validateExploreBody trims and accepts a valid topic', () => {
  assert.equal(validateExploreBody({ topic: '  Quantum computing  ' }).topic, 'Quantum computing');
});

test('validateExploreBody rejects empty and oversized topics', () => {
  assert.throws(() => validateExploreBody({ topic: '   ' }), /topic is required/);
  assert.throws(() => validateExploreBody({ topic: 'x'.repeat(241) }), /240 characters or fewer/);
});

test('validateAnalyzeBody bounds and validates selected items', () => {
  assert.deepEqual(validateAnalyzeBody({ selectedItems: ['A', { title: 'B' }] }).selectedItems, ['A', { title: 'B' }]);
  assert.throws(() => validateAnalyzeBody({ selectedItems: [] }), /selectedItems is required/);
  assert.throws(() => validateAnalyzeBody({ selectedItems: Array.from({ length: 81 }, (_, index) => String(index)) }), /80 items or fewer/);
});

test('readJsonBody rejects invalid JSON and oversized bodies', async () => {
  await assert.rejects(readJsonBody({ body: '{invalid' }), /valid JSON/);
  await assert.rejects(readJsonBody({ body: 'x'.repeat(MAX_BODY_BYTES + 1) }), /too large/);
});

test('enforceRateLimit blocks after the configured limit', () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(enforceRateLimit(key, { limit: 2 }).allowed, true);
  assert.equal(enforceRateLimit(key, { limit: 2 }).allowed, true);
  assert.equal(enforceRateLimit(key, { limit: 2 }).allowed, false);
});
