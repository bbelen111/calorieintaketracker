import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/gemini.js';

const createMockReq = (body, method = 'POST') => ({
  method,
  body,
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
