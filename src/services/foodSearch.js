import {
  resolveEntryGrams,
  scaleMacrosFromPer100g,
} from '../utils/food/portionNormalization.js';
import { getRagSourcePreferenceWeightsForCategory } from './ragTelemetry.js';
import {
  AI_RAG_QUALITY_MODE,
  getAiRagQualityPreset,
  normalizeAiRagQualityMode,
} from './aiRagQuality.js';

export const FOOD_SEARCH_SOURCE = Object.freeze({
  LOCAL: 'local',
  USDA: 'usda',
  AI_WEB_SEARCH: 'ai_web_search',
});

export const FOOD_SEARCH_SOURCE_LABELS = Object.freeze({
  [FOOD_SEARCH_SOURCE.LOCAL]: 'Local',
  [FOOD_SEARCH_SOURCE.USDA]: 'USDA',
  [FOOD_SEARCH_SOURCE.AI_WEB_SEARCH]: 'Web',
});

export const getFoodSearchSourceLabel = (source) => {
  return FOOD_SEARCH_SOURCE_LABELS[source] || 'Unknown';
};

const ONLINE_QUERY_MIN_LENGTH = 2;
const DEFAULT_AI_RAG_QUALITY_PRESET = getAiRagQualityPreset(
  AI_RAG_QUALITY_MODE.BALANCED
);
const AI_LOCAL_LIMIT = DEFAULT_AI_RAG_QUALITY_PRESET.localLimit;
const AI_ONLINE_PAGE_SIZE = DEFAULT_AI_RAG_QUALITY_PRESET.onlinePageSize;

const AI_SCORE_THRESHOLD = Object.freeze({
  high: 0.88,
  medium: 0.72,
  low: 0.55,
});

const DEDUPE_NAME_ALIAS_MAP = Object.freeze({
  kanin: 'rice',
  sinangag: 'rice',
  'garlic fried rice': 'rice',
  'fried rice': 'rice',
});

const BRAND_INTENT_KEYWORDS = new Set(['brand', 'branded', 'official']);

const BRAND_INTENT_TOKEN_HINTS = new Set([
  'coca',
  'cola',
  'pepsi',
  'heinz',
  'nestle',
  'oreo',
  'kellogg',
  'lays',
  'doritos',
  'pringles',
  'mcdonalds',
  'kfc',
  'starbucks',
  'monster',
  'redbull',
  'gatorade',
  'powerade',
  'snickers',
  'hershey',
]);

const SOURCE_TRUST_MULTIPLIER = Object.freeze({
  [FOOD_SEARCH_SOURCE.LOCAL]: 1,
  [FOOD_SEARCH_SOURCE.USDA]: 0.98,
  [FOOD_SEARCH_SOURCE.AI_WEB_SEARCH]: 0.75,
  estimate: 0.55,
});

const SOURCE_ERROR_REASON = Object.freeze({
  LOCAL_SEARCH_FAILED: 'local_search_failed',
  USDA_SEARCH_FAILED: 'usda_search_failed',
  USDA_SEARCH_ABORTED: 'usda_search_aborted',
  GROUNDING_NETWORK_ERROR: 'grounding_network_error',
  GROUNDING_RATE_LIMIT: 'grounding_rate_limit',
  GROUNDING_QUOTA_EXHAUSTED: 'grounding_quota_exhausted',
  GROUNDING_SAFETY_BLOCKED: 'grounding_safety_blocked',
  GROUNDING_INVALID_RESPONSE: 'grounding_invalid_response',
  GROUNDING_TIMEOUT: 'grounding_timeout',
  GROUNDING_UNKNOWN: 'grounding_unknown_error',
});

let aiLookupSessionCache = new Map();
const AI_LOOKUP_SESSION_CACHE_MAX_ENTRIES = 200;
let acceptedAiLookupReuseCache = new Map();
const ACCEPTED_AI_LOOKUP_REUSE_CACHE_MAX_ENTRIES = 300;

const LOOKUP_DECISION = Object.freeze({
  ACCEPT_LOCAL: 'accept_local',
  TRY_USDA: 'try_usda',
  TRY_GROUNDING: 'try_grounding',
  NO_MATCH: 'no_match',
});

const LOOKUP_DECISION_REASON = Object.freeze({
  ACCEPTED_HISTORY_MATCH: 'accepted_history_match',
  STRONG_LOCAL_MATCH: 'strong_local_match',
  DOMINANT_LOCAL_MATCH: 'dominant_local_match',
  LOCAL_RETAINED_AFTER_USDA: 'local_retained_after_usda',
  USDA_RESOLVED_AMBIGUITY: 'usda_resolved_ambiguity',
  USDA_COMPLETED_MISSING_MACROS: 'usda_completed_missing_macros',
  USDA_BETTER_MATCH: 'usda_better_match',
  LOCAL_AMBIGUOUS: 'local_ambiguous',
  MISSING_MACROS: 'missing_macros',
  BRAND_MISMATCH: 'brand_mismatch',
  WEAK_LOCAL_MATCH: 'weak_local_match',
  NO_CLOSE_MATCH: 'no_close_match',
  USDA_NO_BETTER_MATCH: 'usda_no_better_match',
  USDA_NO_CLOSE_MATCH: 'usda_no_close_match',
  GROUNDING_REQUIRED: 'grounding_required',
});

const LOOKUP_DATA_QUALITY = Object.freeze({
  COMPLETE: 'complete',
  MISSING_PER_100G: 'missing_per_100g',
  INCOMPLETE_PER_100G: 'incomplete_per_100g',
  MISSING: 'missing',
});

const LOCAL_ACCEPTANCE_POLICY = Object.freeze({
  strongScore: 0.88,
  dominantScore: 0.72,
  weakScore: 0.55,
  ambiguityGap: 0.035,
  strongAmbiguityGap: 0.02,
});

const SIGNIFICANT_QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

const getAiLookupSessionCacheValue = (key) => {
  if (!aiLookupSessionCache.has(key)) {
    return null;
  }

  const value = aiLookupSessionCache.get(key);
  aiLookupSessionCache.delete(key);
  aiLookupSessionCache.set(key, value);
  return value;
};

const setAiLookupSessionCacheValue = (key, value) => {
  if (aiLookupSessionCache.has(key)) {
    aiLookupSessionCache.delete(key);
  }

  aiLookupSessionCache.set(key, value);

  if (aiLookupSessionCache.size > AI_LOOKUP_SESSION_CACHE_MAX_ENTRIES) {
    const oldestKey = aiLookupSessionCache.keys().next().value;
    if (oldestKey !== undefined) {
      aiLookupSessionCache.delete(oldestKey);
    }
  }
};

const getAcceptedAiLookupReuseValue = (key) => {
  if (!acceptedAiLookupReuseCache.has(key)) {
    return null;
  }

  const value = acceptedAiLookupReuseCache.get(key);
  acceptedAiLookupReuseCache.delete(key);
  acceptedAiLookupReuseCache.set(key, value);
  return value;
};

const setAcceptedAiLookupReuseValue = (key, value) => {
  if (acceptedAiLookupReuseCache.has(key)) {
    acceptedAiLookupReuseCache.delete(key);
  }

  acceptedAiLookupReuseCache.set(key, value);

  if (
    acceptedAiLookupReuseCache.size > ACCEPTED_AI_LOOKUP_REUSE_CACHE_MAX_ENTRIES
  ) {
    const oldestKey = acceptedAiLookupReuseCache.keys().next().value;
    if (oldestKey !== undefined) {
      acceptedAiLookupReuseCache.delete(oldestKey);
    }
  }
};

const normalizeQuery = (query) => String(query ?? '').trim();

const normalizeTokenString = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) => {
  const normalized = normalizeTokenString(value);
  return normalized ? normalized.split(' ') : [];
};

const toSortedUniqueTokens = (value) =>
  [...new Set(tokenize(value))].sort((a, b) => a.localeCompare(b));

const toSignificantTokens = (value) =>
  toSortedUniqueTokens(value).filter(
    (token) => token.length > 2 && !SIGNIFICANT_QUERY_STOPWORDS.has(token)
  );

const dedupeTerms = (terms) => {
  const unique = [];
  const seen = new Set();

  terms.forEach((term) => {
    const normalized = normalizeTokenString(term);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(term);
  });

  return unique;
};

const resolveConfidencePenalty = (confidence) => {
  const normalized = String(confidence || '')
    .trim()
    .toLowerCase();
  if (normalized === 'high') return 'medium';
  if (normalized === 'medium') return 'low';
  return 'low';
};

const resolveCanonicalFoodLabel = (value) => {
  const normalized = normalizeTokenString(value);
  if (!normalized) {
    return '';
  }

  if (DEDUPE_NAME_ALIAS_MAP[normalized]) {
    return DEDUPE_NAME_ALIAS_MAP[normalized];
  }

  for (const [alias, canonical] of Object.entries(DEDUPE_NAME_ALIAS_MAP)) {
    if (normalized.includes(alias)) {
      return canonical;
    }
  }

  return normalized;
};

export const dedupeExtractedFoodEntries = (entries = []) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const byCanonicalKey = new Map();

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const name = String(entry.name || '').trim();
    const lookupTerms = Array.isArray(entry.lookupTerms)
      ? entry.lookupTerms
      : Array.isArray(entry.lookup_queries)
        ? entry.lookup_queries
        : [];

    const canonicalName =
      resolveCanonicalFoodLabel(name) ||
      resolveCanonicalFoodLabel(lookupTerms[0]) ||
      'unknown_food';

    const existing = byCanonicalKey.get(canonicalName);
    if (!existing) {
      byCanonicalKey.set(canonicalName, {
        ...entry,
        lookupTerms: dedupeTerms(lookupTerms),
        assumptions: Array.isArray(entry.assumptions)
          ? [...new Set(entry.assumptions)]
          : [],
      });
      return;
    }

    const mergedLookupTerms = dedupeTerms([
      ...(Array.isArray(existing.lookupTerms) ? existing.lookupTerms : []),
      ...lookupTerms,
    ]);
    const mergedAssumptions = [
      ...new Set([
        ...(Array.isArray(existing.assumptions) ? existing.assumptions : []),
        ...(Array.isArray(entry.assumptions) ? entry.assumptions : []),
      ]),
    ];

    const mergedEntry = {
      ...existing,
      lookupTerms: mergedLookupTerms,
      assumptions: mergedAssumptions,
      rationale:
        [existing.rationale, entry.rationale].filter(Boolean).join(' | ') ||
        null,
      category: existing.category || entry.category,
    };

    byCanonicalKey.set(canonicalName, mergedEntry);
  });

  return Array.from(byCanonicalKey.values());
};

const cloneLookupResult = (result) => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(result);
  }

  return JSON.parse(JSON.stringify(result));
};

const resolveSourceTrustMultiplier = (source) => {
  return SOURCE_TRUST_MULTIPLIER[source] || SOURCE_TRUST_MULTIPLIER.estimate;
};

const resolveWeightedConfidence = ({
  score,
  source,
  sourcePreferenceWeights = null,
}) => {
  const rawScore = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  const baseTrustMultiplier = resolveSourceTrustMultiplier(source);
  const preferenceMultiplier =
    sourcePreferenceWeights && Number.isFinite(sourcePreferenceWeights[source])
      ? sourcePreferenceWeights[source]
      : 1;
  const trustMultiplier = Number(
    Math.max(
      0.6,
      Math.min(1.5, baseTrustMultiplier * preferenceMultiplier)
    ).toFixed(4)
  );
  const weightedScore = Math.max(
    0,
    Math.min(1, Number((rawScore * trustMultiplier).toFixed(4)))
  );

  return {
    confidence: resolveAiConfidence(weightedScore),
    rawScore,
    trustMultiplier,
    weightedScore,
  };
};

const buildAiLookupCacheKey = ({
  entryName = '',
  lookupTerms = [],
  qualityMode = AI_RAG_QUALITY_MODE.BALANCED,
  entryCategory = null,
  isOnline = true,
  allowGroundingFallback = true,
  localLimit = AI_LOCAL_LIMIT,
  onlinePageSize = AI_ONLINE_PAGE_SIZE,
  sourcePreferenceWeights = null,
  preferBrandMatches = false,
} = {}) => {
  const normalizedEntry = normalizeTokenString(entryName);
  const normalizedTerms = dedupeTerms(
    (Array.isArray(lookupTerms) ? lookupTerms : []).map((term) =>
      normalizeTokenString(term)
    )
  );

  const normalizedCategory =
    String(entryCategory || '')
      .trim()
      .toLowerCase() || 'uncategorized';

  const normalizedWeightSignature =
    sourcePreferenceWeights && typeof sourcePreferenceWeights === 'object'
      ? [
          FOOD_SEARCH_SOURCE.LOCAL,
          FOOD_SEARCH_SOURCE.USDA,
          FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          'estimate',
        ]
          .map((key) => {
            const raw = sourcePreferenceWeights[key];
            const rounded = Number.isFinite(Number(raw))
              ? Number(Number(raw).toFixed(3))
              : 1;
            return `${key}:${rounded}`;
          })
          .join('|')
      : 'default';

  return [
    'v2',
    normalizeAiRagQualityMode(qualityMode),
    normalizedEntry,
    normalizedTerms.join(','),
    normalizedCategory,
    isOnline ? 'online' : 'offline',
    allowGroundingFallback ? 'grounding:on' : 'grounding:off',
    preferBrandMatches ? 'brand:on' : 'brand:off',
    `local:${Number(localLimit) || AI_LOCAL_LIMIT}`,
    `online:${Number(onlinePageSize) || AI_ONLINE_PAGE_SIZE}`,
    `weights:${normalizedWeightSignature}`,
  ].join('::');
};

const buildAcceptedReuseCacheKey = ({
  entryName = '',
  entryCategory = null,
  preferBrandMatches = false,
} = {}) => {
  const normalizedEntry = normalizeTokenString(entryName) || 'unknown_food';
  const normalizedCategory =
    String(entryCategory || '')
      .trim()
      .toLowerCase() || 'uncategorized';

  return [
    normalizedEntry,
    normalizedCategory,
    preferBrandMatches ? 'brand:on' : 'brand:off',
  ].join('::');
};

const cloneAcceptedReuseRecord = (record) => {
  if (!record || typeof record !== 'object') {
    return null;
  }

  return cloneLookupResult(record);
};

const detectBrandIntent = ({ entryName = '', lookupTerms = [] } = {}) => {
  const normalizedEntryName = normalizeTokenString(entryName);
  const normalizedTerms = (Array.isArray(lookupTerms) ? lookupTerms : [])
    .map((term) => normalizeTokenString(term))
    .filter(Boolean);
  const combinedText = [normalizedEntryName, ...normalizedTerms]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!combinedText) {
    return false;
  }

  const combinedTokens = tokenize(combinedText);
  if (combinedTokens.length === 0) {
    return false;
  }

  const hasBrandKeyword =
    BRAND_INTENT_KEYWORDS.has(combinedTokens[0]) ||
    combinedTokens.some((token, index) => {
      if (!BRAND_INTENT_KEYWORDS.has(token)) {
        return false;
      }

      const previousToken = combinedTokens[index - 1] || '';
      return previousToken === 'by' || previousToken === 'from';
    });

  if (hasBrandKeyword) {
    return true;
  }

  return combinedTokens.some((token) => BRAND_INTENT_TOKEN_HINTS.has(token));
};

const hasUsablePer100g = (per100g) => {
  if (!per100g || typeof per100g !== 'object') {
    return false;
  }

  return ['calories', 'protein', 'carbs', 'fats'].every((key) => {
    const value = Number(per100g[key]);
    return Number.isFinite(value) && value >= 0;
  });
};

const resolveDataQuality = (food) => {
  if (!food || typeof food !== 'object') {
    return LOOKUP_DATA_QUALITY.MISSING;
  }

  const per100g = food?.per100g;
  if (!per100g || typeof per100g !== 'object') {
    return LOOKUP_DATA_QUALITY.MISSING_PER_100G;
  }

  return hasUsablePer100g(per100g)
    ? LOOKUP_DATA_QUALITY.COMPLETE
    : LOOKUP_DATA_QUALITY.INCOMPLETE_PER_100G;
};

const isDataQualityUsable = (dataQuality) =>
  dataQuality === LOOKUP_DATA_QUALITY.COMPLETE;

const hasMaterialNewTokens = ({
  currentTokens = [],
  acceptedTokens = [],
  preferBrandMatches = false,
}) => {
  const acceptedTokenSet = new Set(acceptedTokens);
  const newTokens = currentTokens.filter(
    (token) => !acceptedTokenSet.has(token)
  );

  if (newTokens.length === 0) {
    return false;
  }

  if (preferBrandMatches) {
    return true;
  }

  return newTokens.length > 0;
};

const buildLookupDecisionMeta = ({
  decision = LOOKUP_DECISION.NO_MATCH,
  decisionReason = LOOKUP_DECISION_REASON.NO_CLOSE_MATCH,
  dataQuality = LOOKUP_DATA_QUALITY.MISSING,
  acceptedFromHistory = false,
  escalationAttempted = false,
  escalationReason = null,
} = {}) => ({
  decision,
  decisionReason,
  dataQuality,
  acceptedFromHistory,
  escalationAttempted,
  escalationReason,
});

const buildCandidate = ({
  source,
  queryUsed,
  food,
  score,
  sourcePreferenceWeights = null,
}) => {
  if (!food) {
    return null;
  }

  const weightedConfidence = resolveWeightedConfidence({
    score,
    source,
    sourcePreferenceWeights,
  });
  const dataQuality = resolveDataQuality(food);

  return {
    source,
    queryUsed,
    food,
    score,
    confidence: weightedConfidence.confidence,
    weightedScore: weightedConfidence.weightedScore,
    confidenceComponents: {
      rawScore: weightedConfidence.rawScore,
      trustMultiplier: weightedConfidence.trustMultiplier,
      weightedScore: weightedConfidence.weightedScore,
    },
    dataQuality,
    hasUsableData: isDataQualityUsable(dataQuality),
  };
};

const collectTopCandidates = ({
  query,
  foods = [],
  source,
  preferBrandMatches = false,
  sourcePreferenceWeights = null,
}) => {
  return (Array.isArray(foods) ? foods : [])
    .map((food) =>
      buildCandidate({
        source,
        queryUsed: query,
        food,
        score: buildNameMatchScore(query, food, { preferBrandMatches }),
        sourcePreferenceWeights,
      })
    )
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.weightedScore - a.weightedScore;
    });
};

const pickTopCandidateAcrossTerms = (candidateGroups = []) => {
  const ranked = candidateGroups
    .flat()
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.weightedScore - a.weightedScore;
    });

  return {
    best: ranked[0] || null,
    second: ranked[1] || null,
    ranked,
  };
};

const resolveLocalDecision = ({
  bestLocal = null,
  secondLocal = null,
  preferBrandMatches = false,
  acceptedHistoryMatch = null,
} = {}) => {
  if (acceptedHistoryMatch?.candidate?.hasUsableData) {
    return buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.ACCEPT_LOCAL,
      decisionReason: LOOKUP_DECISION_REASON.ACCEPTED_HISTORY_MATCH,
      dataQuality: acceptedHistoryMatch.candidate.dataQuality,
      acceptedFromHistory: true,
    });
  }

  if (!bestLocal) {
    return buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.TRY_USDA,
      decisionReason: LOOKUP_DECISION_REASON.NO_CLOSE_MATCH,
      escalationReason: LOOKUP_DECISION_REASON.NO_CLOSE_MATCH,
    });
  }

  if (!bestLocal.hasUsableData) {
    return buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.TRY_USDA,
      decisionReason: LOOKUP_DECISION_REASON.MISSING_MACROS,
      dataQuality: bestLocal.dataQuality,
      escalationReason: LOOKUP_DECISION_REASON.MISSING_MACROS,
    });
  }

  const scoreGap = bestLocal.score - Number(secondLocal?.score || 0);
  const ambiguityGap =
    bestLocal.score >= LOCAL_ACCEPTANCE_POLICY.strongScore
      ? LOCAL_ACCEPTANCE_POLICY.strongAmbiguityGap
      : LOCAL_ACCEPTANCE_POLICY.ambiguityGap;
  const ambiguous =
    secondLocal &&
    secondLocal.hasUsableData &&
    bestLocal.score >= LOCAL_ACCEPTANCE_POLICY.dominantScore &&
    scoreGap < ambiguityGap;

  if (
    preferBrandMatches &&
    !bestLocal.food?.brand &&
    bestLocal.score < LOCAL_ACCEPTANCE_POLICY.strongScore
  ) {
    return buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.TRY_USDA,
      decisionReason: LOOKUP_DECISION_REASON.BRAND_MISMATCH,
      dataQuality: bestLocal.dataQuality,
      escalationReason: LOOKUP_DECISION_REASON.BRAND_MISMATCH,
    });
  }

  if (ambiguous) {
    return buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.TRY_USDA,
      decisionReason: LOOKUP_DECISION_REASON.LOCAL_AMBIGUOUS,
      dataQuality: bestLocal.dataQuality,
      escalationReason: LOOKUP_DECISION_REASON.LOCAL_AMBIGUOUS,
    });
  }

  if (bestLocal.score >= LOCAL_ACCEPTANCE_POLICY.strongScore) {
    return buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.ACCEPT_LOCAL,
      decisionReason: LOOKUP_DECISION_REASON.STRONG_LOCAL_MATCH,
      dataQuality: bestLocal.dataQuality,
    });
  }

  if (
    bestLocal.score >= LOCAL_ACCEPTANCE_POLICY.dominantScore &&
    (!secondLocal || scoreGap >= LOCAL_ACCEPTANCE_POLICY.ambiguityGap)
  ) {
    return buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.ACCEPT_LOCAL,
      decisionReason: LOOKUP_DECISION_REASON.DOMINANT_LOCAL_MATCH,
      dataQuality: bestLocal.dataQuality,
    });
  }

  if (bestLocal.score >= LOCAL_ACCEPTANCE_POLICY.weakScore) {
    return buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.TRY_USDA,
      decisionReason: LOOKUP_DECISION_REASON.WEAK_LOCAL_MATCH,
      dataQuality: bestLocal.dataQuality,
      escalationReason: LOOKUP_DECISION_REASON.WEAK_LOCAL_MATCH,
    });
  }

  return buildLookupDecisionMeta({
    decision: LOOKUP_DECISION.TRY_USDA,
    decisionReason: LOOKUP_DECISION_REASON.NO_CLOSE_MATCH,
    dataQuality: bestLocal.dataQuality,
    escalationReason: LOOKUP_DECISION_REASON.NO_CLOSE_MATCH,
  });
};

const buildResolvedLookupResult = ({
  candidate = null,
  sourcesTried = [],
  errorsBySource = {},
  errorReasonsBySource = {},
  fallbackUsed = false,
  sourcePreferenceWeights = null,
  decisionMeta = {},
  status = 'resolved',
} = {}) => {
  if (!candidate?.food) {
    return null;
  }

  return {
    status,
    usedSource: candidate.source,
    queryUsed: candidate.queryUsed,
    sourcesTried,
    fallbackUsed,
    matchedFood: {
      name: candidate.food.name,
      brand: candidate.food.brand || null,
      category: candidate.food.category || null,
      subcategory: candidate.food.subcategory || null,
      per100g: hasUsablePer100g(candidate.food?.per100g)
        ? {
            calories: Number(candidate.food.per100g.calories) || 0,
            protein: Number(candidate.food.per100g.protein) || 0,
            carbs: Number(candidate.food.per100g.carbs) || 0,
            fats: Number(candidate.food.per100g.fats) || 0,
          }
        : candidate.food?.per100g && typeof candidate.food.per100g === 'object'
          ? {
              calories: Number(candidate.food.per100g.calories) || 0,
              protein: Number(candidate.food.per100g.protein) || 0,
              carbs: Number(candidate.food.per100g.carbs) || 0,
              fats: Number(candidate.food.per100g.fats) || 0,
            }
          : null,
    },
    errorsBySource,
    errorReasonsBySource,
    matchConfidence: candidate.confidence,
    matchScore: Number(candidate.score) || 0,
    weightedMatchScore: Number(candidate.weightedScore) || 0,
    confidenceComponents: {
      rawScore: Number(candidate.confidenceComponents?.rawScore) || 0,
      trustMultiplier:
        Number(candidate.confidenceComponents?.trustMultiplier) ||
        resolveSourceTrustMultiplier(candidate.source),
      weightedScore: Number(candidate.confidenceComponents?.weightedScore) || 0,
    },
    sourcePreferenceWeights,
    ...buildLookupDecisionMeta({
      dataQuality: candidate.dataQuality,
      ...decisionMeta,
    }),
  };
};

export const resetAiLookupSessionCache = () => {
  aiLookupSessionCache = new Map();
};

export const resetAcceptedAiLookupReuseCache = () => {
  acceptedAiLookupReuseCache = new Map();
};

export const recordAcceptedAiFoodLookup = ({
  entry = null,
  lookupMeta = null,
} = {}) => {
  const entryName = String(entry?.name || lookupMeta?.entryName || '').trim();
  if (!entryName) {
    return false;
  }

  const normalizedLookupMeta =
    lookupMeta && typeof lookupMeta === 'object' ? lookupMeta : {};
  const matchedFood =
    normalizedLookupMeta?.matchedFood &&
    typeof normalizedLookupMeta.matchedFood === 'object'
      ? normalizedLookupMeta.matchedFood
      : null;

  if (!matchedFood || !hasUsablePer100g(matchedFood.per100g)) {
    return false;
  }

  const lookupTerms = Array.isArray(entry?.lookupTerms)
    ? entry.lookupTerms
    : [];
  const preferBrandMatches = detectBrandIntent({
    entryName,
    lookupTerms,
  });
  const reuseKey = buildAcceptedReuseCacheKey({
    entryName,
    entryCategory: entry?.category || matchedFood.category || null,
    preferBrandMatches,
  });

  const queryTokens = toSignificantTokens(
    [entryName, ...lookupTerms].filter(Boolean).join(' ')
  );

  setAcceptedAiLookupReuseValue(reuseKey, {
    usedSource: normalizedLookupMeta.usedSource || FOOD_SEARCH_SOURCE.LOCAL,
    queryUsed: normalizedLookupMeta.queryUsed || entryName,
    matchScore: Number(normalizedLookupMeta.matchScore) || 0.9,
    matchConfidence: normalizedLookupMeta.matchConfidence || 'high',
    matchedFood: {
      name: matchedFood.name || entryName,
      brand: matchedFood.brand || null,
      category: matchedFood.category || entry?.category || null,
      subcategory: matchedFood.subcategory || null,
      per100g: {
        calories: Number(matchedFood?.per100g?.calories) || 0,
        protein: Number(matchedFood?.per100g?.protein) || 0,
        carbs: Number(matchedFood?.per100g?.carbs) || 0,
        fats: Number(matchedFood?.per100g?.fats) || 0,
      },
    },
    queryTokens,
    recordedAt: Date.now(),
  });

  return true;
};

const toErrorMessage = (error, fallbackMessage) => {
  const message = String(error?.message ?? '').trim();
  return message || fallbackMessage;
};

const shouldForceGroundingFallbackFromUsdaError = (error) => {
  const statusCode = Number(error?.status);
  const message = String(error?.message || '')
    .toLowerCase()
    .trim();

  if (statusCode === 429 || statusCode === 408) {
    return true;
  }

  if (statusCode >= 500 && statusCode <= 599) {
    return true;
  }

  return (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('connection') ||
    message.includes('quota') ||
    message.includes('resource_exhausted')
  );
};

const resolveGroundingFailureReason = (error) => {
  const statusCode = Number(error?.status);
  const message = String(error?.message || '')
    .toLowerCase()
    .trim();
  const details =
    error?.details && typeof error.details === 'object'
      ? JSON.stringify(error.details).toLowerCase()
      : String(error?.details || '').toLowerCase();
  const errorText = `${message} ${details}`.trim();

  const hasQuotaSignal =
    errorText.includes('quota') ||
    errorText.includes('resource_exhausted') ||
    errorText.includes('daily limit') ||
    errorText.includes('billing') ||
    errorText.includes('exceeded your current quota');

  if ((statusCode === 429 || statusCode === 403) && hasQuotaSignal) {
    return SOURCE_ERROR_REASON.GROUNDING_QUOTA_EXHAUSTED;
  }

  if (statusCode === 429) {
    return SOURCE_ERROR_REASON.GROUNDING_RATE_LIMIT;
  }

  if (statusCode === 408 || error?.name === 'AbortError') {
    return SOURCE_ERROR_REASON.GROUNDING_TIMEOUT;
  }

  if (!message) {
    return SOURCE_ERROR_REASON.GROUNDING_UNKNOWN;
  }

  if (
    message.includes('safety') ||
    message.includes('blocked by safety') ||
    message.includes('promptfeedback')
  ) {
    return SOURCE_ERROR_REASON.GROUNDING_SAFETY_BLOCKED;
  }

  if (
    message.includes('invalid parser format') ||
    message.includes('no usable nutrition data') ||
    message.includes('no readable text') ||
    message.includes('malformed')
  ) {
    return SOURCE_ERROR_REASON.GROUNDING_INVALID_RESPONSE;
  }

  if (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('connection')
  ) {
    return SOURCE_ERROR_REASON.GROUNDING_NETWORK_ERROR;
  }

  return SOURCE_ERROR_REASON.GROUNDING_UNKNOWN;
};

const buildDefaultResult = () => ({
  results: [],
  source: FOOD_SEARCH_SOURCE.LOCAL,
  sourcesTried: [],
  fallbackUsed: false,
  errorsBySource: {},
  errorReasonsBySource: {},
});

const loadSearchLocal = async () =>
  (await import('./foodCatalog.js')).searchFoods;
const loadGetFoodsByIds = async () =>
  (await import('./foodCatalog.js')).getFoodsByIds;
const loadSearchUsda = async () => (await import('./usda.js')).searchFoods;
const loadGroundedMacroLookup = async () =>
  (await import('./gemini.js')).fetchMacrosWithGrounding;
const loadGroundedMacroLookupBatch = async () =>
  (await import('./gemini.js')).fetchMacrosWithGroundingBatch;

const resolveAiConfidence = (score) => {
  if (!Number.isFinite(score) || score <= 0) {
    return 'low';
  }
  if (score >= AI_SCORE_THRESHOLD.high) {
    return 'high';
  }
  if (score >= AI_SCORE_THRESHOLD.medium) {
    return 'medium';
  }
  return 'low';
};

const buildNameMatchScore = (query, food, options = {}) => {
  const normalizedQuery = normalizeTokenString(query);
  if (!normalizedQuery) {
    return 0;
  }

  const preferBrandMatches = options?.preferBrandMatches === true;

  const foodName = normalizeTokenString(food?.name);
  const foodBrand = normalizeTokenString(food?.brand);
  const foodCombined = normalizeTokenString([foodName, foodBrand].join(' '));

  if (!foodCombined) {
    return 0;
  }

  if (foodName === normalizedQuery || foodCombined === normalizedQuery) {
    return 1;
  }

  const queryTokens = tokenize(normalizedQuery);
  const foodTokens = tokenize(foodCombined);

  if (queryTokens.length === 0 || foodTokens.length === 0) {
    return 0;
  }

  const querySet = new Set(queryTokens);
  const foodSet = new Set(foodTokens);

  let overlapCount = 0;
  querySet.forEach((token) => {
    if (foodSet.has(token)) {
      overlapCount += 1;
    }
  });

  const recall = overlapCount / querySet.size;
  const precision = overlapCount / foodSet.size;
  const jaccard = overlapCount / (querySet.size + foodSet.size - overlapCount);
  const beta = 1.35;
  const betaSq = beta * beta;
  const fBetaDenominator = betaSq * precision + recall;
  const fBeta =
    fBetaDenominator > 0
      ? ((1 + betaSq) * precision * recall) / fBetaDenominator
      : 0;
  const containsBonus = foodCombined.includes(normalizedQuery)
    ? 0.16
    : foodName.length > 5 && normalizedQuery.includes(foodName)
      ? 0.08
      : 0;
  const startsWithBonus = foodName.startsWith(normalizedQuery) ? 0.08 : 0;

  let brandBonus = 0;
  if (preferBrandMatches) {
    const brandTokens = tokenize(foodBrand);
    const brandTokenSet = new Set(brandTokens);
    const matchingBrandTokens = queryTokens.filter((token) =>
      brandTokenSet.has(token)
    );

    if (matchingBrandTokens.length > 0) {
      const overlapRatio = matchingBrandTokens.length / queryTokens.length;
      brandBonus = 0.08 + overlapRatio * 0.16;

      if (foodBrand && normalizedQuery.includes(foodBrand)) {
        brandBonus += 0.06;
      }
    } else if (!foodBrand) {
      brandBonus = -0.03;
    }
  }

  const score =
    fBeta * 0.75 +
    jaccard * 0.15 +
    containsBonus +
    startsWithBonus +
    brandBonus;

  return Math.max(0, Math.min(1, score));
};

const searchOnlineHierarchy = async ({
  query,
  page,
  pageSize,
  dependencies,
}) => {
  const sourcesTried = [];
  const errorsBySource = {};
  const errorReasonsBySource = {};

  sourcesTried.push(FOOD_SEARCH_SOURCE.USDA);
  try {
    const usdaResult = await dependencies.searchUsda(query, {
      page,
      pageSize,
    });
    const usdaFoods = Array.isArray(usdaResult?.foods) ? usdaResult.foods : [];

    if (usdaFoods.length > 0) {
      return {
        results: usdaFoods,
        source: FOOD_SEARCH_SOURCE.USDA,
        sourcesTried,
        errorsBySource,
        errorReasonsBySource,
      };
    }
  } catch (error) {
    errorsBySource[FOOD_SEARCH_SOURCE.USDA] = toErrorMessage(
      error,
      'USDA search failed.'
    );
    errorReasonsBySource[FOOD_SEARCH_SOURCE.USDA] =
      SOURCE_ERROR_REASON.USDA_SEARCH_FAILED;
  }

  return {
    results: [],
    source: FOOD_SEARCH_SOURCE.USDA,
    sourcesTried,
    errorsBySource,
    errorReasonsBySource,
  };
};

const loadDependencies = async ({
  includeLocal = true,
  includeGetFoodsByIds = false,
  includeGrounding = false,
  includeGroundingBatch = false,
  dependencies = {},
} = {}) => {
  const resolvedSearchLocal = includeLocal
    ? dependencies.searchLocal || (await loadSearchLocal())
    : dependencies.searchLocal;
  const resolvedSearchUsda =
    dependencies.searchUsda || (await loadSearchUsda());
  const resolvedGetFoodsByIds =
    includeLocal && includeGetFoodsByIds
      ? dependencies.getFoodsByIds || (await loadGetFoodsByIds())
      : dependencies.getFoodsByIds;
  const resolvedGroundedLookup = includeGrounding
    ? dependencies.searchGrounded || (await loadGroundedMacroLookup())
    : dependencies.searchGrounded;
  const resolvedGroundedLookupBatch = includeGroundingBatch
    ? dependencies.searchGroundedBatch || (await loadGroundedMacroLookupBatch())
    : dependencies.searchGroundedBatch;

  return {
    searchLocal: resolvedSearchLocal,
    searchUsda: resolvedSearchUsda,
    getFoodsByIds: resolvedGetFoodsByIds,
    searchGrounded: resolvedGroundedLookup,
    searchGroundedBatch: resolvedGroundedLookupBatch,
  };
};

export const searchFoodsLocal = async ({
  query = '',
  category = null,
  subcategory = null,
  sortBy = 'name',
  sortOrder = 'asc',
  preferBrandMatches = false,
  limit = 500,
  offset = 0,
  pinnedFoodIds = [],
  dependencies = {},
} = {}) => {
  const normalizedQuery = normalizeQuery(query);
  const normalizedOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 500));
  const normalizedPinnedFoodIds = Array.from(
    new Set(
      (Array.isArray(pinnedFoodIds) ? pinnedFoodIds : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  );
  const resolvedDependencies = await loadDependencies({
    includeLocal: true,
    includeGetFoodsByIds:
      normalizedPinnedFoodIds.length > 0 && normalizedOffset === 0,
    dependencies,
  });

  const localResults = await resolvedDependencies.searchLocal({
    query: normalizedQuery,
    category,
    subcategory,
    sortBy,
    sortOrder,
    preferBrandMatches,
    limit: normalizedLimit,
    offset: normalizedOffset,
  });

  const pinnedRows =
    normalizedOffset === 0 &&
    normalizedPinnedFoodIds.length > 0 &&
    typeof resolvedDependencies.getFoodsByIds === 'function'
      ? await resolvedDependencies.getFoodsByIds(normalizedPinnedFoodIds)
      : [];

  const safeLocalResults = Array.isArray(localResults) ? localResults : [];

  const mergedById = new Map();
  (Array.isArray(pinnedRows) ? pinnedRows : []).forEach((food) => {
    if (!food?.id) return;
    mergedById.set(food.id, food);
  });
  safeLocalResults.forEach((food) => {
    if (!food?.id || mergedById.has(food.id)) return;
    mergedById.set(food.id, food);
  });

  const localRowsCount = safeLocalResults.length;
  const hasMoreLocal = localRowsCount >= normalizedLimit;

  return {
    results: Array.from(mergedById.values()),
    localRowsCount,
    localOffset: normalizedOffset,
    nextOffset: normalizedOffset + localRowsCount,
    hasMoreLocal,
    source: FOOD_SEARCH_SOURCE.LOCAL,
    sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL],
    fallbackUsed: false,
    errorsBySource: {},
    errorReasonsBySource: {},
  };
};

export const searchFoodsOnline = async ({
  query = '',
  onlinePage = 1,
  onlinePageSize = 20,
  dependencies = {},
} = {}) => {
  const normalizedQuery = normalizeQuery(query);
  const resolvedDependencies = await loadDependencies({
    includeLocal: false,
    dependencies,
  });

  if (!normalizedQuery || normalizedQuery.length < ONLINE_QUERY_MIN_LENGTH) {
    return {
      ...buildDefaultResult(),
      source: FOOD_SEARCH_SOURCE.USDA,
    };
  }

  const onlineResult = await searchOnlineHierarchy({
    query: normalizedQuery,
    page: onlinePage,
    pageSize: onlinePageSize,
    dependencies: resolvedDependencies,
  });

  return {
    results: onlineResult.results,
    source: onlineResult.source,
    sourcesTried: onlineResult.sourcesTried,
    fallbackUsed: false,
    errorsBySource: onlineResult.errorsBySource,
    errorReasonsBySource: onlineResult.errorReasonsBySource || {},
  };
};

const resolveAcceptedHistoryMatch = ({
  entryName = '',
  lookupTerms = [],
  entryCategory = null,
  preferBrandMatches = false,
  sourcePreferenceWeights = null,
} = {}) => {
  const reuseKey = buildAcceptedReuseCacheKey({
    entryName,
    entryCategory,
    preferBrandMatches,
  });
  const record = getAcceptedAiLookupReuseValue(reuseKey);

  if (!record?.matchedFood) {
    return null;
  }

  const currentTokens = toSignificantTokens(
    [entryName, ...(Array.isArray(lookupTerms) ? lookupTerms : [])]
      .filter(Boolean)
      .join(' ')
  );
  if (
    hasMaterialNewTokens({
      currentTokens,
      acceptedTokens: Array.isArray(record.queryTokens)
        ? record.queryTokens
        : [],
      preferBrandMatches,
    })
  ) {
    return null;
  }

  const candidate = buildCandidate({
    source: record.usedSource || FOOD_SEARCH_SOURCE.LOCAL,
    queryUsed: record.queryUsed || entryName,
    food: record.matchedFood,
    score: Number(record.matchScore) || LOCAL_ACCEPTANCE_POLICY.strongScore,
    sourcePreferenceWeights,
  });

  if (!candidate?.hasUsableData) {
    return null;
  }

  return {
    cacheKey: reuseKey,
    record: cloneAcceptedReuseRecord(record),
    candidate,
  };
};

export const resolveAiFoodLookup = async ({
  entryName = '',
  lookupTerms = [],
  qualityMode = AI_RAG_QUALITY_MODE.BALANCED,
  entryCategory = null,
  isOnline = true,
  allowGroundingFallback,
  localLimit,
  onlinePageSize,
  sourcePreferenceWeights = null,
  dependencies = {},
} = {}) => {
  const resolvedQualityMode = normalizeAiRagQualityMode(qualityMode);
  const qualityPreset = getAiRagQualityPreset(resolvedQualityMode);
  const resolvedLocalLimit = Number.isFinite(Number(localLimit))
    ? Math.max(1, Math.round(Number(localLimit)))
    : qualityPreset.localLimit;
  const resolvedOnlinePageSize = Number.isFinite(Number(onlinePageSize))
    ? Math.max(1, Math.round(Number(onlinePageSize)))
    : qualityPreset.onlinePageSize;
  const shouldAllowGroundingFallback =
    typeof allowGroundingFallback === 'boolean'
      ? allowGroundingFallback
      : qualityPreset.enableGroundingFallback;
  const preferBrandMatches = detectBrandIntent({
    entryName,
    lookupTerms,
  });

  const cacheKey = buildAiLookupCacheKey({
    entryName,
    lookupTerms,
    qualityMode: resolvedQualityMode,
    entryCategory,
    isOnline,
    allowGroundingFallback: shouldAllowGroundingFallback,
    localLimit: resolvedLocalLimit,
    onlinePageSize: resolvedOnlinePageSize,
    sourcePreferenceWeights,
    preferBrandMatches,
  });

  const cachedResult = getAiLookupSessionCacheValue(cacheKey);
  if (cachedResult) {
    return cloneLookupResult(cachedResult);
  }

  const primaryTerm = normalizeQuery(entryName);
  const terms = dedupeTerms([primaryTerm, ...(lookupTerms || [])]).slice(0, 6);

  if (terms.length === 0) {
    const noQueryResult = {
      status: 'no_query',
      usedSource: FOOD_SEARCH_SOURCE.LOCAL,
      queryUsed: null,
      sourcesTried: [],
      fallbackUsed: false,
      matchedFood: null,
      errorsBySource: {},
      errorReasonsBySource: {},
      matchConfidence: 'low',
      matchScore: 0,
      weightedMatchScore: 0,
      confidenceComponents: {
        rawScore: 0,
        trustMultiplier: resolveSourceTrustMultiplier(FOOD_SEARCH_SOURCE.LOCAL),
        weightedScore: 0,
      },
      ...buildLookupDecisionMeta({
        decision: LOOKUP_DECISION.NO_MATCH,
        decisionReason: LOOKUP_DECISION_REASON.NO_CLOSE_MATCH,
      }),
    };

    setAiLookupSessionCacheValue(cacheKey, noQueryResult);
    return cloneLookupResult(noQueryResult);
  }

  const resolvedDependencies = await loadDependencies({
    includeLocal: true,
    includeGrounding: true,
    dependencies,
  });

  const effectiveSourcePreferenceWeights =
    sourcePreferenceWeights ||
    (await getRagSourcePreferenceWeightsForCategory(
      entryCategory || 'uncategorized'
    ));

  const acceptedHistoryMatch = resolveAcceptedHistoryMatch({
    entryName,
    lookupTerms: terms,
    entryCategory,
    preferBrandMatches,
    sourcePreferenceWeights: effectiveSourcePreferenceWeights,
  });
  if (acceptedHistoryMatch?.candidate) {
    const historyResult = buildResolvedLookupResult({
      candidate: acceptedHistoryMatch.candidate,
      sourcesTried: [acceptedHistoryMatch.candidate.source],
      errorsBySource: {},
      errorReasonsBySource: {},
      fallbackUsed: false,
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
      decisionMeta: buildLookupDecisionMeta({
        decision: LOOKUP_DECISION.ACCEPT_LOCAL,
        decisionReason: LOOKUP_DECISION_REASON.ACCEPTED_HISTORY_MATCH,
        dataQuality: acceptedHistoryMatch.candidate.dataQuality,
        acceptedFromHistory: true,
      }),
    });

    setAiLookupSessionCacheValue(cacheKey, historyResult);
    return cloneLookupResult(historyResult);
  }

  const sourcesTried = [];
  const errorsBySource = {};
  const errorReasonsBySource = {};
  let shouldForceGroundingFallback = false;

  const localCandidateGroups = [];
  if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.LOCAL)) {
    sourcesTried.push(FOOD_SEARCH_SOURCE.LOCAL);
  }

  for (const term of terms) {
    try {
      const localResult = await resolvedDependencies.searchLocal({
        query: term,
        limit: resolvedLocalLimit,
        preferBrandMatches,
      });
      localCandidateGroups.push(
        collectTopCandidates({
          query: term,
          foods: localResult,
          source: FOOD_SEARCH_SOURCE.LOCAL,
          preferBrandMatches,
          sourcePreferenceWeights: effectiveSourcePreferenceWeights,
        }).slice(0, 3)
      );
    } catch (error) {
      errorsBySource[FOOD_SEARCH_SOURCE.LOCAL] = toErrorMessage(
        error,
        'Local search failed.'
      );
      errorReasonsBySource[FOOD_SEARCH_SOURCE.LOCAL] =
        SOURCE_ERROR_REASON.LOCAL_SEARCH_FAILED;
    }
  }

  const { best: bestLocalCandidate, second: secondLocalCandidate } =
    pickTopCandidateAcrossTerms(localCandidateGroups);

  const localDecision = resolveLocalDecision({
    bestLocal: bestLocalCandidate,
    secondLocal: secondLocalCandidate,
    preferBrandMatches,
    acceptedHistoryMatch,
  });

  if (localDecision.decision === LOOKUP_DECISION.ACCEPT_LOCAL) {
    const localResult = buildResolvedLookupResult({
      candidate: bestLocalCandidate,
      sourcesTried,
      errorsBySource,
      errorReasonsBySource,
      fallbackUsed: false,
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
      decisionMeta: localDecision,
    });
    setAiLookupSessionCacheValue(cacheKey, localResult);
    return cloneLookupResult(localResult);
  }

  if (!isOnline) {
    const offlineReferenceCandidate = bestLocalCandidate;
    const offlineConfidence = resolveWeightedConfidence({
      score: Number(offlineReferenceCandidate?.score || 0),
      source: offlineReferenceCandidate?.source || FOOD_SEARCH_SOURCE.LOCAL,
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
    });
    const offlineResult = {
      status: offlineReferenceCandidate ? 'weak_match' : 'no_match',
      usedSource: offlineReferenceCandidate?.source || FOOD_SEARCH_SOURCE.LOCAL,
      queryUsed: offlineReferenceCandidate?.queryUsed || primaryTerm || null,
      sourcesTried,
      fallbackUsed: false,
      matchedFood: null,
      errorsBySource,
      errorReasonsBySource,
      matchConfidence: offlineConfidence.confidence,
      matchScore: Number(offlineReferenceCandidate?.score || 0),
      weightedMatchScore: offlineConfidence.weightedScore,
      confidenceComponents: {
        rawScore: offlineConfidence.rawScore,
        trustMultiplier: offlineConfidence.trustMultiplier,
        weightedScore: offlineConfidence.weightedScore,
      },
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
      ...buildLookupDecisionMeta({
        decision: LOOKUP_DECISION.NO_MATCH,
        decisionReason: localDecision.decisionReason,
        dataQuality:
          offlineReferenceCandidate?.dataQuality || LOOKUP_DATA_QUALITY.MISSING,
      }),
    };

    setAiLookupSessionCacheValue(cacheKey, offlineResult);
    return cloneLookupResult(offlineResult);
  }

  const usdaCandidateGroups = [];
  if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.USDA)) {
    sourcesTried.push(FOOD_SEARCH_SOURCE.USDA);
  }

  for (const term of terms) {
    try {
      const usdaResult = await resolvedDependencies.searchUsda(term, {
        page: 1,
        pageSize: resolvedOnlinePageSize,
      });
      const usdaFoods = Array.isArray(usdaResult?.foods)
        ? usdaResult.foods
        : [];
      usdaCandidateGroups.push(
        collectTopCandidates({
          query: term,
          foods: usdaFoods,
          source: FOOD_SEARCH_SOURCE.USDA,
          preferBrandMatches,
          sourcePreferenceWeights: effectiveSourcePreferenceWeights,
        }).slice(0, 3)
      );
    } catch (error) {
      if (shouldForceGroundingFallbackFromUsdaError(error)) {
        shouldForceGroundingFallback = true;
      }
      errorsBySource[FOOD_SEARCH_SOURCE.USDA] = toErrorMessage(
        error,
        'USDA search failed.'
      );
      errorReasonsBySource[FOOD_SEARCH_SOURCE.USDA] =
        SOURCE_ERROR_REASON.USDA_SEARCH_FAILED;
    }
  }

  const { best: bestUsdaCandidate } =
    pickTopCandidateAcrossTerms(usdaCandidateGroups);

  const canAcceptUsda =
    bestUsdaCandidate &&
    bestUsdaCandidate.hasUsableData &&
    bestUsdaCandidate.score >= LOCAL_ACCEPTANCE_POLICY.weakScore;
  const canRetainLocalAfterUsda =
    bestLocalCandidate &&
    bestLocalCandidate.hasUsableData &&
    bestLocalCandidate.score >= LOCAL_ACCEPTANCE_POLICY.dominantScore &&
    (!bestUsdaCandidate || bestLocalCandidate.score >= bestUsdaCandidate.score);

  if (canRetainLocalAfterUsda) {
    const retainedLocalResult = buildResolvedLookupResult({
      candidate: bestLocalCandidate,
      sourcesTried,
      errorsBySource,
      errorReasonsBySource,
      fallbackUsed: false,
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
      decisionMeta: buildLookupDecisionMeta({
        decision: LOOKUP_DECISION.ACCEPT_LOCAL,
        decisionReason: LOOKUP_DECISION_REASON.LOCAL_RETAINED_AFTER_USDA,
        dataQuality: bestLocalCandidate.dataQuality,
        escalationAttempted: true,
        escalationReason:
          localDecision.escalationReason || localDecision.decisionReason,
      }),
    });
    setAiLookupSessionCacheValue(cacheKey, retainedLocalResult);
    return cloneLookupResult(retainedLocalResult);
  }

  if (canAcceptUsda) {
    const usdaDecisionReason =
      localDecision.decisionReason === LOOKUP_DECISION_REASON.LOCAL_AMBIGUOUS
        ? LOOKUP_DECISION_REASON.USDA_RESOLVED_AMBIGUITY
        : localDecision.decisionReason === LOOKUP_DECISION_REASON.MISSING_MACROS
          ? LOOKUP_DECISION_REASON.USDA_COMPLETED_MISSING_MACROS
          : LOOKUP_DECISION_REASON.USDA_BETTER_MATCH;

    const usdaResult = buildResolvedLookupResult({
      candidate: bestUsdaCandidate,
      sourcesTried,
      errorsBySource,
      errorReasonsBySource,
      fallbackUsed: true,
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
      decisionMeta: buildLookupDecisionMeta({
        decision: LOOKUP_DECISION.TRY_USDA,
        decisionReason: usdaDecisionReason,
        dataQuality: bestUsdaCandidate.dataQuality,
        escalationAttempted: true,
        escalationReason:
          localDecision.escalationReason || localDecision.decisionReason,
      }),
    });
    setAiLookupSessionCacheValue(cacheKey, usdaResult);
    return cloneLookupResult(usdaResult);
  }

  const shouldUseGrounding =
    shouldForceGroundingFallback ||
    !bestUsdaCandidate ||
    !bestUsdaCandidate.hasUsableData ||
    bestUsdaCandidate.score < LOCAL_ACCEPTANCE_POLICY.weakScore;

  if (
    shouldUseGrounding &&
    shouldAllowGroundingFallback &&
    typeof resolvedDependencies.searchGrounded === 'function'
  ) {
    if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.AI_WEB_SEARCH)) {
      sourcesTried.push(FOOD_SEARCH_SOURCE.AI_WEB_SEARCH);
    }

    const groundedQuery = terms[0] || primaryTerm;

    try {
      const groundedEstimate = await resolvedDependencies.searchGrounded(
        groundedQuery,
        undefined,
        qualityPreset.groundedLookupTimeoutMs
      );

      if (hasUsablePer100g(groundedEstimate?.per100g)) {
        const groundedScoreMap = {
          high: 0.78,
          medium: 0.64,
          low: AI_SCORE_THRESHOLD.low,
        };
        const groundedScoreKey = String(
          groundedEstimate?.confidence || ''
        ).toLowerCase();
        const groundedScore =
          groundedScoreMap[groundedScoreKey] || AI_SCORE_THRESHOLD.low;
        const groundedCandidate = buildCandidate({
          source: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          queryUsed: groundedQuery,
          food: {
            name: groundedEstimate?.name || primaryTerm || groundedQuery,
            brand: null,
            category: null,
            subcategory: 'grounded_estimate',
            per100g: groundedEstimate.per100g,
          },
          score: groundedScore,
          sourcePreferenceWeights: effectiveSourcePreferenceWeights,
        });

        const groundedResult = buildResolvedLookupResult({
          candidate: groundedCandidate,
          sourcesTried,
          errorsBySource,
          errorReasonsBySource,
          fallbackUsed: true,
          sourcePreferenceWeights: effectiveSourcePreferenceWeights,
          decisionMeta: buildLookupDecisionMeta({
            decision: LOOKUP_DECISION.TRY_GROUNDING,
            decisionReason: LOOKUP_DECISION_REASON.GROUNDING_REQUIRED,
            dataQuality: groundedCandidate.dataQuality,
            escalationAttempted: true,
            escalationReason:
              localDecision.escalationReason || localDecision.decisionReason,
          }),
        });

        setAiLookupSessionCacheValue(cacheKey, groundedResult);
        return cloneLookupResult(groundedResult);
      }
    } catch (error) {
      errorsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH] = toErrorMessage(
        error,
        'Grounded web lookup failed.'
      );
      errorReasonsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH] =
        resolveGroundingFailureReason(error);
    }
  }

  if (shouldUseGrounding && !shouldAllowGroundingFallback) {
    const groundingReferenceCandidate =
      bestUsdaCandidate || bestLocalCandidate || null;
    const needsGroundingConfidence = resolveWeightedConfidence({
      score: Number(
        groundingReferenceCandidate?.score || LOCAL_ACCEPTANCE_POLICY.weakScore
      ),
      source: groundingReferenceCandidate?.source || FOOD_SEARCH_SOURCE.LOCAL,
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
    });

    const deferredGroundingResult = {
      status: 'needs_grounding',
      usedSource:
        groundingReferenceCandidate?.source || FOOD_SEARCH_SOURCE.LOCAL,
      queryUsed:
        groundingReferenceCandidate?.queryUsed ||
        terms[0] ||
        primaryTerm ||
        null,
      groundingQuery: terms[0] || primaryTerm || null,
      sourcesTried,
      fallbackUsed: sourcesTried.length > 1,
      matchedFood: null,
      errorsBySource,
      errorReasonsBySource,
      matchConfidence: needsGroundingConfidence.confidence,
      matchScore: Number(groundingReferenceCandidate?.score || 0),
      weightedMatchScore: needsGroundingConfidence.weightedScore,
      confidenceComponents: {
        rawScore: needsGroundingConfidence.rawScore,
        trustMultiplier: needsGroundingConfidence.trustMultiplier,
        weightedScore: needsGroundingConfidence.weightedScore,
      },
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
      ...buildLookupDecisionMeta({
        decision: LOOKUP_DECISION.TRY_GROUNDING,
        decisionReason: LOOKUP_DECISION_REASON.GROUNDING_REQUIRED,
        dataQuality:
          groundingReferenceCandidate?.dataQuality ||
          LOOKUP_DATA_QUALITY.MISSING,
        escalationAttempted: true,
        escalationReason:
          localDecision.escalationReason || localDecision.decisionReason,
      }),
    };

    setAiLookupSessionCacheValue(cacheKey, deferredGroundingResult);
    return cloneLookupResult(deferredGroundingResult);
  }

  const noMatchReferenceCandidate = bestUsdaCandidate || bestLocalCandidate;
  const lowConfidence = resolveWeightedConfidence({
    score: Number(noMatchReferenceCandidate?.score || 0),
    source: noMatchReferenceCandidate?.source || FOOD_SEARCH_SOURCE.LOCAL,
    sourcePreferenceWeights: effectiveSourcePreferenceWeights,
  });

  const noMatchResult = {
    status: noMatchReferenceCandidate ? 'weak_match' : 'no_match',
    usedSource: noMatchReferenceCandidate?.source || FOOD_SEARCH_SOURCE.LOCAL,
    queryUsed: noMatchReferenceCandidate?.queryUsed || null,
    sourcesTried,
    fallbackUsed: sourcesTried.length > 1,
    matchedFood: null,
    errorsBySource,
    errorReasonsBySource,
    matchConfidence: lowConfidence.confidence,
    matchScore: Number(noMatchReferenceCandidate?.score || 0),
    weightedMatchScore: lowConfidence.weightedScore,
    confidenceComponents: {
      rawScore: lowConfidence.rawScore,
      trustMultiplier: lowConfidence.trustMultiplier,
      weightedScore: lowConfidence.weightedScore,
    },
    sourcePreferenceWeights: effectiveSourcePreferenceWeights,
    ...buildLookupDecisionMeta({
      decision: LOOKUP_DECISION.NO_MATCH,
      decisionReason: shouldUseGrounding
        ? LOOKUP_DECISION_REASON.USDA_NO_CLOSE_MATCH
        : LOOKUP_DECISION_REASON.USDA_NO_BETTER_MATCH,
      dataQuality:
        noMatchReferenceCandidate?.dataQuality || LOOKUP_DATA_QUALITY.MISSING,
      escalationAttempted: true,
      escalationReason:
        localDecision.escalationReason || localDecision.decisionReason,
    }),
  };

  setAiLookupSessionCacheValue(cacheKey, noMatchResult);
  return cloneLookupResult(noMatchResult);
};

export const resolveAiGroundedBatch = async ({
  requests = [],
  qualityMode = AI_RAG_QUALITY_MODE.BALANCED,
  timeoutMs,
  dependencies = {},
} = {}) => {
  const resolvedQualityMode = normalizeAiRagQualityMode(qualityMode);
  const qualityPreset = getAiRagQualityPreset(resolvedQualityMode);
  const resolvedTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.max(1000, Math.round(Number(timeoutMs)))
    : qualityPreset.groundedBatchTimeoutMs;

  const normalizedRequests = Array.isArray(requests)
    ? requests
        .map((request) => ({
          entryKey: String(request?.entryKey || '').trim(),
          entryName: String(request?.entryName || '').trim(),
          groundingQuery: String(
            request?.groundingQuery || request?.entryName || ''
          ).trim(),
          sourcesTried: Array.isArray(request?.sourcesTried)
            ? [...request.sourcesTried]
            : [],
          errorsBySource:
            request?.errorsBySource &&
            typeof request.errorsBySource === 'object'
              ? { ...request.errorsBySource }
              : {},
          errorReasonsBySource:
            request?.errorReasonsBySource &&
            typeof request.errorReasonsBySource === 'object'
              ? { ...request.errorReasonsBySource }
              : {},
          sourcePreferenceWeights:
            request?.sourcePreferenceWeights &&
            typeof request.sourcePreferenceWeights === 'object'
              ? request.sourcePreferenceWeights
              : null,
        }))
        .filter((request) => request.entryKey && request.groundingQuery)
    : [];

  if (normalizedRequests.length === 0) {
    return {};
  }

  const resolvedDependencies = await loadDependencies({
    includeLocal: false,
    includeGrounding: true,
    includeGroundingBatch: true,
    dependencies,
  });

  const withGroundingSource = normalizedRequests.map((request) => ({
    ...request,
    sourcesTried: request.sourcesTried.includes(
      FOOD_SEARCH_SOURCE.AI_WEB_SEARCH
    )
      ? request.sourcesTried
      : [...request.sourcesTried, FOOD_SEARCH_SOURCE.AI_WEB_SEARCH],
  }));

  const resolveSuccess = (request, estimate) => {
    const weightedConfidence = resolveWeightedConfidence({
      score: AI_SCORE_THRESHOLD.low,
      source: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
      sourcePreferenceWeights: request.sourcePreferenceWeights,
    });

    return {
      status: 'resolved',
      usedSource: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
      queryUsed: request.groundingQuery,
      sourcesTried: request.sourcesTried,
      fallbackUsed: true,
      matchedFood: {
        name: estimate?.name || request.entryName || request.groundingQuery,
        brand: null,
        category: null,
        subcategory: 'grounded_estimate',
        per100g: {
          calories: Number(estimate?.per100g?.calories) || 0,
          protein: Number(estimate?.per100g?.protein) || 0,
          carbs: Number(estimate?.per100g?.carbs) || 0,
          fats: Number(estimate?.per100g?.fats) || 0,
        },
      },
      errorsBySource: request.errorsBySource,
      errorReasonsBySource: request.errorReasonsBySource,
      matchConfidence: estimate?.confidence || weightedConfidence.confidence,
      matchScore: AI_SCORE_THRESHOLD.low,
      weightedMatchScore: weightedConfidence.weightedScore,
      confidenceComponents: {
        rawScore: weightedConfidence.rawScore,
        trustMultiplier: weightedConfidence.trustMultiplier,
        weightedScore: weightedConfidence.weightedScore,
      },
      ...buildLookupDecisionMeta({
        decision: LOOKUP_DECISION.TRY_GROUNDING,
        decisionReason: LOOKUP_DECISION_REASON.GROUNDING_REQUIRED,
        dataQuality: LOOKUP_DATA_QUALITY.COMPLETE,
        escalationAttempted: true,
        escalationReason: LOOKUP_DECISION_REASON.GROUNDING_REQUIRED,
      }),
    };
  };

  const resolveFailure = (request, errorOrMessage, reasonCode) => {
    const errorMessage =
      typeof errorOrMessage === 'string'
        ? errorOrMessage
        : toErrorMessage(errorOrMessage, 'Grounded web lookup failed.');
    const failureReason =
      reasonCode ||
      (typeof errorOrMessage === 'string'
        ? SOURCE_ERROR_REASON.GROUNDING_INVALID_RESPONSE
        : resolveGroundingFailureReason(errorOrMessage));

    const errorsBySource = {
      ...request.errorsBySource,
      [FOOD_SEARCH_SOURCE.AI_WEB_SEARCH]: errorMessage,
    };
    const errorReasonsBySource = {
      ...request.errorReasonsBySource,
      [FOOD_SEARCH_SOURCE.AI_WEB_SEARCH]: failureReason,
    };

    const lowConfidence = resolveWeightedConfidence({
      score: 0,
      source: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
      sourcePreferenceWeights: request.sourcePreferenceWeights,
    });

    return {
      status: 'no_match',
      usedSource: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
      queryUsed: request.groundingQuery,
      sourcesTried: request.sourcesTried,
      fallbackUsed: true,
      matchedFood: null,
      errorsBySource,
      errorReasonsBySource,
      matchConfidence: lowConfidence.confidence,
      matchScore: 0,
      weightedMatchScore: lowConfidence.weightedScore,
      confidenceComponents: {
        rawScore: lowConfidence.rawScore,
        trustMultiplier: lowConfidence.trustMultiplier,
        weightedScore: lowConfidence.weightedScore,
      },
      ...buildLookupDecisionMeta({
        decision: LOOKUP_DECISION.NO_MATCH,
        decisionReason: LOOKUP_DECISION_REASON.USDA_NO_CLOSE_MATCH,
        dataQuality: LOOKUP_DATA_QUALITY.MISSING,
        escalationAttempted: true,
        escalationReason: LOOKUP_DECISION_REASON.GROUNDING_REQUIRED,
      }),
    };
  };

  try {
    if (typeof resolvedDependencies.searchGroundedBatch === 'function') {
      const response = await resolvedDependencies.searchGroundedBatch(
        withGroundingSource.map((request) => request.groundingQuery),
        undefined,
        resolvedTimeoutMs
      );
      const estimates = Array.isArray(response?.estimates)
        ? response.estimates
        : [];

      return Object.fromEntries(
        withGroundingSource.map((request, index) => {
          const estimate = estimates[index]?.estimate || null;

          if (estimate?.per100g && typeof estimate.per100g === 'object') {
            return [request.entryKey, resolveSuccess(request, estimate)];
          }

          return [
            request.entryKey,
            resolveFailure(
              request,
              'Grounded lookup returned no usable nutrition data for this entry.',
              SOURCE_ERROR_REASON.GROUNDING_INVALID_RESPONSE
            ),
          ];
        })
      );
    }

    if (typeof resolvedDependencies.searchGrounded === 'function') {
      const settledResults = await Promise.allSettled(
        withGroundingSource.map((request) =>
          resolvedDependencies.searchGrounded(
            request.groundingQuery,
            undefined,
            resolvedTimeoutMs
          )
        )
      );

      return Object.fromEntries(
        withGroundingSource.map((request, index) => {
          const settled = settledResults[index];
          if (
            settled?.status === 'fulfilled' &&
            settled.value?.per100g &&
            typeof settled.value.per100g === 'object'
          ) {
            return [request.entryKey, resolveSuccess(request, settled.value)];
          }

          return [
            request.entryKey,
            resolveFailure(request, settled?.reason || null),
          ];
        })
      );
    }

    return Object.fromEntries(
      withGroundingSource.map((request) => [
        request.entryKey,
        resolveFailure(
          request,
          'Grounded lookup is unavailable.',
          SOURCE_ERROR_REASON.GROUNDING_UNKNOWN
        ),
      ])
    );
  } catch (error) {
    return Object.fromEntries(
      withGroundingSource.map((request) => [
        request.entryKey,
        resolveFailure(request, error),
      ])
    );
  }
};

export const resolveAiFoodEntry = async ({
  entry,
  isOnline = true,
  lookupMeta = null,
  dependencies = {},
} = {}) => {
  if (!entry || typeof entry !== 'object') {
    return {
      verifiedEntry: null,
      lookupMeta: null,
    };
  }

  const resolvedLookupMeta =
    lookupMeta ||
    (await resolveAiFoodLookup({
      entryName: entry.name,
      lookupTerms: Array.isArray(entry.lookupTerms) ? entry.lookupTerms : [],
      isOnline,
      dependencies,
    }));

  const gramsResolution = resolveEntryGrams(entry, {
    fallbackGrams: 100,
  });
  const grams = gramsResolution.grams;

  const hasLookupPer100g =
    resolvedLookupMeta?.status === 'resolved' &&
    resolvedLookupMeta?.matchedFood?.per100g &&
    grams > 0;

  const fallbackVerificationUsed = !hasLookupPer100g;
  const originalConfidence = hasLookupPer100g
    ? resolvedLookupMeta?.matchConfidence || 'high'
    : entry?.confidence || 'medium';
  const fallbackPenaltyConfidence =
    resolveConfidencePenalty(originalConfidence);

  const basePer100g = hasLookupPer100g
    ? resolvedLookupMeta.matchedFood.per100g
    : {
        calories:
          grams > 0
            ? ((Number(entry?.calories) || 0) * 100) / grams
            : Number(entry?.calories) || 0,
        protein:
          grams > 0
            ? ((Number(entry?.protein) || 0) * 100) / grams
            : Number(entry?.protein) || 0,
        carbs:
          grams > 0
            ? ((Number(entry?.carbs) || 0) * 100) / grams
            : Number(entry?.carbs) || 0,
        fats:
          grams > 0
            ? ((Number(entry?.fats) || 0) * 100) / grams
            : Number(entry?.fats) || 0,
      };

  const scaledMacros = scaleMacrosFromPer100g(basePer100g, grams);

  const verifiedEntry = {
    name: String(entry?.name || '').trim() || 'Food entry',
    grams,
    calories: scaledMacros.calories,
    protein: scaledMacros.protein,
    carbs: scaledMacros.carbs,
    fats: scaledMacros.fats,
    confidence: hasLookupPer100g
      ? resolvedLookupMeta?.matchConfidence || 'high'
      : fallbackPenaltyConfidence,
    rationale: entry?.rationale || null,
    assumptions: Array.isArray(entry?.assumptions) ? entry.assumptions : [],
    lookupTerms: Array.isArray(entry?.lookupTerms) ? entry.lookupTerms : [],
    ...(entry?.category ? { category: entry.category } : {}),
    source: hasLookupPer100g
      ? resolvedLookupMeta?.usedSource || FOOD_SEARCH_SOURCE.LOCAL
      : 'estimate',
    portionResolutionMethod: gramsResolution.method,
    portionAssumed: gramsResolution.assumed,
  };

  return {
    verifiedEntry,
    lookupMeta: {
      ...(resolvedLookupMeta && typeof resolvedLookupMeta === 'object'
        ? resolvedLookupMeta
        : {}),
      matchConfidence: hasLookupPer100g
        ? resolvedLookupMeta?.matchConfidence || 'high'
        : fallbackPenaltyConfidence,
      originalMatchConfidence: originalConfidence,
      penalizedMatchConfidence: fallbackVerificationUsed
        ? fallbackPenaltyConfidence
        : null,
      confidencePenaltyApplied: fallbackVerificationUsed,
      confidencePenaltyReason: fallbackVerificationUsed
        ? 'deterministic_macro_fallback'
        : null,
      verificationFallbackUsed: fallbackVerificationUsed,
      verificationMethod: fallbackVerificationUsed
        ? 'derived_per100g_rescale'
        : 'lookup_per100g',
      fallbackDerivedPer100g: fallbackVerificationUsed,
    },
  };
};

export const searchFoodsHierarchically = async ({
  mode = 'local',
  query = '',
  category = null,
  subcategory = null,
  sortBy = 'name',
  sortOrder = 'asc',
  limit = 500,
  onlinePage = 1,
  onlinePageSize = 20,
  dependencies = {},
} = {}) => {
  // Legacy wrapper kept for compatibility while call sites migrate.
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      '[deprecated] searchFoodsHierarchically is a legacy wrapper. Prefer searchFoodsLocal/searchFoodsOnline directly.'
    );
  }

  if (mode === 'online') {
    return searchFoodsOnline({
      query,
      onlinePage: onlinePage || 1,
      onlinePageSize,
      dependencies,
    });
  }

  return searchFoodsLocal({
    query,
    category,
    subcategory,
    sortBy,
    sortOrder,
    limit,
    dependencies,
  });
};
