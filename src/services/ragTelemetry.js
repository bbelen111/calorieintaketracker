import {
  loadAllHistoryDocuments,
  saveHistoryDocumentsToDexie,
} from '../utils/data/historyDatabase.js';
import { normalizeAiRagQualityMode } from './aiRagQuality.js';

const RAG_TELEMETRY_AGGREGATE_DOC_ID = 'ragTelemetryAggregate';
const RAG_TELEMETRY_SESSIONS_DOC_ID = 'ragTelemetrySessions';
const MAX_PERSISTED_SESSION_SUMMARIES = 120;

const createLatencyBucket = () => ({
  count: 0,
  totalMs: 0,
  minMs: null,
  maxMs: null,
});

const createEmptySnapshot = () => ({
  stageLatency: {
    extraction: createLatencyBucket(),
    retrieval: createLatencyBucket(),
    presentation: createLatencyBucket(),
    verification: createLatencyBucket(),
    endToEnd: createLatencyBucket(),
  },
  extractionOutcomes: {
    food_entries: 0,
    clarification: 0,
    error: 0,
    no_entries: 0,
  },
  retrievalSourceHits: {
    local: 0,
    usda: 0,
    ai_web_search: 0,
    estimate: 0,
  },
  groundedFallbackCount: 0,
  confidenceBySource: {
    local: { high: 0, medium: 0, low: 0 },
    usda: { high: 0, medium: 0, low: 0 },
    ai_web_search: { high: 0, medium: 0, low: 0 },
    estimate: { high: 0, medium: 0, low: 0 },
  },
  presentationNameDrift: {
    compared: 0,
    drifted: 0,
  },
  implicitFeedback: {
    events: {
      log_accept: 0,
      log_exit_accept: 0,
      save_favourite_accept: 0,
      ignored_no_action: 0,
      query_again_reject: 0,
      partial_batch_reject: 0,
    },
    confidenceCorrections: {
      high: { accepted: 0, rejected: 0 },
      medium: { accepted: 0, rejected: 0 },
      low: { accepted: 0, rejected: 0 },
    },
    feedbackByMessageId: {},
    sourceValidationByCategory: {},
  },
  schemaVersionCounts: {},
  qualityModeCounts: {
    fast: 0,
    balanced: 0,
    precision: 0,
  },
});

const createEmptySession = () => ({
  sessionId: `rag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  startedAt: Date.now(),
  updatedAt: Date.now(),
  metrics: createEmptySnapshot(),
});

let sessionState = createEmptySession();
let aggregateState = createEmptySnapshot();
let sessionsState = [];
let initialized = false;
let hydratePromise = null;

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const asNonNegativeNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

const normalizeSource = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'local' ||
    normalized === 'usda' ||
    normalized === 'ai_web_search' ||
    normalized === 'estimate'
  ) {
    return normalized;
  }
  return null;
};

const normalizeConfidence = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'high' ||
    normalized === 'medium' ||
    normalized === 'low'
  ) {
    return normalized;
  }
  return 'low';
};

const normalizeSchemaVersion = (value) => {
  const normalized = String(value || '').trim();
  return normalized || 'unknown';
};

const normalizeCategory = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'uncategorized';
};

const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isSignificantNameDrift = (verifiedName, presentedName) => {
  const a = normalizeName(verifiedName);
  const b = normalizeName(presentedName);
  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return false;
  }

  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    if (shorter / longer >= 0.72) {
      return false;
    }
  }

  const aTokens = new Set(a.split(' '));
  const bTokens = new Set(b.split(' '));
  let overlap = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  });

  const tokenSimilarity = overlap / Math.max(aTokens.size, bTokens.size, 1);
  return tokenSimilarity < 0.5;
};

const applyStageLatency = (targetMetrics, stage, durationMs) => {
  const normalizedStage = String(stage || '').trim();
  if (!targetMetrics.stageLatency[normalizedStage]) {
    return;
  }

  const duration = asNonNegativeNumber(durationMs);
  if (duration == null) {
    return;
  }

  const bucket = targetMetrics.stageLatency[normalizedStage];
  bucket.count += 1;
  bucket.totalMs += duration;
  bucket.minMs =
    bucket.minMs == null ? duration : Math.min(bucket.minMs, duration);
  bucket.maxMs =
    bucket.maxMs == null ? duration : Math.max(bucket.maxMs, duration);
};

const applySchemaVersionCount = (targetMetrics, schemaVersion) => {
  const normalizedVersion = normalizeSchemaVersion(schemaVersion);
  targetMetrics.schemaVersionCounts[normalizedVersion] =
    (targetMetrics.schemaVersionCounts[normalizedVersion] || 0) + 1;
};

const applyQualityModeCount = (targetMetrics, qualityMode) => {
  const normalizedQualityMode = normalizeAiRagQualityMode(
    qualityMode,
    'balanced'
  );
  if (
    !targetMetrics.qualityModeCounts ||
    typeof targetMetrics.qualityModeCounts !== 'object'
  ) {
    targetMetrics.qualityModeCounts = {
      fast: 0,
      balanced: 0,
      precision: 0,
    };
  }

  if (
    !Number.isFinite(targetMetrics.qualityModeCounts[normalizedQualityMode])
  ) {
    targetMetrics.qualityModeCounts[normalizedQualityMode] = 0;
  }

  targetMetrics.qualityModeCounts[normalizedQualityMode] += 1;
};

const applyExtractionOutcome = (targetMetrics, messageType, entriesCount) => {
  const normalizedMessageType = String(messageType || '')
    .trim()
    .toLowerCase();
  if (
    normalizedMessageType === 'food_entries' ||
    normalizedMessageType === 'clarification' ||
    normalizedMessageType === 'error'
  ) {
    targetMetrics.extractionOutcomes[normalizedMessageType] += 1;
    if (normalizedMessageType === 'food_entries' && Number(entriesCount) <= 0) {
      targetMetrics.extractionOutcomes.no_entries += 1;
    }
    return;
  }

  targetMetrics.extractionOutcomes.no_entries += 1;
};

const applyLookupContext = (targetMetrics, lookupContext = {}) => {
  Object.values(lookupContext || {}).forEach((meta) => {
    const source = normalizeSource(meta?.usedSource) || 'estimate';
    const confidence = normalizeConfidence(meta?.matchConfidence);

    targetMetrics.retrievalSourceHits[source] += 1;
    targetMetrics.confidenceBySource[source][confidence] += 1;

    if (meta?.fallbackUsed || source === 'ai_web_search') {
      targetMetrics.groundedFallbackCount += 1;
    }
  });
};

const applyNameDrift = (
  targetMetrics,
  verifiedEntries = [],
  presentationEntries = []
) => {
  const maxLength = Math.max(
    Array.isArray(verifiedEntries) ? verifiedEntries.length : 0,
    Array.isArray(presentationEntries) ? presentationEntries.length : 0
  );

  for (let index = 0; index < maxLength; index += 1) {
    const verifiedName = verifiedEntries?.[index]?.name;
    const presentedName = presentationEntries?.[index]?.name;

    if (!verifiedName || !presentedName) {
      continue;
    }

    targetMetrics.presentationNameDrift.compared += 1;
    if (isSignificantNameDrift(verifiedName, presentedName)) {
      targetMetrics.presentationNameDrift.drifted += 1;
    }
  }
};

const isAcceptedFeedbackEvent = (eventType) => {
  return (
    eventType === 'log_accept' ||
    eventType === 'log_exit_accept' ||
    eventType === 'save_favourite_accept'
  );
};

const isRejectedFeedbackEvent = (eventType) => {
  return (
    eventType === 'ignored_no_action' ||
    eventType === 'query_again_reject' ||
    eventType === 'partial_batch_reject'
  );
};

const getCategorySourceBucket = (targetMetrics, category, source) => {
  const normalizedCategory = normalizeCategory(category);
  const normalizedSource = normalizeSource(source) || 'estimate';

  if (
    !targetMetrics.implicitFeedback.sourceValidationByCategory[
      normalizedCategory
    ]
  ) {
    targetMetrics.implicitFeedback.sourceValidationByCategory[
      normalizedCategory
    ] = {
      local: { accepted: 0, rejected: 0 },
      usda: { accepted: 0, rejected: 0 },
      ai_web_search: { accepted: 0, rejected: 0 },
      estimate: { accepted: 0, rejected: 0 },
    };
  }

  return targetMetrics.implicitFeedback.sourceValidationByCategory[
    normalizedCategory
  ][normalizedSource];
};

const applyImplicitFeedback = (
  targetMetrics,
  { eventType, messageId, entryKey, source, confidence, category } = {}
) => {
  const normalizedEventType = String(eventType || '')
    .trim()
    .toLowerCase();
  if (
    !Object.prototype.hasOwnProperty.call(
      targetMetrics.implicitFeedback.events,
      normalizedEventType
    )
  ) {
    return;
  }

  targetMetrics.implicitFeedback.events[normalizedEventType] += 1;

  const normalizedConfidence = normalizeConfidence(confidence);
  const confidenceBucket =
    targetMetrics.implicitFeedback.confidenceCorrections[normalizedConfidence];

  if (isAcceptedFeedbackEvent(normalizedEventType)) {
    confidenceBucket.accepted += 1;
  } else if (isRejectedFeedbackEvent(normalizedEventType)) {
    confidenceBucket.rejected += 1;
  }

  const categorySourceBucket = getCategorySourceBucket(
    targetMetrics,
    category,
    source
  );

  if (isAcceptedFeedbackEvent(normalizedEventType)) {
    categorySourceBucket.accepted += 1;
  } else if (isRejectedFeedbackEvent(normalizedEventType)) {
    categorySourceBucket.rejected += 1;
  }

  const normalizedMessageId = String(messageId || '')
    .trim()
    .slice(0, 80);
  if (normalizedMessageId) {
    if (
      !targetMetrics.implicitFeedback.feedbackByMessageId[normalizedMessageId]
    ) {
      targetMetrics.implicitFeedback.feedbackByMessageId[normalizedMessageId] =
        {
          accepted: 0,
          rejected: 0,
          events: 0,
          lastEventType: null,
          lastEntryKey: null,
        };
    }

    const bucket =
      targetMetrics.implicitFeedback.feedbackByMessageId[normalizedMessageId];
    bucket.events += 1;
    bucket.lastEventType = normalizedEventType;
    bucket.lastEntryKey = String(entryKey || '').trim() || null;

    if (isAcceptedFeedbackEvent(normalizedEventType)) {
      bucket.accepted += 1;
    } else if (isRejectedFeedbackEvent(normalizedEventType)) {
      bucket.rejected += 1;
    }
  }
};

const persistTelemetry = async () => {
  if (!initialized) {
    return;
  }

  const sessionSummary = {
    sessionId: sessionState.sessionId,
    startedAt: sessionState.startedAt,
    updatedAt: sessionState.updatedAt,
    metrics: deepClone(sessionState.metrics),
  };

  sessionsState = [
    sessionSummary,
    ...sessionsState.filter(
      (item) => item?.sessionId !== sessionSummary.sessionId
    ),
  ].slice(0, MAX_PERSISTED_SESSION_SUMMARIES);

  await saveHistoryDocumentsToDexie([
    {
      id: RAG_TELEMETRY_AGGREGATE_DOC_ID,
      payload: {
        updatedAt: Date.now(),
        metrics: deepClone(aggregateState),
      },
    },
    {
      id: RAG_TELEMETRY_SESSIONS_DOC_ID,
      payload: {
        updatedAt: Date.now(),
        sessions: deepClone(sessionsState),
      },
    },
  ]);
};

const ensureHydrated = async () => {
  if (initialized) {
    return;
  }

  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    const loaded = await loadAllHistoryDocuments();
    const docsById = new Map(
      (loaded?.documents || []).map((doc) => [doc.id, doc.payload])
    );

    const aggregatePayload = docsById.get(RAG_TELEMETRY_AGGREGATE_DOC_ID);
    if (
      aggregatePayload?.metrics &&
      typeof aggregatePayload.metrics === 'object'
    ) {
      aggregateState = {
        ...createEmptySnapshot(),
        ...aggregatePayload.metrics,
      };
    }

    const sessionsPayload = docsById.get(RAG_TELEMETRY_SESSIONS_DOC_ID);
    if (Array.isArray(sessionsPayload?.sessions)) {
      sessionsState = sessionsPayload.sessions.slice(
        0,
        MAX_PERSISTED_SESSION_SUMMARIES
      );
    }

    initialized = true;
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
};

const applyMutation = async (mutator) => {
  await ensureHydrated();
  mutator(sessionState.metrics);
  mutator(aggregateState);
  sessionState.updatedAt = Date.now();
  await persistTelemetry();
};

export const recordRagStageLatency = async ({
  stage,
  durationMs,
  schemaVersion = null,
  qualityMode = null,
} = {}) => {
  await applyMutation((metrics) => {
    applyStageLatency(metrics, stage, durationMs);
    if (schemaVersion) {
      applySchemaVersionCount(metrics, schemaVersion);
    }
    if (qualityMode) {
      applyQualityModeCount(metrics, qualityMode);
    }
  });
};

export const recordRagExtractionOutcome = async ({
  messageType,
  entriesCount,
  schemaVersion = null,
  qualityMode = null,
} = {}) => {
  await applyMutation((metrics) => {
    applyExtractionOutcome(metrics, messageType, entriesCount);
    applySchemaVersionCount(metrics, schemaVersion);
    if (qualityMode) {
      applyQualityModeCount(metrics, qualityMode);
    }
  });
};

export const recordRagLookupStats = async ({
  lookupContext,
  schemaVersion = null,
  qualityMode = null,
} = {}) => {
  await applyMutation((metrics) => {
    applyLookupContext(metrics, lookupContext);
    if (schemaVersion) {
      applySchemaVersionCount(metrics, schemaVersion);
    }
    if (qualityMode) {
      applyQualityModeCount(metrics, qualityMode);
    }
  });
};

export const recordRagPresentationNameDrift = async ({
  verifiedEntries,
  presentationEntries,
  schemaVersion = null,
  qualityMode = null,
} = {}) => {
  await applyMutation((metrics) => {
    applyNameDrift(metrics, verifiedEntries, presentationEntries);
    if (schemaVersion) {
      applySchemaVersionCount(metrics, schemaVersion);
    }
    if (qualityMode) {
      applyQualityModeCount(metrics, qualityMode);
    }
  });
};

export const recordRagImplicitFeedback = async ({
  eventType,
  messageId,
  entryKey,
  source,
  confidence,
  category,
  schemaVersion = null,
  qualityMode = null,
} = {}) => {
  await applyMutation((metrics) => {
    applyImplicitFeedback(metrics, {
      eventType,
      messageId,
      entryKey,
      source,
      confidence,
      category,
    });
    if (schemaVersion) {
      applySchemaVersionCount(metrics, schemaVersion);
    }
    if (qualityMode) {
      applyQualityModeCount(metrics, qualityMode);
    }
  });
};

const computeConfidenceRejectionRate = (bucket = {}) => {
  const accepted = Number(bucket.accepted) || 0;
  const rejected = Number(bucket.rejected) || 0;
  const total = accepted + rejected;
  if (total <= 0) {
    return 0;
  }
  return rejected / total;
};

const clampThreshold = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};

export const getRagConfidenceCalibrationSuggestion = async () => {
  await ensureHydrated();

  const base = {
    high: 0.88,
    medium: 0.72,
    low: 0.55,
  };

  const rejectionTargets = {
    high: 0.05,
    medium: 0.15,
    low: 0.25,
  };

  const buckets = aggregateState.implicitFeedback.confidenceCorrections;
  const highRate = computeConfidenceRejectionRate(buckets.high);
  const mediumRate = computeConfidenceRejectionRate(buckets.medium);
  const lowRate = computeConfidenceRejectionRate(buckets.low);

  let recommendedHigh = clampThreshold(
    base.high + (highRate - rejectionTargets.high) * 0.2,
    0.84,
    0.95
  );
  let recommendedMedium = clampThreshold(
    base.medium + (mediumRate - rejectionTargets.medium) * 0.15,
    0.6,
    0.9
  );
  let recommendedLow = clampThreshold(
    base.low + (lowRate - rejectionTargets.low) * 0.1,
    0.45,
    0.8
  );

  if (recommendedMedium >= recommendedHigh) {
    recommendedMedium = Math.max(0.55, recommendedHigh - 0.05);
  }
  if (recommendedLow >= recommendedMedium) {
    recommendedLow = Math.max(0.4, recommendedMedium - 0.05);
  }

  return {
    base,
    recommended: {
      high: Number(recommendedHigh.toFixed(3)),
      medium: Number(recommendedMedium.toFixed(3)),
      low: Number(recommendedLow.toFixed(3)),
    },
    rejectionRates: {
      high: Number(highRate.toFixed(4)),
      medium: Number(mediumRate.toFixed(4)),
      low: Number(lowRate.toFixed(4)),
    },
  };
};

export const getRagSourcePreferenceWeightsForCategory = async (
  category = 'uncategorized'
) => {
  await ensureHydrated();

  const normalizedCategory = normalizeCategory(category);
  const categoryBucket = aggregateState.implicitFeedback
    .sourceValidationByCategory[normalizedCategory] || {
    local: { accepted: 0, rejected: 0 },
    usda: { accepted: 0, rejected: 0 },
    ai_web_search: { accepted: 0, rejected: 0 },
    estimate: { accepted: 0, rejected: 0 },
  };

  const resolveWeight = (bucket) => {
    const accepted = Number(bucket?.accepted) || 0;
    const rejected = Number(bucket?.rejected) || 0;
    const smoothedAcceptanceRate = (accepted + 1) / (accepted + rejected + 2);
    const weight = 0.85 + smoothedAcceptanceRate * 0.3;
    return Number(Math.max(0.85, Math.min(1.15, weight)).toFixed(4));
  };

  return {
    local: resolveWeight(categoryBucket.local),
    usda: resolveWeight(categoryBucket.usda),
    ai_web_search: resolveWeight(categoryBucket.ai_web_search),
    estimate: resolveWeight(categoryBucket.estimate),
  };
};

export const getRagTelemetrySessionSnapshot = () => {
  const snapshot = deepClone(sessionState);
  const compared = snapshot.metrics.presentationNameDrift.compared;
  const drifted = snapshot.metrics.presentationNameDrift.drifted;
  snapshot.metrics.presentationNameDrift.rate =
    compared > 0 ? drifted / compared : 0;

  const outcomes = snapshot.metrics.extractionOutcomes;
  const totalOutcomes =
    outcomes.food_entries +
    outcomes.clarification +
    outcomes.error +
    outcomes.no_entries;
  snapshot.metrics.extractionOutcomes.nonFoodEntriesRate =
    totalOutcomes > 0
      ? (outcomes.clarification + outcomes.error + outcomes.no_entries) /
        totalOutcomes
      : 0;

  snapshot.metrics.implicitFeedback =
    snapshot.metrics.implicitFeedback || createEmptySnapshot().implicitFeedback;

  return snapshot;
};

export const getRagTelemetryAggregateSnapshot = async () => {
  await ensureHydrated();
  return deepClone({
    metrics: aggregateState,
    sessions: sessionsState,
  });
};

export const __resetRagTelemetryForTests = () => {
  sessionState = createEmptySession();
  aggregateState = createEmptySnapshot();
  sessionsState = [];
  initialized = false;
  hydratePromise = null;
};
