import { useEffect } from 'react';
import { prefersReducedMotion } from '../utils/visuals/motionPreference';

/**
 * Smooths the jump a centred modal makes when the on-screen keyboard opens or
 * closes on a platform that RESIZES the window for it (Android `adjustResize`).
 *
 * The resize changes the modal's centring in a single frame, so the modal snaps.
 * The layout itself must stay exactly as the keyboard contract has it (the
 * platform owns it - no JS height writes, no viewport-delta heuristics), so this
 * does not touch layout: it lets the layout snap, then animates the modal from
 * where it WAS to where it now is (a FLIP). The animation is started inside the
 * `resize` event, which runs before the frame is painted, so the snapped position
 * is never shown.
 *
 * It animates the individual `translate` property, not `transform`: the sheet's
 * own entrance animation holds `transform` with a forwards fill, and a `transform`
 * animation here would fight it. `translate` composes with it.
 *
 * Only a viewport change that looks like a keyboard (height changed by a
 * keyboard-sized amount, width unchanged) is smoothed; a rotation is left alone.
 * A no-op where the Web Animations API is missing or under reduced motion.
 *
 * iOS does not resize the window - there the same keyboard change arrives as the
 * `--keyboard-inset` variable, and ModalShell smooths that with CSS transitions
 * on the centring padding and max-height instead.
 */
const KEYBOARD_MIN_VIEWPORT_DELTA_PX = 60;
const WIDTH_TOLERANCE_PX = 2;
const MIN_SHIFT_PX = 1;

export const KEYBOARD_GLIDE_MS = 280;
// Decelerating, like the platform keyboard's own slide.
export const KEYBOARD_GLIDE_EASING = 'cubic-bezier(0.25, 0.8, 0.25, 1)';

// `translate` is "none" or "<x> [<y>]" in px.
const readTranslateY = (element) => {
  const value = window.getComputedStyle(element).translate;
  if (!value || value === 'none') {
    return 0;
  }
  const y = parseFloat(value.split(/\s+/)[1] ?? '0');
  return Number.isFinite(y) ? y : 0;
};

/**
 * @param {object} args
 * @param {boolean} args.enabled only the centred (non-fullscreen) layout glides
 * @param {{ current: HTMLElement | null }} args.contentRef the modal sheet
 */
export const useKeyboardGlide = ({ enabled, contentRef }) => {
  useEffect(() => {
    const content = contentRef.current;
    if (
      !enabled ||
      !content ||
      typeof window === 'undefined' ||
      typeof content.animate !== 'function'
    ) {
      return undefined;
    }

    // `offsetTop` is the LAYOUT position inside the (fixed, inset-0) overlay: it
    // ignores transforms and animations, so it is correct even mid-entrance.
    let layoutTop = content.offsetTop;
    let viewport = { width: window.innerWidth, height: window.innerHeight };
    let glide = null;

    const handleResize = () => {
      const nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const looksLikeKeyboard =
        Math.abs(nextViewport.width - viewport.width) < WIDTH_TOLERANCE_PX &&
        Math.abs(nextViewport.height - viewport.height) >=
          KEYBOARD_MIN_VIEWPORT_DELTA_PX;

      // Where the user is looking right now: the old layout position plus any
      // glide still in flight (a keyboard can emit several resizes while it moves).
      const visibleBefore = layoutTop + readTranslateY(content);
      // Reading `offsetTop` forces layout at the new viewport size.
      const nextLayoutTop = content.offsetTop;
      const shift = visibleBefore - nextLayoutTop;

      layoutTop = nextLayoutTop;
      viewport = nextViewport;

      if (
        !looksLikeKeyboard ||
        Math.abs(shift) < MIN_SHIFT_PX ||
        prefersReducedMotion()
      ) {
        return;
      }

      glide?.cancel();
      glide = content.animate(
        [{ translate: `0 ${shift}px` }, { translate: '0 0' }],
        { duration: KEYBOARD_GLIDE_MS, easing: KEYBOARD_GLIDE_EASING }
      );
    };

    // The sheet can change size (a section expands) and so move without any
    // viewport change; keep the baseline honest so a later keyboard resize is
    // measured from where the sheet actually is.
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            layoutTop = content.offsetTop;
          })
        : null;
    observer?.observe(content);

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
      glide?.cancel();
    };
  }, [enabled, contentRef]);
};
