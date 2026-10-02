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

test('OpenRouter proxy forwards configured fallback models for rate-limit failover', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;
  const originalFallbackModels = process.env.OPENROUTER_FALLBACK_MODELS;
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MODEL = 'google/gemma-4-31b-it:free';
  process.env.OPENROUTER_FALLBACK_MODELS =
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free, google/gemma-4-31b-it:free';
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ choices: [] }) };
  };

  try {
    await handler(
      { method: 'POST', body: { mode: 'extraction', messages }, headers: {} },
      createResponse()
    );
    assert.equal(payload.model, 'google/gemma-4-31b-it:free');
    assert.deepEqual(payload.models, [
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalKey;
    process.env.OPENROUTER_MODEL = originalModel;
    process.env.OPENROUTER_FALLBACK_MODELS = originalFallbackModels;
  }
});

// ---------------------------------------------------------------------------
// Per-IP rate limiting (resolveClientIp + checkRequestRateLimit)
// ---------------------------------------------------------------------------
//
// The handler consults Upstash BEFORE it calls OpenRouter, so these tests route
// the `fetch` stub by URL: `/pipeline` is the Upstash counter call, anything
// else is the OpenRouter completion. The limiter is a no-op unless BOTH Upstash
// credentials are present, so the env vars are saved and restored - using
// `delete` when a var was originally unset, because assigning `undefined` would
// write the string "undefined" and silently enable the limiter in later tests.

const RATE_LIMIT_ENV_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'OPENROUTER_RATE_LIMIT_MAX_REQUESTS',
  'OPENROUTER_RATE_LIMIT_WINDOW_SECONDS',
  'OPENROUTER_RATE_LIMIT_FAIL_CLOSED',
];

const snapshotEnv = (keys) =>
  Object.fromEntries(keys.map((key) => [key, process.env[key]]));

const restoreEnv = (snapshot) => {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const configureUpstash = () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  process.env.OPENROUTER_RATE_LIMIT_MAX_REQUESTS = '15';
  process.env.OPENROUTER_RATE_LIMIT_WINDOW_SECONDS = '60';
};

// Stubs `fetch` for both hops and records every call, so a test can assert the
// Upstash bucket key and whether OpenRouter was reached at all.
const stubFetch = ({ count = 1, ttl = 42, failUpstash = false } = {}) => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({
      url: target,
      body: options.body ? JSON.parse(options.body) : undefined,
    });

    if (target.endsWith('/pipeline')) {
      if (failUpstash) {
        throw new Error('upstash unreachable');
      }
      return {
        ok: true,
        status: 200,
        json: async () => [{ result: count }, { result: 1 }, { result: ttl }],
      };
    }

    return { ok: true, status: 200, json: async () => ({ choices: [] }) };
  };
  return calls;
};

const pipelineCalls = (calls) =>
  calls.filter((call) => call.url.endsWith('/pipeline'));

const completionCalls = (calls) =>
  calls.filter((call) => !call.url.endsWith('/pipeline'));

// The INCR key is the first command in the Upstash pipeline payload.
const upstashBucketKey = (calls) => pipelineCalls(calls)[0]?.body?.[0]?.[1];

const postChat = (headers, response = createResponse()) =>
  handler(
    { method: 'POST', body: { mode: 'extraction', messages }, headers },
    response
  );

test('rate limit: an over-limit request gets 429 + Retry-After and never reaches OpenRouter', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const envSnapshot = snapshotEnv(RATE_LIMIT_ENV_KEYS);
  process.env.OPENROUTER_API_KEY = 'test-key';
  configureUpstash();

  try {
    const calls = stubFetch({ count: 16, ttl: 27 });
    const response = createResponse();
    await postChat({ 'x-real-ip': '203.0.113.7' }, response);

    assert.equal(response.statusCode, 429);
    assert.equal(response.headers['Retry-After'], '27');
    assert.equal(response.jsonPayload.error, 'Too many requests');
    assert.equal(response.jsonPayload.retryAfterSeconds, 27);
    assert.equal(completionCalls(calls).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv({ ...envSnapshot, OPENROUTER_API_KEY: originalKey });
  }
});

test('rate limit: an in-budget request proceeds and keys the bucket on x-real-ip', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const envSnapshot = snapshotEnv(RATE_LIMIT_ENV_KEYS);
  process.env.OPENROUTER_API_KEY = 'test-key';
  configureUpstash();

  try {
    const calls = stubFetch({ count: 3 });
    const response = createResponse();
    await postChat(
      { 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(upstashBucketKey(calls), 'openrouter:rl:203.0.113.7');
    assert.equal(completionCalls(calls).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv({ ...envSnapshot, OPENROUTER_API_KEY: originalKey });
  }
});

test('rate limit: without x-real-ip the bucket comes from the last x-forwarded-for hop', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const envSnapshot = snapshotEnv(RATE_LIMIT_ENV_KEYS);
  process.env.OPENROUTER_API_KEY = 'test-key';
  configureUpstash();

  try {
    // The leftmost hop is attacker-supplied; the rightmost is appended by the
    // platform, so only the rightmost may be trusted as a bucket key.
    const calls = stubFetch({ count: 2 });
    await postChat(
      { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' },
      createResponse()
    );

    assert.equal(upstashBucketKey(calls), 'openrouter:rl:203.0.113.7');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv({ ...envSnapshot, OPENROUTER_API_KEY: originalKey });
  }
});

test('rate limit: rotating the forged x-forwarded-for prefix cannot evade the limit', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const envSnapshot = snapshotEnv(RATE_LIMIT_ENV_KEYS);
  process.env.OPENROUTER_API_KEY = 'test-key';
  configureUpstash();

  try {
    const keys = new Set();
    for (const forged of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
      const calls = stubFetch({ count: 2 });
      await postChat(
        { 'x-forwarded-for': `${forged}, 203.0.113.7` },
        createResponse()
      );
      keys.add(upstashBucketKey(calls));
    }

    // One bucket for all three requests, so the third still counts against the
    // first two instead of minting a fresh allowance.
    assert.deepEqual([...keys], ['openrouter:rl:203.0.113.7']);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv({ ...envSnapshot, OPENROUTER_API_KEY: originalKey });
  }
});

test('rate limit: distinct clients get distinct buckets', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const envSnapshot = snapshotEnv(RATE_LIMIT_ENV_KEYS);
  process.env.OPENROUTER_API_KEY = 'test-key';
  configureUpstash();

  try {
    const keys = [];
    for (const ip of ['203.0.113.7', '203.0.113.8']) {
      const calls = stubFetch({ count: 1 });
      await postChat({ 'x-real-ip': ip }, createResponse());
      keys.push(upstashBucketKey(calls));
    }

    assert.deepEqual(keys, [
      'openrouter:rl:203.0.113.7',
      'openrouter:rl:203.0.113.8',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv({ ...envSnapshot, OPENROUTER_API_KEY: originalKey });
  }
});

test('rate limit: the limiter is a no-op when Upstash credentials are absent', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const envSnapshot = snapshotEnv(RATE_LIMIT_ENV_KEYS);
  process.env.OPENROUTER_API_KEY = 'test-key';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    // Even an over-limit count is ignored, because the pipeline is never called.
    const calls = stubFetch({ count: 999 });
    const response = createResponse();
    await postChat({ 'x-real-ip': '203.0.113.7' }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(pipelineCalls(calls).length, 0);
    assert.equal(completionCalls(calls).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv({ ...envSnapshot, OPENROUTER_API_KEY: originalKey });
  }
});

test('rate limit: fail-closed returns 429 when the limiter backend is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const envSnapshot = snapshotEnv(RATE_LIMIT_ENV_KEYS);
  process.env.OPENROUTER_API_KEY = 'test-key';
  configureUpstash();
  process.env.OPENROUTER_RATE_LIMIT_FAIL_CLOSED = 'true';

  try {
    const calls = stubFetch({ failUpstash: true });
    const response = createResponse();
    await postChat({ 'x-real-ip': '203.0.113.7' }, response);

    assert.equal(response.statusCode, 429);
    assert.equal(response.headers['Retry-After'], '60');
    assert.equal(
      response.jsonPayload.error,
      'Rate limiter unavailable. Please retry shortly.'
    );
    assert.equal(completionCalls(calls).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv({ ...envSnapshot, OPENROUTER_API_KEY: originalKey });
  }
});

test('rate limit: fail-open (the default) lets the request through when the backend is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const envSnapshot = snapshotEnv(RATE_LIMIT_ENV_KEYS);
  process.env.OPENROUTER_API_KEY = 'test-key';
  configureUpstash();
  delete process.env.OPENROUTER_RATE_LIMIT_FAIL_CLOSED;

  try {
    const calls = stubFetch({ failUpstash: true });
    const response = createResponse();
    await postChat({ 'x-real-ip': '203.0.113.7' }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(completionCalls(calls).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv({ ...envSnapshot, OPENROUTER_API_KEY: originalKey });
  }
});
