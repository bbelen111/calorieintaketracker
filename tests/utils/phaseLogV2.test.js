import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultPhaseLogV2State,
  deriveDailyLogStatus,
  LOG_COMPLETION_STATUS,
  normalizePhaseLogV2State,
  upsertPhaseLogV2DailyLog,
  removePhaseLogV2DailyLog,
} from '../../src/utils/phaseLogV2.js';

test('v2 normalization enforces a single active phase', () => {
  const now = Date.now();
  const state = normalizePhaseLogV2State({
    version: 2,
    phaseOrder: [101, 202],
    activePhaseId: 101,
    phasesById: {
      101: {
        id: 101,
        name: 'Cut Block',
        startDate: '2026-01-01',
        goalType: 'cutting',
        status: 'active',
        createdAt: now,
      },
      202: {
        id: 202,
        name: 'Bulk Block',
        startDate: '2026-02-01',
        goalType: 'bulking',
        status: 'active',
        createdAt: now,
      },
    },
    logsById: {},
    logIdsByPhaseId: {
      101: [],
      202: [],
    },
    logIdByPhaseDate: {
      101: {},
      202: {},
    },
  });

  assert.equal(state.activePhaseId, 101);
  assert.equal(state.phasesById[101].status, 'active');
  assert.equal(state.phasesById[202].status, 'completed');
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
  const base = normalizePhaseLogV2State({
    version: 2,
    phaseOrder: [7],
    activePhaseId: 7,
    phasesById: {
      7: {
        id: 7,
        name: 'Mini Cut',
        startDate: '2026-03-01',
        goalType: 'cutting',
        status: 'active',
        createdAt: Date.now(),
      },
    },
    logsById: {},
    logIdsByPhaseId: {
      7: [],
    },
    logIdByPhaseDate: {
      7: {},
    },
  });

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
