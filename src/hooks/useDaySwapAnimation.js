import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MOTION_MODES } from '../constants/appearance/motion';
import { getMotionMode } from '../utils/visuals/motionPreference';

export const DAY_SWAP_OUT_MS = 180;
export const DAY_SWAP_IN_MS = 320;
export const DAY_SWAP_OFFSET_PX = 16; // stays inside a card's padding
const OUT_EASING = 'cubic-bezier(0.32, 0, 0.67, 0)';
const IN_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

const movesBlocks = () => getMotionMode() === MOTION_MODES.FULL;

const canAnimate = () =>
  getMotionMode() !== MOTION_MODES.OFF &&
  typeof window.Element.prototype.animate === 'function';

// Reduced motion keeps the fade without the movement.
const frame = (opacity, shiftPx) =>
  movesBlocks()
    ? { opacity, transform: `translateX(${shiftPx}px)` }
    : { opacity };

// Where a block is right now, so an interrupted fade carries on from there.
const currentFrame = (block) => {
  const { opacity, transform } = window.getComputedStyle(block);
  return movesBlocks() ? { opacity, transform } : { opacity };
};

const getBlocks = (root) =>
  Array.from(root?.querySelectorAll('[data-day-swap]') ?? []);

const getResizeAreas = (root) =>
  Array.from(root?.querySelectorAll('[data-day-swap-resize]') ?? []);

// Eases each area from the old day's height to the new one's. An area is clipped
// only while it changes, so focus rings are never cut off at rest.
const resize = (areas, fromHeights, runningRef) => {
  runningRef.current.forEach((animation) => animation?.cancel?.());
  runningRef.current = [];
  areas.forEach((area) => {
    area.style.overflow = '';
    const from = fromHeights.get(area);
    // Natural height: nothing is animating it any more.
    const to = area.offsetHeight;
    if (!movesBlocks() || from === undefined || from === to) {
      return;
    }
    area.style.overflow = 'hidden';
    const animation = area.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: DAY_SWAP_IN_MS, easing: IN_EASING }
    );
    animation.onfinish = () => {
      area.style.overflow = '';
    };
    runningRef.current.push(animation);
  });
};

// Replaces whatever is running on the blocks. `from` is read before the old
// animations are cancelled.
const play = (blocks, runningRef, { from, to, ...options }) => {
  const starts = blocks.map(from);
  runningRef.current.forEach((animation) => animation?.cancel?.());
  runningRef.current = canAnimate()
    ? blocks.map((block, index) => block.animate([starts[index], to], options))
    : [];
};

const setTappable = (blocks, tappable) => {
  blocks.forEach((block) => {
    block.style.pointerEvents = tappable ? '' : 'none';
  });
};

/**
 * Swaps a screen's day-dependent blocks when the selected day changes: the old
 * day fades out, then the new one fades in. A later day moves right to left, an
 * earlier day left to right. Every element under `rootRef` that carries
 * `data-day-swap` takes part, and those blocks must render `shownDate`, which
 * trails `dateKey` until the old day has gone. An element marked
 * `data-day-swap-resize` also eases from the old day's height to the new one's.
 *
 * It animates the live elements (Web Animations API) instead of re-keying them,
 * so progress bars and rings inside still glide from the old value to the new
 * one. The blocks ignore taps while the old day is leaving. Reduced motion keeps
 * the fades without the movement or resizing; motion "off", or no Web Animations
 * API, swaps at once.
 *
 * @param {string} dateKey selected `YYYY-MM-DD`
 * @returns {{ rootRef: React.RefObject, shownDate: string }}
 */
export const useDaySwapAnimation = (dateKey) => {
  const rootRef = useRef(null);
  const [shownDate, setShownDate] = useState(dateKey);
  const enteredDateRef = useRef(dateKey);
  const latestDateRef = useRef(dateKey);
  const leaveTimerRef = useRef(null);
  const runningRef = useRef([]);
  const oldHeightsRef = useRef(new Map());
  const resizingRef = useRef([]);

  if (shownDate !== dateKey && !canAnimate()) {
    setShownDate(dateKey);
  }

  useLayoutEffect(() => {
    latestDateRef.current = dateKey;
    const blocks = getBlocks(rootRef.current);

    // The new day has just been rendered: bring it in.
    if (enteredDateRef.current !== shownDate) {
      const side = shownDate > enteredDateRef.current ? 1 : -1;
      enteredDateRef.current = shownDate;
      setTappable(blocks, true);
      const start = frame(0, side * DAY_SWAP_OFFSET_PX);
      play(blocks, runningRef, {
        from: () => start,
        to: frame(1, 0),
        duration: DAY_SWAP_IN_MS,
        easing: IN_EASING,
      });
      resize(
        getResizeAreas(rootRef.current),
        oldHeightsRef.current,
        resizingRef
      );
      oldHeightsRef.current = new Map();
    }

    const isLeaving = leaveTimerRef.current !== null;
    if (dateKey !== shownDate) {
      // Further taps while leaving only change which day arrives.
      if (isLeaving) {
        return;
      }
      const side = dateKey > shownDate ? -1 : 1;
      setTappable(blocks, false);
      play(blocks, runningRef, {
        from: currentFrame,
        to: frame(0, side * DAY_SWAP_OFFSET_PX),
        duration: DAY_SWAP_OUT_MS,
        easing: OUT_EASING,
        fill: 'forwards',
      });
      leaveTimerRef.current = setTimeout(() => {
        leaveTimerRef.current = null;
        // Measured last thing, while the old day is still on screen.
        oldHeightsRef.current = new Map(
          getResizeAreas(rootRef.current).map((area) => [
            area,
            area.offsetHeight,
          ])
        );
        setShownDate(latestDateRef.current);
      }, DAY_SWAP_OUT_MS);
    } else if (isLeaving) {
      // Back to the day still on screen before it had gone.
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
      setTappable(blocks, true);
      play(blocks, runningRef, {
        from: currentFrame,
        to: frame(1, 0),
        duration: DAY_SWAP_IN_MS,
        easing: IN_EASING,
      });
    }
  }, [dateKey, shownDate]);

  useEffect(
    () => () => {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    },
    []
  );

  return { rootRef, shownDate };
};
