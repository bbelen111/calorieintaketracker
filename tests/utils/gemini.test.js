import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GeminiError,
  buildGeminiContents,
  parseFoodParserPayloadFromText,
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

test('parseFoodParserPayloadFromText strips dangling parser tag when payload is truncated', () => {
  const rawText = `I estimated one fried chicken drumstick based on a typical serving.\n\n<food_parser_json>{"messageType":"food_entries","entries":[{"name":"Fried chicken leg"`;

  const parsed = parseFoodParserPayloadFromText(rawText);

  assert.equal(
    parsed.displayText,
    'I estimated one fried chicken drumstick based on a typical serving.'
  );
  assert.equal(parsed.payload, null);
});
