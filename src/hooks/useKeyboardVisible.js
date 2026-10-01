/**
 * App-wide keyboard visibility + overlap inset.
 *
 * Owns the single source of truth for "is the keyboard up, and how much of the
 * layout viewport does it cover". The result is published two ways:
 *
 *   1. as a CSS custom property (`--keyboard-inset`, px) on `:root`, so bottom
 *      chrome can clear the keyboard with pure CSS (`.keyboard-bottom-inset` in
 *      index.css) without a React re-render, and
 *   2. as a React snapshot (`{ isKeyboardVisible, keyboardInset }`) for chrome
 *      that must actually disappear (the floating tab bar).
 *
 * Detection is the Capacitor keyboard events plus the visual-viewport shrink,
 * resolved by the pure `resolveKeyboardState` — never a "viewport changed by N
 * px" heuristic, which cannot tell a tall keyboard from a rotation and was the
 * reason a tall keyboard used to be misread as a layout change.
 *
 * Android resizes the window for the keyboard (`adjustResize`), so there
 * `keyboardInset` is 0 and `isKeyboardVisible` is the field that matters. iOS
 * keeps `resize: "none"`, so the keyboard overlays the page and the inset carries
 * the covered height — its consumers use it to lift bottom chrome and the modal
 * centering band. A zoomed visual viewport is never read as a keyboard.
 */
import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import {
  KEYBOARD_INSET_CSS_VAR,
  resolveKeyboardState,
} from '../utils/visuals/keyboardInset';

const IDLE_STATE = { isKeyboardVisible: false, keyboardInset: 0 };

// Module-scoped singleton: one listener set and one publisher for the whole app,
// however many components subscribe (same pattern as ModalShell's stack/scroll
// managers, so a second consumer costs nothing).
let reportedKeyboardHeight = 0;
let state = IDLE_STATE;
let teardown = null;
const subscribers = new Set();

const readViewports = () => ({
  layoutViewportHeight: Math.round(window.innerHeight || 0),
  visualViewportHeight: Math.round(window.visualViewport?.height || 0),
  visualViewportScale: window.visualViewport?.scale ?? 1,
});

const writeCssInset = () => {
  if (typeof document === 'undefined') return;

  document.documentElement.style.setProperty(
    KEYBOARD_INSET_CSS_VAR,
    `${state.keyboardInset}px`
  );
};

const publishState = (nextState) => {
  if (
    nextState.isKeyboardVisible === state.isKeyboardVisible &&
    nextState.keyboardInset === state.keyboardInset
  ) {
    return;
  }

  state = nextState;
  writeCssInset();
  subscribers.forEach((notify) => notify());
};

const recompute = () => {
  const { layoutViewportHeight, visualViewportHeight, visualViewportScale } =
    readViewports();

  publishState(
    resolveKeyboardState({
      keyboardHeight: reportedKeyboardHeight,
      layoutViewportHeight,
      visualViewportHeight,
      visualViewportScale,
    })
  );
};

const trackListener = (registration, handles, isDisposed) => {
  if (!registration || typeof registration.then !== 'function') return;

  registration
    .then((handle) => {
      if (isDisposed()) {
        handle?.remove?.();
        return;
      }

      handles.push(handle);
    })
    .catch(() => null);
};

const ensureListening = () => {
  if (teardown || typeof window === 'undefined') return;

  let disposed = false;
  const handles = [];
  const isDisposed = () => disposed;
  const handleViewportChange = () => recompute();

  if (Capacitor.isNativePlatform()) {
    trackListener(
      Keyboard.addListener('keyboardDidShow', (info) => {
        reportedKeyboardHeight = Number(info?.keyboardHeight) || 0;
        recompute();
      }),
      handles,
      isDisposed
    );

    trackListener(
      Keyboard.addListener('keyboardDidHide', () => {
        reportedKeyboardHeight = 0;
        recompute();
      }),
      handles,
      isDisposed
    );
  }

  // The visual-viewport shrink is the same signal as the plugin's, and also
  // covers a platform/version that never emits the event.
  window.addEventListener('resize', handleViewportChange);
  window.visualViewport?.addEventListener('resize', handleViewportChange);

  // Publish up-front so `var(--keyboard-inset)` exists before the first change.
  writeCssInset();
  recompute();

  teardown = () => {
    disposed = true;
    window.removeEventListener('resize', handleViewportChange);
    window.visualViewport?.removeEventListener('resize', handleViewportChange);
    handles.forEach((handle) => handle?.remove?.());
    handles.length = 0;
    reportedKeyboardHeight = 0;
    teardown = null;
  };
};

const subscribe = (notify) => {
  subscribers.add(notify);
  ensureListening();

  return () => {
    subscribers.delete(notify);

    if (subscribers.size === 0) {
      teardown?.();
    }
  };
};

const getSnapshot = () => state;

/**
 * @returns {{ isKeyboardVisible: boolean, keyboardInset: number }}
 */
export function useKeyboardVisible() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
