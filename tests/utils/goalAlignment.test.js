import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateGoalAlignment,
  getGoalAlignedStyle,
  hasTrendData,
} from '../../src/utils/calculations/goalAlignment.js';
import { calculateWeightTrend } from '../../src/utils/measurements/weight.js';

const trend = (overrides = {}) => ({
  label: 'Stable',
  weeklyRate: 0,
  direction: 'flat',
  sampleRange: [],
  ...overrides,
});

test('hasTrendData rejects empty and insufficient trend results', () => {
  assert.equal(hasTrendData(null), false);
  assert.equal(hasTrendData(undefined), false);
  assert.equal(hasTrendData(trend({ label: 'No data yet' })), false);
  assert.equal(hasTrendData(trend({ label: 'Need more data' })), false);
  assert.equal(
    hasTrendData(trend({ label: 'Need more data', weeklyRate: 0.4 })),
    false
  );
  assert.equal(hasTrendData(trend({ weeklyRate: Number.NaN })), false);
});

test('hasTrendData accepts a genuinely stable rate', () => {
  // "Stable" with a 0 rate is a real measurement, not missing data — the
  // distinction the old `weeklyRate`-only signature could not make.
  assert.equal(hasTrendData(trend({ label: 'Stable', weeklyRate: 0 })), true);
  assert.equal(
    hasTrendData(trend({ label: 'Gradual weight loss', weeklyRate: -0.3 })),
    true
  );
});

test('an empty log produces a trend with no usable data', () => {
  const empty = calculateWeightTrend([], 7);
  assert.equal(empty.label, 'No data yet');
  assert.equal(hasTrendData(empty), false);
});

test('calculateGoalAlignment reports no-data for a non-finite rate', () => {
  const alignment = calculateGoalAlignment(Number.NaN, 'maintenance', 'weight');
  assert.equal(alignment.alignment, 'no-data');
  assert.equal(alignment.description, 'Insufficient data');
});

test('getGoalAlignedStyle treats missing trend data as neutral, not on track', () => {
  const style = getGoalAlignedStyle(
    trend({ label: 'No data yet', weeklyRate: 0 }),
    'maintenance',
    'weight'
  );
  assert.equal(style.alignment, 'no-data');
  assert.equal(style.tone, 'neutral');
});
