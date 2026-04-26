const SOURCE_BADGE_BY_TYPE = Object.freeze({
  local: {
    label: 'Verified Database',
    className: 'bg-accent-green/20 text-accent-green',
  },
  usda: {
    label: 'Verified Database',
    className: 'bg-accent-green/20 text-accent-green',
  },
  ai_web_search: {
    label: 'Web Estimate',
    className: 'bg-accent-amber/20 text-accent-amber',
  },
  estimate: {
    label: 'AI Estimate',
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

const pushChip = (chips, chip) => {
  if (!chip?.label) {
    return;
  }

  if (
    chips.some(
      (existingChip) =>
        existingChip.label === chip.label &&
        existingChip.className === chip.className
    )
  ) {
    return;
  }

  chips.push(chip);
};

export const getFinalizedSourceBadge = (source) =>
  SOURCE_BADGE_BY_TYPE[source] || SOURCE_BADGE_BY_TYPE.estimate;

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

export const buildFinalizedEntryChips = ({
  entry = null,
  lookupMeta = null,
  primaryLookupReasonCode = null,
} = {}) => {
  const chips = [];
  const source = String(entry?.source || 'estimate').trim() || 'estimate';

  pushChip(chips, getFinalizedSourceBadge(source));
  pushChip(chips, {
    label: 'Finalized',
    className: 'bg-accent-blue/15 text-accent-blue',
  });

  if (lookupMeta?.verificationFallbackUsed) {
    pushChip(chips, {
      label: 'Fallback verified',
      className: 'bg-accent-green/15 text-accent-green',
    });
  }

  if (entry?.nutritionIntegrityIssue) {
    pushChip(chips, {
      label: 'Macro guardrail',
      className: 'bg-accent-red/20 text-accent-red',
    });
  }

  if (entry?.nameRewriteSuppressed) {
    pushChip(chips, {
      label: 'Name locked',
      className: 'bg-accent-purple/20 text-accent-purple',
    });
  }

  if (source === 'estimate') {
    pushChip(chips, {
      label: 'Fallback estimate',
      className: 'bg-accent-amber/20 text-accent-amber',
    });
  }

  const fallbackReasonChipLabel = getFallbackReasonChipLabel(
    primaryLookupReasonCode
  );
  if (fallbackReasonChipLabel) {
    pushChip(chips, {
      label: fallbackReasonChipLabel,
      className: 'bg-accent-amber/15 text-accent-amber',
    });
  }

  const lookupStatusChipLabel = getLookupStatusChipLabel(lookupMeta?.status);
  if (lookupStatusChipLabel) {
    pushChip(chips, {
      label: lookupStatusChipLabel,
      className: 'bg-accent-slate/20 text-accent-slate',
    });
  }

  return chips;
};
