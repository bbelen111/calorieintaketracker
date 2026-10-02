import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const DEFAULT_FROM_OPACITY = 0.6;
const DEFAULT_FROM_OFFSET_PX = 2;
const DEFAULT_DURATION_MS = 160;

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
 * Implementation notes (both learned the hard way):
 * - It is a plain CSS transition, NOT framer's imperative `animate()`. That API
 *   caches per-element animation state: after the first run it resolves the
 *   "from" value from its own stale state (`opacity: 1`), so every later run
 *   animates `1 -> 1` - a no-op - and never overwrites the start style this hook
 *   just wrote. The symptom was a panel that animated once and then stayed
 *   faded until the modal was remounted. A CSS transition has no "from"
 *   resolution: the browser interpolates from the inline start values.
 * - It runs in a `useLayoutEffect` so the start values are applied before paint
 *   (no flash of the new content at full opacity), and it CLEARS every inline
 *   style it wrote once the transition ends, so nothing can ever be left behind.
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
 * @param {number} [options.durationMs=160] - Transition duration in milliseconds
 * @returns {import('react').MutableRefObject<HTMLElement|null>} ref for a wrapper inside the panel
 */
export const useContentRefresh = (
  identity,
  {
    enabled = true,
    fromOpacity = DEFAULT_FROM_OPACITY,
    fromOffsetPx = DEFAULT_FROM_OFFSET_PX,
    durationMs = DEFAULT_DURATION_MS,
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

    let frame = 0;
    let timeout = 0;

    const clearStyles = () => {
      node.style.transition = '';
      node.style.opacity = '';
      node.style.transform = '';
    };

    // Park at the start values with transitions off, then arm the transition on
    // the next frame so the browser has a painted "from" state to interpolate.
    node.style.transition = 'none';
    node.style.opacity = String(fromOpacity);
    node.style.transform = `translateY(${fromOffsetPx}px)`;

    frame = requestAnimationFrame(() => {
      node.style.transition = `opacity ${durationMs}ms ease-out, transform ${durationMs}ms ease-out`;
      node.style.opacity = '1';
      node.style.transform = 'translateY(0px)';
      timeout = setTimeout(clearStyles, durationMs + 40);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      clearStyles();
    };
  }, [
    identity,
    enabled,
    prefersReducedMotion,
    fromOpacity,
    fromOffsetPx,
    durationMs,
  ]);

  return ref;
};
