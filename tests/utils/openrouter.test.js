import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetOpenRouterRateLimitQueueForTests,
  buildOpenRouterContents,
  composeExtractionMessage,
  FOOD_PARSER_SCHEMA_VERSION,
  OPENROUTER_REQUEST_MODE,
  parseFoodParserPayloadFromText,
  sendOpenRouterMessage,
} from '../../src/services/openrouter.js';

test.beforeEach(() => {
  __resetOpenRouterRateLimitQueueForTests();
});

test('buildOpenRouterContents creates OpenAI-compatible roles and multimodal content', () => {
  const messages = buildOpenRouterContents(
    [
      { role: 'assistant', content: 'What did you eat?' },
      {
        role: 'user',
        parts: [
          { text: 'This meal' },
          { inlineData: { mimeType: 'image/jpeg', data: 'abc123' } },
        ],
      },
    ],
    { role: 'user', content: [{ type: 'text', text: 'latest prompt' }] }
  );

  assert.equal(messages[0].role, 'assistant');
  assert.deepEqual(messages[1].content[0], { type: 'text', text: 'This meal' });
  assert.equal(messages[1].content[1].type, 'image_url');
  assert.equal(messages.at(-1).content[0].text, 'latest prompt');
});

test('sendOpenRouterMessage sends messages and reads chat-completions output', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody;
  globalThis.fetch = async (_url, options = {}) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Use a 120g serving.' } }],
      }),
    };
  };

  try {
    const result = await sendOpenRouterMessage({
      message: 'How much chicken should I log?',
      mode: OPENROUTER_REQUEST_MODE.EXTRACTION,
    });
    assert.equal(result.text, 'Use a 120g serving.');
    assert.equal(capturedBody.messages.at(-1).role, 'user');
    assert.equal(capturedBody.messages.at(-1).content[0].type, 'text');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parser payload validation and correction retry use OpenRouter messages', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    const body = JSON.parse(options.body);
    if (calls === 2) {
      assert.ok(
        body.messages.at(-1).content[0].text.includes('FORMAT CORRECTION')
      );
    }
    const content =
      calls === 1
        ? 'Malformed <food_parser_json>{'
        : `Ready.\n<food_parser_json>{"version":"${FOOD_PARSER_SCHEMA_VERSION}","messageType":"food_entries","assistantMessage":"Ready.","entries":[{"name":"rice","grams":100,"calories":130,"protein":2.7,"carbs":28,"fats":0.3,"confidence":"medium"}]}</food_parser_json>`;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    };
  };

  try {
    const result = await sendOpenRouterMessage({
      message: 'rice',
      expectFoodParser: true,
    });
    assert.equal(calls, 2);
    assert.equal(result.foodParser.entries[0].name, 'rice');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parses food parser payload and preserves food context prompts', () => {
  const parsed = parseFoodParserPayloadFromText(
    '<food_parser_json>{"messageType":"clarification","assistantMessage":"Which size?","followUpQuestion":"Which size?","entries":[]}</food_parser_json>'
  );
  assert.equal(parsed.payload.messageType, 'clarification');
  assert.ok(composeExtractionMessage('same as before', '1. Rice').includes('[RECENT_FOOD_CONTEXT]'));
});
