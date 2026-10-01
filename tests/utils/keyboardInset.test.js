import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KEYBOARD_INSET_CSS_VAR,
  MAX_UNZOOMED_SCALE,
  MIN_KEYBOARD_INSET_PX,
  resolveKeyboardState,
} from '../../src/utils/visuals/keyboardInset.js';

const NO_KEYBOARD = { isKeyboardVisible: false, keyboardInset: 0 };

test('keyboard inset constants stay in sync with the CSS contract', () => {
  // `KEYBOARD_INSET_CSS_VAR` is consumed by `.keyboard-bottom-inset` in
  // index.css and published by hooks/useKeyboardVisible.js.
  assert.equal(KEYBOARD_INSET_CSS_VAR, '--keyboard-inset');
  assert.equal(MIN_KEYBOARD_INSET_PX, 80);
  assert.equal(MAX_UNZOOMED_SCALE, 1.05);
});

test('resolveKeyboardState reports nothing while no keyboard is up', () => {
  assert.deepEqual(resolveKeyboardState(), NO_KEYBOARD);

  assert.deepEqual(
    resolveKeyboardState({
      keyboardHeight: 0,
      layoutViewportHeight: 900,
      visualViewportHeight: 900,
      baselineLayoutHeight: 900,
    }),
    NO_KEYBOARD
  );
});

test('a keyboard overlaying the layout viewport becomes the bottom inset (iOS resize:none)', () => {
  assert.deepEqual(
    resolveKeyboardState({
      keyboardHeight: 320,
      layoutViewportHeight: 900,
      visualViewportHeight: 580,
    }),
    { isKeyboardVisible: true, keyboardInset: 320 }
  );
});

test('a keyboard that resized the window adds no extra inset (Android `adjustResize`)', () => {
  // The layout viewport already ends at the keyboard's top edge, so padding for
  // the keyboard height again would leave a phantom gap above the keyboard.
  assert.deepEqual(
    resolveKeyboardState({
      keyboardHeight: 340,
      layoutViewportHeight: 560,
      visualViewportHeight: 560,
      baselineLayoutHeight: 900,
    }),
    { isKeyboardVisible: true, keyboardInset: 0 }
  );
});

test('the visual viewport is a fallback signal when the plugin reports nothing', () => {
  assert.deepEqual(
    resolveKeyboardState({
      layoutViewportHeight: 900,
      visualViewportHeight: 600,
      baselineLayoutHeight: 900,
    }),
    { isKeyboardVisible: true, keyboardInset: 300 }
  );
});

test('a window-resizing keyboard never pads, whichever signal lands first', () => {
  // Plugin event first, layout viewport not resized yet...
  assert.deepEqual(
    resolveKeyboardState({
      keyboardHeight: 340,
      layoutViewportHeight: 900,
      visualViewportHeight: 900,
    }),
    { isKeyboardVisible: true, keyboardInset: 0 }
  );

  // ...then the window resize lands: same answer, so no phantom gap can flash
  // between the two events.
  assert.deepEqual(
    resolveKeyboardState({
      keyboardHeight: 340,
      layoutViewportHeight: 560,
      visualViewportHeight: 560,
    }),
    { isKeyboardVisible: true, keyboardInset: 0 }
  );
});

test('a reported keyboard with no visual overlap never pads (window-resized layout)', () => {
  // The plugin height alone is evidence that the keyboard is up, never that
  // chrome needs to move: the layout viewport already ends at the keyboard.
  assert.deepEqual(
    resolveKeyboardState({
      keyboardHeight: 300,
      layoutViewportHeight: 900,
      visualViewportHeight: 900,
    }),
    { isKeyboardVisible: true, keyboardInset: 0 }
  );
});

test('a zoomed visual viewport is not mistaken for a keyboard', () => {
  assert.deepEqual(
    resolveKeyboardState({
      layoutViewportHeight: 900,
      visualViewportHeight: 450,
      visualViewportScale: 2,
    }),
    NO_KEYBOARD
  );

  // ...but a real keyboard still resolves while unzoomed.
  assert.deepEqual(
    resolveKeyboardState({
      layoutViewportHeight: 900,
      visualViewportHeight: 450,
      visualViewportScale: 1,
    }),
    { isKeyboardVisible: true, keyboardInset: 450 }
  );
});

test('sub-keyboard viewport noise is ignored', () => {
  const noise = MIN_KEYBOARD_INSET_PX - 1;

  assert.deepEqual(
    resolveKeyboardState({
      keyboardHeight: noise,
      layoutViewportHeight: 900,
      visualViewportHeight: 900 - noise,
      baselineLayoutHeight: 900,
    }),
    NO_KEYBOARD
  );
});

test('a rotation while the keyboard is closed never becomes an inset', () => {
  assert.deepEqual(
    resolveKeyboardState({
      layoutViewportHeight: 420,
      visualViewportHeight: 420,
      baselineLayoutHeight: 900,
    }),
    NO_KEYBOARD
  );
});

test('malformed viewport measurements degrade to no inset', () => {
  assert.deepEqual(
    resolveKeyboardState({
      keyboardHeight: Number.NaN,
      layoutViewportHeight: Number.NaN,
      visualViewportHeight: -10,
      visualViewportScale: Number.NaN,
    }),
    NO_KEYBOARD
  );
});

