import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetRagTelemetryForTests,
  getRagConfidenceCalibrationSuggestion,
  getRagSourcePreferenceWeightsForCategory,
  getRagTelemetryAggregateSnapshot,
  getRagTelemetrySessionSnapshot,
  recordRagExtractionOutcome,
  recordRagImplicitFeedback,
  recordRagLookupStats,
  recordRagPresentationNameDrift,
  recordRagStageLatency,
} from '../../src/services/ragTelemetry.js';
import { AI_RAG_QUALITY_MODE } from '../../src/services/aiRagQuality.js';

test.beforeEach(() => {
  __resetRagTelemetryForTests();
});

test('records stage latency and extraction outcomes with schema versions', async () => {
  await recordRagStageLatency({
    stage: 'extraction',
    durationMs: 120,
    schemaVersion: '1.0.0',
    qualityMode: AI_RAG_QUALITY_MODE.BALANCED,
  });

  await recordRagExtractionOutcome({
    messageType: 'food_entries',
    entriesCount: 2,
    schemaVersion: '1.0.0',
    qualityMode: AI_RAG_QUALITY_MODE.FAST,
  });

  await recordRagExtractionOutcome({
    messageType: 'clarification',
    entriesCount: 0,
    schemaVersion: '1.0.1',
    qualityMode: AI_RAG_QUALITY_MODE.PRECISION,
  });

  const snapshot = getRagTelemetrySessionSnapshot();

  assert.equal(snapshot.metrics.stageLatency.extraction.count, 1);
  assert.equal(snapshot.metrics.stageLatency.extraction.totalMs, 120);
  assert.equal(snapshot.metrics.extractionOutcomes.food_entries, 1);
  assert.equal(snapshot.metrics.extractionOutcomes.clarification, 1);
  assert.equal(snapshot.metrics.schemaVersionCounts['1.0.0'], 2);
  assert.equal(snapshot.metrics.schemaVersionCounts['1.0.1'], 1);
  assert.equal(snapshot.metrics.qualityModeCounts.balanced, 1);
  assert.equal(snapshot.metrics.qualityModeCounts.fast, 1);
  assert.equal(snapshot.metrics.qualityModeCounts.precision, 1);
  assert.ok(snapshot.metrics.extractionOutcomes.nonFoodEntriesRate > 0);
});

test('records retrieval source/confidence distributions and grounded fallback frequency', async () => {
  await recordRagLookupStats({
    schemaVersion: '1.0.0',
    lookupContext: {
      'assistant-1-0': {
        usedSource: 'local',
        matchConfidence: 'high',
        fallbackUsed: false,
      },
      'assistant-1-1': {
        usedSource: 'usda',
        matchConfidence: 'medium',
        fallbackUsed: true,
      },
      'assistant-1-2': {
        usedSource: 'ai_web_search',
        matchConfidence: 'low',
        fallbackUsed: true,
      },
    },
  });

  const snapshot = getRagTelemetrySessionSnapshot();

  assert.equal(snapshot.metrics.retrievalSourceHits.local, 1);
  assert.equal(snapshot.metrics.retrievalSourceHits.usda, 1);
  assert.equal(snapshot.metrics.retrievalSourceHits.ai_web_search, 1);
  assert.equal(snapshot.metrics.groundedFallbackCount, 2);
  assert.equal(snapshot.metrics.confidenceBySource.local.high, 1);
  assert.equal(snapshot.metrics.confidenceBySource.usda.medium, 1);
  assert.equal(snapshot.metrics.confidenceBySource.ai_web_search.low, 1);
});

test('records presentation name drift and aggregate snapshot', async () => {
  await recordRagPresentationNameDrift({
    schemaVersion: '1.0.0',
    verifiedEntries: [{ name: 'Sinangag' }, { name: 'Chicken Breast' }],
    presentationEntries: [
      { name: 'Garlic Fried Rice' },
      { name: 'Chicken Breast' },
    ],
  });

  const sessionSnapshot = getRagTelemetrySessionSnapshot();
  assert.equal(sessionSnapshot.metrics.presentationNameDrift.compared, 2);
  assert.equal(sessionSnapshot.metrics.presentationNameDrift.drifted, 1);
  assert.equal(sessionSnapshot.metrics.presentationNameDrift.rate, 0.5);

  const aggregateSnapshot = await getRagTelemetryAggregateSnapshot();
  assert.ok(aggregateSnapshot.metrics);
  assert.ok(Array.isArray(aggregateSnapshot.sessions));
});

test('records implicit feedback by confidence and message id', async () => {
  await recordRagImplicitFeedback({
    eventType: 'log_accept',
    messageId: 'assistant-123',
    entryKey: 'assistant-123-0',
    source: 'local',
    confidence: 'high',
    category: 'rice meals',
    schemaVersion: '1.0.0',
  });

  await recordRagImplicitFeedback({
    eventType: 'query_again_reject',
    messageId: 'assistant-123',
    entryKey: 'assistant-123-1',
    source: 'usda',
    confidence: 'medium',
    category: 'rice meals',
    schemaVersion: '1.0.0',
  });

  const snapshot = getRagTelemetrySessionSnapshot();
  assert.equal(snapshot.metrics.implicitFeedback.events.log_accept, 1);
  assert.equal(snapshot.metrics.implicitFeedback.events.query_again_reject, 1);
  assert.equal(
    snapshot.metrics.implicitFeedback.confidenceCorrections.high.accepted,
    1
  );
  assert.equal(
    snapshot.metrics.implicitFeedback.confidenceCorrections.medium.rejected,
    1
  );
  assert.equal(
    snapshot.metrics.implicitFeedback.feedbackByMessageId['assistant-123']
      .events,
    2
  );
});

test('confidence calibration and source weights reflect implicit feedback trends', async () => {
  await recordRagImplicitFeedback({
    eventType: 'query_again_reject',
    messageId: 'assistant-a',
    entryKey: 'assistant-a-0',
    source: 'estimate',
    confidence: 'high',
    category: 'dessert',
  });
  await recordRagImplicitFeedback({
    eventType: 'query_again_reject',
    messageId: 'assistant-a',
    entryKey: 'assistant-a-1',
    source: 'estimate',
    confidence: 'high',
    category: 'dessert',
  });
  await recordRagImplicitFeedback({
    eventType: 'log_accept',
    messageId: 'assistant-a',
    entryKey: 'assistant-a-2',
    source: 'local',
    confidence: 'high',
    category: 'dessert',
  });

  const calibration = await getRagConfidenceCalibrationSuggestion();
  assert.ok(calibration.recommended.high > calibration.base.high);

  const weights = await getRagSourcePreferenceWeightsForCategory('dessert');
  assert.ok(weights.local > weights.estimate);
});
