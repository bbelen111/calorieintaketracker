import { useSyncExternalStore } from 'react';
import {
  getMotionMode,
  subscribeMotionMode,
} from '../utils/visuals/motionPreference';

// Server snapshot (there is no SSR here, but the API requires one): animate.
const getServerMotionMode = () => 'full';

/** The resolved motion mode: 'full' | 'reduced' | 'off'. Re-renders on change. */
export const useMotionMode = () =>
  useSyncExternalStore(subscribeMotionMode, getMotionMode, getServerMotionMode);

/**
 * Drop-in replacement for framer-motion's `useReducedMotion()`, which only knows
 * the device setting. True for `reduced` AND `off`, so every component that already
 * branched on "reduced motion" honours the in-app preference too.
 */
export const useReducedMotionPreference = () => useMotionMode() !== 'full';
