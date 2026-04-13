/* eslint-disable no-undef */
import { Capacitor } from '@capacitor/core';

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_COUNT = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const FOOD_PARSER_SCHEMA_VERSION = '1.0.0';
const FOOD_PARSER_JSON_TAG = 'food_parser_json';
const FOOD_ENTRY_CONFIDENCE = new Set(['high', 'medium', 'low']);
const FOOD_MESSAGE_TYPES = new Set([
  'food_entries',
  'clarification',
  'error',
  'extraction',
]);
export const GEMINI_REQUEST_MODE = Object.freeze({
  EXTRACTION: 'extraction',
  PRESENTATION: 'presentation',
  GROUNDING_LOOKUP: 'grounding_lookup',
});

export const AI_CHAT_RAG_ENABLED =
  String(import.meta.env?.VITE_AI_CHAT_RAG_ENABLED || '')
    .trim()
    .toLowerCase() === 'true';

export const AI_CHAT_RAG_ROLLOUT_OVERRIDE = Object.freeze({
  DEFAULT: 'default',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
});

const ENV_RAG_ROLLOUT_PERCENTAGE = Number(
  import.meta.env?.VITE_AI_CHAT_RAG_ROLLOUT_PERCENTAGE
);
const DEFAULT_RAG_ROLLOUT_PERCENTAGE = Number.isFinite(
  ENV_RAG_ROLLOUT_PERCENTAGE
)
  ? Math.max(0, Math.min(100, Math.round(ENV_RAG_ROLLOUT_PERCENTAGE)))
  : 100;

const API_BASE = (
  (typeof import.meta.env?.VITE_GEMINI_API_BASE === 'string'
    ? import.meta.env.VITE_GEMINI_API_BASE
    : '') || 'https://calorieintaketracker.vercel.app/api/gemini'
).trim();

const GROUNDING_MODEL_OVERRIDE =
  typeof import.meta.env?.VITE_GEMINI_GROUNDING_MODEL === 'string' &&
  import.meta.env.VITE_GEMINI_GROUNDING_MODEL.trim().length > 0
    ? import.meta.env.VITE_GEMINI_GROUNDING_MODEL.trim()
    : undefined;

const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_BACKOFF_BASE_MS = 400;
const CLIENT_RATE_LIMIT_MAX_REQUESTS_PER_WINDOW = 15;
const CLIENT_RATE_LIMIT_WINDOW_MS = 60_000;
const CLIENT_RATE_LIMIT_MAX_WAIT_MS = 60_000;
const TRANSIENT_HTTP_MAX_RETRIES = 2;
const TRANSIENT_HTTP_BACKOFF_BASE_MS = 250;
const TRANSIENT_HTTP_RETRY_STATUSES = new Set([502, 503, 504]);
const NO_TEXT_MAX_RETRIES = 1;
const MALFORMED_PARSER_MAX_RETRIES = 1;
let rateLimitBackoffQueue = Promise.resolve();
let requestSlotQueue = Promise.resolve();
let requestTimestampsMs = [];
const foodParserRegistry = new Map();

function clampRolloutPercentage(
  value,
  fallback = DEFAULT_RAG_ROLLOUT_PERCENTAGE
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeRolloutOverride(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (
    normalized === AI_CHAT_RAG_ROLLOUT_OVERRIDE.ENABLED ||
    normalized === AI_CHAT_RAG_ROLLOUT_OVERRIDE.DISABLED
  ) {
    return normalized;
  }

  return AI_CHAT_RAG_ROLLOUT_OVERRIDE.DEFAULT;
}

function getStableBucketPercent(input) {
  const seed = String(input || 'anonymous');
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % 100;
}

export class GeminiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.details = details;
  }
}

function extractGeminiText(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

  const collectedTexts = candidates.flatMap((candidate) => {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) return [];

    return parts
      .filter((part) => typeof part?.text === 'string')
      .map((part) => part.text.trim())
      .filter(Boolean);
  });

  return collectedTexts.join('\n\n').trim();
}

function clampNumber(value, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(Math.max(parsed, min), max);
}

function asNonEmptyString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSchemaVersion(value) {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  if (!/^\d+\.\d+\.\d+$/.test(parsed)) {
    return null;
  }

  return parsed;
}

function normalizeHistoryRole(role) {
  return role === 'assistant' || role === 'model' ? 'model' : 'user';
}

function normalizeInlineHistoryPart(part) {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const text = asNonEmptyString(part.text);
  if (text) {
    return { text };
  }

  const inlineData = part.inlineData;
  if (
    inlineData &&
    typeof inlineData === 'object' &&
    asNonEmptyString(inlineData.mimeType) &&
    asNonEmptyString(inlineData.data)
  ) {
    return {
      inlineData: {
        mimeType: inlineData.mimeType,
        data: inlineData.data,
      },
    };
  }

  return null;
}

async function normalizeAsyncHistoryPart(part) {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const inlinePart = normalizeInlineHistoryPart(part);
  if (inlinePart) {
    return inlinePart;
  }

  if (part.file instanceof File) {
    return { inlineData: await fileToInlineData(part.file) };
  }

  return null;
}

function normalizeFoodParserEntryV1(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const name = asNonEmptyString(entry.name);
  if (!name) {
    return null;
  }

  const calories = clampNumber(entry.calories, { min: 0, max: 10000 });
  const protein = clampNumber(entry.protein, { min: 0, max: 1000 });
  const carbs = clampNumber(entry.carbs, { min: 0, max: 1000 });
  const fats = clampNumber(entry.fats, { min: 0, max: 1000 });

  if (calories == null || protein == null || carbs == null || fats == null) {
    return null;
  }

  const grams = clampNumber(entry.grams, { min: 1, max: 2000 });
  const confidenceRaw = asNonEmptyString(entry.confidence)?.toLowerCase();
  const confidence = FOOD_ENTRY_CONFIDENCE.has(confidenceRaw)
    ? confidenceRaw
    : 'medium';

  const assumptions = Array.isArray(entry.assumptions)
    ? entry.assumptions
        .map((item) => asNonEmptyString(item))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const normalizedLookupTerms = Array.isArray(entry.lookupTerms)
    ? entry.lookupTerms
        .map((item) => asNonEmptyString(item))
        .filter(Boolean)
        .slice(0, 6)
    : Array.isArray(entry.lookup_queries)
      ? entry.lookup_queries
          .map((item) => asNonEmptyString(item))
          .filter(Boolean)
          .slice(0, 6)
      : [];

  const rawCategory = asNonEmptyString(entry.category)?.toLowerCase();
  const category = [
    'protein',
    'carbs',
    'vegetables',
    'fats',
    'supplements',
    'custom',
    'manual',
  ].includes(rawCategory)
    ? rawCategory
    : null;

  return {
    name,
    grams,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fats: Math.round(fats * 10) / 10,
    confidence,
    rationale: asNonEmptyString(entry.rationale),
    assumptions,
    ...(normalizedLookupTerms.length > 0
      ? { lookupTerms: normalizedLookupTerms }
      : {}),
    ...(category ? { category } : {}),
  };
}

export function registerFoodParserVersion(version, normalizer) {
  const normalizedVersion = normalizeSchemaVersion(version);
  if (!normalizedVersion || typeof normalizer !== 'function') {
    return false;
  }

  foodParserRegistry.set(normalizedVersion, normalizer);
  return true;
}

function resolveFoodParserEntryNormalizer(version) {
  const normalizedVersion = normalizeSchemaVersion(version);
  if (normalizedVersion && foodParserRegistry.has(normalizedVersion)) {
    return foodParserRegistry.get(normalizedVersion);
  }

  return (
    foodParserRegistry.get(FOOD_PARSER_SCHEMA_VERSION) ||
    normalizeFoodParserEntryV1
  );
}

registerFoodParserVersion(
  FOOD_PARSER_SCHEMA_VERSION,
  normalizeFoodParserEntryV1
);

function stripFoodParserPayload(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return '';
  }

  const pattern = new RegExp(
    `<${FOOD_PARSER_JSON_TAG}>[\\s\\S]*?<\\/${FOOD_PARSER_JSON_TAG}>`,
    'gi'
  );

  const withoutCompleteBlocks = text.replace(pattern, '').trim();

  const startTag = `<${FOOD_PARSER_JSON_TAG}>`;
  const danglingStartIndex = withoutCompleteBlocks
    .toLowerCase()
    .indexOf(startTag.toLowerCase());

  if (danglingStartIndex === -1) {
    return withoutCompleteBlocks;
  }

  return withoutCompleteBlocks.slice(0, danglingStartIndex).trim();
}

export function parseFoodParserPayloadFromText(text) {
  const fallback = {
    displayText: stripFoodParserPayload(text),
    payload: null,
  };

  if (typeof text !== 'string' || !text.trim()) {
    return fallback;
  }

  const pattern = new RegExp(
    `<${FOOD_PARSER_JSON_TAG}>([\\s\\S]*?)<\\/${FOOD_PARSER_JSON_TAG}>`,
    'i'
  );
  const match = text.match(pattern);

  if (!match || !match[1]) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }

    const messageTypeRaw =
      asNonEmptyString(parsed.messageType)?.toLowerCase() ?? null;
    const messageType = FOOD_MESSAGE_TYPES.has(messageTypeRaw)
      ? messageTypeRaw
      : null;
    if (!messageType) {
      return fallback;
    }

    const parsedVersion = normalizeSchemaVersion(parsed.version);
    const normalizeFoodParserEntry =
      resolveFoodParserEntryNormalizer(parsedVersion);
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.map(normalizeFoodParserEntry).filter(Boolean)
      : [];

    const assistantMessageFromPayload = asNonEmptyString(
      parsed.assistantMessage
    );
    const assistantMessage =
      assistantMessageFromPayload ?? stripFoodParserPayload(text);

    return {
      displayText: assistantMessage,
      payload: {
        version: parsedVersion,
        messageType,
        entries,
        followUpQuestion: asNonEmptyString(parsed.followUpQuestion),
      },
    };
  } catch {
    return fallback;
  }
}

export function resolveAiChatRagRolloutConfig(userData = {}) {
  return {
    override: normalizeRolloutOverride(userData?.aiChatRagRolloutOverride),
    rolloutPercentage: clampRolloutPercentage(
      userData?.aiChatRagRolloutPercentage,
      DEFAULT_RAG_ROLLOUT_PERCENTAGE
    ),
    rolloutUserId:
      String(userData?.aiChatRolloutUserId || '').trim() || 'anonymous',
  };
}

export function isAiChatRagEnabledForUser(userData = {}) {
  if (!AI_CHAT_RAG_ENABLED) {
    return false;
  }

  const config = resolveAiChatRagRolloutConfig(userData);

  if (config.override === AI_CHAT_RAG_ROLLOUT_OVERRIDE.ENABLED) {
    return true;
  }

  if (config.override === AI_CHAT_RAG_ROLLOUT_OVERRIDE.DISABLED) {
    return false;
  }

  return (
    getStableBucketPercent(config.rolloutUserId) < config.rolloutPercentage
  );
}

function resolveNoTextReason(data) {
  const blockReason = data?.promptFeedback?.blockReason;
  if (typeof blockReason === 'string' && blockReason.length > 0) {
    return `Response blocked by safety filters (${blockReason}). Try a clearer prompt or a different image.`;
  }

  const firstFinishReason = data?.candidates?.[0]?.finishReason;
  if (firstFinishReason === 'SAFETY') {
    return 'Response blocked by safety filters. Try rephrasing your request or using a different image.';
  }

  if (firstFinishReason === 'MAX_TOKENS') {
    return 'The assistant response was cut off. Please ask a shorter or more specific question.';
  }

  if (!Array.isArray(data?.candidates) || data.candidates.length === 0) {
    return 'No response candidate was returned by Gemini. Please try again. If this keeps happening, check your GEMINI_MODEL value in Vercel.';
  }

  return 'The assistant returned no readable text. Please try again with a clearer prompt or different image.';
}

function shouldRetryNoTextResponse(data) {
  const hasCandidates =
    Array.isArray(data?.candidates) && data.candidates.length > 0;
  if (hasCandidates) {
    return false;
  }

  const blockReason = data?.promptFeedback?.blockReason;
  if (typeof blockReason === 'string' && blockReason.length > 0) {
    return false;
  }

  return true;
}

function getFormatCorrectionHint(mode) {
  if (mode === GEMINI_REQUEST_MODE.PRESENTATION) {
    return 'FORMAT CORRECTION: Respond with concise text plus a valid <food_parser_json> block matching the presentation schema exactly.';
  }

  if (mode === GEMINI_REQUEST_MODE.GROUNDING_LOOKUP) {
    return 'FORMAT CORRECTION: Return strict grounded lookup parser JSON in <food_parser_json> tags with one 100g entry per requested food.';
  }

  return 'FORMAT CORRECTION: Respond with concise text plus valid <food_parser_json> matching the extraction schema exactly.';
}

function appendFormatCorrectionHint(requestBody, mode) {
  return {
    ...requestBody,
    contents: [
      ...(Array.isArray(requestBody?.contents) ? requestBody.contents : []),
      {
        role: 'user',
        parts: [{ text: getFormatCorrectionHint(mode) }],
      },
    ],
  };
}

async function sleepWithSignal(ms, signal) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    if (!signal) {
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutId);
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      reject(abortError);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function queueRateLimitBackoff(delayMs, signal) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const previous = rateLimitBackoffQueue;
  rateLimitBackoffQueue = gate;

  await previous;
  try {
    await sleepWithSignal(delayMs, signal);
  } finally {
    release();
    if (rateLimitBackoffQueue === gate) {
      rateLimitBackoffQueue = Promise.resolve();
    }
  }
}

function pruneRequestTimestamps(nowMs = Date.now()) {
  const cutoffMs = nowMs - CLIENT_RATE_LIMIT_WINDOW_MS;
  requestTimestampsMs = requestTimestampsMs.filter(
    (timestamp) => timestamp > cutoffMs
  );
}

function resolveRetryAfterMs(response) {
  const retryAfterRaw = response?.headers?.get?.('retry-after');
  if (!retryAfterRaw) {
    return null;
  }

  const asSeconds = Number(retryAfterRaw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }

  const asDateMs = Date.parse(retryAfterRaw);
  if (Number.isFinite(asDateMs)) {
    return Math.max(0, asDateMs - Date.now());
  }

  return null;
}

async function waitForClientRateLimitSlot(signal) {
  while (true) {
    const nowMs = Date.now();
    pruneRequestTimestamps(nowMs);

    if (
      requestTimestampsMs.length < CLIENT_RATE_LIMIT_MAX_REQUESTS_PER_WINDOW
    ) {
      requestTimestampsMs.push(nowMs);
      return;
    }

    const earliestTimestamp = requestTimestampsMs[0] || nowMs;
    const waitMs = Math.max(
      0,
      CLIENT_RATE_LIMIT_WINDOW_MS - (nowMs - earliestTimestamp)
    );

    if (waitMs > CLIENT_RATE_LIMIT_MAX_WAIT_MS) {
      throw new GeminiError(
        'AI request limit reached (15 requests/min). Please wait a moment and try again.',
        429,
        {
          reason: 'client_rate_limit_window',
          retryAfterMs: waitMs,
        }
      );
    }

    await sleepWithSignal(waitMs + 25, signal);
  }
}

async function acquireClientRateLimitSlot(signal) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const previous = requestSlotQueue;
  requestSlotQueue = gate;

  await previous;
  try {
    await waitForClientRateLimitSlot(signal);
  } finally {
    release();
    if (requestSlotQueue === gate) {
      requestSlotQueue = Promise.resolve();
    }
  }
}

function isQuotaExhaustedSignal(status, data) {
  if (Number(status) !== 429) {
    return false;
  }

  const errorText = String(data?.error || '').toLowerCase();
  const statusText = String(data?.status || data?.error?.status || '')
    .toLowerCase()
    .trim();
  const codeText = String(data?.code || data?.error?.code || '')
    .toLowerCase()
    .trim();
  const detailsText =
    data && typeof data === 'object' ? JSON.stringify(data).toLowerCase() : '';
  const combined = `${errorText} ${statusText} ${codeText} ${detailsText}`;

  return (
    combined.includes('quota') ||
    combined.includes('resource_exhausted') ||
    combined.includes('daily limit') ||
    combined.includes('billing') ||
    combined.includes('exceeded your current quota')
  );
}

async function requestGemini({ body, signal }) {
  const resolvedBase = API_BASE || '/api/gemini';

  if (Capacitor.isNativePlatform() && resolvedBase.startsWith('/')) {
    throw new GeminiError(
      'Gemini API base not configured for native. Set VITE_GEMINI_API_BASE to your deployed URL.',
      0
    );
  }

  const response = await fetch(resolvedBase, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  return { response, data };
}

function createCombinedAbortSignal(externalSignal, timeoutMs) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  if (!externalSignal) {
    return {
      signal: timeoutController.signal,
      cleanup: () => clearTimeout(timeoutId),
    };
  }

  const mergedController = new AbortController();

  const abortMerged = () => mergedController.abort();
  const abortExternal = () => mergedController.abort();

  timeoutController.signal.addEventListener('abort', abortMerged, {
    once: true,
  });
  externalSignal.addEventListener('abort', abortExternal, { once: true });

  return {
    signal: mergedController.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      timeoutController.signal.removeEventListener('abort', abortMerged);
      externalSignal.removeEventListener('abort', abortExternal);
    },
  };
}

export function validateAttachmentFile(file) {
  if (!(file instanceof File)) {
    throw new GeminiError('Invalid file attachment', 400);
  }

  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    throw new GeminiError('Only JPEG, PNG, or WebP images are supported', 400);
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new GeminiError('Each image must be 5MB or smaller', 400);
  }

  return true;
}

export async function fileToInlineData(file) {
  validateAttachmentFile(file);

  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return {
    mimeType: file.type,
    data:
      typeof btoa === 'function'
        ? btoa(binary)
        : Buffer.from(binary, 'binary').toString('base64'),
  };
}

export async function buildUserContent({ message, files = [] }) {
  const text = typeof message === 'string' ? message.trim() : '';

  if (!text && files.length === 0) {
    throw new GeminiError('Type a message or attach at least one image', 400);
  }

  if (files.length > MAX_IMAGE_COUNT) {
    throw new GeminiError('You can attach up to 3 images per message', 400);
  }

  const inlineParts = await Promise.all(
    files.map(async (file) => ({ inlineData: await fileToInlineData(file) }))
  );

  const textPart = text ? [{ text }] : [];

  return {
    role: 'user',
    parts: [...textPart, ...inlineParts],
  };
}

export function buildGeminiContents(history = [], latestUserContent) {
  const normalizedHistory = Array.isArray(history)
    ? history
        .map((item) => {
          if (!item || typeof item !== 'object') return null;

          const role = normalizeHistoryRole(item.role);
          const contentText = asNonEmptyString(item.content ?? item.text);
          const explicitParts = Array.isArray(item.parts)
            ? item.parts.map(normalizeInlineHistoryPart).filter(Boolean)
            : [];
          const parts =
            explicitParts.length > 0
              ? explicitParts
              : contentText
                ? [{ text: contentText }]
                : [];

          if (parts.length === 0) return null;

          return { role, parts };
        })
        .filter(Boolean)
        .slice(-12)
    : [];

  return [...normalizedHistory, latestUserContent];
}

async function buildGeminiContentsForRequest(history = [], latestUserContent) {
  const normalizedHistory = Array.isArray(history)
    ? (
        await Promise.all(
          history.map(async (item) => {
            if (!item || typeof item !== 'object') {
              return null;
            }

            const role = normalizeHistoryRole(item.role);
            const contentText = asNonEmptyString(item.content ?? item.text);
            const explicitParts = Array.isArray(item.parts)
              ? (
                  await Promise.all(
                    item.parts.map((part) => normalizeAsyncHistoryPart(part))
                  )
                ).filter(Boolean)
              : [];
            const fileParts = Array.isArray(item.files)
              ? (
                  await Promise.all(
                    item.files.map(async (file) => ({
                      inlineData: await fileToInlineData(file),
                    }))
                  )
                ).filter(Boolean)
              : [];
            const parts = [];

            if (explicitParts.length > 0) {
              parts.push(...explicitParts);
            } else {
              if (contentText) {
                parts.push({ text: contentText });
              }
              if (fileParts.length > 0) {
                parts.push(...fileParts);
              }
            }

            if (parts.length === 0) {
              return null;
            }

            return { role, parts };
          })
        )
      )
        .filter(Boolean)
        .slice(-12)
    : [];

  return [...normalizedHistory, latestUserContent];
}

export async function sendGeminiMessage({
  message,
  files = [],
  history = [],
  model,
  mode = GEMINI_REQUEST_MODE.EXTRACTION,
  expectFoodParser = false,
  useGrounding = false,
  signal,
  timeoutMs = 30000,
}) {
  const latestUserContent = await buildUserContent({ message, files });
  const contents = await buildGeminiContentsForRequest(
    history,
    latestUserContent
  );

  const { signal: requestSignal, cleanup } = createCombinedAbortSignal(
    signal,
    timeoutMs
  );

  try {
    let requestBody = {
      contents,
      model,
      mode,
      useGrounding: useGrounding === true,
    };
    let noTextRetries = 0;
    let malformedParserRetries = 0;
    let rateLimitRetries = 0;
    let transientHttpRetries = 0;

    while (true) {
      await acquireClientRateLimitSlot(requestSignal);

      const { response, data } = await requestGemini({
        body: requestBody,
        signal: requestSignal,
      });

      if (!response.ok) {
        if (
          response.status === 429 &&
          rateLimitRetries < RATE_LIMIT_MAX_RETRIES
        ) {
          const retryAfterMs = resolveRetryAfterMs(response);
          const baseDelayMs =
            RATE_LIMIT_BACKOFF_BASE_MS * Math.pow(2, rateLimitRetries);
          const delayMs = retryAfterMs
            ? Math.max(retryAfterMs, baseDelayMs)
            : baseDelayMs;
          rateLimitRetries += 1;
          await queueRateLimitBackoff(delayMs, requestSignal);
          continue;
        }

        if (
          TRANSIENT_HTTP_RETRY_STATUSES.has(response.status) &&
          transientHttpRetries < TRANSIENT_HTTP_MAX_RETRIES
        ) {
          const delayMs =
            TRANSIENT_HTTP_BACKOFF_BASE_MS * Math.pow(2, transientHttpRetries);
          transientHttpRetries += 1;
          await sleepWithSignal(delayMs, requestSignal);
          continue;
        }

        if (response.status === 429) {
          if (isQuotaExhaustedSignal(response.status, data)) {
            throw new GeminiError(
              'The AI provider quota is currently exhausted. Please try again later or use manual search.',
              429,
              data
            );
          }

          throw new GeminiError(
            'The AI is processing too many requests. Please wait a moment or use the manual search.',
            429,
            data
          );
        }

        throw new GeminiError(
          data?.error || `Gemini request failed (${response.status})`,
          response.status,
          data
        );
      }

      const resolvedText = extractGeminiText(data);

      if (!resolvedText && shouldRetryNoTextResponse(data)) {
        if (noTextRetries < NO_TEXT_MAX_RETRIES) {
          noTextRetries += 1;
          continue;
        }
      }

      if (!resolvedText) {
        throw new GeminiError(resolveNoTextReason(data), 502, data);
      }

      const parsedPayload = parseFoodParserPayloadFromText(resolvedText);

      if (
        expectFoodParser &&
        !parsedPayload.payload &&
        malformedParserRetries < MALFORMED_PARSER_MAX_RETRIES
      ) {
        malformedParserRetries += 1;
        requestBody = appendFormatCorrectionHint(requestBody, mode);
        continue;
      }

      if (expectFoodParser && !parsedPayload.payload) {
        throw new GeminiError(
          'The AI returned an invalid parser format. Please try again.',
          502,
          data
        );
      }

      return {
        text: parsedPayload.displayText,
        raw: data,
        foodParser: parsedPayload.payload,
      };
    }
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new GeminiError('Request timed out. Please try again.', 408);
    }

    throw new GeminiError(
      'Network error - check your connection',
      0,
      error?.message || null
    );
  } finally {
    cleanup();
  }
}

export async function sendGeminiExtraction({
  message,
  files = [],
  history = [],
  foodContextSummary = '',
  model,
  signal,
  timeoutMs = 30000,
}) {
  const composedMessage = composeExtractionMessage(message, foodContextSummary);

  return sendGeminiMessage({
    message: composedMessage,
    files,
    history,
    model,
    mode: GEMINI_REQUEST_MODE.EXTRACTION,
    expectFoodParser: true,
    useGrounding: false,
    signal,
    timeoutMs,
  });
}

export function composeExtractionMessage(message, foodContextSummary = '') {
  const baseMessage = String(message ?? '').trim();
  const normalizedContext = String(foodContextSummary ?? '').trim();

  if (!normalizedContext) {
    return baseMessage;
  }

  return `${baseMessage}\n\n[RECENT_FOOD_CONTEXT]\n${normalizedContext}`;
}

export async function sendGeminiPresentation({
  message,
  systemData,
  history = [],
  model,
  signal,
  timeoutMs = 30000,
}) {
  const systemDataBlock =
    systemData && typeof systemData === 'object'
      ? `\n\n[SYSTEM_DATA]: ${JSON.stringify(systemData)}`
      : '';

  return sendGeminiMessage({
    message: `${String(message ?? '').trim()}${systemDataBlock}`.trim(),
    files: [],
    history,
    model,
    mode: GEMINI_REQUEST_MODE.PRESENTATION,
    expectFoodParser: true,
    useGrounding: false,
    signal,
    timeoutMs,
  });
}

export async function fetchMacrosWithGrounding(
  foodName,
  signal,
  timeoutMs = 20000,
  model = GROUNDING_MODEL_OVERRIDE
) {
  const normalizedFoodName = String(foodName ?? '').trim();
  if (!normalizedFoodName) {
    throw new GeminiError('A food name is required for grounded lookup.', 400);
  }

  const prompt = `Find a conservative 100g nutrition estimate for: ${normalizedFoodName}. Return parser JSON only.`;

  const result = await sendGeminiMessage({
    message: prompt,
    files: [],
    history: [],
    model,
    mode: GEMINI_REQUEST_MODE.GROUNDING_LOOKUP,
    expectFoodParser: true,
    useGrounding: true,
    signal,
    timeoutMs,
  });

  const firstEntry = result?.foodParser?.entries?.[0];
  if (!firstEntry) {
    throw new GeminiError(
      'Grounded lookup returned no usable nutrition data.',
      502,
      result?.raw || null
    );
  }

  return {
    name: firstEntry.name || normalizedFoodName,
    per100g: {
      calories: Math.max(0, Number(firstEntry.calories) || 0),
      protein: Math.max(0, Number(firstEntry.protein) || 0),
      carbs: Math.max(0, Number(firstEntry.carbs) || 0),
      fats: Math.max(0, Number(firstEntry.fats) || 0),
    },
    confidence: firstEntry.confidence || 'low',
    rationale: firstEntry.rationale || null,
    assumptions: Array.isArray(firstEntry.assumptions)
      ? firstEntry.assumptions
      : [],
    source: 'ai_web_search',
  };
}

const normalizeFoodLabel = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildGroundedEstimateFromEntry = (entry, fallbackName) => ({
  name:
    String(entry?.name || fallbackName).trim() || String(fallbackName || ''),
  per100g: {
    calories: Math.max(0, Number(entry?.calories) || 0),
    protein: Math.max(0, Number(entry?.protein) || 0),
    carbs: Math.max(0, Number(entry?.carbs) || 0),
    fats: Math.max(0, Number(entry?.fats) || 0),
  },
  confidence: entry?.confidence || 'low',
  rationale: entry?.rationale || null,
  assumptions: Array.isArray(entry?.assumptions) ? entry.assumptions : [],
  source: 'ai_web_search',
});

export async function fetchMacrosWithGroundingBatch(
  foodNames,
  signal,
  timeoutMs = 25000,
  model = GROUNDING_MODEL_OVERRIDE
) {
  const normalizedFoodNames = Array.isArray(foodNames)
    ? foodNames
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  if (normalizedFoodNames.length === 0) {
    throw new GeminiError(
      'At least one food name is required for grounded batch lookup.',
      400
    );
  }

  const promptLines = normalizedFoodNames
    .map((name, index) => `${index + 1}. ${name}`)
    .join('\n');

  const prompt = [
    'Find conservative 100g nutrition estimates for each food below.',
    'Return parser JSON only.',
    'Keep entry order aligned to the list when possible.',
    '',
    promptLines,
  ].join('\n');

  const result = await sendGeminiMessage({
    message: prompt,
    files: [],
    history: [],
    model,
    mode: GEMINI_REQUEST_MODE.GROUNDING_LOOKUP,
    expectFoodParser: true,
    useGrounding: true,
    signal,
    timeoutMs,
  });

  const parsedEntries = Array.isArray(result?.foodParser?.entries)
    ? result.foodParser.entries
    : [];

  const usedEntryIndexes = new Set();
  const estimates = normalizedFoodNames.map((requestedName, index) => {
    const normalizedRequestedName = normalizeFoodLabel(requestedName);

    let matchedIndex = parsedEntries[index] ? index : -1;
    if (matchedIndex === -1) {
      matchedIndex = parsedEntries.findIndex((entry, candidateIndex) => {
        if (usedEntryIndexes.has(candidateIndex)) {
          return false;
        }

        const normalizedCandidateName = normalizeFoodLabel(entry?.name);
        if (!normalizedCandidateName || !normalizedRequestedName) {
          return false;
        }

        return (
          normalizedCandidateName === normalizedRequestedName ||
          normalizedCandidateName.includes(normalizedRequestedName) ||
          normalizedRequestedName.includes(normalizedCandidateName)
        );
      });
    }

    if (matchedIndex === -1) {
      return {
        requestedFoodName: requestedName,
        estimate: null,
      };
    }

    usedEntryIndexes.add(matchedIndex);
    return {
      requestedFoodName: requestedName,
      estimate: buildGroundedEstimateFromEntry(
        parsedEntries[matchedIndex],
        requestedName
      ),
    };
  });

  return {
    estimates,
  };
}

export const __resetGeminiRateLimitQueueForTests = () => {
  rateLimitBackoffQueue = Promise.resolve();
  requestSlotQueue = Promise.resolve();
  requestTimestampsMs = [];
};
