import { useLayoutEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

const DEFAULT_FROM_OPACITY = 0.6;
const DEFAULT_FROM_OFFSET_PX = 2;
const DEFAULT_DURATION_S = 0.16;

/**
 * Subtle "content refreshed" cue for the always-mounted dual panels in the
 * Daily Ledger and Calendar modals (day preview / month summary).
 *
 * Both panels already crossfade when they SWITCH STATE (day <-> month,
 * empty <-> filled). What they lacked was any feedback when the state stays the
 * same and only the content changes - picking a different day, or changing the
 * month. This hook replays a deliberately weaker animation for that case: it
 * never fades to 0 (so there is no blink) and moves 2px instead of 8px, so it
 * reads as "the content refreshed" rather than "a panel appeared".
 *
 * Why imperative `animate()` inside `useLayoutEffect` rather than a keyed
 * remount:
 * - A remount resets CalendarPickerModal's `AnimatedNumber`, so the numbers
 *   would mount at their final value and never roll.
 * - Starting the tween from a plain effect (after paint) would flash the new
 *   content at full opacity for one frame; a layout effect writes the start
 *   style before the browser paints.
 *
 * It fires ONLY when the panel is already visible and its identity changes, so
 * it never stacks on top of the existing state-transition crossfade:
 * the first fill (`previousIdentity == null`) and the disabled -> enabled flip
 * (`becameVisible`) are both skipped.
 *
 * @param {string|number|null} identity - Content identity (day date key / month key)
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Whether the panel is currently visible
 * @param {number} [options.fromOpacity=0.6] - Start opacity (partial: never 0)
 * @param {number} [options.fromOffsetPx=2] - Start vertical offset
 * @param {number} [options.duration=0.16] - Tween duration in seconds
 * @returns {import('react').MutableRefObject<HTMLElement|null>} ref for a wrapper inside the panel
 */
export const useContentRefresh = (
  identity,
  {
    enabled = true,
    fromOpacity = DEFAULT_FROM_OPACITY,
    fromOffsetPx = DEFAULT_FROM_OFFSET_PX,
    duration = DEFAULT_DURATION_S,
  } = {}
) => {
  const ref = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const previousIdentityRef = useRef(identity);
  const wasEnabledRef = useRef(enabled);

  useLayoutEffect(() => {
    const node = ref.current;
    const previousIdentity = previousIdentityRef.current;
    const wasEnabled = wasEnabledRef.current;
    previousIdentityRef.current = identity;
    wasEnabledRef.current = enabled;

    const becameVisible = enabled && !wasEnabled;
    const shouldRefresh =
      Boolean(node) &&
      enabled &&
      !becameVisible &&
      previousIdentity != null &&
      previousIdentity !== identity &&
      !prefersReducedMotion;

    if (!shouldRefresh) {
      return undefined;
    }

    node.style.opacity = String(fromOpacity);
    node.style.transform = `translateY(${fromOffsetPx}px)`;
    const controls = animate(
      node,
      { opacity: 1, y: 0 },
      { duration, ease: 'easeOut' }
    );

    return () => controls.stop();
  }, [
    identity,
    enabled,
    prefersReducedMotion,
    fromOpacity,
    fromOffsetPx,
    duration,
  ]);

  return ref;
};
