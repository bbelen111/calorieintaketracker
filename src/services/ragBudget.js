/**
 * Centralized RAG pipeline timing/budget constants.
 *
 * These constants are the single source of truth for every timeout applied to
 * OpenRouter calls and grounding lookups across the RAG food-AI pipeline.
 * Callers must import from here instead of hardcoding per-stage durations.
 */

export const RAG_LOOKUP_CONCURRENCY_LIMIT = 10;

/**
 * Documented safe upper bound for deferred grounding entries in a single batch.
 * The batch-timeout invariant uses this to guarantee that even a worst-case
 * batch of per-entry lookups fits inside the batch budget.
 */
export const RAG_MAX_DEFERRED_GROUNDING_ENTRIES = 20;

export const RAG_TIMING = Object.freeze({
  /** Extraction LLM pass (food entries from raw user text). */
  extractionMs: 30000,
  /** Presentation LLM pass (formatting verified entries into a response). */
  presentationMs: 30000,
  /** Legacy single-call processing path. */
  processingMs: 30000,
  /** Single grounded web lookup. */
  groundingLookupMs: 30000,
  /** Deferred grounding batch budget. */
  groundingBatchMs: 90000,
  /** Default applied by the low-level OpenRouter client when no override is given. */
  openRouterMessageDefaultMs: 30000,
  /** Default applied by fetchMacrosWithGrounding when the caller omits a timeout. */
  groundingCallDefaultMs: 20000,
  /** Default applied by fetchMacrosWithGroundingBatch when the caller omits a timeout. */
  groundingBatchCallDefaultMs: 25000,
});

/**
 * Batch budget factor used to derive the deferred-grounding budget from the
 * per-lookup budget (3x headroom for multi-entry messages).
 */
export const RAG_GROUNDING_BATCH_FACTOR = 3;

/**
 * Enforces the pinned timeout invariant:
 *   groundingBatchMs >= groundingLookupMs * ceil(maxDeferred / concurrency)
 *
 * Missing days are handled internally: the worst case is a full batch of
 * deferred per-entry grounding calls running at concurrency, so the batch
 * budget must be large enough to cover that many per-lookup timeouts.
 */
export const assertRagTimingInvariants = () => {
  const worstCaseBatchedLookups = Math.max(
    1,
    Math.ceil(
      RAG_MAX_DEFERRED_GROUNDING_ENTRIES / RAG_LOOKUP_CONCURRENCY_LIMIT
    )
  );
  const requiredBatchMs =
    RAG_TIMING.groundingLookupMs * worstCaseBatchedLookups;

  if (RAG_TIMING.groundingBatchMs < requiredBatchMs) {
    throw new Error(
      `RAG timing invariant violated: groundingBatchMs (${RAG_TIMING.groundingBatchMs}) ` +
        `must be >= groundingLookupMs (${RAG_TIMING.groundingLookupMs}) * ` +
        `ceil(maxDeferred (${RAG_MAX_DEFERRED_GROUNDING_ENTRIES}) / ` +
        `concurrency (${RAG_LOOKUP_CONCURRENCY_LIMIT})) = ${requiredBatchMs}.`
    );
  }

  if (RAG_TIMING.groundingBatchMs < RAG_TIMING.groundingLookupMs) {
    throw new Error(
      `RAG timing invariant violated: groundingBatchMs (${RAG_TIMING.groundingBatchMs}) ` +
        'must be >= groundingLookupMs ' +
        `(${RAG_TIMING.groundingLookupMs}).`
    );
  }
};

/**
 * Resolves the default timeout for a pipeline stage, honoring per-stage
 * overrides passed via `timeoutMs`.
 *
 * @param {'extraction'|'retrieval'|'verification'|'presentation'|'processing'|'groundingLookup'|'groundingBatch'} stage
 */
export const resolveRagStageTimeoutMs = (stage) => {
  switch (stage) {
    case 'extraction':
      return RAG_TIMING.extractionMs;
    case 'presentation':
      return RAG_TIMING.presentationMs;
    case 'processing':
      return RAG_TIMING.processingMs;
    case 'groundingLookup':
      return RAG_TIMING.groundingLookupMs;
    case 'groundingBatch':
      return RAG_TIMING.groundingBatchMs;
    default:
      return RAG_TIMING.openRouterMessageDefaultMs;
  }
};