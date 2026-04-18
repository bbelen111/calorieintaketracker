import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_RAG_QUALITY_MODE,
  AI_RAG_QUALITY_OPTIONS,
  getAiRagQualityPreset,
  normalizeAiRagQualityMode,
} from '../../src/services/aiRagQuality.js';

test('normalizeAiRagQualityMode coerces unknown values to balanced', () => {
  assert.equal(normalizeAiRagQualityMode('FAST'), AI_RAG_QUALITY_MODE.FAST);
  assert.equal(
    normalizeAiRagQualityMode('unknown-mode'),
    AI_RAG_QUALITY_MODE.BALANCED
  );
});

test('getAiRagQualityPreset exposes expected mode knobs', () => {
  const fastPreset = getAiRagQualityPreset(AI_RAG_QUALITY_MODE.FAST);
  const balancedPreset = getAiRagQualityPreset(AI_RAG_QUALITY_MODE.BALANCED);
  const precisionPreset = getAiRagQualityPreset(
    AI_RAG_QUALITY_MODE.PRECISION
  );

  assert.equal(fastPreset.extractionTimeoutMs, balancedPreset.extractionTimeoutMs);
  assert.equal(
    balancedPreset.extractionTimeoutMs,
    precisionPreset.extractionTimeoutMs
  );
  assert.equal(
    fastPreset.presentationTimeoutMs,
    balancedPreset.presentationTimeoutMs
  );
  assert.equal(
    balancedPreset.presentationTimeoutMs,
    precisionPreset.presentationTimeoutMs
  );
  assert.equal(
    fastPreset.groundedLookupTimeoutMs,
    balancedPreset.groundedLookupTimeoutMs
  );
  assert.equal(
    balancedPreset.groundedLookupTimeoutMs,
    precisionPreset.groundedLookupTimeoutMs
  );
  assert.equal(
    fastPreset.groundedLookupTimeoutMs,
    fastPreset.extractionTimeoutMs
  );
  assert.equal(
    balancedPreset.groundedLookupTimeoutMs,
    balancedPreset.extractionTimeoutMs
  );
  assert.equal(
    precisionPreset.groundedLookupTimeoutMs,
    precisionPreset.extractionTimeoutMs
  );
  assert.ok(
    fastPreset.groundedBatchTimeoutMs > fastPreset.groundedLookupTimeoutMs
  );
  assert.ok(
    balancedPreset.groundedBatchTimeoutMs >
      balancedPreset.groundedLookupTimeoutMs
  );
  assert.ok(
    precisionPreset.groundedBatchTimeoutMs >
      precisionPreset.groundedLookupTimeoutMs
  );
  assert.ok(fastPreset.localLimit < balancedPreset.localLimit);
  assert.ok(precisionPreset.localLimit > balancedPreset.localLimit);
  assert.ok(fastPreset.onlinePageSize < balancedPreset.onlinePageSize);
  assert.ok(precisionPreset.onlinePageSize > balancedPreset.onlinePageSize);
  assert.equal(fastPreset.enableDeferredGrounding, false);
  assert.equal(balancedPreset.enableDeferredGrounding, true);
});

test('AI_RAG_QUALITY_OPTIONS covers all available modes', () => {
  assert.deepEqual(
    AI_RAG_QUALITY_OPTIONS.map((option) => option.value).sort(),
    Object.values(AI_RAG_QUALITY_MODE).sort()
  );
});
