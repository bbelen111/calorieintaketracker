import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFinalizedEntryCardState,
  getFallbackReasonChipLabel,
  getFinalizedSourceBadge,
  getLookupStatusChipLabel,
} from '../../src/utils/food/aiFinalizedEntryState.js';

test('getFinalizedSourceBadge returns calm primary badge labels for known sources', () => {
  assert.deepEqual(getFinalizedSourceBadge('local'), {
    label: 'Verified match',
    className: 'bg-accent-green/20 text-accent-green',
  });
  assert.deepEqual(getFinalizedSourceBadge('usda'), {
    label: 'Verified match',
    className: 'bg-accent-green/20 text-accent-green',
  });
  assert.deepEqual(getFinalizedSourceBadge('estimate'), {
    label: 'AI estimate',
    className: 'bg-accent-slate/20 text-accent-slate',
  });
});

test('fallback and lookup status labels remain available for disclosure panels', () => {
  assert.equal(
    getFallbackReasonChipLabel('grounding_timeout'),
    'Lookup timed out'
  );
  assert.equal(
    getFallbackReasonChipLabel('local_search_failed'),
    'No local match'
  );
  assert.equal(getFallbackReasonChipLabel('unknown_reason'), null);

  assert.equal(
    getLookupStatusChipLabel('needs_grounding'),
    'Grounded fallback'
  );
  assert.equal(getLookupStatusChipLabel('error'), 'Lookup issue');
  assert.equal(getLookupStatusChipLabel('resolved'), null);
});

test('buildFinalizedEntryCardState prefers reused accepted matches as the one visible badge', () => {
  const cardState = buildFinalizedEntryCardState({
    entry: {
      source: 'local',
      confidence: 'high',
    },
    lookupMeta: {
      acceptedFromHistory: true,
      decisionReason: 'accepted_history_match',
      status: 'resolved',
      matchConfidence: 'high',
    },
  });

  assert.deepEqual(cardState.primaryBadge, {
    label: 'Reused match',
    className: 'bg-accent-blue/15 text-accent-blue',
  });
  assert.equal(
    cardState.detailsSummary.decisionReason,
    'Reused accepted match'
  );
  assert.equal(cardState.detailsSummary.confidenceLabel, 'high');
});

test('buildFinalizedEntryCardState uses source-based calm badge for verified and estimate states', () => {
  const verified = buildFinalizedEntryCardState({
    entry: { source: 'ai' },
    lookupMeta: { usedSource: 'usda', matchConfidence: 'medium' },
  });
  const estimated = buildFinalizedEntryCardState({
    entry: { source: 'estimate' },
    lookupMeta: {
      decisionReason: 'usda_better_match',
      matchConfidence: 'medium',
    },
    primaryLookupReasonCode: 'usda_search_failed',
  });

  assert.equal(verified.primaryBadge.label, 'Verified match');
  assert.equal(estimated.primaryBadge.label, 'AI estimate');
  assert.equal(estimated.detailsSummary.fallbackReason, 'Online lookup failed');
  assert.equal(estimated.detailsSummary.decisionReason, 'Better online match');
});

test('buildFinalizedEntryCardState prefers lookupMeta.usedSource over raw ai entry source', () => {
  const localCardState = buildFinalizedEntryCardState({
    entry: { source: 'ai' },
    lookupMeta: { usedSource: 'local', matchConfidence: 'high' },
  });
  const webCardState = buildFinalizedEntryCardState({
    entry: { source: 'ai' },
    lookupMeta: { usedSource: 'ai_web_search', matchConfidence: 'medium' },
  });

  assert.equal(localCardState.primaryBadge.label, 'Verified match');
  assert.equal(webCardState.primaryBadge.label, 'Estimated from web');
});

test('buildFinalizedEntryCardState lets warning-grade integrity issues override calmer badges', () => {
  const cardState = buildFinalizedEntryCardState({
    entry: {
      source: 'estimate',
      nutritionIntegrityIssue: true,
      confidence: 'low',
    },
    lookupMeta: {
      verificationFallbackUsed: true,
      decisionReason: 'grounding_required',
      status: 'error',
    },
    primaryLookupReasonCode: 'grounding_timeout',
  });

  assert.deepEqual(cardState.primaryBadge, {
    label: 'Needs review',
    className: 'bg-accent-red/20 text-accent-red',
  });
  assert.equal(cardState.detailsSummary.lookupStatus, 'Lookup issue');
  assert.equal(cardState.detailsSummary.fallbackReason, 'Lookup timed out');
  assert.equal(cardState.detailsSummary.decisionReason, 'Grounded fallback');
  assert.equal(cardState.detailsSummary.confidenceLabel, 'low');
});
