/* eslint-disable no-undef */
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_COUNT = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const viteGeminiApiBase =
  typeof import.meta.env?.VITE_GEMINI_API_BASE === 'string'
    ? import.meta.env.VITE_GEMINI_API_BASE
    : '';

const API_BASE = (viteGeminiApiBase || '/api/gemini').trim();

export class GeminiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.details = details;
  }
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
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
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: requestSignal,
      body: JSON.stringify({ contents, model }),
    });

    const data = await response.json().catch(() => ({}));

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

    if (!text) {
      throw new GeminiError(
        'The assistant returned an empty response',
        502,
        data
      );
    }

    return {
      text,
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
