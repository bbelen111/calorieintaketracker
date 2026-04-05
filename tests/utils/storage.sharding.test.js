import assert from 'node:assert/strict';
import test from 'node:test';

import { reconstructHistoryFromDexieDocuments } from '../../src/utils/data/storage.js';

test('reconstructHistoryFromDexieDocuments rebuilds sharded history fields', () => {
  const documents = [
    {
      id: 'nutritionData:2026-03-21',
      payload: {
        breakfast: [
          {
            id: 'food-1',
            name: 'Eggs',
            calories: 155,
          },
        ],
      },
    },
    {
      id: 'weightEntries:2026-03-21',
      payload: {
        date: '2026-03-21',
        weight: 81,
      },
    },
    {
      id: 'bodyFatEntries:2026-03-21',
      payload: {
        date: '2026-03-21',
        bodyFat: 16.4,
      },
    },
    {
      id: 'stepEntries:2026-03-21',
      payload: {
        date: '2026-03-21',
        steps: 12654,
        source: 'manual',
      },
    },
    {
      id: 'cardioSessions:session-1',
      payload: {
        id: 'session-1',
        type: 'run',
        duration: '45 min',
        __order: 1,
      },
    },
    {
      id: 'cardioSessions:session-0',
      payload: {
        id: 'session-0',
        type: 'walk',
        duration: '20 min',
        __order: 0,
      },
    },
    {
      id: 'cachedFoods:chicken%20breast',
      payload: {
        entry: {
          id: 'food-123',
          name: 'Chicken Breast',
        },
        __order: 0,
      },
    },
    {
      id: 'dailySnapshots:2026-03-21',
      payload: {
        date: '2026-03-21',
        tdee: 3100,
        intake: 2400,
        deficit: 700,
        stepCount: 12654,
      },
    },
  ];

  const { historyData, hasAnyHistory, shardDocIdsByField } =
    reconstructHistoryFromDexieDocuments(documents);

  assert.equal(hasAnyHistory, true);
  assert.deepEqual(historyData.weightEntries, [
    {
      date: '2026-03-21',
      weight: 81,
    },
  ]);
  assert.deepEqual(historyData.bodyFatEntries, [
    {
      date: '2026-03-21',
      bodyFat: 16.4,
    },
  ]);
  assert.deepEqual(historyData.stepEntries, [
    {
      date: '2026-03-21',
      steps: 12654,
      source: 'manual',
    },
  ]);
  assert.equal(
    historyData.nutritionData['2026-03-21'].breakfast[0].name,
    'Eggs'
  );
  assert.deepEqual(
    historyData.cardioSessions.map((session) => session.id),
    ['session-0', 'session-1']
  );
  assert.deepEqual(historyData.cachedFoods, [
    {
      id: 'food-123',
      name: 'Chicken Breast',
    },
  ]);
  assert.equal(historyData.dailySnapshots['2026-03-21']?.deficit, 700);

  assert.equal(
    shardDocIdsByField.get('nutritionData')?.has('nutritionData:2026-03-21'),
    true
  );
  assert.equal(
    shardDocIdsByField.get('cachedFoods')?.has('cachedFoods:chicken%20breast'),
    true
  );
  assert.equal(
    shardDocIdsByField
      .get('dailySnapshots')
      ?.has('dailySnapshots:2026-03-21'),
    true
  );
});

test('reconstructHistoryFromDexieDocuments prefers sharded payload over unsharded field document', () => {
  const documents = [
    {
      id: 'nutritionData',
      payload: {
        '2026-03-01': {
          breakfast: [{ id: 'unsharded-food' }],
        },
      },
    },
    {
      id: 'nutritionData:2026-03-21',
      payload: {
        dinner: [{ id: 'sharded-food' }],
      },
    },
  ];

  const { historyData } = reconstructHistoryFromDexieDocuments(documents);

  assert.deepEqual(historyData.nutritionData, {
    '2026-03-21': {
      dinner: [{ id: 'sharded-food' }],
    },
  });
});

test('reconstructHistoryFromDexieDocuments ignores deprecated phases payload', () => {
  const documents = [
    {
      id: 'phases',
      payload: [
        {
          id: 101,
          name: 'Deprecated Phase',
          startDate: '2026-03-01',
          goalType: 'maintenance',
          status: 'active',
          dailyLogs: {},
        },
      ],
    },
  ];

  const { historyData } = reconstructHistoryFromDexieDocuments(documents);

  assert.equal('deprecatedPhases' in historyData, false);
  assert.equal('phaseLogV2' in historyData, false);
});

test('reconstructHistoryFromDexieDocuments rebuilds phaseLogV2 from sharded docs', () => {
  const documents = [
    {
      id: 'phaseLogV2:meta',
      payload: {
        version: 2,
        phaseOrder: ['phase-1'],
        activePhaseId: 'phase-1',
      },
    },
    {
      id: 'phaseLogV2:phase%3Aphase-1',
      payload: {
        id: 'phase-1',
        name: 'Lean Bulk',
        startDate: '2026-03-01',
        goalType: 'bulking',
        status: 'active',
        createdAt: 1700000000000,
      },
    },
    {
      id: 'phaseLogV2:log%3Aphase-1%3A2026-03-21',
      payload: {
        id: 'phase-1:2026-03-21',
        phaseId: 'phase-1',
        date: '2026-03-21',
        links: {
          weightEntryId: '2026-03-21',
          bodyFatEntryId: null,
          nutritionDayKey: '2026-03-21',
          stepEntryId: null,
          trainingSessionIds: [],
        },
        notes: 'Good day',
        metadata: {},
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
    },
  ];

  const { historyData } = reconstructHistoryFromDexieDocuments(documents);

  assert.equal(historyData.phaseLogV2.activePhaseId, 'phase-1');
  assert.equal(historyData.phaseLogV2.phaseOrder[0], 'phase-1');
  assert.equal(historyData.phaseLogV2.logsById['phase-1:2026-03-21'].notes, 'Good day');
  assert.equal(
    historyData.phaseLogV2.logIdByPhaseDate['phase-1']['2026-03-21'],
    'phase-1:2026-03-21'
  );
});
