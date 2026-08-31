import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/usda.js';

const SAMPLE_ROW = {
  id: 'usda_171077',
  name: 'Chicken breast, raw',
  brand: null,
  category: 'protein',
  subcategory: 'poultry',
  calories: 120,
  protein: 22.5,
  carbs: 0,
  fats: 2.62,
  fiber: 0,
  sodium: 45,
  saturated_fats: 0.56,
  sugars: 0,
  portions: '[{"id":"p_100g","label":"100g","grams":100}]',
};

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

const createJsonFetchResponse = ({ ok, status, payload = {} }) => ({
  ok,
  status,
  json: async () => payload,
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

test('proxy queries the Supabase search RPCs with service-role auth and returns both envelopes', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedHeaders;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/search_foods_total')) {
      return createJsonFetchResponse({
        ok: true,
        status: 200,
        // PostgREST returns bare scalars for scalar RPCs
        payload: 561,
      });
    }
    capturedUrl = parsed;
    capturedHeaders = options.headers;
    return createJsonFetchResponse({
      ok: true,
      status: 200,
      payload: [SAMPLE_ROW],
    });
  };

  try {
    const response = createResponse();
    await withEnv(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
      },
      () =>
        handler(
          {
            method: 'GET',
            query: {
              action: 'search',
              query: 'chicken',
              page: '1',
              pageSize: '20',
            },
            headers: {},
          },
          response
        )
    );

    assert.equal(response.statusCode, 200);

    assert.equal(response.jsonPayload.catalogFoods.length, 1);
    assert.equal(response.jsonPayload.catalogFoods[0].id, 'usda_171077');
    assert.equal(
      response.jsonPayload.catalogFoods[0].name,
      'Chicken breast, raw'
    );
    assert.deepEqual(response.jsonPayload.catalogFoods[0].portions, [
      { id: 'p_100g', label: '100g', grams: 100 },
    ]);

    // Legacy FDC envelope for old native builds.
    assert.equal(response.jsonPayload.foods.length, 1);
    assert.equal(response.jsonPayload.foods[0].fdcId, '171077');
    assert.equal(
      response.jsonPayload.foods[0].description,
      'Chicken breast, raw'
    );
    assert.equal(response.jsonPayload.foods[0].servingSize, 100);

    assert.equal(response.jsonPayload.totalHits, 561);
    assert.equal(response.jsonPayload.page, 1);

    assert.equal(
      `${capturedUrl.origin}${capturedUrl.pathname}`,
      'https://proj.supabase.co/rest/v1/rpc/search_foods'
    );
    assert.equal(capturedUrl.searchParams.get('p_query'), 'chicken');
    assert.equal(capturedUrl.searchParams.get('p_limit'), '20');
    assert.equal(capturedUrl.searchParams.get('p_offset'), '0');
    assert.equal(capturedHeaders.apikey, 'svc-key');
    assert.equal(capturedHeaders.Authorization, 'Bearer svc-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxy maps page/pageSize to limit/offset and clamps pageSize to 50', async () => {
  const originalFetch = globalThis.fetch;
  const dataUrlParams = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/search_foods_total')) {
      return createJsonFetchResponse({ ok: true, status: 200, payload: 2 });
    }
    dataUrlParams.push({
      p_limit: parsed.searchParams.get('p_limit'),
      p_offset: parsed.searchParams.get('p_offset'),
    });
    return createJsonFetchResponse({ ok: true, status: 200, payload: [] });
  };

  try {
    const response = createResponse();
    await withEnv(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
      },
      () =>
        handler(
          {
            method: 'GET',
            query: {
              action: 'search',
              query: 'egg',
              page: '3',
              pageSize: '99',
            },
            headers: {},
          },
          response
        )
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(dataUrlParams, [{ p_limit: '50', p_offset: '100' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxy returns 500 before any upstream call when Supabase env is missing', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return createJsonFetchResponse({ ok: false, status: 500, payload: {} });
  };

  try {
    const response = createResponse();
    await withEnv({}, () =>
      handler(
        {
          method: 'GET',
          query: { action: 'search', query: 'chicken' },
          headers: {},
        },
        response
      )
    );

    assert.equal(called, false);
    assert.equal(response.statusCode, 500);
    assert.equal(response.jsonPayload.error, 'Supabase catalog not configured');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxy rejects short queries and invalid actions without upstream calls', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return createJsonFetchResponse({ ok: true, status: 200, payload: [] });
  };

  try {
    const shortResponse = createResponse();
    await withEnv(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
      },
      () =>
        handler(
          {
            method: 'GET',
            query: { action: 'search', query: 'a' },
            headers: {},
          },
          shortResponse
        )
    );
    assert.equal(shortResponse.statusCode, 400);
    assert.match(shortResponse.jsonPayload.error, /min 2 characters/);

    const actionResponse = createResponse();
    await withEnv(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
      },
      () =>
        handler(
          {
            method: 'GET',
            query: { action: 'details', query: 'chicken' },
            headers: {},
          },
          actionResponse
        )
    );
    assert.equal(actionResponse.statusCode, 400);
    assert.deepEqual(actionResponse.jsonPayload.validActions, ['search']);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxy retries transient 5xx upstream errors and succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let dataCalls = 0;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/search_foods_total')) {
      return createJsonFetchResponse({
        ok: true,
        status: 200,
        payload: [{ search_foods_total: 1 }],
      });
    }
    dataCalls += 1;
    if (dataCalls === 1) {
      return createJsonFetchResponse({ ok: false, status: 502, payload: {} });
    }
    return createJsonFetchResponse({
      ok: true,
      status: 200,
      payload: [SAMPLE_ROW],
    });
  };

  try {
    const response = createResponse();
    const delays = await withFakeTimers(() =>
      withEnv(
        {
          SUPABASE_URL: 'https://proj.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
        },
        () =>
          handler(
            {
              method: 'GET',
              query: { action: 'search', query: 'chicken' },
              headers: {},
            },
            response
          )
      )
    );

    assert.equal(dataCalls, 2);
    assert.equal(response.statusCode, 200);
    assert.equal(response.jsonPayload.catalogFoods.length, 1);
    assert.equal(delays.length, 1);
    assert.ok(delays[0] >= 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxy does not retry non-transient upstream statuses', async () => {
  const originalFetch = globalThis.fetch;
  let dataCalls = 0;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/search_foods_total')) {
      return createJsonFetchResponse({
        ok: true,
        status: 200,
        payload: [{ search_foods_total: 0 }],
      });
    }
    dataCalls += 1;
    return createJsonFetchResponse({
      ok: false,
      status: 400,
      payload: { message: 'bad request' },
    });
  };

  try {
    const response = createResponse();
    await withEnv(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
      },
      () =>
        handler(
          {
            method: 'GET',
            query: { action: 'search', query: 'chicken' },
            headers: {},
          },
          response
        )
    );

    assert.equal(dataCalls, 1);
    assert.equal(response.statusCode, 400);
    assert.match(response.jsonPayload.error, /bad request/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxy degrades totalHits to rows.length when the count RPC fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/search_foods_total')) {
      return createJsonFetchResponse({ ok: false, status: 500, payload: {} });
    }
    return createJsonFetchResponse({
      ok: true,
      status: 200,
      payload: [SAMPLE_ROW, SAMPLE_ROW],
    });
  };

  try {
    const response = createResponse();
    await withEnv(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
      },
      () =>
        handler(
          {
            method: 'GET',
            query: { action: 'search', query: 'chicken' },
            headers: {},
          },
          response
        )
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.jsonPayload.catalogFoods.length, 2);
    assert.equal(response.jsonPayload.totalHits, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* __APPEND_POINT_2__ */
