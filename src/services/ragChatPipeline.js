/**
 * RAG food-AI chat pipeline (extraction → retrieval → verification →
 * presentation) as a standalone, testable service.
 *
 * Extracted from FoodSearchModal.jsx so the sequence can be unit-tested with
 * stubbed OpenRouter modules and reused without the modal's DOM/state weight.
 *
 * Design notes:
 * - `modules` are injected (the modal lazy-imports `services/openrouter.js` to
 *   preserve bundle splitting; tests inject plain stubs).
 * - `telemetry` callbacks are injected with no-op defaults so the pipeline
 *   stays pure outside the app (Node tests never touch Dexie).
 * - Single-entry/simple responses skip the presentation LLM pass entirely
 *   (the merge is near-identity there) — see `shouldSkipPresentationPass`.
 * - Lookup-context keys are stable entry keys (`msgId::index:token`).
 */

import {
  dedupeExtractedFoodEntries,
  FOOD_SEARCH_SOURCE,
  resolveAiFoodEntry,
} from './foodSearch.js';
import {
  buildLookupContextEntryKey,
  resolveFoodLookupContext,
} from './foodLookupContext.js';
import { mergePresentationEntriesWithVerified } from '../utils/food/aiPresentationMerge.js';
import { scaleMacrosFromPer100g } from '../utils/food/portionNormalization.js';
import {
  buildDisplayUnitsBlock,
  buildDisplayValues,
} from '../utils/units/aiDisplayUnits.js';
import {
  RAG_GROUNDING_BATCH_MAX_NAMES,
  RAG_TIMING,
  RAG_MAX_DEFERRED_GROUNDING_ENTRIES,
  RAG_LOOKUP_CONCURRENCY_LIMIT,
  resolveRagStageTimeoutMs,
} from './ragBudget.js';

export const CHAT_HISTORY_MESSAGE_LIMIT = 48;

/**
 * History actually sent to the model per request. The low-level client
 * (`buildOpenRouterContentsForRequest`) already slices to the last 12
 * messages, so the builder caps here too instead of assembling 48 and
 * discarding 36 — and the two constants can never drift silently.
 */
export const CHAT_REQUEST_HISTORY_MESSAGE_LIMIT = 12;

export const CHAT_PIPELINE_STAGE = Object.freeze({
  EXTRACTION: 'extraction',
  RETRIEVAL: 'retrieval',
  VERIFICATION: 'verification',
  PRESENTATION: 'presentation',
  PROCESSING: 'processing',
});

const getNowMs = () => {
  if (typeof window !== 'undefined' && window.performance?.now) {
    return window.performance.now();
  }
  return Date.now();
};

/**
 * Builds the OpenRouter-style structured history (user parts + assistant
 * content) from the app's chat message list, stopping at `beforeMessageId`.
 *
 * Historical images are NEVER replayed: a 5MB photo re-encoded per request
 * would both blow the proxy's 500KB payload cap (hard-failing every message
 * after an image message) and waste re-encode time. Past image messages carry
 * a text note instead; only the CURRENT message's files are sent (via the
 * pipeline's `files` argument).
 */
export const buildStructuredChatHistory = (messages, options = {}) => {
  const { beforeMessageId = null } = options;
  const history = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    if (beforeMessageId && message.id === beforeMessageId) {
      break;
    }

    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      message.status !== 'sent'
    ) {
      continue;
    }

    if (message.role === 'user') {
      const parts = [];
      const text = typeof message.text === 'string' ? message.text.trim() : '';
      if (text) {
        parts.push({ text });
      }

      (Array.isArray(message.attachments) ? message.attachments : []).forEach(
        (attachment) => {
          if (
            attachment?.file &&
            typeof window !== 'undefined' &&
            attachment.file instanceof window.File
          ) {
            parts.push({ text: '[an image was attached]' });
          }
        }
      );

      if (parts.length > 0) {
        history.push({ role: 'user', parts });
      }
      continue;
    }

    const assistantText =
      typeof message.text === 'string' ? message.text.trim() : '';
    if (assistantText) {
      history.push({ role: 'assistant', content: assistantText });
    }
  }

  return history.slice(-CHAT_REQUEST_HISTORY_MESSAGE_LIMIT);
};
/**
 * Builds a compact rolling summary of previously logged food entries for the
 * extraction prompt (recent foods shown to the model as context).
 */
export const buildRollingFoodContextSummary = (messages, options = {}) => {
  const { beforeMessageId = null, maxEntries = 8 } = options;
  const contextItems = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    if (beforeMessageId && message.id === beforeMessageId) {
      break;
    }

    if (
      message?.role !== 'assistant' ||
      message?.status !== 'sent' ||
      message?.foodParser?.messageType !== 'food_entries' ||
      !Array.isArray(message?.foodParser?.entries)
    ) {
      continue;
    }

    message.foodParser.entries.forEach((entry) => {
      const name = String(entry?.name || '').trim();
      if (!name) {
        return;
      }

      const grams = Number(entry?.grams);
      const calories = Number(entry?.calories);
      const gramsLabel =
        Number.isFinite(grams) && grams > 0 ? `${Math.round(grams)}g` : null;
      const caloriesLabel =
        Number.isFinite(calories) && calories > 0
          ? `${Math.round(calories)} kcal`
          : null;

      contextItems.push(
        `${name}${gramsLabel ? ` (${gramsLabel}${caloriesLabel ? `, ${caloriesLabel}` : ''})` : caloriesLabel ? ` (${caloriesLabel})` : ''}`
      );
    });
  }

  const recentItems = contextItems.slice(-Math.max(1, maxEntries));
  if (recentItems.length === 0) {
    return '';
  }

  return recentItems.map((item, index) => `${index + 1}. ${item}`).join('\n');
};
/**
 * Attaches per-entry lookup metadata to assistant food entries for display.
 * Uses stable entry keys so metadata survives ordering shifts.
 */
export const mergeEntriesWithLookupContext = ({
  entries = [],
  messageId = '',
  lookupContext = null,
}) => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeMessageId = String(messageId || '').trim();
  const safeLookupContext =
    lookupContext && typeof lookupContext === 'object' ? lookupContext : null;

  if (!safeMessageId || !safeLookupContext || safeEntries.length === 0) {
    return safeEntries;
  }

  return safeEntries.map((entry, index) => {
    const entryKey = buildLookupContextEntryKey(
      safeMessageId,
      index,
      entry?.name
    );
    const entryLookupMeta = safeLookupContext[entryKey];

    if (!entryLookupMeta || typeof entryLookupMeta !== 'object') {
      return entry;
    }

    return {
      ...entry,
      lookupMeta: entryLookupMeta,
    };
  });
};

/**
 * Decides whether the presentation LLM pass can be safely skipped.
 *
 * With a single verified entry the presentation→verification merge is nearly
 * an identity operation, so skipping saves one billable LLM call plus its
 * latency (~30% end-to-end on the common single-food message).
 */
export const shouldSkipPresentationPass = ({ verifiedEntries = [] } = {}) =>
  Array.isArray(verifiedEntries) && verifiedEntries.length <= 1;

const telemetryNoop = async () => {};

/**
 * Telemetry is fire-and-forget: every `record.*` call used to be awaited
 * inline between pipeline stages, putting a telemetry write on the critical
 * path of every message. Stage timings are still captured synchronously —
 * only the recording stops blocking the next stage. A rejected telemetry
 * promise must never surface as an unhandled rejection in the chat flow.
 */
const fireAndForgetTelemetry = (promise) => {
  Promise.resolve(promise).catch(() => {});
};

/**
 * Extracts OpenRouter usage stats from a raw completion response so token
 * spend per stage is visible in telemetry (`raw.usage` is otherwise
 * discarded). Returns null when the response carries no usage block.
 */
const extractUsageStats = (raw) => {
  const usage = raw?.usage && typeof raw.usage === 'object' ? raw.usage : null;
  if (!usage) {
    return null;
  }

  const stats = {};
  const promptTokens = Number(usage.prompt_tokens ?? usage.promptTokens);
  const completionTokens = Number(
    usage.completion_tokens ?? usage.completionTokens
  );
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens);

  if (Number.isFinite(promptTokens) && promptTokens >= 0) {
    stats.promptTokens = promptTokens;
  }
  if (Number.isFinite(completionTokens) && completionTokens >= 0) {
    stats.completionTokens = completionTokens;
  }
  if (Number.isFinite(totalTokens) && totalTokens >= 0) {
    stats.totalTokens = totalTokens;
  }

  return Object.keys(stats).length > 0 ? stats : null;
};

const buildVerifiedResultFromEntries = ({
  extractionResult,
  verifiedEntries,
  presentationSkipped = false,
}) => ({
  text:
    extractionResult?.text ||
    (presentationSkipped
      ? "Here's your parsed food entry."
      : 'Here are your parsed food entries.'),
  raw: presentationSkipped ? null : extractionResult?.raw || null,
  foodParser: {
    messageType: 'food_entries',
    entries: verifiedEntries,
    followUpQuestion: null,
  },
  ...(presentationSkipped ? { presentationSkipped: true } : {}),
});
/**
 * Runs the full RAG chat request. Returns the final `result` object (same
 * shape the modal previously produced inline) plus lookup context and schema
 * bookkeeping for the caller.
 */
export const runRagChatPipeline = async ({
  message,
  files = [],
  history = [],
  chatMessages = [],
  beforeMessageId = null,
  assistantMessageId = null,
  isOnline = true,
  enableRag = false,
  displayUnits,
  signal,
  modules = {},
  lookupOptions = {},
  timeoutMs = {},
  onStageChange = () => {},
  telemetry = {},
} = {}) => {
  const {
    sendOpenRouterMessage,
    sendOpenRouterExtraction,
    sendOpenRouterPresentation,
    fetchMacrosWithGrounding,
  } = modules;

  const trimmedText = String(message ?? '').trim();
  // Empty for kcal + grams users, whose requests carry nothing extra.
  const unitsNote = buildDisplayUnitsBlock(displayUnits);
  const safeFiles = Array.isArray(files) ? files : [];
  const resolvedAssistantMessageId =
    String(assistantMessageId || '').trim() || `assistant-${Date.now()}`;

  const record = {
    stageLatency: telemetry.recordRagStageLatency || telemetryNoop,
    extractionOutcome: telemetry.recordRagExtractionOutcome || telemetryNoop,
    lookupStats: telemetry.recordRagLookupStats || telemetryNoop,
    nameDrift: telemetry.recordRagPresentationNameDrift || telemetryNoop,
    presentationIssues: telemetry.recordRagPresentationIssues || telemetryNoop,
    tokenUsage: telemetry.recordRagTokenUsage || telemetryNoop,
  };

  const transitionStage = (nextStage) => onStageChange(nextStage);

  const resolveStageTimeout = (stage) => {
    const override = timeoutMs[stage];
    return Number.isFinite(Number(override)) && Number(override) > 0
      ? Number(override)
      : resolveRagStageTimeoutMs(stage);
  };

  const historyForRequest =
    Array.isArray(history) && history.length > 0
      ? history
      : buildStructuredChatHistory(chatMessages, { beforeMessageId });
  const rollingFoodContextSummary = buildRollingFoodContextSummary(
    chatMessages,
    { beforeMessageId }
  );

  const normalizedLookupOptions =
    lookupOptions && typeof lookupOptions === 'object' ? lookupOptions : {};

  let result = null;
  let preResolvedLookupContext = {};
  let lookupContext = null;
  let lookupStatsRecorded = false;
  let extractionSchemaVersion = null;
  let resultSchemaVersion = null;
  let presentationSkipped = false;

  /** Fail-closed guard: without a usable extraction module, fall back to the
   *  legacy single-call processing path instead of throwing mid-request. */
  if (enableRag && typeof sendOpenRouterExtraction !== 'function') {
    enableRag = false;
  }
  if (enableRag) {
    transitionStage(CHAT_PIPELINE_STAGE.EXTRACTION);
    const extractionStartedAt = getNowMs();

    const runExtractionAttempt = async (messageOverride = trimmedText) =>
      sendOpenRouterExtraction({
        message: messageOverride,
        foodContextSummary: rollingFoodContextSummary,
        unitsNote,
        files: safeFiles,
        history: historyForRequest,
        signal,
        timeoutMs: resolveStageTimeout('extraction'),
      });

    let extractionResult = await runExtractionAttempt(trimmedText);
    extractionSchemaVersion = extractionResult?.foodParser?.version || null;

    const extractionMessageType =
      extractionResult?.foodParser?.messageType || null;
    const extractionEntries = Array.isArray(
      extractionResult?.foodParser?.entries
    )
      ? extractionResult.foodParser.entries
      : [];
    const dedupedExtractionEntries =
      dedupeExtractedFoodEntries(extractionEntries);

    const shouldRetryShortCircuit =
      (extractionResult?.foodParser?.messageType === 'clarification' ||
        extractionResult?.foodParser?.messageType === 'error' ||
        dedupedExtractionEntries.length === 0) &&
      trimmedText.length > 0;

    let effectiveExtractionEntries = dedupedExtractionEntries;
    if (shouldRetryShortCircuit) {
      const constrainedPrompt = `${trimmedText}\n\nIf possible, return messageType=food_entries with conservative assumptions and at least one entry. Ask only one clarification question only if absolutely required.`;
      const retryResult = await runExtractionAttempt(constrainedPrompt);
      const retryEntries = Array.isArray(retryResult?.foodParser?.entries)
        ? retryResult.foodParser.entries
        : [];
      const retryDedupedEntries = dedupeExtractedFoodEntries(retryEntries);
      const retryMessageType = retryResult?.foodParser?.messageType || null;

      if (
        retryMessageType === 'food_entries' &&
        retryDedupedEntries.length > 0
      ) {
        extractionResult = retryResult;
        effectiveExtractionEntries = retryDedupedEntries;
        extractionSchemaVersion =
          extractionResult?.foodParser?.version || extractionSchemaVersion;
      }
    }

    // Stage latency covers the whole extraction stage, including the
    // constrained-prompt retry when it fires (the retry used to be invisible
    // to stage telemetry because latency was recorded before it ran).
    const extractionLatencyMs = getNowMs() - extractionStartedAt;
    extractionSchemaVersion =
      extractionResult?.foodParser?.version || extractionSchemaVersion;
    const extractionUsage = extractUsageStats(extractionResult?.raw);
    fireAndForgetTelemetry(
      record.stageLatency({
        stage: 'extraction',
        durationMs: extractionLatencyMs,
        schemaVersion: extractionSchemaVersion,
      })
    );
    fireAndForgetTelemetry(
      record.tokenUsage({
        stage: 'extraction',
        ...(extractionUsage || {}),
        schemaVersion: extractionSchemaVersion,
      })
    );

    fireAndForgetTelemetry(
      record.extractionOutcome({
        messageType:
          extractionMessageType ||
          (extractionEntries.length > 0 ? 'food_entries' : 'no_entries'),
        entriesCount: effectiveExtractionEntries.length,
        schemaVersion: extractionSchemaVersion,
      })
    );

    const shouldShortCircuit =
      extractionMessageType === 'clarification' ||
      extractionMessageType === 'error' ||
      effectiveExtractionEntries.length === 0;
    if (shouldShortCircuit) {
      const canAttemptGroundedExtractionFallback =
        isOnline &&
        safeFiles.length === 0 &&
        effectiveExtractionEntries.length === 0 &&
        trimmedText.length > 0;

      if (
        canAttemptGroundedExtractionFallback &&
        typeof fetchMacrosWithGrounding === 'function'
      ) {
        transitionStage(CHAT_PIPELINE_STAGE.RETRIEVAL);
        try {
          // Prefer the extraction's clarification lookupTerms (whole-word
          // food queries from the parser schema) over the raw user text —
          // "2 cups of rice with egg" used to become the literal food name
          // of the grounded entry.
          const clarificationLookupTerms = Array.isArray(
            extractionResult?.foodParser?.lookupTerms
          )
            ? extractionResult.foodParser.lookupTerms.filter(Boolean)
            : [];
          const groundedQuery = clarificationLookupTerms[0] || trimmedText;

          const groundedEstimate = await fetchMacrosWithGrounding(
            groundedQuery,
            signal,
            resolveStageTimeout('groundingLookup')
          );

          // Preserve the portion the grounding model inferred from the
          // request (default 100g) instead of pinning every fallback entry
          // to 100 grams.
          const groundedPortionGrams = Math.min(
            2000,
            Math.max(
              1,
              Math.round(Number(groundedEstimate?.portionGrams) || 100)
            )
          );
          const groundedPer100g =
            groundedEstimate?.per100g &&
            typeof groundedEstimate.per100g === 'object'
              ? groundedEstimate.per100g
              : {};
          const scaledGroundedMacros = scaleMacrosFromPer100g(
            groundedPer100g,
            groundedPortionGrams
          );

          const groundedEntry = {
            name: groundedEstimate?.name || groundedQuery,
            grams: groundedPortionGrams,
            calories: scaledGroundedMacros.calories,
            protein: scaledGroundedMacros.protein,
            carbs: scaledGroundedMacros.carbs,
            fats: scaledGroundedMacros.fats,
            fiber: scaledGroundedMacros.fiber ?? null,
            sodium: scaledGroundedMacros.sodium ?? null,
            saturatedFats: scaledGroundedMacros.saturatedFats ?? null,
            sugars: scaledGroundedMacros.sugars ?? null,
            confidence: groundedEstimate?.confidence || 'low',
            rationale:
              groundedEstimate?.rationale ||
              'Fallback grounded estimate due to low-confidence extraction.',
            assumptions: Array.isArray(groundedEstimate?.assumptions)
              ? groundedEstimate.assumptions
              : [],
            lookupTerms: [groundedQuery],
            source: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          };

          result = {
            text:
              extractionResult?.text ||
              'I used a grounded web estimate for this entry.',
            raw: extractionResult?.raw || null,
            foodParser: {
              version:
                extractionResult?.foodParser?.version ||
                extractionSchemaVersion,
              messageType: 'food_entries',
              entries: [groundedEntry],
              followUpQuestion: null,
            },
          };
          resultSchemaVersion = result?.foodParser?.version || null;
        } catch {
          result = extractionResult;
          resultSchemaVersion = extractionSchemaVersion;
        }
      } else {
        result = extractionResult;
        resultSchemaVersion = extractionSchemaVersion;
      }
    } else {
      transitionStage(CHAT_PIPELINE_STAGE.RETRIEVAL);
      const retrievalStartedAt = getNowMs();
      preResolvedLookupContext = await resolveFoodLookupContext({
        messageId: resolvedAssistantMessageId,
        entries: effectiveExtractionEntries,
        isOnline,
        lookupOptions: normalizedLookupOptions,
        groundedBatchTimeoutMs: resolveStageTimeout('groundingBatch'),
      });
      const retrievalLatencyMs = getNowMs() - retrievalStartedAt;
      fireAndForgetTelemetry(
        record.stageLatency({
          stage: 'retrieval',
          durationMs: retrievalLatencyMs,
          schemaVersion: extractionSchemaVersion,
        })
      );
      fireAndForgetTelemetry(
        record.lookupStats({
          lookupContext: preResolvedLookupContext,
          schemaVersion: extractionSchemaVersion,
        })
      );
      lookupStatsRecorded = true;

      transitionStage(CHAT_PIPELINE_STAGE.VERIFICATION);
      const verificationStartedAt = getNowMs();
      const verifiedEntryResults = await Promise.all(
        effectiveExtractionEntries.map((entry, index) => {
          const entryKey = buildLookupContextEntryKey(
            resolvedAssistantMessageId,
            index,
            entry?.name
          );
          return resolveAiFoodEntry({
            entry,
            isOnline,
            lookupMeta: preResolvedLookupContext[entryKey] || null,
          });
        })
      );
      const verificationLatencyMs = getNowMs() - verificationStartedAt;
      fireAndForgetTelemetry(
        record.stageLatency({
          stage: 'verification',
          durationMs: verificationLatencyMs,
          schemaVersion: extractionSchemaVersion,
        })
      );

      const verifiedEntries = verifiedEntryResults
        .map((item) => item?.verifiedEntry || null)
        .filter(Boolean);

      verifiedEntryResults.forEach((item, index) => {
        const entryKey = buildLookupContextEntryKey(
          resolvedAssistantMessageId,
          index,
          effectiveExtractionEntries[index]?.name
        );
        if (item?.lookupMeta) {
          preResolvedLookupContext[entryKey] = item.lookupMeta;
        }
      });

      transitionStage(CHAT_PIPELINE_STAGE.PRESENTATION);
      const presentationStartedAt = getNowMs();

      if (shouldSkipPresentationPass({ verifiedEntries })) {
        presentationSkipped = true;
        resultSchemaVersion = extractionSchemaVersion;
        const presentationLatencyMs = getNowMs() - presentationStartedAt;
        fireAndForgetTelemetry(
          record.stageLatency({
            stage: 'presentation',
            durationMs: presentationLatencyMs,
            schemaVersion: resultSchemaVersion,
          })
        );
        fireAndForgetTelemetry(
          record.presentationIssues({
            presentationSkipped: true,
            schemaVersion: resultSchemaVersion,
          })
        );
        result = buildVerifiedResultFromEntries({
          extractionResult,
          verifiedEntries,
          presentationSkipped: true,
        });
      } else if (typeof sendOpenRouterPresentation === 'function') {
        try {
          const presentationResult = await sendOpenRouterPresentation({
            message: trimmedText,
            systemData: {
              entries: verifiedEntries,
              ...(unitsNote && {
                displayValues: buildDisplayValues(
                  verifiedEntries,
                  displayUnits
                ),
              }),
            },
            history: historyForRequest,
            unitsNote,
            signal,
            timeoutMs: resolveStageTimeout('presentation'),
          });
          resultSchemaVersion =
            presentationResult?.foodParser?.version || extractionSchemaVersion;
          const presentationLatencyMs = getNowMs() - presentationStartedAt;
          const presentationUsage = extractUsageStats(presentationResult?.raw);
          fireAndForgetTelemetry(
            record.stageLatency({
              stage: 'presentation',
              durationMs: presentationLatencyMs,
              schemaVersion: resultSchemaVersion,
            })
          );
          fireAndForgetTelemetry(
            record.tokenUsage({
              stage: 'presentation',
              ...(presentationUsage || {}),
              schemaVersion: resultSchemaVersion,
            })
          );

          const presentationEntries = Array.isArray(
            presentationResult?.foodParser?.entries
          )
            ? presentationResult.foodParser.entries
            : [];

          const {
            mergedEntries,
            hasPresentationLengthMismatch,
            hasSparsePresentationEntries,
          } = mergePresentationEntriesWithVerified({
            verifiedEntries,
            presentationEntries,
          });

          const suppressedRewriteCount = mergedEntries.filter(
            (entry) => entry?.nameRewriteSuppressed
          ).length;
          const integrityIssueCount = mergedEntries.filter(
            (entry) => entry?.nutritionIntegrityIssue
          ).length;
          const sparseEntryCount = presentationEntries.reduce(
            (count, presentedEntry) =>
              !presentedEntry || typeof presentedEntry !== 'object'
                ? count + 1
                : count,
            0
          );

          if (
            hasPresentationLengthMismatch ||
            hasSparsePresentationEntries ||
            suppressedRewriteCount > 0 ||
            integrityIssueCount > 0
          ) {
            if (
              typeof console !== 'undefined' &&
              typeof console.warn === 'function'
            ) {
              console.warn('Presentation entry alignment mismatch detected', {
                verifiedEntryCount: verifiedEntries.length,
                presentationEntryCount: presentationEntries.length,
                hasSparsePresentationEntries,
              });
            }
            fireAndForgetTelemetry(
              record.presentationIssues({
                lengthMismatch: hasPresentationLengthMismatch,
                sparseEntryCount,
                suppressedRewriteCount,
                integrityIssueCount,
                presentationFailed: false,
                schemaVersion: resultSchemaVersion,
              })
            );
          }

          fireAndForgetTelemetry(
            record.nameDrift({
              verifiedEntries,
              presentationEntries,
              schemaVersion: resultSchemaVersion,
            })
          );

          result = {
            ...presentationResult,
            text:
              presentationResult?.text ||
              extractionResult?.text ||
              'Here are your parsed food entries.',
            foodParser: {
              messageType: 'food_entries',
              entries: mergedEntries,
              followUpQuestion: null,
            },
          };
        } catch (presentationError) {
          if (
            typeof console !== 'undefined' &&
            typeof console.warn === 'function'
          ) {
            console.warn('Presentation fallback to verified entries', {
              message: presentationError?.message || 'Unknown error',
            });
          }

          resultSchemaVersion = extractionSchemaVersion;
          const presentationFailureLatencyMs =
            getNowMs() - presentationStartedAt;
          fireAndForgetTelemetry(
            record.stageLatency({
              stage: 'presentation',
              durationMs: presentationFailureLatencyMs,
              schemaVersion: resultSchemaVersion,
            })
          );
          fireAndForgetTelemetry(
            record.presentationIssues({
              presentationFailed: true,
              schemaVersion: resultSchemaVersion,
            })
          );
          result = buildVerifiedResultFromEntries({
            extractionResult,
            verifiedEntries,
            presentationSkipped: false,
          });
        }
      } else {
        // No presentation module available — skip the pass defensively.
        presentationSkipped = true;
        resultSchemaVersion = extractionSchemaVersion;
        fireAndForgetTelemetry(
          record.presentationIssues({
            presentationSkipped: true,
            schemaVersion: resultSchemaVersion,
          })
        );
        result = buildVerifiedResultFromEntries({
          extractionResult,
          verifiedEntries,
          presentationSkipped: true,
        });
      }
    }
  } else {
    transitionStage(CHAT_PIPELINE_STAGE.PROCESSING);
    if (typeof sendOpenRouterMessage !== 'function') {
      throw new Error('OpenRouter message module is unavailable.');
    }

    // This single-call path composes its own message, so it carries the units
    // note itself.
    result = await sendOpenRouterMessage({
      message: [trimmedText, unitsNote].filter(Boolean).join('\n\n'),
      files: safeFiles,
      history: historyForRequest,
      signal,
      timeoutMs: resolveStageTimeout('processing'),
    });
    resultSchemaVersion = result?.foodParser?.version || null;

    const processingUsage = extractUsageStats(result?.raw);
    if (processingUsage) {
      fireAndForgetTelemetry(
        record.tokenUsage({
          stage: 'processing',
          ...processingUsage,
          schemaVersion: resultSchemaVersion,
        })
      );
    }

    if (result?.foodParser?.messageType) {
      const fallbackEntries = Array.isArray(result?.foodParser?.entries)
        ? result.foodParser.entries
        : [];
      fireAndForgetTelemetry(
        record.extractionOutcome({
          messageType: result.foodParser.messageType,
          entriesCount: fallbackEntries.length,
          schemaVersion: resultSchemaVersion,
        })
      );
    }
  }
  // Final lookup-context reconciliation for any branch that produced food
  // entries without a pre-resolved context (grounded fallback, legacy path).
  if (
    result?.foodParser?.messageType === 'food_entries' &&
    Array.isArray(result?.foodParser?.entries) &&
    result.foodParser.entries.length > 0
  ) {
    lookupContext =
      Object.keys(preResolvedLookupContext).length > 0
        ? preResolvedLookupContext
        : await resolveFoodLookupContext({
            messageId: resolvedAssistantMessageId,
            entries: result.foodParser.entries,
            isOnline,
            lookupOptions: normalizedLookupOptions,
            groundedBatchTimeoutMs: resolveStageTimeout('groundingBatch'),
          });

    if (!lookupStatsRecorded && Object.keys(lookupContext).length > 0) {
      fireAndForgetTelemetry(
        record.lookupStats({
          lookupContext,
          schemaVersion: resultSchemaVersion || extractionSchemaVersion,
        })
      );
      lookupStatsRecorded = true;
    }
  }

  return {
    result,
    lookupContext:
      lookupContext && Object.keys(lookupContext).length > 0
        ? lookupContext
        : null,
    schemaVersion: resultSchemaVersion,
    extractionSchemaVersion,
    presentationSkipped,
    mode: enableRag ? 'rag' : 'legacy',
  };
};

export const RAG_PIPELINE_LIMITS = Object.freeze({
  maxDeferredGroundingEntries: RAG_MAX_DEFERRED_GROUNDING_ENTRIES,
  groundingBatchMaxNames: RAG_GROUNDING_BATCH_MAX_NAMES,
  lookupConcurrency: RAG_LOOKUP_CONCURRENCY_LIMIT,
  timing: RAG_TIMING,
});
