/* eslint-disable no-undef */
import { Capacitor } from '@capacitor/core';

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_COUNT = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FOOD_PARSER_JSON_TAG = 'food_parser_json';
const FOOD_ENTRY_CONFIDENCE = new Set(['high', 'medium', 'low']);
const FOOD_MESSAGE_TYPES = new Set(['food_entries', 'clarification', 'error']);

const API_BASE = (
  (typeof import.meta.env?.VITE_GEMINI_API_BASE === 'string'
    ? import.meta.env.VITE_GEMINI_API_BASE
    : '') || 'https://calorieintaketracker.vercel.app/api/gemini'
).trim();

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

function normalizeFoodParserEntry(entry) {
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
    ...(category ? { category } : {}),
  };
}

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
        messageType,
        entries,
        followUpQuestion: asNonEmptyString(parsed.followUpQuestion),
      },
    };
  } catch {
    return fallback;
  }
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
    const requestBody = { contents, model };

    let { response, data } = await requestGemini({
      body: requestBody,
      signal: requestSignal,
    });

    if (!response.ok) {
      if (response.status === 429) {
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

    const text = extractGeminiText(data);

    if (!text && shouldRetryNoTextResponse(data)) {
      const retryResult = await requestGemini({
        body: requestBody,
        signal: requestSignal,
      });

      response = retryResult.response;
      data = retryResult.data;

      if (!response.ok) {
        if (response.status === 429) {
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
    }

    const resolvedText = extractGeminiText(data);

    if (!resolvedText) {
      throw new GeminiError(resolveNoTextReason(data), 502, data);
    }

    const parsedPayload = parseFoodParserPayloadFromText(resolvedText);

    return {
      text: parsedPayload.displayText,
      raw: data,
      foodParser: parsedPayload.payload,
    };
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
