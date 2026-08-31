import {
  getFallbackReasonChipLabel as resolveCanonicalFallbackReasonLabel,
  getLookupDecisionReasonChipLabel as resolveCanonicalDecisionReasonLabel,
  getLookupStatusChipLabel as resolveCanonicalLookupStatusLabel,
} from '../../services/foodLookupReasons.js';

const PRIMARY_BADGE_BY_SOURCE = Object.freeze({
  local: {
    label: 'Verified match',
    className: 'bg-accent-green/20 text-accent-green',
  },
  cloud: {
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

const WARNING_PRIMARY_BADGE = Object.freeze({
  label: 'Needs review',
  className: 'bg-accent-red/20 text-accent-red',
});

const getPrimaryBadgeForSource = (source) =>
  PRIMARY_BADGE_BY_SOURCE[source] || PRIMARY_BADGE_BY_SOURCE.estimate;

export const getFinalizedSourceBadge = (source) =>
  getPrimaryBadgeForSource(source);

export const getFallbackReasonChipLabel = (reasonCode) =>
  resolveCanonicalFallbackReasonLabel(reasonCode);

export const getLookupStatusChipLabel = (status) =>
  resolveCanonicalLookupStatusLabel(status);

export const getLookupDecisionReasonChipLabel = (reasonCode) =>
  resolveCanonicalDecisionReasonLabel(reasonCode);

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
