import { useCallback, useMemo, useRef, useState, useEffect } from 'react';

const BASE_SWIPE_THRESHOLD = 130;

export const useSwipeableScreens = (
  totalScreens,
  viewportRef,
  initialScreen = 0
) => {
  const [currentScreen, setCurrentScreen] = useState(initialScreen);
  const [dragOffset, setDragOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1);
  const [viewportElement, setViewportElement] = useState(null);

  const swipeStartX = useRef(null);
  const swipeStartY = useRef(null);
  const isSwipeActive = useRef(false);
  const hasSwipeDirection = useRef(false);
  const readViewportWidth = useCallback(() => {
    const elementWidth = viewportRef.current?.clientWidth;
    if (Number.isFinite(elementWidth) && elementWidth > 0) {
      return elementWidth;
    }
    return viewportWidth || 1;
  }, [viewportRef, viewportWidth]);

  useEffect(() => {
    if (viewportRef.current && viewportRef.current !== viewportElement) {
      setViewportElement(viewportRef.current);
    }
  }, [viewportElement, viewportRef]);

  useEffect(() => {
    if (!viewportElement) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewportWidth(viewportElement.clientWidth || 1);

    const observer = new ResizeObserver(() => {
      setViewportWidth(viewportElement.clientWidth || 1);
    });
    observer.observe(viewportElement);

    return () => observer.disconnect();
  }, [viewportElement]);

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

    if (!hasSwipeDirection.current) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
        isSwipeActive.current = false;
        swipeStartX.current = null;
        swipeStartY.current = null;
        setIsSwiping(false);
        setDragOffset(0);
        return;
      }

      if (Math.abs(deltaX) > 12) {
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
