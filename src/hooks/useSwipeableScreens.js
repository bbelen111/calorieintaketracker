import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CAROUSEL_SETTLE_MS,
  SCREEN_EDGE_PEEK_PX,
  alignPositionToReference,
  buildSlideTransform,
  carouselEase,
  normalizePosition,
  resolveCarouselStride,
  resolveSettleTarget,
  resolveShortestScreenDelta,
  resolveSlideOffsets,
} from '../utils/visuals/carouselLoop';

// Re-exported for callers that key off the peek geometry (hard sync point with
// `.carousel-slide` in index.css); the canonical definition lives in
// utils/visuals/carouselLoop.js.
export { SCREEN_EDGE_PEEK_PX };

const BASE_SWIPE_THRESHOLD = 130;
const SWIPE_DIRECTION_LOCK_THRESHOLD = 8;
const AXIS_DOMINANCE_RATIO = 1.15;
const MIN_SWIPE_DIRECTION_PX = 6;

/**
 * Looping, clone-free carousel for the five app screens.
 *
 * Every screen is rendered exactly once and positioned by its own wrapped
 * transform (see utils/visuals/carouselLoop.js), so the carousel loops in both
 * directions without duplicated slides, ghost cells or normalization timers.
 * The position is a single continuous, unbounded value; normalizing it after a
 * wrap is invisible because the transforms are periodic.
 *
 * All motion (drag frames and settles) is written imperatively to the slide
 * elements — never through React style props and never through a CSS
 * transition. That keeps drags free of React re-renders and removes the class
 * of bug where a stranded inline `transition: none` (left behind by a gesture
 * that never advanced `isSwiping`, e.g. a vertical scroll) made the next
 * programmatic navigation snap instead of slide.
 */
export const useSwipeableScreens = (
  totalScreens,
  viewportRef,
  initialScreen = 0
) => {
  const screenCount = Math.max(Math.floor(Number(totalScreens)) || 0, 1);
  const clampedInitialScreen = Math.max(
    0,
    Math.min(Math.round(Number(initialScreen) || 0), screenCount - 1)
  );

  const [currentScreen, setCurrentScreen] = useState(clampedInitialScreen);
  const [isSwiping, setIsSwiping] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1);

  const resizeFrameIdRef = useRef(null);
  const swipeFrameIdRef = useRef(null);
  const settleFrameIdRef = useRef(null);
  const settleStateRef = useRef(null);
  const slideElementsRef = useRef([]);
  const positionRef = useRef(clampedInitialScreen + 1);
  const pendingPositionRef = useRef(clampedInitialScreen + 1);
  const dragStartPositionRef = useRef(clampedInitialScreen + 1);
  const restPositionRef = useRef(clampedInitialScreen + 1);
  const gestureRef = useRef({
    startX: null,
    startY: null,
    isActive: false,
    hasDirection: false,
    lockedAxis: null,
  });

  const publishProgress = useCallback(
    (position) => {
      // Progress is clamped to the tab range on purpose: during a wrap drag the
      // affordance UI pins at the end it is leaving, then glides to the wrapped
      // tab once the settle normalizes the position.
      const clamped = Math.max(0, Math.min(position - 1, screenCount - 1));
      document.documentElement.style.setProperty(
        '--screen-drag-progress',
        clamped.toFixed(4)
      );
    },
    [screenCount]
  );

  const writeSlideTransforms = useCallback(
    (position) => {
      const offsets = resolveSlideOffsets(position, screenCount);

      for (let index = 0; index < screenCount; index += 1) {
        const element = slideElementsRef.current[index];
        if (element) {
          element.style.transform = buildSlideTransform(offsets[index], index);
        }
      }
    },
    [screenCount]
  );

  const commitPosition = useCallback(
    (position, { publish = true } = {}) => {
      positionRef.current = position;
      writeSlideTransforms(position);

      if (publish) {
        publishProgress(position);
      }
    },
    [publishProgress, writeSlideTransforms]
  );

  const slideRefCallbacks = useMemo(
    () =>
      Array.from({ length: screenCount }, (_, index) => (node) => {
        slideElementsRef.current[index] = node;
        if (!node) {
          return;
        }

        // Refs commit before paint, so this first write prevents a flash of the
        // un-shifted flex layout on mount.
        const offsets = resolveSlideOffsets(positionRef.current, screenCount);
        node.style.transform = buildSlideTransform(offsets[index], index);
      }),
    [screenCount]
  );

  const getSlideProps = useCallback(
    (index) => ({ ref: slideRefCallbacks[index] }),
    [slideRefCallbacks]
  );

  const cancelSettleAnimation = useCallback(() => {
    if (settleFrameIdRef.current != null) {
      window.cancelAnimationFrame(settleFrameIdRef.current);
      settleFrameIdRef.current = null;
    }
    settleStateRef.current = null;
  }, []);

  // Wrapped normalization rewrites byte-identical transforms, so applying it at
  // the end of a wrap settle is invisible on screen — it only re-syncs the React
  // screen state (fade masks, tab pill, header dots, hardware-back logic).
  const applyNormalizedPosition = useCallback(
    (position) => {
      const normalized = normalizePosition(position, screenCount);
      commitPosition(normalized.position);
      setCurrentScreen((previousScreen) =>
        previousScreen === normalized.screenIndex
          ? previousScreen
          : normalized.screenIndex
      );
      return normalized.screenIndex;
    },
    [commitPosition, screenCount]
  );

  // Single rAF settle used by both swipe releases and programmatic navigation.
  // It always starts from the live position, so an interrupted settle simply
  // hands its momentum to the new target.
  const runSettleAnimation = useCallback(
    (targetPosition, { fromPosition } = {}) => {
      cancelSettleAnimation();

      const startPosition = Number.isFinite(fromPosition)
        ? fromPosition
        : positionRef.current;

      if (
        !Number.isFinite(startPosition) ||
        Math.abs(targetPosition - startPosition) < 0.0005
      ) {
        applyNormalizedPosition(targetPosition);
        return false;
      }

      const startedAt = window.performance.now();
      settleStateRef.current = { startPosition, targetPosition, startedAt };

      const step = () => {
        settleFrameIdRef.current = null;
        const state = settleStateRef.current;
        if (!state) {
          return;
        }

        const elapsed = window.performance.now() - state.startedAt;
        const progress = Math.min(elapsed / CAROUSEL_SETTLE_MS, 1);

        if (progress >= 1) {
          settleStateRef.current = null;
          applyNormalizedPosition(state.targetPosition);
          return;
        }

        const eased = carouselEase(progress);
        commitPosition(
          state.startPosition +
            (state.targetPosition - state.startPosition) * eased
        );
        settleFrameIdRef.current = window.requestAnimationFrame(step);
      };

      settleFrameIdRef.current = window.requestAnimationFrame(step);
      return true;
    },
    [applyNormalizedPosition, cancelSettleAnimation, commitPosition]
  );

  const cancelPendingDragFrame = useCallback(() => {
    if (swipeFrameIdRef.current != null) {
      window.cancelAnimationFrame(swipeFrameIdRef.current);
      swipeFrameIdRef.current = null;
    }
  }, []);

  const queueDragPosition = useCallback(
    (nextPosition) => {
      pendingPositionRef.current = nextPosition;

      if (swipeFrameIdRef.current != null) {
        return;
      }

      swipeFrameIdRef.current = window.requestAnimationFrame(() => {
        swipeFrameIdRef.current = null;
        commitPosition(pendingPositionRef.current);
      });
    },
    [commitPosition]
  );

  const getLatestPosition = useCallback(
    () =>
      swipeFrameIdRef.current != null
        ? pendingPositionRef.current
        : positionRef.current,
    []
  );

  const readViewportWidth = useCallback(() => {
    const elementWidth = viewportRef.current?.clientWidth;
    if (Number.isFinite(elementWidth) && elementWidth > 0) {
      return elementWidth;
    }
    return viewportWidth || 1;
  }, [viewportRef, viewportWidth]);

  // Keep the swipe-affordance custom property in sync after screen changes,
  // hydration and resizes. Only the custom property is published here — slide
  // transforms stay imperative-only so this can never fight a drag frame.
  useEffect(() => {
    publishProgress(positionRef.current);
  }, [publishProgress, currentScreen, viewportWidth]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const syncViewportWidth = () => {
      const nextWidth = element.clientWidth || 1;
      setViewportWidth((previousWidth) =>
        previousWidth === nextWidth ? previousWidth : nextWidth
      );
    };

    syncViewportWidth();

    const queueSyncViewportWidth = () => {
      if (resizeFrameIdRef.current != null) {
        return;
      }

      resizeFrameIdRef.current = window.requestAnimationFrame(() => {
        resizeFrameIdRef.current = null;
        syncViewportWidth();
      });
    };

    const observer = new ResizeObserver(queueSyncViewportWidth);
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (resizeFrameIdRef.current != null) {
        window.cancelAnimationFrame(resizeFrameIdRef.current);
        resizeFrameIdRef.current = null;
      }
    };
  }, [viewportRef]);

  useEffect(
    () => () => {
      cancelPendingDragFrame();
      cancelSettleAnimation();
    },
    [cancelPendingDragFrame, cancelSettleAnimation]
  );

  const beginSwipe = useCallback(
    (clientX, clientY) => {
      // Take over any in-flight settle from its live position. Note there is no
      // style write here at all: starting a gesture must never mutate the slide
      // styles (that is what used to strand `transition: none` on the track).
      cancelPendingDragFrame();
      cancelSettleAnimation();

      const width = readViewportWidth();
      if (width !== viewportWidth) {
        setViewportWidth(width);
      }

      const livePosition = positionRef.current;
      gestureRef.current = {
        startX: clientX,
        startY: clientY,
        isActive: true,
        hasDirection: false,
        lockedAxis: null,
      };
      dragStartPositionRef.current = livePosition;
      // Keep the rest position in the live position's period (an interrupted
      // wrap settle can sit at e.g. 6.2 -> rest 6, not 1) so the release
      // animation always travels the short way.
      restPositionRef.current = alignPositionToReference(
        normalizePosition(livePosition, screenCount).position,
        livePosition,
        screenCount
      );
      pendingPositionRef.current = livePosition;
      setIsSwiping(false);
    },
    [
      cancelPendingDragFrame,
      cancelSettleAnimation,
      readViewportWidth,
      screenCount,
      viewportWidth,
    ]
  );

  const updateSwipePosition = useCallback(
    (clientX, clientY) => {
      const gesture = gestureRef.current;
      if (!gesture.isActive || gesture.startX === null) return;

      const deltaX = clientX - gesture.startX;
      const startY = gesture.startY ?? clientY;
      const deltaY = clientY - startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (!gesture.lockedAxis) {
        if (
          absDeltaX < SWIPE_DIRECTION_LOCK_THRESHOLD &&
          absDeltaY < SWIPE_DIRECTION_LOCK_THRESHOLD
        ) {
          return;
        }

        if (absDeltaY > absDeltaX * AXIS_DOMINANCE_RATIO) {
          gesture.lockedAxis = 'y';
        } else if (absDeltaX > absDeltaY * AXIS_DOMINANCE_RATIO) {
          gesture.lockedAxis = 'x';
        } else {
          return;
        }
      }

      if (gesture.lockedAxis === 'y') {
        // Vertical scrolling wins: abandon the gesture and re-sync the carousel
        // to its rest screen (also repairs the screen state if a settle was
        // interrupted mid-flight) without ever touching CSS transitions.
        gesture.isActive = false;
        gesture.hasDirection = false;
        gesture.startX = null;
        gesture.startY = null;
        setIsSwiping(false);
        applyNormalizedPosition(restPositionRef.current);
        return;
      }

      if (!gesture.hasDirection) {
        if (absDeltaX > MIN_SWIPE_DIRECTION_PX) {
          gesture.hasDirection = true;
          setIsSwiping(true);
        } else {
          return;
        }
      }

      const stride = resolveCarouselStride(
        viewportWidth || readViewportWidth()
      );
      queueDragPosition(dragStartPositionRef.current - deltaX / stride);
    },
    [
      applyNormalizedPosition,
      queueDragPosition,
      readViewportWidth,
      viewportWidth,
    ]
  );

  const finishSwipe = useCallback(() => {
    const gesture = gestureRef.current;
    if (gesture.startX === null) {
      return;
    }

    const hadDirection = gesture.hasDirection;
    gesture.isActive = false;
    gesture.hasDirection = false;
    gesture.lockedAxis = null;
    gesture.startX = null;
    gesture.startY = null;
    setIsSwiping(false);

    // Decide the target screen, then settle imperatively with rAF from the live
    // dragged position — accepted swipes glide on, rejected swipes glide back,
    // and drags of a full slide or more land where the finger left them.
    const width = viewportWidth || readViewportWidth();
    const stride = resolveCarouselStride(width);
    const thresholdPx = width
      ? Math.min(width * 0.25, BASE_SWIPE_THRESHOLD)
      : BASE_SWIPE_THRESHOLD;
    const { targetPosition } = resolveSettleTarget({
      position: hadDirection ? getLatestPosition() : restPositionRef.current,
      restPosition: restPositionRef.current,
      thresholdSlides: Math.min(thresholdPx / stride, 0.5),
      totalScreens: screenCount,
    });

    runSettleAnimation(targetPosition);
  }, [
    getLatestPosition,
    readViewportWidth,
    runSettleAnimation,
    screenCount,
    viewportWidth,
  ]);

  const handleTouchStart = useCallback(
    (event) => {
      if (event.touches.length === 0) return;
      const touch = event.touches[0];
      beginSwipe(touch.clientX, touch.clientY);
    },
    [beginSwipe]
  );

  const handleTouchMove = useCallback(
    (event) => {
      if (event.touches.length === 0) return;
      const touch = event.touches[0];
      updateSwipePosition(touch.clientX, touch.clientY);

      // Lock vertical page scrolling once horizontal swipe intent is confirmed.
      // This creates symmetrical axis behavior with the existing vertical-first
      // cancellation logic.
      if (gestureRef.current.lockedAxis === 'x' && event.cancelable) {
        event.preventDefault();
      }
    },
    [updateSwipePosition]
  );

  const handleTouchEnd = useCallback(() => {
    finishSwipe();
  }, [finishSwipe]);

  const handleMouseDown = useCallback(
    (event) => {
      if (event.button !== 0) return;
      beginSwipe(event.clientX, event.clientY);
    },
    [beginSwipe]
  );

  const handleMouseMove = useCallback(
    (event) => {
      if (!gestureRef.current.isActive && !gestureRef.current.hasDirection) {
        return;
      }
      updateSwipePosition(event.clientX, event.clientY);
    },
    [updateSwipePosition]
  );

  const handleMouseUp = useCallback(() => {
    finishSwipe();
  }, [finishSwipe]);

  const handleMouseLeave = useCallback(() => {
    finishSwipe();
  }, [finishSwipe]);

  const goToScreen = useCallback(
    (index) => {
      const targetScreen = Math.max(
        0,
        Math.min(Math.round(Number(index) || 0), screenCount - 1)
      );
      const livePosition = positionRef.current;
      const rest = normalizePosition(livePosition, screenCount);
      const delta = resolveShortestScreenDelta(
        rest.screenIndex,
        targetScreen,
        screenCount
      );
      // Same period as the live position so the tick always animates the short
      // way (a tab tap during a wrap settle must not spin the whole track).
      const restInPeriod = alignPositionToReference(
        rest.position,
        livePosition,
        screenCount
      );

      cancelPendingDragFrame();
      cancelSettleAnimation();
      gestureRef.current = {
        startX: null,
        startY: null,
        isActive: false,
        hasDirection: false,
        lockedAxis: null,
      };
      setIsSwiping(false);

      if (delta === 0) {
        runSettleAnimation(restInPeriod);
        return;
      }

      // Update the fade masks / affordances immediately (as before), while the
      // slides themselves glide from the live position via the rAF settle.
      // Tab taps travel the wrapped way around: 4 -> 0 is one screen forward.
      setCurrentScreen(targetScreen);
      runSettleAnimation(restInPeriod + delta);
    },
    [
      cancelPendingDragFrame,
      cancelSettleAnimation,
      runSettleAnimation,
      screenCount,
    ]
  );

  const handlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseLeave,
  };

  return {
    currentScreen,
    isSwiping,
    goToScreen,
    getSlideProps,
    handlers,
  };
};
