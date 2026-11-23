import React, { useRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { useSwipeableScreens } from './useSwipeableScreens';
import {
  CAROUSEL_SETTLE_MS,
  SCREEN_DRAG_DURATION_ANIMATED,
  SCREEN_DRAG_DURATION_INSTANT,
  SCREEN_DRAG_DURATION_VAR,
  SLIDE_SETTLE_TRANSITION_SET,
} from '../utils/visuals/carouselLoop';
import {
  registerCarouselDragVarSink,
  resetCarouselDragVars,
} from '../utils/visuals/carouselDragVars';
import {
  resetMotionMode,
  setMotionMode,
} from '../utils/visuals/motionPreference';

const SCREEN_COUNT = 5;

const CarouselHarness = ({ onApi, initialScreen = 2 }) => {
  const viewportRef = useRef(null);
  const api = useSwipeableScreens(SCREEN_COUNT, viewportRef, initialScreen);

  onApi(api);

  return (
    <div ref={viewportRef} data-testid="viewport" {...api.handlers}>
      {Array.from({ length: SCREEN_COUNT }, (_, index) => (
        <div
          key={index}
          data-testid={`slide-${index}`}
          className="carousel-slide"
          {...api.getSlideProps(index)}
        />
      ))}
    </div>
  );
};

describe('useSwipeableScreens', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeAll(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterAll(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  afterEach(() => {
    resetMotionMode();
    resetCarouselDragVars();
    vi.useRealTimers();
  });

  it.each(['full', 'reduced', 'off'])(
    'keeps tab-switch settles smoothly animated when motion mode is %s',
    (mode) => {
      vi.useFakeTimers();
      setMotionMode(mode);

      const sink = document.createElement('div');
      const unregisterSink = registerCarouselDragVarSink(sink);

      let latestApi;
      const { getByTestId } = render(
        <CarouselHarness
          initialScreen={2}
          onApi={(api) => {
            latestApi = api;
          }}
        />
      );

      act(() => {
        latestApi.goToScreen(3);
      });

      // Non-teleporting slides receive the compositor settle transition and the
      // drag-linked chrome receives the matching settle duration.
      expect(getByTestId('slide-2').style.transition).toBe(
        SLIDE_SETTLE_TRANSITION_SET
      );
      expect(getByTestId('slide-3').style.transition).toBe(
        SLIDE_SETTLE_TRANSITION_SET
      );
      expect(sink.style.getPropertyValue(SCREEN_DRAG_DURATION_VAR)).toBe(
        SCREEN_DRAG_DURATION_ANIMATED
      );
      expect(latestApi.visibleScreen).toBe(3);

      // After the settle window lands, normalization writes instant resting state.
      act(() => {
        vi.advanceTimersByTime(CAROUSEL_SETTLE_MS + 50);
      });

      expect(latestApi.currentScreen).toBe(3);
      expect(sink.style.getPropertyValue(SCREEN_DRAG_DURATION_VAR)).toBe(
        SCREEN_DRAG_DURATION_INSTANT
      );

      unregisterSink();
    }
  );

  it.each(['reduced', 'off'])(
    'keeps finger-swipe release settles smoothly animated when motion mode is %s',
    (mode) => {
      vi.useFakeTimers();
      setMotionMode(mode);

      const sink = document.createElement('div');
      const unregisterSink = registerCarouselDragVarSink(sink);

      let latestApi;
      const { getByTestId } = render(
        <CarouselHarness
          initialScreen={2}
          onApi={(api) => {
            latestApi = api;
          }}
        />
      );

      const viewport = getByTestId('viewport');
      Object.defineProperty(viewport, 'clientWidth', {
        configurable: true,
        value: 400,
      });

      // Drag left past the threshold (25% of 400 = 100px) and release.
      act(() => {
        fireEvent.mouseDown(viewport, {
          button: 0,
          clientX: 300,
          clientY: 100,
        });
        fireEvent.mouseMove(viewport, { clientX: 160, clientY: 102 });
        vi.advanceTimersByTime(20);
      });

      expect(getByTestId('slide-2').style.transition).toBe('none');
      expect(sink.style.getPropertyValue(SCREEN_DRAG_DURATION_VAR)).toBe(
        SCREEN_DRAG_DURATION_INSTANT
      );

      act(() => {
        fireEvent.mouseUp(viewport);
      });

      // Releasing the drag must smoothly settle to the next screen instead of snapping.
      expect(latestApi.visibleScreen).toBe(3);
      expect(getByTestId('slide-2').style.transition).toBe(
        SLIDE_SETTLE_TRANSITION_SET
      );
      expect(getByTestId('slide-3').style.transition).toBe(
        SLIDE_SETTLE_TRANSITION_SET
      );
      expect(sink.style.getPropertyValue(SCREEN_DRAG_DURATION_VAR)).toBe(
        SCREEN_DRAG_DURATION_ANIMATED
      );

      act(() => {
        vi.advanceTimersByTime(CAROUSEL_SETTLE_MS + 50);
      });

      expect(latestApi.currentScreen).toBe(3);

      unregisterSink();
    }
  );
});
