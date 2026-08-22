import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLookupContextEntryKey } from '../../src/services/foodLookupContext.js';
import {
  CHAT_HISTORY_MESSAGE_LIMIT,
  CHAT_PIPELINE_STAGE,
  RAG_PIPELINE_LIMITS,
  buildRollingFoodContextSummary,
  buildStructuredChatHistory,
  mergeEntriesWithLookupContext,
  runRagChatPipeline,
  shouldSkipPresentationPass,
} from '../../src/services/ragChatPipeline.js';

/**
 * Telemetry double the pipeline can record into; mirrors the injected
 * `telemetry` callbacks FoodSearchModal wires in production.
 */
const makeTelemetry = () => {
  const calls = {
    extractionOutcome: [],
    lookupStats: [],
    nameDrift: [],
    presentationIssues: [],
    stageLatency: [],
  };
  return {
    recordRagExtractionOutcome: async (payload) =>
      calls.extractionOutcome.push(payload),
    recordRagLookupStats: async (payload) => calls.lookupStats.push(payload),
    recordRagPresentationNameDrift: async (payload) =>
      calls.nameDrift.push(payload),
    recordRagPresentationIssues: async (payload) =>
      calls.presentationIssues.push(payload),
    recordRagStageLatency: async (payload) => calls.stageLatency.push(payload),
    calls,
  };
};

test('CHAT_PIPELINE_STAGE exposes the documented stage keys and is frozen', () => {
  assert.deepEqual(CHAT_PIPELINE_STAGE, {
    EXTRACTION: 'extraction',
    RETRIEVAL: 'retrieval',
    VERIFICATION: 'verification',
    PRESENTATION: 'presentation',
    PROCESSING: 'processing',
  });
  assert.equal(Object.isFrozen(CHAT_PIPELINE_STAGE), true);
});

test('RAG_PIPELINE_LIMITS mirrors the centralized ragBudget constants', () => {
  assert.equal(RAG_PIPELINE_LIMITS.maxDeferredGroundingEntries, 20);
  assert.equal(RAG_PIPELINE_LIMITS.lookupConcurrency, 10);
  assert.equal(RAG_PIPELINE_LIMITS.timing.groundingBatchMs, 90000);
});

test('buildStructuredChatHistory keeps sent user/assistant messages up to beforeMessageId', () => {
  const messages = [
    { id: 'm1', role: 'user', status: 'sent', text: '  hello  ' },
    { id: 'm2', role: 'assistant', status: 'sent', text: 'reply' },
    { id: 'm3', role: 'user', status: 'pending', text: 'not yet sent' },
    { id: 'm4', role: 'system', status: 'sent', text: 'ignored role' },
    { id: 'm5', role: 'user', status: 'sent', text: '   ' },
    { id: 'm6', role: 'assistant', status: 'sent', text: 'after boundary' },
  ];

  const history = buildStructuredChatHistory(messages, {
    beforeMessageId: 'm6',
  });

  assert.deepEqual(history, [
    { role: 'user', parts: [{ text: 'hello' }] },
    { role: 'assistant', content: 'reply' },
  ]);
});

test('buildStructuredChatHistory caps history at CHAT_HISTORY_MESSAGE_LIMIT', () => {
  const messages = Array.from({ length: 60 }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    status: 'sent',
    text: index % 2 === 0 ? `question ${index}` : `answer ${index}`,
  }));

  const history = buildStructuredChatHistory(messages);

  assert.equal(history.length, CHAT_HISTORY_MESSAGE_LIMIT);
  assert.deepEqual(history[history.length - 1], {
    role: 'assistant',
    content: 'answer 59',
  });
});

test('buildRollingFoodContextSummary lists recent assistant food entries before beforeMessageId', () => {
  const messages = [
    { id: 'q1', role: 'user', status: 'sent', text: 'lunch' },
    {
      id: 'a1',
      role: 'assistant',
      status: 'sent',
      text: 'parsed',
      foodParser: {
        messageType: 'food_entries',
        entries: [
          { name: 'Chicken Breast', grams: 150, calories: 248 },
          { name: 'White Rice', grams: 200, calories: 260 },
        ],
      },
    },
    { id: 'q2', role: 'user', status: 'sent', text: 'more' },
    {
      id: 'a2',
      role: 'assistant',
      status: 'sent',
      text: 'parsed again',
      foodParser: {
        messageType: 'food_entries',
        entries: [{ name: 'Olive Oil', grams: 15, calories: 120 }],
      },
    },
    { id: 'q3', role: 'user', status: 'sent', text: 'stop' },
  ];

  const summary = buildRollingFoodContextSummary(messages, {
    beforeMessageId: 'q3',
  });

  assert.equal(
    summary,
    '1. Chicken Breast (150g, 248 kcal)\n2. White Rice (200g, 260 kcal)\n3. Olive Oil (15g, 120 kcal)'
  );
});

test('buildRollingFoodContextSummary returns empty string without qualifying entries and honors maxEntries', () => {
  assert.equal(buildRollingFoodContextSummary([]), '');

  const messages = Array.from({ length: 4 }, (_, index) => ({
    id: `a${index}`,
    role: 'assistant',
    status: 'sent',
    text: 'parsed',
    foodParser: {
      messageType: 'food_entries',
      entries: [{ name: `Food ${index}`, grams: 100, calories: 100 }],
    },
  }));

  const summary = buildRollingFoodContextSummary(messages, { maxEntries: 2 });
  assert.equal(
    summary,
    '1. Food 2 (100g, 100 kcal)\n2. Food 3 (100g, 100 kcal)'
  );
});
test('mergeEntriesWithLookupContext attaches lookupMeta by stable messageId-keyed entry key', () => {
  const messageId = 'assistant-1';
  const entries = [{ name: 'Chicken Breast' }, { name: 'White Rice' }];
  const lookupMeta = { status: 'resolved', usedSource: 'local' };
  const lookupContext = {
    [buildLookupContextEntryKey(messageId, 0, 'Chicken Breast')]: lookupMeta,
  };

  const merged = mergeEntriesWithLookupContext({
    entries,
    messageId,
    lookupContext,
  });

  assert.equal(merged.length, 2);
  assert.equal(merged[0].lookupMeta, lookupMeta);
  assert.equal(merged[1].lookupMeta, undefined);
});

test('mergeEntriesWithLookupContext returns entries untouched without context or messageId', () => {
  const entries = [{ name: 'Eggs' }];
  assert.deepEqual(
    mergeEntriesWithLookupContext({
      entries,
      messageId: '',
      lookupContext: null,
    }),
    entries
  );
  assert.deepEqual(
    mergeEntriesWithLookupContext({
      entries: [],
      messageId: 'assistant-1',
      lookupContext: {},
    }),
    []
  );
});

test('shouldSkipPresentationPass skips for single/no-entry results and keeps multi-entry passthrough', () => {
  assert.equal(shouldSkipPresentationPass({ verifiedEntries: [] }), true);
  assert.equal(
    shouldSkipPresentationPass({ verifiedEntries: [{ name: 'Eggs' }] }),
    true
  );
  assert.equal(
    shouldSkipPresentationPass({
      verifiedEntries: [{ name: 'Eggs' }, { name: 'Rice' }],
    }),
    false
  );
  assert.equal(shouldSkipPresentationPass({}), true);
  // Non-array input is outside the contract (callers always pass an array);
  // the guard returns false (does not skip) in that case.
  assert.equal(shouldSkipPresentationPass({ verifiedEntries: 'nope' }), false);
});

test('runRagChatPipeline runs the legacy single-call path when RAG is disabled', async () => {
  const stages = [];
  const telemetry = makeTelemetry();
  const messageCalls = [];
  let extractionCalls = 0;
  let presentationCalls = 0;

  const pipelineResult = await runRagChatPipeline({
    message: '2 eggs',
    isOnline: true,
    enableRag: false,
    modules: {
      sendOpenRouterMessage: async (options) => {
        messageCalls.push(options);
        return {
          text: 'Sure!',
          foodParser: {
            version: 'v1',
            messageType: 'follow_up',
            followUpQuestion: 'How many eggs?',
          },
        };
      },
      sendOpenRouterExtraction: async () => {
        extractionCalls += 1;
        throw new Error('extraction must not run in legacy mode');
      },
      sendOpenRouterPresentation: async () => {
        presentationCalls += 1;
        throw new Error('presentation must not run in legacy mode');
      },
    },
    onStageChange: (stage) => stages.push(stage),
    telemetry,
  });

  assert.equal(pipelineResult.mode, 'legacy');
  assert.equal(pipelineResult.result.text, 'Sure!');
  assert.equal(pipelineResult.result.foodParser.messageType, 'follow_up');
  assert.equal(pipelineResult.schemaVersion, 'v1');
  assert.equal(pipelineResult.lookupContext, null);
  assert.equal(extractionCalls, 0);
  assert.equal(presentationCalls, 0);
  assert.ok(stages.includes(CHAT_PIPELINE_STAGE.PROCESSING));
  assert.equal(messageCalls.length, 1);
  assert.equal(messageCalls[0].message, '2 eggs');
});
test('runRagChatPipeline fail-closes to the legacy path when the extraction module is missing', async () => {
  const stages = [];
  let messageCalls = 0;

  const pipelineResult = await runRagChatPipeline({
    message: '2 eggs',
    isOnline: true,
    enableRag: true,
    modules: {
      sendOpenRouterMessage: async () => {
        messageCalls += 1;
        return { text: 'ok', foodParser: { messageType: 'follow_up' } };
      },
    },
    onStageChange: (stage) => stages.push(stage),
    telemetry: makeTelemetry(),
  });

  assert.equal(pipelineResult.mode, 'legacy');
  assert.equal(messageCalls, 1);
  assert.ok(stages.includes(CHAT_PIPELINE_STAGE.PROCESSING));
});

test('runRagChatPipeline short-circuits on extraction error and retries once with the constrained prompt', async () => {
  const stages = [];
  const telemetry = makeTelemetry();
  const extractionCallMessages = [];

  const errorResult = {
    text: 'Could not parse. Please clarify.',
    foodParser: { version: 'v1', messageType: 'error' },
  };

  const pipelineResult = await runRagChatPipeline({
    message: 'some meal',
    files: [],
    isOnline: false,
    enableRag: true,
    modules: {
      sendOpenRouterExtraction: async ({ message }) => {
        extractionCallMessages.push(message);
        return { ...errorResult };
      },
      sendOpenRouterPresentation: async () => {
        throw new Error('presentation must not run');
      },
      fetchMacrosWithGrounding: async () => {
        throw new Error('grounding must not run offline');
      },
    },
    onStageChange: (stage) => stages.push(stage),
    telemetry,
  });

  assert.equal(pipelineResult.mode, 'rag');
  assert.equal(pipelineResult.result.foodParser.messageType, 'error');
  assert.equal(extractionCallMessages.length, 2);
  assert.match(
    extractionCallMessages[1],
    /If possible, return messageType=food_entries/
  );
  assert.equal(pipelineResult.lookupContext, null);
  assert.equal(telemetry.calls.stageLatency.length, 1);
  assert.equal(telemetry.calls.stageLatency[0].stage, 'extraction');
  assert.equal(telemetry.calls.extractionOutcome.length, 1);
  assert.equal(telemetry.calls.presentationIssues.length, 0);
});

test('runRagChatPipeline keeps extraction short-circuit results when no grounding module is injected', async () => {
  const stages = [];
  const extractionCalls = [];

  const clarificationResult = {
    text: 'Which meal?',
    foodParser: { version: 'v1', messageType: 'clarification' },
  };

  const pipelineResult = await runRagChatPipeline({
    message: 'lunch',
    isOnline: true,
    enableRag: true,
    modules: {
      sendOpenRouterExtraction: async () => {
        extractionCalls.push(1);
        return { ...clarificationResult };
      },
    },
    onStageChange: (stage) => stages.push(stage),
    telemetry: makeTelemetry(),
  });

  assert.equal(pipelineResult.mode, 'rag');
  assert.equal(pipelineResult.result.foodParser.messageType, 'clarification');
  assert.equal(extractionCalls.length, 2);
  assert.deepEqual(stages, [CHAT_PIPELINE_STAGE.EXTRACTION]);
});
