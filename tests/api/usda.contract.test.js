import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/usda.js';

const DEFAULT_USDA_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.jsonPayload = payload;
    return this;
  },
  end() {
    return this;
  },
});

const withEnv = (env, fn) => {
  const originals = {};
  for (const [key, value] of Object.entries(env)) {
    originals[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const createFetchResponse = ({
  ok,
  status,
  jsonPayload = {},
  headers = {},
}) => ({
  ok,
  status,
  json: async () => jsonPayload,
  headers: {
    get(name) {
      const lower = String(name).toLowerCase();
      const match = Object.entries(headers).find(
        ([key]) => String(key).toLowerCase() === lower
      );
      return match ? match[1] : null;
    },
  },
});

// Stubs setTimeout so upstream retry backoffs run synchronously while
// recording every scheduled delay for assertions.
const withFakeTimers = async (fn) => {
  const original = globalThis.setTimeout;
  const delays = [];
  globalThis.setTimeout = (callback, delay) => {
    delays.push(Number(delay) || 0);
    callback();
    return 1;
  };
  try {
    await fn();
    return delays;
  } finally {
    globalThis.setTimeout = original;
  }
};

test('USDA proxy sends browser-like User-Agent and correct search URL', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: url.toString(), headers: options.headers };
    return {
      ok: true,
      status: 200,
      json: async () => ({ foods: [{ fdcId: 1 }], totalHits: 1 }),
    };
  };
  try {
    const response = createResponse();
    await withEnv({ USDA_API_KEY: 'test-key' }, async () => {
      await handler(
        {
          method: 'GET',
          query: {
            action: 'search',
            query: 'omelette',
            page: '1',
            pageSize: '20',
          },
          headers: {},
        },
        response
      );
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.jsonPayload.foods[0].fdcId, 1);

    assert.equal(request.headers['User-Agent'], DEFAULT_USDA_USER_AGENT);
    assert.ok(request.headers['User-Agent'].startsWith('Mozilla/5.0'));
    assert.equal(request.headers.Accept, 'application/json');

    const url = new URL(request.url);
    assert.equal(
      `${url.origin}${url.pathname}`,
      'https://api.nal.usda.gov/fdc/v1/foods/search'
    );
    assert.equal(url.searchParams.get('query'), 'omelette');
    assert.equal(url.searchParams.get('pageNumber'), '1');
    assert.equal(url.searchParams.get('pageSize'), '20');
    assert.equal(url.searchParams.get('api_key'), 'test-key');
    assert.deepEqual(url.searchParams.getAll('dataType'), [
      'Foundation',
      'SR Legacy',
      'Branded',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USDA proxy honors the USDA_USER_AGENT env override', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: url.toString(), headers: options.headers };
    return { ok: true, status: 200, json: async () => ({ foods: [] }) };
  };
  try {
    const response = createResponse();
    await withEnv(
      { USDA_API_KEY: 'test-key', USDA_USER_AGENT: 'EnergyMapTracker/2.0' },
      async () => {
        await handler(
          {
            method: 'GET',
            query: { action: 'search', query: 'chicken' },
            headers: {},
          },
          response
        );
      }
    );
    assert.equal(request.headers['User-Agent'], 'EnergyMapTracker/2.0');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USDA proxy rejects requests without a configured API key', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  try {
    const response = createResponse();
    await withEnv({ USDA_API_KEY: '' }, async () => {
      await handler(
        {
          method: 'GET',
          query: { action: 'search', query: 'omelette' },
          headers: {},
        },
        response
      );
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.jsonPayload.error, 'USDA API key not configured');
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('USDA proxy validates query length before calling upstream', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  try {
    const response = createResponse();
    await withEnv({ USDA_API_KEY: 'test-key' }, async () => {
      await handler(
        {
          method: 'GET',
          query: { action: 'search', query: 'o' },
          headers: {},
        },
        response
      );
    });
    assert.equal(response.statusCode, 400);
    assert.equal(
      response.jsonPayload.error,
      'Valid query parameter required (min 2 characters)'
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USDA proxy passes upstream non-OK status through after retries are exhausted', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return createFetchResponse({ ok: false, status: 404, jsonPayload: {} });
  };
  try {
    const response = createResponse();
    await withFakeTimers(() =>
      withEnv({ USDA_API_KEY: 'test-key' }, async () => {
        await handler(
          {
            method: 'GET',
            query: { action: 'search', query: 'omelette' },
            headers: {},
          },
          response
        );
      })
    );
    assert.equal(response.statusCode, 404);
    assert.equal(response.jsonPayload.error, 'USDA search error: 404');
    assert.deepEqual(response.jsonPayload.details, {});
    // 404 is transient — the proxy retries up to 3 attempts before forwarding.
    assert.equal(fetchCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USDA proxy retries transient upstream 404 and succeeds on a later attempt', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls < 3) {
      return createFetchResponse({ ok: false, status: 404, jsonPayload: {} });
    }
    return createFetchResponse({
      ok: true,
      status: 200,
      jsonPayload: { foods: [{ fdcId: 1 }], totalHits: 1 },
    });
  };
  try {
    const response = createResponse();
    await withFakeTimers(() =>
      withEnv({ USDA_API_KEY: 'test-key' }, async () => {
        await handler(
          {
            method: 'GET',
            query: { action: 'search', query: 'omelette' },
            headers: {},
          },
          response
        );
      })
    );
    assert.equal(fetchCalls, 3);
    assert.equal(response.statusCode, 200);
    assert.equal(response.jsonPayload.foods[0].fdcId, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USDA proxy honors Retry-After (capped) when retrying transient statuses', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return createFetchResponse({
        ok: false,
        status: 429,
        headers: { 'retry-after': '5' },
        jsonPayload: {},
      });
    }
    if (fetchCalls === 2) {
      return createFetchResponse({
        ok: false,
        status: 429,
        headers: { 'retry-after': '0.25' },
        jsonPayload: {},
      });
    }
    return createFetchResponse({
      ok: true,
      status: 200,
      jsonPayload: { foods: [], totalHits: 0 },
    });
  };
  try {
    const response = createResponse();
    const delays = await withFakeTimers(() =>
      withEnv({ USDA_API_KEY: 'test-key' }, async () => {
        await handler(
          {
            method: 'GET',
            query: { action: 'search', query: 'chicken' },
            headers: {},
          },
          response
        );
      })
    );
    assert.equal(fetchCalls, 3);
    assert.equal(response.statusCode, 200);
    // First delay honors Retry-After (5s) but is capped to 2000ms; the second
    // uses the uncapped Retry-After value (250ms).
    assert.deepEqual(delays, [2000, 250]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USDA proxy does not retry non-transient upstream statuses', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return createFetchResponse({
      ok: false,
      status: 403,
      jsonPayload: { error: { message: 'forbidden' } },
    });
  };
  try {
    const response = createResponse();
    await withEnv({ USDA_API_KEY: 'test-key' }, async () => {
      await handler(
        {
          method: 'GET',
          query: { action: 'search', query: 'chicken' },
          headers: {},
        },
        response
      );
    });
    assert.equal(fetchCalls, 1);
    assert.equal(response.statusCode, 403);
    assert.equal(response.jsonPayload.error, 'forbidden');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USDA proxy attempt limit is configurable via env', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return createFetchResponse({ ok: false, status: 404, jsonPayload: {} });
  };
  try {
    const response = createResponse();
    await withFakeTimers(() =>
      withEnv(
        { USDA_API_KEY: 'test-key', USDA_MAX_ATTEMPTS: '2' },
        async () => {
          await handler(
            {
              method: 'GET',
              query: { action: 'search', query: 'omelette' },
              headers: {},
            },
            response
          );
        }
      )
    );
    assert.equal(fetchCalls, 2);
    assert.equal(response.statusCode, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('USDA proxy rejects an invalid action', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  try {
    const response = createResponse();
    await withEnv({ USDA_API_KEY: 'test-key' }, async () => {
      await handler(
        {
          method: 'GET',
          query: { action: 'details', query: 'omelette' },
          headers: {},
        },
        response
      );
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.jsonPayload.validActions, ['search']);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
