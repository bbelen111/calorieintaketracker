import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { computeGoldenOutputs } from '../helpers/heartRateGoldenFixture.js';

const expected = JSON.parse(
  readFileSync(
    new URL('../fixtures/heartRateGolden.json', import.meta.url),
    'utf8'
  )
);

// Captured before any heart-rate change. Every value that existed then must
// still be exactly the same, at any depth; NEW keys (e.g. the per-session
// `trainingDetails`, HR provenance inside EPOC details, snapshot HR fields)
// are allowed, because adding information is not drift. Arrays must keep
// their length. If this fails, a change moved a user's TDEE/snapshot numbers:
// fix the regression, or - only when the move is intended - re-capture the
// fixture and explain the moved field in the commit.
const assertPinnedFields = (actual, pinned, path) => {
  if (pinned === null || typeof pinned !== 'object') {
    assert.deepStrictEqual(actual, pinned, `${path} drifted`);
    return;
  }
  if (Array.isArray(pinned)) {
    assert.ok(Array.isArray(actual), `${path} is no longer an array`);
    assert.equal(actual.length, pinned.length, `${path} length changed`);
    pinned.forEach((item, index) =>
      assertPinnedFields(actual[index], item, `${path}[${index}]`)
    );
    return;
  }
  assert.ok(
    actual !== null && typeof actual === 'object' && !Array.isArray(actual),
    `${path} is no longer an object`
  );
  Object.keys(pinned).forEach((key) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(actual, key),
      `${path}.${key} disappeared`
    );
    assertPinnedFields(actual[key], pinned[key], `${path}.${key}`);
  });
};

test('heart-rate golden: breakdown + snapshot outputs are unchanged', () => {
  const actual = computeGoldenOutputs();
  assert.deepStrictEqual(Object.keys(actual), Object.keys(expected));
  Object.keys(expected).forEach((scenario) => {
    assertPinnedFields(
      actual[scenario].breakdown,
      expected[scenario].breakdown,
      `${scenario} breakdown`
    );
    assertPinnedFields(
      actual[scenario].snapshot,
      expected[scenario].snapshot,
      `${scenario} snapshot`
    );
  });
});
