import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHealthConnectStepReadWindow } from '../../src/utils/healthConnectWindow.js';

test('buildHealthConnectStepReadWindow returns a same-day window for normal times', () => {
  const referenceDate = new Date(2026, 0, 15, 14, 30, 45, 123);
  const window = buildHealthConnectStepReadWindow(referenceDate);

  assert.ok(window);

  const start = new Date(window.startDate);
  const end = new Date(window.endDate);

  assert.equal(start.getFullYear(), referenceDate.getFullYear());
  assert.equal(start.getMonth(), referenceDate.getMonth());
  assert.equal(start.getDate(), referenceDate.getDate());
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.ok(end > start);
  assert.equal(end.getTime(), referenceDate.getTime());
});

test('buildHealthConnectStepReadWindow nudges an exact-midnight boundary forward', () => {
  const referenceDate = new Date(2026, 0, 15, 0, 0, 0, 0);
  const window = buildHealthConnectStepReadWindow(referenceDate);

  assert.ok(window);

  const start = new Date(window.startDate);
  const end = new Date(window.endDate);

  assert.ok(end > start);
  assert.equal(end.getTime() - start.getTime(), 1);
});

test('buildHealthConnectStepReadWindow returns null for invalid input', () => {
  assert.equal(buildHealthConnectStepReadWindow(new Date('invalid')), null);
});