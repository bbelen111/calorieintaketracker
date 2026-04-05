import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_ACTIVITY_MULTIPLIERS } from '../../src/constants/activity/activityPresets.js';

test('default activity multipliers are intentionally differentiated by day type', () => {
  assert.equal(DEFAULT_ACTIVITY_MULTIPLIERS.training, 0.35);
  assert.equal(DEFAULT_ACTIVITY_MULTIPLIERS.rest, 0.28);
  assert.notEqual(
    DEFAULT_ACTIVITY_MULTIPLIERS.training,
    DEFAULT_ACTIVITY_MULTIPLIERS.rest
  );
});
