import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SCREEN_ORDER,
  SCREEN_DEFINITIONS,
  isSameScreenOrder,
  moveScreen,
  normalizeScreenOrder,
  swapScreens,
} from '../../src/constants/navigation/screens.js';

const ORDER = [...DEFAULT_SCREEN_ORDER];

test('every screen has a label and a description', () => {
  for (const key of DEFAULT_SCREEN_ORDER) {
    assert.ok(SCREEN_DEFINITIONS[key].label, key);
    assert.ok(SCREEN_DEFINITIONS[key].description, key);
  }
});

test('normalizeScreenOrder keeps a valid re-order', () => {
  const reordered = [...ORDER].reverse();
  assert.deepEqual(normalizeScreenOrder(reordered), reordered);
});

test('normalizeScreenOrder falls back to the default for unusable values', () => {
  for (const value of [undefined, null, 'home', {}, []]) {
    assert.deepEqual(normalizeScreenOrder(value), ORDER);
  }
});

test('normalizeScreenOrder never adds or removes a screen', () => {
  const settled = normalizeScreenOrder([
    'insights',
    'home',
    'insights',
    'made-up',
  ]);

  // Kept picks first, the missing screens appended in their default order.
  assert.deepEqual(settled, [
    'insights',
    'home',
    'logbook',
    'tracker',
    'calorie-map',
  ]);
});

test('swapScreens exchanges two slots and leaves the rest', () => {
  assert.deepEqual(swapScreens(ORDER, 'logbook', 'insights'), [
    'insights',
    'tracker',
    'home',
    'calorie-map',
    'logbook',
  ]);
  assert.equal(swapScreens(ORDER, 'home', 'home'), ORDER);
  assert.equal(swapScreens(ORDER, 'home', 'made-up'), ORDER);
});

test('moveScreen shifts the screens in between', () => {
  assert.deepEqual(moveScreen(ORDER, 'insights', 0), [
    'insights',
    'logbook',
    'tracker',
    'home',
    'calorie-map',
  ]);
  assert.deepEqual(moveScreen(ORDER, 'logbook', 2), [
    'tracker',
    'home',
    'logbook',
    'calorie-map',
    'insights',
  ]);
});

test('moveScreen returns the same order when nothing would move', () => {
  assert.equal(moveScreen(ORDER, 'logbook', -1), ORDER);
  assert.equal(moveScreen(ORDER, 'insights', 9), ORDER);
  assert.equal(moveScreen(ORDER, 'made-up', 1), ORDER);
});

test('isSameScreenOrder compares order, not just membership', () => {
  assert.equal(isSameScreenOrder(ORDER, [...ORDER]), true);
  assert.equal(isSameScreenOrder(ORDER, [...ORDER].reverse()), false);
  assert.equal(isSameScreenOrder(undefined, ORDER), false);
});
