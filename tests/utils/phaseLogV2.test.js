import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultPhaseLogV2State,
  convertLegacyPhasesToPhaseLogV2,
  convertPhaseLogV2ToLegacyPhases,
  deriveDailyLogStatus,
  LOG_COMPLETION_STATUS,
  upsertPhaseLogV2DailyLog,
  removePhaseLogV2DailyLog,
} from '../../src/utils/phaseLogV2.js';

test('legacy conversion enforces a single active phase', () => {
  const now = Date.now();
  const state = convertLegacyPhasesToPhaseLogV2([
    {
      id: 101,
      name: 'Cut Block',
      startDate: '2026-01-01',
      goalType: 'cutting',
      status: 'active',
      dailyLogs: {},
      createdAt: now,
    },
    {
      id: 202,
      name: 'Bulk Block',
      startDate: '2026-02-01',
      goalType: 'bulking',
      status: 'active',
      dailyLogs: {},
      createdAt: now,
    },
  ]);

  assert.equal(state.activePhaseId, 101);
  assert.equal(state.phasesById[101].status, 'active');
  assert.equal(state.phasesById[202].status, 'completed');
});

test('phase log conversion preserves body fat references', () => {
  const now = Date.now();
  const v2 = convertLegacyPhasesToPhaseLogV2([
    {
      id: 1,
      name: 'Recomp',
      startDate: '2026-03-01',
      goalType: 'maintenance',
      status: 'active',
      dailyLogs: {
        '2026-03-10': {
          date: '2026-03-10',
          weightRef: '2026-03-10',
          bodyFatRef: '2026-03-10',
          nutritionRef: '',
          notes: 'Good session',
          completed: false,
          createdAt: now,
          updatedAt: now,
        },
      },
      createdAt: now,
    },
  ]);

  const legacy = convertPhaseLogV2ToLegacyPhases(v2);
  assert.equal(
    legacy.phases[0].dailyLogs['2026-03-10'].bodyFatRef,
    '2026-03-10'
  );
});

test('deriveDailyLogStatus is body-fat aware', () => {
  const statusWithPrimaryAndSecondary = deriveDailyLogStatus({
    links: {
      bodyFatEntryId: '2026-03-12',
      trainingSessionIds: [999],
    },
    notes: '',
  });

  const statusWithOnlyPrimary = deriveDailyLogStatus({
    links: {
      bodyFatEntryId: '2026-03-12',
    },
    notes: '',
  });

  assert.equal(statusWithPrimaryAndSecondary, LOG_COMPLETION_STATUS.COMPLETE);
  assert.equal(statusWithOnlyPrimary, LOG_COMPLETION_STATUS.PARTIAL);
});

test('upsert and remove daily log maintain phase-date index integrity', () => {
  const base = convertLegacyPhasesToPhaseLogV2([
    {
      id: 7,
      name: 'Mini Cut',
      startDate: '2026-03-01',
      goalType: 'cutting',
      status: 'active',
      dailyLogs: {},
      createdAt: Date.now(),
    },
  ]);

  const withLog = upsertPhaseLogV2DailyLog(base, 7, '2026-03-15', {
    weightRef: '2026-03-15',
    bodyFatRef: '2026-03-15',
    nutritionRef: '2026-03-15',
    notes: 'Linked all core entries',
  });

  const logId = withLog.logIdByPhaseDate[7]['2026-03-15'];
  assert.ok(logId);
  assert.equal(withLog.logsById[logId].links.bodyFatEntryId, '2026-03-15');

  const withoutLog = removePhaseLogV2DailyLog(withLog, 7, '2026-03-15');
  assert.equal(withoutLog.logIdByPhaseDate[7]['2026-03-15'], undefined);
  assert.equal(withoutLog.logsById[logId], undefined);
});

test('default v2 state starts empty and stable', () => {
  const state = createDefaultPhaseLogV2State();
  assert.equal(state.version, 2);
  assert.deepEqual(state.phaseOrder, []);
  assert.equal(state.activePhaseId, null);
});
