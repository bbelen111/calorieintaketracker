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
  SCREEN_DRAG_PROGRESS_VAR,
  EDGE_RESISTANCE,
  SLIDE_SETTLE_TRANSITION_SET,
  buildSlideTransform,
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

const KEYS = ['a', 'b', 'c', 'd', 'e'];

const CarouselHarness = ({ onApi, initialScreen = 2, loop, screenKeys }) => {
  const viewportRef = useRef(null);
  const api = useSwipeableScreens(SCREEN_COUNT, viewportRef, initialScreen, {
    loop,
    screenKeys,
  });

  onApi(api);

  return (
    <div ref={viewportRef} data-testid="viewport" {...api.handlers}>
      {(screenKeys ?? KEYS).map((key, index) => (
        <div
          key={key}
          data-testid={`slide-${index}`}
          data-screen={key}
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

  /** Mount the harness against a 400px viewport with a registered var sink. */
  const mountCarousel = (props = {}) => {
    vi.useFakeTimers();
    const sink = document.createElement('div');
    registerCarouselDragVarSink(sink);

    const state = { api: null };
    const element = (overrides = {}) => (
      <CarouselHarness
        {...props}
        {...overrides}
        onApi={(api) => {
          state.api = api;
        }}
      />
    );
    const view = render(element());
    Object.defineProperty(view.getByTestId('viewport'), 'clientWidth', {
      configurable: true,
      value: 400,
    });

    return {
      state,
      view,
      rerender: (overrides) => view.rerender(element(overrides)),
      progress: () =>
        Number(sink.style.getPropertyValue(SCREEN_DRAG_PROGRESS_VAR)),
      transformOf: (key) =>
        view.container.querySelector(`[data-screen="${key}"]`).style.transform,
    };
  };

  const drag = (viewport, fromX, toX) => {
    act(() => {
      fireEvent.mouseDown(viewport, {
        button: 0,
        clientX: fromX,
        clientY: 100,
      });
      fireEvent.mouseMove(viewport, { clientX: toX, clientY: 101 });
      vi.advanceTimersByTime(20);
    });
  };

  const release = (viewport) => {
    act(() => {
      fireEvent.mouseUp(viewport);
    });
    act(() => {
      vi.advanceTimersByTime(CAROUSEL_SETTLE_MS + 50);
    });
  };

  describe('with the loop off', () => {
    it('lays the screens out as a track with two ends', () => {
      const { transformOf } = mountCarousel({ initialScreen: 0, loop: false });

      // The last screen waits four slides to the right instead of peeking in
      // from the left.
      expect(transformOf('e')).toBe(buildSlideTransform(4, 4));
    });

    it('resists a drag past the first screen and springs back', () => {
      const { state, view, progress, transformOf } = mountCarousel({
        initialScreen: 0,
        loop: false,
      });
      const viewport = view.getByTestId('viewport');

      drag(viewport, 50, 350);

      // 300px over a 368px stride, damped to 30%.
      const overshoot = (300 / 368) * EDGE_RESISTANCE;
      expect(transformOf('a')).toBe(buildSlideTransform(overshoot, 0));
      // The tab bar and dots stay pinned to the end.
      expect(progress()).toBe(1);

      release(viewport);

      expect(state.api.currentScreen).toBe(0);
      expect(transformOf('a')).toBe(buildSlideTransform(0, 0));
    });

    it('does not wrap from the last screen to the first', () => {
      const { state, view } = mountCarousel({ initialScreen: 4, loop: false });
      const viewport = view.getByTestId('viewport');

      drag(viewport, 390, 10);
      release(viewport);

      expect(state.api.currentScreen).toBe(4);
    });

    it('slides the whole way on a first-to-last tab jump', () => {
      const { state, view } = mountCarousel({ initialScreen: 0, loop: false });

      act(() => {
        state.api.goToScreen(4);
      });

      // Nothing "teleports": every slide animates across.
      KEYS.forEach((_, index) => {
        expect(view.getByTestId(`slide-${index}`).style.transition).toBe(
          SLIDE_SETTLE_TRANSITION_SET
        );
      });

      act(() => {
        vi.advanceTimersByTime(CAROUSEL_SETTLE_MS + 50);
      });
      expect(state.api.currentScreen).toBe(4);
    });

    it('re-lays the track when the loop is switched off', () => {
      const { rerender, transformOf } = mountCarousel({ initialScreen: 0 });
      expect(transformOf('e')).toBe(buildSlideTransform(-1, 4));

      rerender({ loop: false });

      expect(transformOf('e')).toBe(buildSlideTransform(4, 4));
    });
  });

  it('keeps the screen in view when the order changes', () => {
    const { state, rerender, transformOf, progress } = mountCarousel({
      initialScreen: 2,
      screenKeys: KEYS,
    });

    rerender({ screenKeys: ['c', 'a', 'b', 'd', 'e'] });

    expect(state.api.currentScreen).toBe(0);
    expect(state.api.visibleScreen).toBe(0);
    expect(transformOf('c')).toBe(buildSlideTransform(0, 0));
    expect(transformOf('a')).toBe(buildSlideTransform(1, 1));
    expect(progress()).toBe(1);
  });

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
