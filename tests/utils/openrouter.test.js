import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetOpenRouterRateLimitQueueForTests,
  buildOpenRouterContents,
  composeExtractionMessage,
  fetchMacrosWithGrounding,
  FOOD_PARSER_SCHEMA_VERSION,
  OPENROUTER_REQUEST_MODE,
  parseFoodParserPayloadFromText,
  sendOpenRouterMessage,
  sendOpenRouterPresentation,
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

test('parser v1.1 extracts optional micro nutrients and clamps them', () => {
  const { payload } = parseFoodParserPayloadFromText(
    `<food_parser_json>{"version":"1.1.0","messageType":"food_entries","assistantMessage":"ok","entries":[{"name":"Overnight Oats","grams":100,"calories":180,"protein":6,"carbs":30,"fats":4,"fiber":5.25,"sodium":42.8,"saturatedFats":0.75,"sugars":6,"confidence":"high"}]}</food_parser_json>`
  );

  const entry = payload.entries[0];
  assert.equal(entry.fiber, 5.3);
  assert.equal(entry.sodium, 43);
  assert.equal(entry.saturatedFats, 0.8);
  assert.equal(entry.sugars, 6);
  assert.equal(payload.version, '1.1.0');
});

test('parser v1.1 keeps omitted micros absent (never invents zeros)', () => {
  const { payload } = parseFoodParserPayloadFromText(
    `<food_parser_json>{"version":"1.1.0","messageType":"food_entries","assistantMessage":"ok","entries":[{"name":"Chicken","grams":150,"calories":250,"protein":40,"carbs":0,"fats":9,"confidence":"high"}]}</food_parser_json>`
  );

  const entry = payload.entries[0];
  assert.equal('fiber' in entry, false);
  assert.equal('sodium' in entry, false);
  assert.equal('saturatedFats' in entry, false);
  assert.equal('sugars' in entry, false);
});

test('parser v1.1 clamps out-of-range micro nutrients to canonical bounds', () => {
  const { payload } = parseFoodParserPayloadFromText(
    `<food_parser_json>{"version":"1.1.0","messageType":"food_entries","assistantMessage":"ok","entries":[{"name":"Salt Bomb","grams":100,"calories":10,"protein":0,"carbs":2,"fats":0,"sodium":99999,"fiber":-5,"confidence":"high"}]}</food_parser_json>`
  );

  const entry = payload.entries[0];
  assert.equal(entry.sodium, 10000);
  assert.equal(entry.fiber, 0);
});

test('legacy parser v1.0.0 payloads still parse without micro fields', () => {
  const { payload } = parseFoodParserPayloadFromText(
    `<food_parser_json>{"version":"1.0.0","messageType":"food_entries","assistantMessage":"ok","entries":[{"name":"Egg","grams":50,"calories":70,"protein":6,"carbs":0.5,"fats":5,"confidence":"medium"}]}</food_parser_json>`
  );

  assert.equal(payload.version, '1.0.0');
  assert.equal(payload.entries[0].name, 'Egg');
  assert.equal('fiber' in payload.entries[0], false);
});

test('parses food parser payload and preserves food context prompts', () => {
  const parsed = parseFoodParserPayloadFromText(
    '<food_parser_json>{"messageType":"clarification","assistantMessage":"Which size?","followUpQuestion":"Which size?","entries":[]}</food_parser_json>'
  );
  assert.equal(parsed.payload.messageType, 'clarification');
  assert.ok(composeExtractionMessage('same as before', '1. Rice').includes('[RECENT_FOOD_CONTEXT]'));
});

test('parser normalizes top-level lookupTerms on clarification payloads', () => {
  const { payload } = parseFoodParserPayloadFromText(
    '<food_parser_json>{"version":"1.1.0","messageType":"clarification","assistantMessage":"Which rice?","lookupTerms":[" white rice ", 42, "", "steamed rice","a","b","c","d","e","f","g"],"entries":[]}</food_parser_json>'
  );

  assert.deepEqual(payload.lookupTerms, [
    'white rice',
    'steamed rice',
    'a',
    'b',
    'c',
    'd',
  ]);
});

test('parser keeps lookupTerms as an empty array when the model omits them', () => {
  const { payload } = parseFoodParserPayloadFromText(
    '<food_parser_json>{"version":"1.1.0","messageType":"food_entries","assistantMessage":"ok","entries":[{"name":"Egg","grams":50,"calories":70,"protein":6,"carbs":0.5,"fats":5,"confidence":"medium"}]}</food_parser_json>'
  );

  assert.deepEqual(payload.lookupTerms, []);
});

test('fetchMacrosWithGrounding rescales portion-aware responses and passes micros through', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody;
  globalThis.fetch = async (_url, options = {}) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '<food_parser_json>{"version":"1.1.0","messageType":"food_entries","assistantMessage":"ok","entries":[{"name":"White Rice","grams":320,"calories":416,"protein":8.6,"carbs":89,"fats":1,"fiber":1.3,"sodium":2,"confidence":"medium","source":"ai_web_search"}]}</food_parser_json>',
            },
          },
        ],
      }),
    };
  };

  try {
    const estimate = await fetchMacrosWithGrounding('2 cups of white rice');

    // The grounded prompt asks the model to estimate the described portion.
    assert.ok(capturedBody.mode === 'grounding_lookup');

    // Portion-aware values are rescaled to the per-100g baseline...
    assert.equal(estimate.portionGrams, 320);
    assert.equal(estimate.per100g.calories, 130);
    assert.equal(estimate.per100g.protein, 2.7);
    assert.equal(estimate.per100g.carbs, 27.8);
    // ...and micro nutrients survive the rescale without being invented.
    assert.equal(estimate.per100g.fiber, 0.4);
    assert.equal(estimate.per100g.sodium, 0.6);
    assert.equal(estimate.per100g.sugars, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('extraction prompts name the display units only for kJ or oz users', () => {
  const plain = composeExtractionMessage('6 oz steak', '1. Rice');
  assert.equal(
    composeExtractionMessage('6 oz steak', '1. Rice', {
      energy: 'kcal',
      foodWeight: 'g',
      bodyWeight: 'lb',
    }),
    plain
  );

  const converted = composeExtractionMessage('6 oz steak', '1. Rice', {
    energy: 'kJ',
    foodWeight: 'oz',
  });
  assert.equal(
    converted,
    `${plain}\n\n[DISPLAY_UNITS]\nenergy: kJ (1 kcal = 4.184 kJ)\nfood weight: oz (1 oz = 28.35 g)`
  );
});

test('presentation sends preconverted display values beside kcal entries', async () => {
  const originalFetch = globalThis.fetch;
  const prompts = [];
  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body);
    prompts.push(body.messages.at(-1).content[0].text);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: `Logged.
<food_parser_json>${JSON.stringify({
                version: FOOD_PARSER_SCHEMA_VERSION,
                messageType: 'error',
                assistantMessage: 'Logged.',
                entries: [],
              })}</food_parser_json>`,
            },
          },
        ],
      }),
    };
  };
  const entries = [{ name: 'Rice', grams: 170, calories: 221 }];
  const readSystemData = (prompt) =>
    JSON.parse(prompt.split('[SYSTEM_DATA]: ')[1]);

  try {
    await sendOpenRouterPresentation({
      message: 'rice',
      systemData: { entries },
      displayUnits: { energy: 'kcal', foodWeight: 'g' },
    });
    await sendOpenRouterPresentation({
      message: 'rice',
      systemData: { entries },
      displayUnits: { energy: 'kJ', foodWeight: 'oz' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    prompts[0],
    `rice\n\n[SYSTEM_DATA]: ${JSON.stringify({ entries })}`
  );
  assert.match(prompts[1], /\[DISPLAY_UNITS\]/);
  const data = readSystemData(prompts[1]);
  assert.deepEqual(data.entries, entries);
  assert.deepEqual(data.displayValues, [
    { name: 'Rice', energy: '925 kJ', weight: '6 oz' },
  ]);
});
