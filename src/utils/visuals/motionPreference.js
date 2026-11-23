// Runtime home of the resolved motion mode (see constants/appearance/motion.js for
// the preference -> mode model).
//
// Framework-free on purpose: CSS reads the mode from the `data-motion` attribute,
// React reads it through `hooks/useMotionMode.js`, and imperative code (the card
// flight, the keyboard glide) calls `prefersReducedMotion()`
// directly. One source of truth replaces the dozen independent
// `matchMedia('(prefers-reduced-motion)')` reads that used to be scattered through
// the app - each of which only ever knew the device setting.

import {
  MOTION_ATTRIBUTE,
  MOTION_MODES,
  isMotionMode,
} from '../../constants/appearance/motion.js';

// Set by App.jsx once the persisted preference is known (and re-set whenever the
// preference or the device setting changes). Until then the device setting is read
// live, which is exactly the app's previous behaviour.
let resolvedMode = null;
const listeners = new Set();

const deviceRequestsReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;

export const getMotionMode = () =>
  resolvedMode ??
  (deviceRequestsReducedMotion() ? MOTION_MODES.REDUCED : MOTION_MODES.FULL);

/** True for `reduced` and `off`: no movement. */
export const prefersReducedMotion = () => getMotionMode() !== MOTION_MODES.FULL;

/**
 * `'smooth'` becomes `'instant'` whenever motion is reduced or off: a smooth
 * scroll is movement too, and CSS `scroll-behavior` does not override the explicit
 * `behavior` argument of `scrollTo()`.
 */
export const resolveScrollBehavior = (behavior = 'smooth') =>
  behavior === 'smooth' && prefersReducedMotion() ? 'instant' : behavior;

/** True only for `off`: not even fades or transitions. */
export const isMotionOff = () => getMotionMode() === MOTION_MODES.OFF;

/**
 * Publish the resolved mode: module state, subscribers, and (when a root element is
 * given) the `data-motion` attribute the CSS keys on. Ignores unknown values.
 */
export const setMotionMode = (mode, root = null) => {
  if (!isMotionMode(mode)) {
    return;
  }

  root?.setAttribute?.(MOTION_ATTRIBUTE, mode);

  if (mode === resolvedMode) {
    return;
  }
  resolvedMode = mode;
  listeners.forEach((notify) => notify());
};

export const subscribeMotionMode = (notify) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/** Back to "read the device setting live" (used by tests). */
export const resetMotionMode = () => {
  resolvedMode = null;
  listeners.forEach((notify) => notify());
};
