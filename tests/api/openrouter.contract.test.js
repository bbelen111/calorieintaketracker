import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/openrouter.js';

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.jsonPayload = payload; return this; },
  end() { return this; },
});

const messages = [{ role: 'user', content: [{ type: 'text', text: '2 eggs and toast' }] }];

test('OpenRouter proxy sends OpenAI chat-completions payload with system prompt', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options: JSON.parse(options.body), headers: options.headers };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
  };
  try {
    const response = createResponse();
    await handler({ method: 'POST', body: { mode: 'extraction', messages }, headers: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(request.headers.Authorization, 'Bearer test-key');
    assert.equal(request.options.messages[0].role, 'system');
    assert.equal(request.options.messages[1].content[0].text, '2 eggs and toast');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('OpenRouter proxy enables web search only for grounded lookup requests', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key';
  const payloads = [];
  globalThis.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ choices: [] }) };
  };
  try {
    for (const body of [
      { mode: 'grounding_lookup', useGrounding: true, messages },
      { mode: 'extraction', useGrounding: true, messages },
    ]) {
      await handler({ method: 'POST', body, headers: {} }, createResponse());
    }
    assert.deepEqual(payloads[0].tools, [{ type: 'openrouter:web_search' }]);
    assert.equal(payloads[1].tools, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalKey;
  }
});
