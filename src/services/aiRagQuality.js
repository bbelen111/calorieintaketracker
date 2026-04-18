export const AI_RAG_QUALITY_MODE = Object.freeze({
  FAST: 'fast',
  BALANCED: 'balanced',
  PRECISION: 'precision',
});

const AI_RAG_QUALITY_MODE_SET = new Set(Object.values(AI_RAG_QUALITY_MODE));

const AI_RAG_TIMEOUT_MS = 30000;
const AI_RAG_BATCH_TIMEOUT_MS = 90000;

export const AI_RAG_QUALITY_PRESETS = Object.freeze({
  [AI_RAG_QUALITY_MODE.FAST]: Object.freeze({
    mode: AI_RAG_QUALITY_MODE.FAST,
    label: 'Fast',
    description: 'Lowest latency with narrower lookup depth.',
    extractionTimeoutMs: AI_RAG_TIMEOUT_MS,
    presentationTimeoutMs: AI_RAG_TIMEOUT_MS,
    groundedLookupTimeoutMs: AI_RAG_TIMEOUT_MS,
    groundedBatchTimeoutMs: AI_RAG_BATCH_TIMEOUT_MS,
    localLimit: 8,
    onlinePageSize: 8,
    enableGroundingFallback: false,
    enableDeferredGrounding: false,
  }),
  [AI_RAG_QUALITY_MODE.BALANCED]: Object.freeze({
    mode: AI_RAG_QUALITY_MODE.BALANCED,
    label: 'Balanced',
    description: 'Default balance of speed and coverage.',
    extractionTimeoutMs: AI_RAG_TIMEOUT_MS,
    presentationTimeoutMs: AI_RAG_TIMEOUT_MS,
    groundedLookupTimeoutMs: AI_RAG_TIMEOUT_MS,
    groundedBatchTimeoutMs: AI_RAG_BATCH_TIMEOUT_MS,
    localLimit: 25,
    onlinePageSize: 20,
    enableGroundingFallback: true,
    enableDeferredGrounding: true,
  }),
  [AI_RAG_QUALITY_MODE.PRECISION]: Object.freeze({
    mode: AI_RAG_QUALITY_MODE.PRECISION,
    label: 'Precision',
    description: 'Maximum lookup coverage with higher latency tolerance.',
    extractionTimeoutMs: AI_RAG_TIMEOUT_MS,
    presentationTimeoutMs: AI_RAG_TIMEOUT_MS,
    groundedLookupTimeoutMs: AI_RAG_TIMEOUT_MS,
    groundedBatchTimeoutMs: AI_RAG_BATCH_TIMEOUT_MS,
    localLimit: 100,
    onlinePageSize: 40,
    enableGroundingFallback: true,
    enableDeferredGrounding: true,
  }),
});

export const normalizeAiRagQualityMode = (
  value,
  fallback = AI_RAG_QUALITY_MODE.BALANCED
) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (AI_RAG_QUALITY_MODE_SET.has(normalized)) {
    return normalized;
  }

  return AI_RAG_QUALITY_MODE_SET.has(fallback)
    ? fallback
    : AI_RAG_QUALITY_MODE.BALANCED;
};

export const getAiRagQualityPreset = (mode) => {
  const normalizedMode = normalizeAiRagQualityMode(mode);
  return AI_RAG_QUALITY_PRESETS[normalizedMode];
};

export const AI_RAG_QUALITY_OPTIONS = Object.freeze(
  Object.values(AI_RAG_QUALITY_MODE).map((mode) => {
    const preset = AI_RAG_QUALITY_PRESETS[mode];
    return Object.freeze({
      value: preset.mode,
      label: preset.label,
      description: preset.description,
    });
  })
);
