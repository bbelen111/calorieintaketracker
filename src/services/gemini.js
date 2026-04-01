/* eslint-disable no-undef */
import { Capacitor } from '@capacitor/core';

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_COUNT = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

          const role = item.role === 'assistant' ? 'model' : 'user';
          const contentText =
            typeof item.content === 'string' ? item.content.trim() : '';

          if (!contentText) return null;

          return {
            role,
            parts: [{ text: contentText }],
          };
        })
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
  const contents = buildGeminiContents(history, latestUserContent);

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

    return {
      text: resolvedText,
      raw: data,
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
