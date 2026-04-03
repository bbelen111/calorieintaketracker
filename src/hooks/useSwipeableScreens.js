import { useCallback, useMemo, useRef, useState, useEffect } from 'react';

const BASE_SWIPE_THRESHOLD = 130;
const SWIPE_DIRECTION_LOCK_THRESHOLD = 8;
const AXIS_DOMINANCE_RATIO = 1.15;

export const useSwipeableScreens = (
  totalScreens,
  viewportRef,
  initialScreen = 0
) => {
  const [currentScreen, setCurrentScreen] = useState(initialScreen);
  const [dragOffset, setDragOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1);
  const resizeFrameIdRef = useRef(null);

  const swipeStartX = useRef(null);
  const swipeStartY = useRef(null);
  const isSwipeActive = useRef(false);
  const hasSwipeDirection = useRef(false);
  const lockedAxis = useRef(null);
  const readViewportWidth = useCallback(() => {
    const elementWidth = viewportRef.current?.clientWidth;
    if (Number.isFinite(elementWidth) && elementWidth > 0) {
      return elementWidth;
    }
    return viewportWidth || 1;
  }, [viewportRef, viewportWidth]);

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

  const beginSwipe = useCallback(
    (clientX, clientY) => {
      const width = readViewportWidth();
      if (width !== viewportWidth) {
        setViewportWidth(width);
      }
      swipeStartX.current = clientX;
      swipeStartY.current = clientY;
      isSwipeActive.current = true;
      hasSwipeDirection.current = false;
      lockedAxis.current = null;
      setIsSwiping(false);
      setDragOffset(0);
    },
    [readViewportWidth, viewportWidth]
  );

  const updateSwipePosition = useCallback((clientX, clientY) => {
    if (!isSwipeActive.current || swipeStartX.current === null) return;

    const deltaX = clientX - swipeStartX.current;
    const startY = swipeStartY.current ?? clientY;
    const deltaY = clientY - startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (!lockedAxis.current) {
      if (
        absDeltaX < SWIPE_DIRECTION_LOCK_THRESHOLD &&
        absDeltaY < SWIPE_DIRECTION_LOCK_THRESHOLD
      ) {
        return;
      }

      if (absDeltaY > absDeltaX * AXIS_DOMINANCE_RATIO) {
        lockedAxis.current = 'y';
      } else if (absDeltaX > absDeltaY * AXIS_DOMINANCE_RATIO) {
        lockedAxis.current = 'x';
      } else {
        return;
      }
    }

    if (lockedAxis.current === 'y') {
      isSwipeActive.current = false;
      swipeStartX.current = null;
      swipeStartY.current = null;
      setIsSwiping(false);
      setDragOffset(0);
      return;
    }

    if (!hasSwipeDirection.current) {
      if (absDeltaX > 6) {
        hasSwipeDirection.current = true;
        setIsSwiping(true);
      } else {
        return;
      }
    }

    setDragOffset(deltaX);
  }, []);

  const finishSwipe = useCallback(() => {
    if (swipeStartX.current === null) {
      return;
    }

    if (hasSwipeDirection.current) {
      const width = viewportWidth || readViewportWidth();
      const threshold = width
        ? Math.min(width * 0.25, BASE_SWIPE_THRESHOLD)
        : BASE_SWIPE_THRESHOLD;
      const delta = dragOffset;

      if (delta < -threshold && currentScreen < totalScreens - 1) {
        setCurrentScreen((prev) => Math.min(prev + 1, totalScreens - 1));
      } else if (delta > threshold && currentScreen > 0) {
        setCurrentScreen((prev) => Math.max(prev - 1, 0));
      }
    }

    setDragOffset(0);
    setIsSwiping(false);
    isSwipeActive.current = false;
    hasSwipeDirection.current = false;
    lockedAxis.current = null;
    swipeStartX.current = null;
    swipeStartY.current = null;
  }, [
    currentScreen,
    dragOffset,
    readViewportWidth,
    totalScreens,
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
      if (lockedAxis.current === 'x' && event.cancelable) {
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
      if (!isSwipeActive.current && !hasSwipeDirection.current) return;
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
      const clampedIndex = Math.max(0, Math.min(index, totalScreens - 1));
      setCurrentScreen(clampedIndex);
      setDragOffset(0);
      setIsSwiping(false);
      isSwipeActive.current = false;
      hasSwipeDirection.current = false;
      lockedAxis.current = null;
      swipeStartX.current = null;
      swipeStartY.current = null;
    },
    [totalScreens]
  );

  const sliderStyle = useMemo(() => {
    const sliderTranslatePercent =
      -currentScreen * 100 + (dragOffset / viewportWidth) * 100;
    const sliderTransition = isSwiping
      ? 'none'
      : 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';

    return {
      transform: `translateX(${sliderTranslatePercent}%)`,
      transition: sliderTransition,
    };
  }, [currentScreen, dragOffset, isSwiping, viewportWidth]);

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
    dragOffset,
    isSwiping,
    goToScreen,
    sliderStyle,
    handlers,
  };
};
