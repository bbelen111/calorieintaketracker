import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetGeminiRateLimitQueueForTests,
  composeExtractionMessage,
  fetchMacrosWithGrounding,
  FOOD_PARSER_SCHEMA_VERSION,
  GEMINI_REQUEST_MODE,
  GeminiError,
  buildGeminiContents,
  parseFoodParserPayloadFromText,
  registerFoodParserVersion,
  resolveAiChatRagRolloutConfig,
  sendGeminiExtraction,
  sendGeminiMessage,
} from '../../src/services/gemini.js';

test.beforeEach(() => {
  __resetGeminiRateLimitQueueForTests();
});

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

test('buildGeminiContents keeps structured history parts including inline image data', () => {
  const latestUserContent = {
    role: 'user',
    parts: [{ text: 'latest prompt' }],
  };

  const contents = buildGeminiContents(
    [
      {
        role: 'user',
        parts: [
          { text: 'What is this meal?' },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: 'abc123',
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'Looks like a diner burger and fries.',
      },
    ],
    latestUserContent
  );

  assert.equal(contents.length, 3);
  assert.equal(contents[0].role, 'user');
  assert.equal(contents[0].parts.length, 2);
  assert.deepEqual(contents[0].parts[0], { text: 'What is this meal?' });
  assert.deepEqual(contents[0].parts[1], {
    inlineData: {
      mimeType: 'image/jpeg',
      data: 'abc123',
    },
  });
  assert.equal(contents[1].role, 'model');
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

test('sendGeminiMessage forwards mode and grounding flags to API body', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    capturedBody = JSON.parse(String(options.body || '{}'));

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'ok' }],
            },
          },
        ],
      }),
    };
  };

  try {
    await sendGeminiMessage({
      message: 'lookup',
      history: [],
      mode: GEMINI_REQUEST_MODE.GROUNDING_LOOKUP,
      useGrounding: true,
    });

    assert.equal(capturedBody.mode, GEMINI_REQUEST_MODE.GROUNDING_LOOKUP);
    assert.equal(capturedBody.useGrounding, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendGeminiMessage maps 429 to user-friendly GeminiError', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limit reached' }),
    };
  };

  try {
    await assert.rejects(
      () => sendGeminiMessage({ message: 'test', history: [] }),
      (error) => {
        assert.ok(error instanceof GeminiError);
        assert.equal(error.status, 429);
        assert.match(error.message, /processing too many requests/i);
        assert.equal(calls, 3);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendGeminiMessage maps quota-exhausted 429 to quota-specific GeminiError', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      json: async () => ({
        error: 'RESOURCE_EXHAUSTED: exceeded your current quota',
      }),
    };
  };

  try {
    await assert.rejects(
      () => sendGeminiMessage({ message: 'test', history: [] }),
      (error) => {
        assert.ok(error instanceof GeminiError);
        assert.equal(error.status, 429);
        assert.match(error.message, /quota is currently exhausted/i);
        assert.equal(calls, 3);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendGeminiMessage enforces client-side 15 RPM guard during burst calls', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'ok' }],
            },
          },
        ],
      }),
    };
  };

  try {
    for (let index = 0; index < 15; index += 1) {
      const result = await sendGeminiMessage({ message: `test-${index}` });
      assert.equal(result.text, 'ok');
    }

    await assert.rejects(
      () => sendGeminiMessage({ message: 'test-16' }),
      (error) => {
        assert.ok(error instanceof GeminiError);
        assert.equal(error.status, 429);
        assert.match(error.message, /15 requests\/min/i);
        return true;
      }
    );

    assert.equal(calls, 15);
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

test('sendGeminiMessage retries transient 503 errors before succeeding', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;

    if (callCount < 3) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: 'upstream unavailable' }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Recovered after transient upstream failure.' }],
            },
          },
        ],
      }),
    };
  };

  try {
    const response = await sendGeminiMessage({ message: 'test', history: [] });
    assert.equal(callCount, 3);
    assert.equal(response.text, 'Recovered after transient upstream failure.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchMacrosWithGrounding retries transient 503 and returns parsed grounded entry', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;

    if (callCount === 1) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: 'temporary outage' }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Grounded entry ready.\n<food_parser_json>{"version":"${FOOD_PARSER_SCHEMA_VERSION}","messageType":"food_entries","assistantMessage":"Grounded entry ready.","entries":[{"name":"Chicken adobo","grams":100,"calories":180,"protein":16,"carbs":6,"fats":10,"confidence":"low"}]}</food_parser_json>`,
                },
              ],
            },
          },
        ],
      }),
    };
  };

  try {
    const result = await fetchMacrosWithGrounding('chicken adobo');
    assert.equal(callCount, 2);
    assert.equal(result.name, 'Chicken adobo');
    assert.equal(result.per100g.calories, 180);
    assert.equal(result.source, 'ai_web_search');
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

test('sendGeminiMessage retries malformed parser payload with correction hint', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async (_url, options = {}) => {
    callCount += 1;

    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Here is malformed output\n<food_parser_json>{"messageType":"food_entries"',
                  },
                ],
              },
            },
          ],
        }),
      };
    }

    const body = JSON.parse(String(options.body || '{}'));
    const hasCorrectionHint = (body.contents || []).some((content) =>
      (content?.parts || []).some((part) =>
        String(part?.text || '').includes('FORMAT CORRECTION')
      )
    );

    assert.equal(hasCorrectionHint, true);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Recovered payload.\n<food_parser_json>{"version":"${FOOD_PARSER_SCHEMA_VERSION}","messageType":"food_entries","assistantMessage":"Recovered payload.","entries":[{"name":"rice","grams":100,"calories":130,"protein":2.7,"carbs":28,"fats":0.3,"confidence":"medium"}]}</food_parser_json>`,
                },
              ],
            },
          },
        ],
      }),
    };
  };

  try {
    const response = await sendGeminiMessage({
      message: 'Rice meal',
      history: [],
      mode: GEMINI_REQUEST_MODE.EXTRACTION,
      expectFoodParser: true,
    });

    assert.equal(callCount, 2);
    assert.equal(response.foodParser?.messageType, 'food_entries');
    assert.equal(response.foodParser?.entries?.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parseFoodParserPayloadFromText returns validated payload and display text', () => {
  const rawText = `Here is your estimated food log with assumptions.
<food_parser_json>{
  "messageType": "food_entries",
  "assistantMessage": "Here is your estimated food log with assumptions.",
  "entries": [
    {
      "name": "3 egg omelette",
      "grams": 180,
      "calories": 310,
      "protein": 21.2,
      "carbs": 2.4,
      "fats": 24.1,
      "confidence": "high",
      "rationale": "Estimated from 3 large eggs and minimal added fat.",
      "assumptions": ["Large eggs", "No cheese"]
    }
  ]
}</food_parser_json>`;

  const parsed = parseFoodParserPayloadFromText(rawText);

  assert.equal(
    parsed.displayText,
    'Here is your estimated food log with assumptions.'
  );
  assert.equal(parsed.payload?.messageType, 'food_entries');
  assert.equal(parsed.payload?.entries?.length, 1);
  assert.equal(parsed.payload?.entries?.[0]?.name, '3 egg omelette');
  assert.equal(parsed.payload?.entries?.[0]?.confidence, 'high');
});

test('parseFoodParserPayloadFromText preserves optional lookup terms', () => {
  const rawText = `Estimated entry ready.\n<food_parser_json>{"version":"${FOOD_PARSER_SCHEMA_VERSION}","messageType":"food_entries","assistantMessage":"Estimated entry ready.","entries":[{"name":"tableya drink","grams":240,"calories":180,"protein":5,"carbs":18,"fats":8,"confidence":"medium","rationale":"Estimated from a cocoa-based drink serving.","assumptions":["Sweetened preparation"],"lookupTerms":["tableya cacao","cacao tablet drink"]}]}</food_parser_json>`;

  const parsed = parseFoodParserPayloadFromText(rawText);

  assert.equal(parsed.payload?.version, FOOD_PARSER_SCHEMA_VERSION);
  assert.equal(parsed.payload?.messageType, 'food_entries');
  assert.deepEqual(parsed.payload?.entries?.[0]?.lookupTerms, [
    'tableya cacao',
    'cacao tablet drink',
  ]);
});

test('parseFoodParserPayloadFromText returns null schema version when field is missing', () => {
  const rawText = `Estimated entry ready.\n<food_parser_json>{"messageType":"food_entries","assistantMessage":"Estimated entry ready.","entries":[{"name":"rice","grams":100,"calories":130,"protein":2.7,"carbs":28,"fats":0.3,"confidence":"high"}]}</food_parser_json>`;

  const parsed = parseFoodParserPayloadFromText(rawText);

  assert.equal(parsed.payload?.version, null);
  assert.equal(parsed.payload?.messageType, 'food_entries');
});

test('sendGeminiMessage includes parsed foodParser payload when response embeds parser JSON', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: `Estimated entry ready.\n<food_parser_json>{"messageType":"food_entries","assistantMessage":"Estimated entry ready.","entries":[{"name":"diner burger","grams":220,"calories":560,"protein":28,"carbs":38,"fats":32,"confidence":"medium","rationale":"Typical diner burger portion and composition.","assumptions":["No extra sauces"]}]}</food_parser_json>`,
              },
            ],
          },
        },
      ],
    }),
  });

  try {
    const response = await sendGeminiMessage({
      message: 'burger from a local diner',
      history: [],
    });

    assert.equal(response.text, 'Estimated entry ready.');
    assert.equal(response.foodParser?.messageType, 'food_entries');
    assert.equal(response.foodParser?.entries?.length, 1);
    assert.equal(response.foodParser?.entries?.[0]?.name, 'diner burger');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parseFoodParserPayloadFromText returns clarification follow-up payload', () => {
  const rawText = `I need one detail before I estimate this.\n<food_parser_json>{"messageType":"clarification","assistantMessage":"I need one detail before I estimate this.","followUpQuestion":"Was the burger single or double patty?","entries":[]}</food_parser_json>`;

  const parsed = parseFoodParserPayloadFromText(rawText);

  assert.equal(parsed.displayText, 'I need one detail before I estimate this.');
  assert.equal(parsed.payload?.messageType, 'clarification');
  assert.equal(
    parsed.payload?.followUpQuestion,
    'Was the burger single or double patty?'
  );
  assert.deepEqual(parsed.payload?.entries, []);
});

test('parseFoodParserPayloadFromText supports extraction message type', () => {
  const rawText = `Parsed candidate foods.\n<food_parser_json>{"messageType":"extraction","assistantMessage":"Parsed candidate foods.","entries":[{"name":"oatmeal","grams":240,"calories":160,"protein":6,"carbs":27,"fats":3,"confidence":"medium","lookupTerms":["oatmeal cooked"]}]}</food_parser_json>`;

  const parsed = parseFoodParserPayloadFromText(rawText);

  assert.equal(parsed.payload?.messageType, 'extraction');
  assert.equal(parsed.payload?.entries?.[0]?.name, 'oatmeal');
  assert.deepEqual(parsed.payload?.entries?.[0]?.lookupTerms, [
    'oatmeal cooked',
  ]);
});

test('sendGeminiExtraction uses extraction mode helper', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;

  globalThis.fetch = async (_url, options = {}) => {
    capturedBody = JSON.parse(String(options.body || '{}'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Extraction ready.\n<food_parser_json>{"version":"${FOOD_PARSER_SCHEMA_VERSION}","messageType":"food_entries","assistantMessage":"Extraction ready.","entries":[{"name":"toast","grams":50,"calories":130,"protein":4,"carbs":24,"fats":2,"confidence":"medium"}]}</food_parser_json>`,
                },
              ],
            },
          },
        ],
      }),
    };
  };

  try {
    await sendGeminiExtraction({
      message: '2 eggs and toast',
      foodContextSummary: '1. 2 eggs (100g, 156 kcal)',
      history: [],
    });

    assert.equal(capturedBody.mode, GEMINI_REQUEST_MODE.EXTRACTION);
    assert.equal(capturedBody.useGrounding, false);
    assert.ok(
      String(capturedBody?.contents?.at(-1)?.parts?.[0]?.text || '').includes(
        '[RECENT_FOOD_CONTEXT]'
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('composeExtractionMessage appends recent food context when provided', () => {
  const composed = composeExtractionMessage(
    'same as before but double rice',
    '1. Chicken adobo (140g, 250 kcal)\n2. Rice (120g, 160 kcal)'
  );

  assert.ok(composed.includes('same as before but double rice'));
  assert.ok(composed.includes('[RECENT_FOOD_CONTEXT]'));
  assert.ok(composed.includes('Chicken adobo'));
  assert.ok(composed.includes('Rice (120g, 160 kcal)'));
});

test('parseFoodParserPayloadFromText strips dangling parser tag when payload is truncated', () => {
  const rawText = `I estimated one fried chicken drumstick based on a typical serving.\n\n<food_parser_json>{"messageType":"food_entries","entries":[{"name":"Fried chicken leg"`;

  const parsed = parseFoodParserPayloadFromText(rawText);

  assert.equal(
    parsed.displayText,
    'I estimated one fried chicken drumstick based on a typical serving.'
  );
  assert.equal(parsed.payload, null);
});

test('parseFoodParserPayloadFromText dispatches to parser registry by schema version', () => {
  registerFoodParserVersion('9.9.9', (entry) => ({
    name: String(entry?.name || '').toUpperCase(),
    grams: 100,
    calories: 200,
    protein: 10,
    carbs: 20,
    fats: 5,
    confidence: 'low',
    rationale: null,
    assumptions: [],
  }));

  const rawText =
    'Versioned parse.\n' +
    '<food_parser_json>{"version":"9.9.9","messageType":"food_entries","assistantMessage":"Versioned parse.","entries":[{"name":"custom item"}]}</food_parser_json>';

  const parsed = parseFoodParserPayloadFromText(rawText);
  assert.equal(parsed.payload?.version, '9.9.9');
  assert.equal(parsed.payload?.entries?.[0]?.name, 'CUSTOM ITEM');
  assert.equal(parsed.payload?.entries?.[0]?.confidence, 'low');
});

test('resolveAiChatRagRolloutConfig normalizes override and percentage', () => {
  const config = resolveAiChatRagRolloutConfig({
    aiChatRagRolloutOverride: ' ENABLED ',
    aiChatRagRolloutPercentage: 163,
    aiChatRolloutUserId: 'user-123',
  });

  assert.equal(config.override, 'enabled');
  assert.equal(config.rolloutPercentage, 100);
  assert.equal(config.rolloutUserId, 'user-123');
});
