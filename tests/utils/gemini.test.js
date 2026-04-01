import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GeminiError,
  buildGeminiContents,
  sendGeminiMessage,
} from '../../src/services/gemini.js';

test('buildGeminiContents maps assistant role to model and trims history', () => {
  const history = Array.from({ length: 20 }).map((_, index) => ({
    role: index % 2 === 0 ? 'assistant' : 'user',
    content: `message-${index}`,
  }));

  const latestUserContent = {
    role: 'user',
    parts: [{ text: 'latest prompt' }],
  };

  const contents = buildGeminiContents(history, latestUserContent);

  assert.equal(contents.length, 13);
  assert.equal(contents[0].role, 'model');
  assert.equal(contents[1].role, 'user');
  assert.deepEqual(contents.at(-1), latestUserContent);
});

test('sendGeminiMessage returns assistant text on success', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: 'Use 120g serving for better macro accuracy.' }],
          },
        },
      ],
    }),
  });

  try {
    const response = await sendGeminiMessage({
      message: 'How much chicken should I log?',
      history: [],
    });

    assert.equal(response.text, 'Use 120g serving for better macro accuracy.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendGeminiMessage maps 429 to user-friendly GeminiError', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: 'Rate limit reached' }),
  });

  try {
    await assert.rejects(
      () => sendGeminiMessage({ message: 'test', history: [] }),
      (error) => {
        assert.ok(error instanceof GeminiError);
        assert.equal(error.status, 429);
        assert.match(error.message, /processing too many requests/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendGeminiMessage maps empty candidate text to actionable GeminiError', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          finishReason: 'SAFETY',
          content: { parts: [] },
        },
      ],
      promptFeedback: { blockReason: 'SAFETY' },
    }),
  });

  try {
    await assert.rejects(
      () => sendGeminiMessage({ message: 'test', history: [] }),
      (error) => {
        assert.ok(error instanceof GeminiError);
        assert.equal(error.status, 502);
        assert.match(error.message, /blocked by safety filters/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendGeminiMessage retries once when first response has no candidates', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;

    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Retry succeeded with a valid candidate.' }],
            },
          },
        ],
      }),
    };
  };

  try {
    const response = await sendGeminiMessage({ message: 'test', history: [] });
    assert.equal(callCount, 2);
    assert.equal(response.text, 'Retry succeeded with a valid candidate.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
