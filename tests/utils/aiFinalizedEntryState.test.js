import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFinalizedEntryChips,
  getFallbackReasonChipLabel,
  getFinalizedSourceBadge,
  getLookupStatusChipLabel,
} from '../../src/utils/food/aiFinalizedEntryState.js';

test('getFinalizedSourceBadge returns verified database badge for local sources', () => {
  assert.deepEqual(getFinalizedSourceBadge('local'), {
    label: 'Verified Database',
    className: 'bg-accent-green/20 text-accent-green',
  });
  assert.deepEqual(getFinalizedSourceBadge('usda'), {
    label: 'Verified Database',
    className: 'bg-accent-green/20 text-accent-green',
  });
});

test('fallback and lookup status chip labels expose concise finalized-state summaries', () => {
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

test('buildFinalizedEntryChips includes finalized and fallback explanation chips without duplicates', () => {
  const chips = buildFinalizedEntryChips({
    entry: {
      source: 'estimate',
      nutritionIntegrityIssue: true,
      nameRewriteSuppressed: true,
    },
    lookupMeta: {
      status: 'error',
      verificationFallbackUsed: true,
    },
    primaryLookupReasonCode: 'grounding_timeout',
  });

  assert.deepEqual(
    chips.map((chip) => chip.label),
    [
      'AI Estimate',
      'Finalized',
      'Fallback verified',
      'Macro guardrail',
      'Name locked',
      'Fallback estimate',
      'Lookup timed out',
      'Lookup issue',
    ]
  );
});
