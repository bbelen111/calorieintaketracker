import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFlightTransform,
  clearPortionOrigin,
  peekPortionOrigin,
  rememberPortionOrigin,
} from '../../src/utils/visuals/portionTransition.js';

const fakeElement = (rect) => ({ getBoundingClientRect: () => rect });

test('buildFlightTransform maps the resting box onto the other box', () => {
  const rest = { top: 123, left: 31, width: 327, height: 68 };
  const origin = { top: 284, left: 14, width: 348, height: 68 };
  assert.equal(
    buildFlightTransform(rest, origin),
    `translate(-17px, 161px) scale(${348 / 327}, 1)`
  );
});

test('buildFlightTransform is the identity for identical boxes', () => {
  const box = { top: 10, left: 20, width: 100, height: 40 };
  assert.equal(
    buildFlightTransform(box, box),
    'translate(0px, 0px) scale(1, 1)'
  );
});

test('buildFlightTransform survives a zero-size resting box', () => {
  const out = buildFlightTransform(
    { top: 0, left: 0, width: 0, height: 0 },
    { top: 5, left: 5, width: 10, height: 10 }
  );
  assert.equal(out, 'translate(5px, 5px) scale(1, 1)');
});

test('the origin registry round-trips a rect and clears', () => {
  clearPortionOrigin();
  assert.equal(peekPortionOrigin(), null);

  rememberPortionOrigin(
    fakeElement({ top: 1, left: 2, width: 30, height: 40 })
  );
  assert.deepEqual(peekPortionOrigin(), {
    top: 1,
    left: 2,
    width: 30,
    height: 40,
  });
  // Non-destructive read (StrictMode / a re-run of the effect must still see it).
  assert.deepEqual(peekPortionOrigin(), {
    top: 1,
    left: 2,
    width: 30,
    height: 40,
  });

  clearPortionOrigin();
  assert.equal(peekPortionOrigin(), null);
});

test('rememberPortionOrigin ignores things that are not measurable', () => {
  clearPortionOrigin();
  rememberPortionOrigin(null);
  rememberPortionOrigin({});
  rememberPortionOrigin(fakeElement({ top: 0, left: 0, width: 0, height: 0 }));
  assert.equal(peekPortionOrigin(), null);
});

test('a stale origin is never handed to a modal opened by another route', () => {
  clearPortionOrigin();
  const realNow = Date.now;
  try {
    let now = 1_000_000;
    Date.now = () => now;
    rememberPortionOrigin(
      fakeElement({ top: 1, left: 1, width: 5, height: 5 })
    );

    now += 4_000;
    assert.notEqual(peekPortionOrigin(), null, 'still fresh at 4s');

    now += 2_000; // 6s since the tap
    assert.equal(peekPortionOrigin(), null, 'expired at 6s');
    assert.equal(peekPortionOrigin(), null, 'and stays gone');
  } finally {
    Date.now = realNow;
    clearPortionOrigin();
  }
});
