import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/gemini.js';

const createMockReq = (body, method = 'POST', headers = {}) => ({
  method,
  body,
  headers,
});

const createMockRes = () => {
  const response = {
    statusCode: 200,
    headers: {},
    jsonPayload: null,
    ended: false,
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
  };

  return response;
};

const buildValidContents = () => [
  {
    role: 'user',
    parts: [{ text: '2 eggs and toast' }],
  },
];

test('gemini proxy binds mode-specific system instruction and temperature', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;

  process.env.GEMINI_API_KEY = 'test-key';

  const capturedPayloads = [];
  globalThis.fetch = async (_url, options = {}) => {
    capturedPayloads.push(JSON.parse(String(options.body || '{}')));
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    };
  };

  try {
    const scenarios = [
      {
        mode: 'extraction',
        expectedTemp: 0.5,
        expectedInstructionSnippet:
          'You are a nutrition parser for food logging in a calorie tracker.',
      },
      {
        mode: 'presentation',
        expectedTemp: 0.5,
        expectedInstructionSnippet:
          'formats final answers from system-verified nutrition data',
      },
      {
        mode: 'grounding_lookup',
        expectedTemp: 0.2,
        expectedInstructionSnippet:
          'nutrition retrieval assistant for obscure foods',
      },
    ];

    for (const scenario of scenarios) {
      const req = createMockReq({
        mode: scenario.mode,
        contents: buildValidContents(),
      });
      const res = createMockRes();

      await handler(req, res);
      assert.equal(res.statusCode, 200);
    }

    assert.equal(capturedPayloads.length, 3);

    scenarios.forEach((scenario, index) => {
      const payload = capturedPayloads[index];
      const instruction = String(
        payload?.systemInstruction?.parts?.[0]?.text || ''
      );

      assert.equal(payload?.generationConfig?.temperature, scenario.expectedTemp);
      assert.ok(instruction.includes(scenario.expectedInstructionSnippet));
      assert.ok(instruction.includes('"version": "1.0.0"'));
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
  }
});

test('gemini proxy gates googleSearch tool only for grounding_lookup + useGrounding=true', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;

  process.env.GEMINI_API_KEY = 'test-key';

  const capturedPayloads = [];
  globalThis.fetch = async (_url, options = {}) => {
    capturedPayloads.push(JSON.parse(String(options.body || '{}')));
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    };
  };

  try {
    const scenarios = [
      { mode: 'grounding_lookup', useGrounding: true, shouldHaveTools: true },
      {
        mode: 'grounding_lookup',
        useGrounding: false,
        shouldHaveTools: false,
      },
      { mode: 'extraction', useGrounding: true, shouldHaveTools: false },
    ];

    for (const scenario of scenarios) {
      const req = createMockReq({
        mode: scenario.mode,
        useGrounding: scenario.useGrounding,
        contents: buildValidContents(),
      });
      const res = createMockRes();

      await handler(req, res);
      assert.equal(res.statusCode, 200);
    }

    scenarios.forEach((scenario, index) => {
      const payload = capturedPayloads[index];
      const hasGoogleSearchTool =
        Array.isArray(payload?.tools) &&
        payload.tools.some((tool) => Boolean(tool?.googleSearch));

      assert.equal(hasGoogleSearchTool, scenario.shouldHaveTools);
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
  }
});

test('gemini proxy resolves grounding model precedence correctly', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalDefaultModel = process.env.GEMINI_MODEL;
  const originalGroundingModel = process.env.GEMINI_GROUNDING_MODEL;

  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';
  process.env.GEMINI_GROUNDING_MODEL = 'gemini-2.5-flash-lite';

  const capturedEndpoints = [];
  globalThis.fetch = async (url) => {
    capturedEndpoints.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    };
  };

  try {
    const scenarios = [
      {
        body: {
          mode: 'grounding_lookup',
          useGrounding: true,
          contents: buildValidContents(),
        },
        expectedModel: 'gemini-2.5-flash-lite',
      },
      {
        body: {
          mode: 'extraction',
          contents: buildValidContents(),
        },
        expectedModel: 'gemini-2.5-flash',
      },
      {
        body: {
          mode: 'grounding_lookup',
          useGrounding: true,
          model: 'gemini-2.5-pro',
          contents: buildValidContents(),
        },
        expectedModel: 'gemini-2.5-pro',
      },
    ];

    for (const scenario of scenarios) {
      const req = createMockReq(scenario.body);
      const res = createMockRes();
      await handler(req, res);
      assert.equal(res.statusCode, 200);
    }

    assert.equal(capturedEndpoints.length, scenarios.length);

    scenarios.forEach((scenario, index) => {
      const endpoint = decodeURIComponent(capturedEndpoints[index]);
      assert.ok(
        endpoint.includes(`/models/${scenario.expectedModel}:generateContent`)
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_MODEL = originalDefaultModel;
    process.env.GEMINI_GROUNDING_MODEL = originalGroundingModel;
  }
});

test('gemini proxy rejects invalid mode before upstream call', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;

  process.env.GEMINI_API_KEY = 'test-key';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    };
  };

  try {
    const req = createMockReq({
      mode: 'totally_invalid_mode',
      contents: buildValidContents(),
    });
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(fetchCalls, 0);
    assert.equal(res.jsonPayload?.error, 'Invalid mode');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
  }
});

test('gemini proxy enforces payload item count limit', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;

  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () => {
    throw new Error('upstream should not be called for oversized payload');
  };

  try {
    const oversizedContents = Array.from({ length: 31 }, () => ({
      role: 'user',
      parts: [{ text: 'food item' }],
    }));

    const req = createMockReq({
      mode: 'extraction',
      contents: oversizedContents,
    });
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 413);
    assert.equal(res.jsonPayload?.error, 'Payload too large');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
  }
});

test('gemini proxy enforces CORS allowlist when configured', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  process.env.GEMINI_API_KEY = 'test-key';
  process.env.ALLOWED_ORIGINS = 'https://allowed.example';

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [] }),
  });

  try {
    const blockedReq = createMockReq(
      {
        mode: 'extraction',
        contents: buildValidContents(),
      },
      'POST',
      { origin: 'https://blocked.example' }
    );
    const blockedRes = createMockRes();
    await handler(blockedReq, blockedRes);
    assert.equal(blockedRes.statusCode, 403);

    const allowedReq = createMockReq(
      {
        mode: 'extraction',
        contents: buildValidContents(),
      },
      'POST',
      { origin: 'https://allowed.example' }
    );
    const allowedRes = createMockRes();
    await handler(allowedReq, allowedRes);
    assert.equal(allowedRes.statusCode, 200);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
  }
});
