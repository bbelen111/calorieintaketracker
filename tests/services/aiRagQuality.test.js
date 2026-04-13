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

  assert.ok(fastPreset.extractionTimeoutMs < balancedPreset.extractionTimeoutMs);
  assert.ok(precisionPreset.extractionTimeoutMs > balancedPreset.extractionTimeoutMs);
  assert.ok(fastPreset.localLimit < balancedPreset.localLimit);
  assert.ok(precisionPreset.localLimit > balancedPreset.localLimit);
  assert.equal(fastPreset.enableDeferredGrounding, false);
  assert.equal(balancedPreset.enableDeferredGrounding, true);
});

test('AI_RAG_QUALITY_OPTIONS covers all available modes', () => {
  assert.deepEqual(
    AI_RAG_QUALITY_OPTIONS.map((option) => option.value).sort(),
    Object.values(AI_RAG_QUALITY_MODE).sort()
  );
});
