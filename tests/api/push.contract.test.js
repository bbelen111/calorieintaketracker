/* eslint-disable no-undef -- process is a Node/Vercel Serverless global */
import test from 'node:test';
import assert from 'node:assert/strict';

import registerHandler, {
  validateRegisterPayload,
} from '../../api/push/register.js';
import unregisterHandler from '../../api/push/unregister.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

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
    this.ended = true;
    return this;
  },
});

const withEnv = async (env, fn) => {
  const originals = {};
  for (const [key, value] of Object.entries(env)) {
    originals[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
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

const BASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-public-key',
  PUSH_RPC_SECRET: 'shared-rpc-secret-xyz',
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
};

test('validateRegisterPayload normalizes valid payloads and rejects invalid ones', () => {
  const valid = validateRegisterPayload({
    installationId: VALID_UUID.toUpperCase(),
    platform: 'IOS',
    token: 'apns-token-abc123',
    topics: ['announcements', 'unknown_topic', 'ANNOUNCEMENTS'],
    appVersion: '0.1.0',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.record.installation_id, VALID_UUID);
  assert.equal(valid.record.platform, 'ios');
  assert.deepEqual(valid.record.topics, ['announcements']);

  assert.equal(
    validateRegisterPayload({
      installationId: 'not-a-uuid',
      platform: 'android',
      token: 'abc',
    }).ok,
    false
  );
  assert.equal(
    validateRegisterPayload({
      installationId: VALID_UUID,
      platform: 'web',
      token: 'abc',
    }).ok,
    false
  );
  assert.equal(
    validateRegisterPayload({
      installationId: VALID_UUID,
      platform: 'android',
      token: '',
    }).ok,
    false
  );
});

test('POST /api/push/register invokes register_push_device RPC with anon key and PUSH_RPC_SECRET', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedOptions;

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedOptions = options;
    return { ok: true, status: 204, json: async () => ({}) };
  };

  try {
    await withEnv(BASE_ENV, async () => {
      const res = createResponse();
      await registerHandler(
        {
          method: 'POST',
          body: {
            installationId: VALID_UUID,
            platform: 'android',
            token: 'fcm-token-xyz',
            topics: ['announcements'],
            appVersion: '0.1.0',
          },
        },
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonPayload.ok, true);
      assert.equal(res.jsonPayload.installationId, VALID_UUID);
      assert.equal(
        capturedUrl,
        'https://example.supabase.co/rest/v1/rpc/register_push_device'
      );
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers.apikey, 'anon-public-key');
      assert.equal(
        capturedOptions.headers.Authorization,
        'Bearer anon-public-key'
      );
      const sentBody = JSON.parse(capturedOptions.body);
      assert.equal(sentBody.p_secret, 'shared-rpc-secret-xyz');
      assert.equal(sentBody.p_installation_id, VALID_UUID);
      assert.equal(sentBody.p_platform, 'android');
      assert.equal(sentBody.p_token, 'fcm-token-xyz');
      assert.deepEqual(sentBody.p_topics, ['announcements']);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST /api/push/register returns 500 when PUSH_RPC_SECRET or Supabase anon env is missing and 405 on GET', async () => {
  const resMethod = createResponse();
  await registerHandler({ method: 'GET' }, resMethod);
  assert.equal(resMethod.statusCode, 405);

  await withEnv(
    {
      ...BASE_ENV,
      PUSH_RPC_SECRET: undefined,
    },
    async () => {
      const res = createResponse();
      await registerHandler({ method: 'POST', body: {} }, res);
      assert.equal(res.statusCode, 500);
    }
  );
});

test('POST /api/push/unregister invokes unregister_push_device RPC with anon key and PUSH_RPC_SECRET', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedOptions;

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedOptions = options;
    return { ok: true, status: 204, json: async () => ({}) };
  };

  try {
    await withEnv(BASE_ENV, async () => {
      const res = createResponse();
      await unregisterHandler(
        {
          method: 'POST',
          body: { installationId: VALID_UUID },
        },
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonPayload.ok, true);
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(
        capturedUrl,
        'https://example.supabase.co/rest/v1/rpc/unregister_push_device'
      );
      assert.equal(
        capturedOptions.headers.Authorization,
        'Bearer anon-public-key'
      );
      assert.deepEqual(JSON.parse(capturedOptions.body), {
        p_secret: 'shared-rpc-secret-xyz',
        p_installation_id: VALID_UUID,
      });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Upstash per-IP rate limiter returns 429 + Retry-After before calling Supabase and keys on last XFF hop / x-real-ip', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: options?.body });
    if (String(url).includes('/pipeline')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ result: 21 }, { result: 1 }, { result: 42 }],
      };
    }
    throw new Error('Supabase should not be called when rate-limited');
  };

  try {
    await withEnv(
      {
        ...BASE_ENV,
        UPSTASH_REDIS_REST_URL: 'https://redis.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
        PUSH_RATE_LIMIT_MAX_REQUESTS: '20',
      },
      async () => {
        const res = createResponse();
        await registerHandler(
          {
            method: 'POST',
            headers: {
              'x-forwarded-for': '1.2.3.4, 203.0.113.9',
            },
            body: {
              installationId: VALID_UUID,
              platform: 'ios',
              token: 'apns-123',
              topics: ['announcements'],
            },
          },
          res
        );

        assert.equal(res.statusCode, 429);
        assert.equal(res.headers['Retry-After'], '42');
        assert.equal(calls.length, 1);
        assert.match(calls[0].body, /push:register:rl:203\.0\.113\.9/);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
