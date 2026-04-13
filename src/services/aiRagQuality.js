export const AI_RAG_QUALITY_MODE = Object.freeze({
  FAST: 'fast',
  BALANCED: 'balanced',
  PRECISION: 'precision',
});

const AI_RAG_QUALITY_MODE_SET = new Set(Object.values(AI_RAG_QUALITY_MODE));

export const AI_RAG_QUALITY_PRESETS = Object.freeze({
  [AI_RAG_QUALITY_MODE.FAST]: Object.freeze({
    mode: AI_RAG_QUALITY_MODE.FAST,
    label: 'Fast',
    description: 'Lowest latency with narrower lookup depth.',
    extractionTimeoutMs: 12000,
    presentationTimeoutMs: 12000,
    groundedLookupTimeoutMs: 12000,
    groundedBatchTimeoutMs: 14000,
    localLimit: 12,
    onlinePageSize: 10,
    enableGroundingFallback: false,
    enableDeferredGrounding: false,
  }),
  [AI_RAG_QUALITY_MODE.BALANCED]: Object.freeze({
    mode: AI_RAG_QUALITY_MODE.BALANCED,
    label: 'Balanced',
    description: 'Default balance of speed and coverage.',
    extractionTimeoutMs: 30000,
    presentationTimeoutMs: 30000,
    groundedLookupTimeoutMs: 20000,
    groundedBatchTimeoutMs: 25000,
    localLimit: 25,
    onlinePageSize: 20,
    enableGroundingFallback: true,
    enableDeferredGrounding: true,
  }),
  [AI_RAG_QUALITY_MODE.PRECISION]: Object.freeze({
    mode: AI_RAG_QUALITY_MODE.PRECISION,
    label: 'Precision',
    description: 'Maximum lookup coverage with higher latency tolerance.',
    extractionTimeoutMs: 45000,
    presentationTimeoutMs: 45000,
    groundedLookupTimeoutMs: 30000,
    groundedBatchTimeoutMs: 35000,
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
