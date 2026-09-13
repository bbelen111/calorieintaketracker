import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CAROUSEL_SETTLE_MS,
  SCREEN_DRAG_DURATION_ANIMATED,
  SCREEN_DRAG_DURATION_INSTANT,
  SCREEN_DRAG_DURATION_VAR,
  SCREEN_DRAG_PROGRESS_VAR,
  SCREEN_EDGE_PEEK_PX,
  SLIDE_FADE_LEFT_VAR,
  SLIDE_FADE_RIGHT_VAR,
  SLIDE_SETTLE_TRANSITION_SET,
  alignPositionToReference,
  buildSlideTransform,
  isSlideTeleport,
  normalizePosition,
  resolveCarouselStride,
  resolveSettlePositionAt,
  resolveSettleTarget,
  resolveShortestScreenDelta,
  resolveSlideFadeStrengths,
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

// A settle is landed (normalized) shortly after its CSS transition should have
// finished; `transitionend` is the fast path when the browser reports it.
const SETTLE_FINALIZE_BUFFER_MS = 40;
// A foreign or stale `transitionend` must never land an animation early.
const SETTLE_FINALIZE_EARLY_TOLERANCE_MS = 40;

const measureElementWidth = (element) => {
  const width = element?.clientWidth;
  return Number.isFinite(width) && width > 0 ? width : 0;
};

// Edge-fade strengths are quantized before they are written: the ramp is 20px
// wide, so 1/50 steps move it by 0.4px — visually continuous while keeping the
// mask invalidation off the hot path for slides that are not moving.
const FADE_QUANTIZATION_STEPS = 50;

const quantizeFade = (value) =>
  Math.round(value * FADE_QUANTIZATION_STEPS) / FADE_QUANTIZATION_STEPS;

const shouldAnimateSettle = () => {
  if (typeof window.matchMedia !== 'function') {
    return true;
  }

  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

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
 * elements — never through React style props. Drag frames are px `translate3d`
 * writes throttled with rAF; settles are a CSS transition
 * (`SLIDE_SETTLE_TRANSITION`) written onto the slides so they run on the
 * compositor thread. A JS/rAF settle is exposed to every main-thread stall
 * (React renders, `:root` custom-property style recalc, paint), which is plainly
 * visible on a 120Hz panel.
 *
 * Every write pairs its `transition` with its `transform`, so no code path can
 * strand a `transition: none` — that stranded transition (left behind by a
 * gesture that never advanced `isSwiping`, e.g. a vertical scroll) was what made
 * the next programmatic navigation snap instead of slide.
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
  // Optimistic display screen: flips the moment a settle's *target* is known
  // (swipe release, tab tap) instead of when the settle normalizes ~350ms later,
  // so the header stat line and the tab icon colours respond immediately. The
  // `currentScreen` state above stays the committed screen (rest position and
  // hardware-back semantics).
  const [visibleScreen, setVisibleScreen] = useState(clampedInitialScreen);
  const [isSwiping, setIsSwiping] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1);

  const resizeFrameIdRef = useRef(null);
  const swipeFrameIdRef = useRef(null);
  const settleTimerIdRef = useRef(null);
  const settleTokenRef = useRef(0);
  const settleStateRef = useRef(null);
  const slideElementsRef = useRef([]);
  const slideOffsetsRef = useRef([]);
  const slideFadeRef = useRef([]);
  const positionRef = useRef(clampedInitialScreen + 1);
  const pendingPositionRef = useRef(clampedInitialScreen + 1);
  const dragStartPositionRef = useRef(clampedInitialScreen + 1);
  const restPositionRef = useRef(clampedInitialScreen + 1);
  // Cached viewport width, used **only** by the drag/settle math (converting
  // finger px into slide units and the swipe threshold). Slide transforms never
  // read it — they are percentage-based and self-correct on any resize. Only a
  // real measurement is ever cached, so a not-yet-laid-out viewport cannot
  // poison the stride the way a `1px` fallback did (which froze every slide
  // within a couple of px and looked like a dead carousel).
  const viewportWidthRef = useRef(0);

  // Returns 0 (never a guess) when the viewport is not measurable yet.
  const resolveViewportWidth = useCallback(() => {
    const cached = viewportWidthRef.current;
    if (cached > 0) {
      return cached;
    }

    const measured = measureElementWidth(viewportRef.current);
    if (measured > 0) {
      viewportWidthRef.current = measured;
    }
    return measured;
  }, [viewportRef]);
  const gestureRef = useRef({
    startX: null,
    startY: null,
    isActive: false,
    hasDirection: false,
    lockedAxis: null,
  });

  const publishProgress = useCallback((position, { animate = false } = {}) => {
    // The published value is the *1-based, unclamped* carousel position. The
    // tab-bar pill and the header dot are ring affordances (three copies each,
    // see RING_COPY_OFFSETS), so a loop-seam crossing must be free to glide one
    // copy off the end of the track while the next enters from the other end.
    // Clamping here (and swapping at normalize) is what made a wrap jump.
    const value = Number.isFinite(position) ? position : 1;
    const root = document.documentElement.style;
    root.setProperty(SCREEN_DRAG_PROGRESS_VAR, value.toFixed(4));
    // The shell owns the affordances' transition duration so they follow the
    // finger (0s), glide in lockstep with the slides on a settle, or jump
    // instantly when a wrap normalizes — the ring copies land on byte-identical
    // positions there, so that swap must not animate.
    root.setProperty(
      SCREEN_DRAG_DURATION_VAR,
      animate ? SCREEN_DRAG_DURATION_ANIMATED : SCREEN_DRAG_DURATION_INSTANT
    );
  }, []);

  const writeSlideTransforms = useCallback(
    (position, { animate = false } = {}) => {
      const offsets = resolveSlideOffsets(position, screenCount);
      const transition = animate ? SLIDE_SETTLE_TRANSITION_SET : 'none';

      for (let index = 0; index < screenCount; index += 1) {
        const element = slideElementsRef.current[index];
        if (!element) {
          continue;
        }

        const offset = offsets[index];
        const teleport = isSlideTeleport(
          slideOffsetsRef.current[index],
          offset,
          screenCount
        );

        // `transition` and `transform` are always written together, in one task,
        // on every path (mount, drag frame, settle, normalize, resize). That
        // keeps the browser's "after-change style" authoritative: an animated
        // write animates, an instant write lands immediately, and no path can
        // strand a `transition: none` (which used to make the next tab tap
        // snap). A slide that is teleporting to the other side of the ring is
        // written without a transition so it can never sweep across the screen.
        element.style.transition = teleport ? 'none' : transition;
        element.style.transform = buildSlideTransform(offset, index);

        // Edge alpha ramp. The mask geometry is permanent in CSS and only its
        // *strength* moves, so the ramp retracts with the slide instead of being
        // toggled as a class — toggling is what made the peek fades pop. The
        // strengths are quantized and only written when they actually change, so
        // a still slide costs nothing per frame.
        const strengths = resolveSlideFadeStrengths(offset);
        const left = quantizeFade(strengths.left);
        const right = quantizeFade(strengths.right);
        const previous = slideFadeRef.current[index];

        if (!previous || previous.left !== left || previous.right !== right) {
          element.style.setProperty(SLIDE_FADE_LEFT_VAR, String(left));
          element.style.setProperty(SLIDE_FADE_RIGHT_VAR, String(right));
          slideFadeRef.current[index] = { left, right };
        }

        slideOffsetsRef.current[index] = offset;
      }
    },
    [screenCount]
  );

  const commitPosition = useCallback(
    (position, { publish = true, animate = false } = {}) => {
      positionRef.current = position;
      writeSlideTransforms(position, { animate });

      if (publish) {
        publishProgress(position, { animate });
      }
    },
    [publishProgress, writeSlideTransforms]
  );

  const slideRefCallbacks = useMemo(
    () =>
      Array.from({ length: screenCount }, (_, index) => (node) => {
        slideElementsRef.current[index] = node;
        slideFadeRef.current[index] = null;
        if (!node) {
          return;
        }

        // Refs commit before paint, so this first write (instant, no transition)
        // prevents a flash of the un-shifted flex layout on mount. It needs no
        // viewport measurement: the percentage transform is stride-agnostic.
        const offsets = resolveSlideOffsets(positionRef.current, screenCount);
        const strengths = resolveSlideFadeStrengths(offsets[index]);
        node.style.transition = 'none';
        node.style.transform = buildSlideTransform(offsets[index], index);
        node.style.setProperty(
          SLIDE_FADE_LEFT_VAR,
          String(quantizeFade(strengths.left))
        );
        node.style.setProperty(
          SLIDE_FADE_RIGHT_VAR,
          String(quantizeFade(strengths.right))
        );
        slideOffsetsRef.current[index] = offsets[index];
        slideFadeRef.current[index] = {
          left: quantizeFade(strengths.left),
          right: quantizeFade(strengths.right),
        };
      }),
    [screenCount]
  );

  const getSlideProps = useCallback(
    (index) => ({ ref: slideRefCallbacks[index] }),
    [slideRefCallbacks]
  );

  const cancelSettleAnimation = useCallback(() => {
    // Token bump invalidates any pending timer / transitionend fast path.
    settleTokenRef.current += 1;

    if (settleTimerIdRef.current != null) {
      window.clearTimeout(settleTimerIdRef.current);
      settleTimerIdRef.current = null;
    }
    settleStateRef.current = null;
  }, []);

  // Wrapped normalization rewrites byte-identical transforms, so applying it at
  // the end of a wrap settle is invisible on screen — it only re-syncs the React
  // screen state (fade masks, tab pill, header dots, hardware-back logic).
  const applyNormalizedPosition = useCallback(
    (position) => {
      const normalized = normalizePosition(position, screenCount);
      // Byte-identical transforms (the loop is periodic) written without a
      // transition, and the affordances are published instantly too, so a seam
      // crossing swaps the tab pill / header dot onto the wrapped tab instead of
      // animating backwards across every tab.
      commitPosition(normalized.position, { animate: false, publish: false });
      publishProgress(normalized.position, { animate: false });
      setCurrentScreen((previousScreen) =>
        previousScreen === normalized.screenIndex
          ? previousScreen
          : normalized.screenIndex
      );
      return normalized.screenIndex;
    },
    [commitPosition, publishProgress, screenCount]
  );

  // Lands the in-flight settle: normalize the position (transforms are periodic,
  // so this writes byte-identical values) and let the affordances swap if the
  // settle crossed the loop seam. Token-guarded, so a stale timer or a
  // `transitionend` from an older animation can never land a newer one.
  const finalizeSettle = useCallback(
    (token) => {
      if (token !== settleTokenRef.current) {
        return;
      }

      const state = settleStateRef.current;
      settleStateRef.current = null;

      if (settleTimerIdRef.current != null) {
        window.clearTimeout(settleTimerIdRef.current);
        settleTimerIdRef.current = null;
      }

      if (!state) {
        return;
      }

      applyNormalizedPosition(state.targetPosition);
    },
    [applyNormalizedPosition]
  );

  // Settle used by both swipe releases and programmatic navigation. It is a
  // single CSS transition write per slide — the browser animates on the
  // compositor thread, so React renders, style recalc and paint can no longer
  // stutter it (the regression a 120Hz panel exposed). No rAF loop runs here.
  const settleTo = useCallback(
    (targetPosition) => {
      cancelSettleAnimation();

      const startPosition = positionRef.current;
      const target = Number.isFinite(targetPosition)
        ? targetPosition
        : startPosition;

      if (
        !Number.isFinite(startPosition) ||
        Math.abs(target - startPosition) < 0.0005
      ) {
        applyNormalizedPosition(target);
        return false;
      }

      const token = settleTokenRef.current;
      const animate = shouldAnimateSettle();

      settleStateRef.current = {
        startPosition,
        targetPosition: target,
        startedAt: window.performance.now(),
      };

      commitPosition(target, { animate });

      if (!animate) {
        finalizeSettle(token);
        return true;
      }

      settleTimerIdRef.current = window.setTimeout(() => {
        settleTimerIdRef.current = null;
        finalizeSettle(token);
      }, CAROUSEL_SETTLE_MS + SETTLE_FINALIZE_BUFFER_MS);

      return true;
    },
    [
      applyNormalizedPosition,
      cancelSettleAnimation,
      commitPosition,
      finalizeSettle,
    ]
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

  // Live position part-way through a settle. The CSS transition and this helper
  // share one duration and curve, so the value is exactly what is on screen — an
  // interrupted settle hands its position to the finger (or a tab tap) with no
  // DOM measurement and no per-frame loop.
  const resolveInterruptedPosition = useCallback(() => {
    const state = settleStateRef.current;
    if (!state) {
      return positionRef.current;
    }

    return resolveSettlePositionAt({
      fromPosition: state.startPosition,
      toPosition: state.targetPosition,
      startedAt: state.startedAt,
      now: window.performance.now(),
      durationMs: CAROUSEL_SETTLE_MS,
    });
  }, []);

  // Keep the swipe-affordance custom property in sync after screen changes,
  // hydration and resizes. Only the custom property is published here — slide
  // transforms stay imperative-only so this can never fight a drag frame.
  useEffect(() => {
    // Resync the affordances after hydration / screen changes / resizes — but
    // never while a drag or a settle owns the position, or the pill would be
    // re-targeted mid-animation (which made the nav bar look mushy).
    if (gestureRef.current.hasDirection || settleStateRef.current) {
      return;
    }

    publishProgress(positionRef.current, { animate: false });
  }, [publishProgress, currentScreen, viewportWidth]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const syncViewportWidth = () => {
      const measured = measureElementWidth(element);
      if (measured === 0) {
        // Not laid out yet: learn nothing rather than caching a bogus width.
        return;
      }

      const changed = measured !== viewportWidthRef.current;
      viewportWidthRef.current = measured;
      setViewportWidth((previousWidth) =>
        previousWidth === measured ? previousWidth : measured
      );

      if (!changed) {
        return;
      }

      // Slide transforms are percentage-based, so a resize needs no transform
      // rewrite; only the drag-linked affordances are re-synced, and only when
      // nothing else owns the position.
      if (!gestureRef.current.hasDirection && !settleStateRef.current) {
        publishProgress(positionRef.current, { animate: false });
      }
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
  }, [publishProgress, viewportRef]);

  // Fast path out of a settle: every animated slide shares one duration and start
  // frame, so the first transform `transitionend` means the animation is done.
  // The timer remains the fallback (it also covers reduced-motion settles).
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return undefined;
    }

    const handleTransitionEnd = (event) => {
      if (event.propertyName !== 'transform') return;
      if (!slideElementsRef.current.includes(event.target)) return;

      const state = settleStateRef.current;
      if (!state) return;

      const elapsed = window.performance.now() - state.startedAt;
      if (elapsed < CAROUSEL_SETTLE_MS - SETTLE_FINALIZE_EARLY_TOLERANCE_MS) {
        return;
      }

      finalizeSettle(settleTokenRef.current);
    };

    element.addEventListener('transitionend', handleTransitionEnd);
    return () =>
      element.removeEventListener('transitionend', handleTransitionEnd);
  }, [finalizeSettle, viewportRef]);

  useEffect(
    () => () => {
      cancelPendingDragFrame();
      cancelSettleAnimation();
    },
    [cancelPendingDragFrame, cancelSettleAnimation]
  );

  const beginSwipe = useCallback(
    (clientX, clientY) => {
      // Take over any in-flight settle from the position it is actually showing
      // (derived from the settle's own clock, so no DOM measurement), then freeze
      // it with an instant write. Every write pairs its transition with its
      // transform, so nothing can be stranded for the next navigation.
      const livePosition = resolveInterruptedPosition();
      cancelPendingDragFrame();
      cancelSettleAnimation();

      const width = resolveViewportWidth();
      if (width > 0 && width !== viewportWidth) {
        setViewportWidth(width);
      }

      commitPosition(livePosition, { animate: false });

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
      commitPosition,
      resolveInterruptedPosition,
      resolveViewportWidth,
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
        // Vertical scrolling wins: abandon the gesture and glide the carousel
        // back to its rest screen (which also completes a settle this touch
        // interrupted). Instant when the carousel is already at rest.
        gesture.isActive = false;
        gesture.hasDirection = false;
        gesture.startX = null;
        gesture.startY = null;
        setIsSwiping(false);
        cancelPendingDragFrame();
        settleTo(restPositionRef.current);
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

      // The viewport must be measurable before finger px can be converted into
      // slide units. A bogus stride here is what made the carousel look dead, so
      // an unmeasurable viewport skips the frame instead of moving wildly.
      const width = resolveViewportWidth();
      if (width === 0) {
        return;
      }

      const stride = resolveCarouselStride(width);
      queueDragPosition(dragStartPositionRef.current - deltaX / stride);
    },
    [cancelPendingDragFrame, queueDragPosition, resolveViewportWidth, settleTo]
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

    // Decide the target screen, then settle from the live dragged position —
    // accepted swipes glide on, rejected swipes glide back, and drags of a full
    // slide or more land where the finger left them. The pending drag frame is
    // dropped after reading its value so it cannot overwrite the settle.
    const width = resolveViewportWidth();
    if (width === 0) {
      // No measurable viewport: treat the release as a rejected swipe.
      cancelPendingDragFrame();
      settleTo(restPositionRef.current);
      return;
    }

    const stride = resolveCarouselStride(width);
    const thresholdPx = Math.min(width * 0.25, BASE_SWIPE_THRESHOLD);
    const { targetPosition, screenIndex } = resolveSettleTarget({
      position: hadDirection ? getLatestPosition() : restPositionRef.current,
      restPosition: restPositionRef.current,
      thresholdSlides: Math.min(thresholdPx / stride, 0.5),
      totalScreens: screenCount,
    });

    // The chrome (header stat line, tab icon colours) presents the destination
    // the instant the release commits it, rather than waiting ~350ms for the
    // settle to normalize.
    setVisibleScreen(screenIndex);

    cancelPendingDragFrame();
    settleTo(targetPosition);
  }, [
    cancelPendingDragFrame,
    getLatestPosition,
    resolveViewportWidth,
    screenCount,
    settleTo,
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
      // Plan from the position the user is actually looking at: a settle already
      // in flight is interrupted at its live (clock-derived) position.
      const livePosition = resolveInterruptedPosition();
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
      // Freeze the running animation on the frame it is showing before replanning.
      commitPosition(livePosition, { animate: false });

      // The chrome presents the destination immediately; the slides and the ring
      // affordances glide there over the settle, and the icon colour /
      // mask fades share that clock.
      setVisibleScreen(targetScreen);

      if (delta === 0) {
        settleTo(restInPeriod);
        return;
      }

      settleTo(restInPeriod + delta);
    },
    [
      cancelPendingDragFrame,
      cancelSettleAnimation,
      commitPosition,
      resolveInterruptedPosition,
      screenCount,
      settleTo,
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
    visibleScreen,
    isSwiping,
    goToScreen,
    getSlideProps,
    handlers,
  };
};
