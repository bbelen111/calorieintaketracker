/**
 * Canonical reason-code registry for the RAG food-AI pipeline.
 *
 * Every user-facing label (error message, recovery hint, chip label) and
 * default-source mapping for lookup reason codes lives here. Consumers
 * (foodSearch, foodLookupContext, aiFinalizedEntryState, chat UI) must resolve
 * reason codes through these helpers so the registries cannot drift apart.
 */

export const FOOD_LOOKUP_ERROR_REASONS = Object.freeze({
  local_search_failed: {
    message: "We couldn't find a match in the local food database.",
    recoveryHint: 'Try again in a moment, or log manually if needed.',
    chipLabel: 'No local match',
    defaultSource: 'local',
  },
  cloud_search_failed: {
    message: 'Online nutrition database lookup failed.',
    recoveryHint: 'Wait a bit and retry, or enter nutrition manually.',
    chipLabel: 'Online lookup failed',
    defaultSource: 'cloud',
  },
  cloud_search_aborted: {
    message: 'Found a stronger match and stopped the extra lookup.',
    recoveryHint: 'No action needed — we found a better match.',
    chipLabel: 'Better source used',
    defaultSource: 'cloud',
  },
  grounding_network_error: {
    message: 'Web search hit a connection problem.',
    recoveryHint: 'Check your internet connection, then retry.',
    chipLabel: 'Network issue',
    defaultSource: 'ai_web_search',
  },
  grounding_rate_limit: {
    message: "We're looking up too many items right now. Please retry shortly.",
    recoveryHint: 'Wait a moment, then retry.',
    chipLabel: 'Rate limited',
    defaultSource: 'ai_web_search',
  },
  grounding_quota_exhausted: {
    message:
      "We've reached the current web lookup limit. Please try again later.",
    recoveryHint: 'Try again later, or enter nutrition manually for now.',
    chipLabel: 'Quota reached',
    defaultSource: 'ai_web_search',
  },
  grounding_safety_blocked: {
    message: 'Web search was blocked by safety checks.',
    recoveryHint:
      "Use simpler wording and retry (for example: '2 slices pizza').",
    chipLabel: 'Search blocked',
    defaultSource: 'ai_web_search',
  },
  grounding_invalid_response: {
    message: 'Web search returned incomplete nutrition details.',
    recoveryHint: 'Retry once. If it still fails, enter this item manually.',
    chipLabel: 'Incomplete web data',
    defaultSource: 'ai_web_search',
  },
  grounding_timeout: {
    message: 'Web search took too long to finish.',
    recoveryHint: 'Retry now, or include fewer foods in one message.',
    chipLabel: 'Lookup timed out',
    defaultSource: 'ai_web_search',
  },
  grounding_unknown_error: {
    message: 'Web search failed. Please try again.',
    recoveryHint: 'Retry once. If it keeps failing, enter manually.',
    chipLabel: 'Web lookup failed',
    defaultSource: 'ai_web_search',
  },
});

export const LOOKUP_STATUS_CHIP_LABELS = Object.freeze({
  needs_grounding: 'Grounded fallback',
  no_match: 'No close match',
  error: 'Lookup issue',
});

export const LOOKUP_DECISION_REASON_LABELS = Object.freeze({
  accepted_history_match: 'Reused accepted match',
  strong_local_match: 'Strong local match',
  dominant_local_match: 'Strong local match',
  local_retained_after_cloud: 'Kept local match',
  cloud_resolved_ambiguity: 'Resolved online',
  cloud_completed_missing_macros: 'Completed nutrition',
  cloud_better_match: 'Better online match',
  cloud_no_better_match: 'Kept local result',
  cloud_no_close_match: 'No close match',
  local_ambiguous: 'Local ambiguity',
  missing_macros: 'Missing local macros',
  brand_mismatch: 'Brand mismatch',
  weak_local_match: 'Weak local match',
  no_close_match: 'No close match',
  grounding_required: 'Grounded fallback',
});

export const DEFAULT_ERROR_REASON_BY_SOURCE = Object.freeze({
  local: 'local_search_failed',
  cloud: 'cloud_search_failed',
  ai_web_search: 'grounding_unknown_error',
});

const normalizeReasonCode = (value) => String(value || '').trim();

export const getLookupErrorReasonMessage = (reasonCode) => {
  const normalizedReason = normalizeReasonCode(reasonCode);
  if (!normalizedReason) {
    return null;
  }
  const entry = FOOD_LOOKUP_ERROR_REASONS[normalizedReason];
  return entry?.message || null;
};

export const getLookupErrorRecoveryHint = (reasonCode) => {
  const normalizedReason = normalizeReasonCode(reasonCode);
  if (!normalizedReason) {
    return null;
  }
  const entry = FOOD_LOOKUP_ERROR_REASONS[normalizedReason];
  return entry?.recoveryHint || null;
};

export const getFallbackReasonChipLabel = (reasonCode) => {
  const normalizedReason = normalizeReasonCode(reasonCode);
  if (!normalizedReason) {
    return null;
  }
  const entry = FOOD_LOOKUP_ERROR_REASONS[normalizedReason];
  return entry?.chipLabel || null;
};

export const getLookupStatusChipLabel = (status) => {
  const normalizedStatus = String(status || '')
    .trim()
    .toLowerCase();
  if (!normalizedStatus) {
    return null;
  }
  return LOOKUP_STATUS_CHIP_LABELS[normalizedStatus] || null;
};

export const getLookupDecisionReasonChipLabel = (reasonCode) => {
  const normalizedReason = normalizeReasonCode(reasonCode).toLowerCase();
  if (!normalizedReason) {
    return null;
  }
  return LOOKUP_DECISION_REASON_LABELS[normalizedReason] || null;
};

export const getLookupDecisionReasonLabels = () =>
  Object.freeze({ ...LOOKUP_DECISION_REASON_LABELS });

/**
 * Identity map of error-reason code → code string. Kept in the same module as
 * the descriptive registry so consumers that need a raw code value (e.g.
 * `SOURCE_ERROR_REASON` identifiers in foodSearch) can never drift from the
 * canonical key set.
 */
export const FOOD_LOOKUP_ERROR_REASON_CODES = Object.freeze(
  Object.fromEntries(
    Object.keys(FOOD_LOOKUP_ERROR_REASONS).map((reasonCode) => [
      reasonCode,
      reasonCode,
    ])
  )
);
