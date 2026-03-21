import assert from 'node:assert/strict';
import test from 'node:test';

import { reconstructHistoryFromDexieDocuments } from '../../src/utils/storage.js';

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

  assert.equal(
    shardDocIdsByField.get('nutritionData')?.has('nutritionData:2026-03-21'),
    true
  );
  assert.equal(
    shardDocIdsByField.get('cachedFoods')?.has('cachedFoods:chicken%20breast'),
    true
  );
});

test('reconstructHistoryFromDexieDocuments prefers sharded payload over legacy field document', () => {
  const documents = [
    {
      id: 'nutritionData',
      payload: {
        '2026-03-01': {
          breakfast: [{ id: 'legacy-food' }],
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

test('reconstructHistoryFromDexieDocuments ignores legacy phases payload', () => {
  const documents = [
    {
      id: 'phases',
      payload: [
        {
          id: 101,
          name: 'Legacy Phase',
          startDate: '2026-03-01',
          goalType: 'maintenance',
          status: 'active',
          dailyLogs: {},
        },
      ],
    },
  ];

  const { historyData } = reconstructHistoryFromDexieDocuments(documents);

  assert.equal('legacyPhases' in historyData, false);
  assert.equal('phaseLogV2' in historyData, false);
});
