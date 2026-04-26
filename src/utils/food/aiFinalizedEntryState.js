const PRIMARY_BADGE_BY_SOURCE = Object.freeze({
  local: {
    label: 'Verified match',
    className: 'bg-accent-green/20 text-accent-green',
  },
  usda: {
    label: 'Verified match',
    className: 'bg-accent-green/20 text-accent-green',
  },
  ai_web_search: {
    label: 'Estimated from web',
    className: 'bg-accent-amber/20 text-accent-amber',
  },
  estimate: {
    label: 'AI estimate',
    className: 'bg-accent-slate/20 text-accent-slate',
  },
});

const FALLBACK_REASON_CHIP_LABELS = Object.freeze({
  local_search_failed: 'No local match',
  usda_search_failed: 'Online lookup failed',
  usda_search_aborted: 'Better source used',
  grounding_network_error: 'Network issue',
  grounding_rate_limit: 'Rate limited',
  grounding_quota_exhausted: 'Quota reached',
  grounding_safety_blocked: 'Search blocked',
  grounding_invalid_response: 'Incomplete web data',
  grounding_timeout: 'Lookup timed out',
  grounding_unknown_error: 'Web lookup failed',
});

const LOOKUP_STATUS_CHIP_LABELS = Object.freeze({
  needs_grounding: 'Grounded fallback',
  no_match: 'No close match',
  error: 'Lookup issue',
});

const LOOKUP_DECISION_REASON_CHIP_LABELS = Object.freeze({
  accepted_history_match: 'Reused accepted match',
  strong_local_match: 'Strong local match',
  dominant_local_match: 'Strong local match',
  local_retained_after_usda: 'Kept local match',
  usda_resolved_ambiguity: 'Resolved online',
  usda_completed_missing_macros: 'Completed nutrition',
  usda_better_match: 'Better online match',
  local_ambiguous: 'Local ambiguity',
  missing_macros: 'Missing local macros',
  brand_mismatch: 'Brand mismatch',
  weak_local_match: 'Weak local match',
  no_close_match: 'No close match',
  grounding_required: 'Grounded fallback',
});

const WARNING_PRIMARY_BADGE = Object.freeze({
  label: 'Needs review',
  className: 'bg-accent-red/20 text-accent-red',
});

const getPrimaryBadgeForSource = (source) =>
  PRIMARY_BADGE_BY_SOURCE[source] || PRIMARY_BADGE_BY_SOURCE.estimate;

export const getFinalizedSourceBadge = (source) =>
  getPrimaryBadgeForSource(source);

export const getFallbackReasonChipLabel = (reasonCode) => {
  const normalizedReasonCode = String(reasonCode || '').trim();

  if (!normalizedReasonCode) {
    return null;
  }

  return FALLBACK_REASON_CHIP_LABELS[normalizedReasonCode] || null;
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
  const normalizedReasonCode = String(reasonCode || '')
    .trim()
    .toLowerCase();

  if (!normalizedReasonCode) {
    return null;
  }

  return LOOKUP_DECISION_REASON_CHIP_LABELS[normalizedReasonCode] || null;
};

export const resolveFinalizedEntryPrimaryBadge = ({
  entry = null,
  lookupMeta = null,
} = {}) => {
  if (entry?.nutritionIntegrityIssue) {
    return WARNING_PRIMARY_BADGE;
  }

  if (lookupMeta?.acceptedFromHistory) {
    return {
      label: 'Reused match',
      className: 'bg-accent-blue/15 text-accent-blue',
    };
  }

  if (lookupMeta?.verificationFallbackUsed) {
    return {
      label: 'Verified match',
      className: 'bg-accent-green/20 text-accent-green',
    };
  }

  const source =
    String(
      lookupMeta?.usedSource ||
        entry?.aiLookupSource ||
        entry?.source ||
        'estimate'
    )
      .trim()
      .toLowerCase() || 'estimate';
  return getPrimaryBadgeForSource(source);
};

export const buildFinalizedEntryCardState = ({
  entry = null,
  lookupMeta = null,
  primaryLookupReasonCode = null,
} = {}) => {
  return {
    primaryBadge: resolveFinalizedEntryPrimaryBadge({
      entry,
      lookupMeta,
    }),
    detailsSummary: {
      fallbackReason: getFallbackReasonChipLabel(primaryLookupReasonCode),
      lookupStatus: getLookupStatusChipLabel(lookupMeta?.status),
      decisionReason: getLookupDecisionReasonChipLabel(
        lookupMeta?.decisionReason
      ),
      confidenceLabel: String(
        lookupMeta?.matchConfidence || entry?.confidence || ''
      )
        .trim()
        .toLowerCase(),
    },
  };
};
