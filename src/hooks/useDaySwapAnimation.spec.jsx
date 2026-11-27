import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DAY_SWAP_IN_MS,
  DAY_SWAP_OUT_MS,
  useDaySwapAnimation,
} from './useDaySwapAnimation';
import {
  resetMotionMode,
  setMotionMode,
} from '../utils/visuals/motionPreference';

const Days = ({ date }) => {
  const { rootRef, shownDate } = useDaySwapAnimation(date);
  return (
    <div ref={rootRef}>
      <h2>Title</h2>
      <p data-day-swap="" data-testid="day">
        {shownDate}
      </p>
      <div data-day-swap="">meals</div>
    </div>
  );
};

const START = '2026-11-27';

// jsdom has no layout, so the area's height follows the day it shows.
const HEIGHTS = { [START]: 300, '2026-11-28': 120, '2026-11-29': 300 };
const measured = (node) => {
  if (node) {
    Object.defineProperty(node, 'offsetHeight', {
      configurable: true,
      get: () => HEIGHTS[node.textContent],
    });
  }
};

const Resizing = ({ date }) => {
  const { rootRef, shownDate } = useDaySwapAnimation(date);
  return (
    <div ref={rootRef}>
      <div ref={measured} data-day-swap-resize="" data-testid="area">
        {shownDate}
      </div>
    </div>
  );
};

describe('useDaySwapAnimation', () => {
  let animate;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no Web Animations API.
    animate = vi.fn(() => ({ cancel: vi.fn() }));
    window.Element.prototype.animate = animate;
    setMotionMode('full');
  });

  afterEach(() => {
    delete window.Element.prototype.animate;
    resetMotionMode();
    vi.useRealTimers();
  });

  const day = () => screen.getByTestId('day');
  const shown = () => day().textContent;
  const leave = () => act(() => vi.advanceTimersByTime(DAY_SWAP_OUT_MS));
  // One call per block, so every other call describes the next step.
  const step = (index) => {
    const [frames, options] = animate.mock.calls[index * 2];
    return { from: frames[0], to: frames[1], options };
  };

  it('stays still on first render and when the day is unchanged', () => {
    const view = render(<Days date={START} />);
    view.rerender(<Days date={START} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it('fades the old day out before showing and fading in the new one', () => {
    const view = render(<Days date={START} />);
    view.rerender(<Days date="2026-11-28" />);

    expect(shown()).toBe(START);
    expect(animate.mock.contexts).toEqual([day(), screen.getByText('meals')]);
    expect(step(0).to).toEqual({
      opacity: 0,
      transform: 'translateX(-16px)',
    });
    expect(step(0).options).toMatchObject({
      duration: DAY_SWAP_OUT_MS,
      fill: 'forwards',
    });

    leave();

    expect(shown()).toBe('2026-11-28');
    expect(step(1).from).toEqual({
      opacity: 0,
      transform: 'translateX(16px)',
    });
    expect(step(1).to).toEqual({ opacity: 1, transform: 'translateX(0px)' });
    expect(step(1).options.duration).toBe(DAY_SWAP_IN_MS);
    expect(step(1).options.fill).toBeUndefined();
    // The held fade-out is dropped, or it would hide the new day afterwards.
    expect(animate.mock.results[0].value.cancel).toHaveBeenCalled();
  });

  it.each([
    ['an earlier day', '2026-11-26', 16, -16],
    ['a day in a later year', '2027-01-01', -16, 16],
  ])('moves %s from its own side', (_label, nextDate, outTo, inFrom) => {
    const view = render(<Days date={START} />);
    view.rerender(<Days date={nextDate} />);
    leave();

    expect(step(0).to.transform).toBe(`translateX(${outTo}px)`);
    expect(step(1).from.transform).toBe(`translateX(${inFrom}px)`);
  });

  it('goes straight to the last day tapped, without restarting', () => {
    const view = render(<Days date={START} />);
    view.rerender(<Days date="2026-11-28" />);
    view.rerender(<Days date="2026-11-29" />);

    expect(animate).toHaveBeenCalledTimes(2);

    leave();

    expect(shown()).toBe('2026-11-29');
    expect(animate).toHaveBeenCalledTimes(4);
  });

  it('brings the old day back if it is tapped again before it has gone', () => {
    const view = render(<Days date={START} />);
    view.rerender(<Days date="2026-11-28" />);
    view.rerender(<Days date={START} />);

    expect(step(1).to.opacity).toBe(1);

    leave();

    expect(shown()).toBe(START);
    expect(animate).toHaveBeenCalledTimes(4);
    expect(day().style.pointerEvents).toBe('');
  });

  it('ignores taps on the old day while it leaves', () => {
    const view = render(<Days date={START} />);
    view.rerender(<Days date="2026-11-28" />);

    expect(day().style.pointerEvents).toBe('none');

    leave();

    expect(day().style.pointerEvents).toBe('');
  });

  it('only fades with reduced motion', () => {
    setMotionMode('reduced');
    const view = render(<Days date={START} />);
    view.rerender(<Days date="2026-11-28" />);
    leave();

    expect(step(0).to).toEqual({ opacity: 0 });
    expect(step(1).from).toEqual({ opacity: 0 });
    expect(step(1).to).toEqual({ opacity: 1 });
  });

  const area = () => screen.getByTestId('area');
  const goTo = (date) => {
    const view = render(<Resizing date={START} />);
    view.rerender(<Resizing date={date} />);
  };

  it('eases a marked area from the old day’s height to the new one’s', () => {
    goTo('2026-11-28');
    // Nothing resizes while the old day is still on screen.
    expect(animate).not.toHaveBeenCalled();

    leave();

    expect(animate.mock.calls).toEqual([
      [
        [{ height: '300px' }, { height: '120px' }],
        expect.objectContaining({ duration: DAY_SWAP_IN_MS }),
      ],
    ]);
    expect(area().style.overflow).toBe('hidden');

    animate.mock.results[0].value.onfinish();

    expect(area().style.overflow).toBe('');
  });

  it('leaves the area alone between days of the same height', () => {
    goTo('2026-11-29');
    leave();

    expect(animate).not.toHaveBeenCalled();
    expect(area().style.overflow).toBe('');
  });

  it('does not resize with reduced motion', () => {
    setMotionMode('reduced');
    goTo('2026-11-28');
    leave();

    expect(animate).not.toHaveBeenCalled();
  });

  it.each([
    ['motion off', () => setMotionMode('off')],
    ['no Web Animations API', () => delete window.Element.prototype.animate],
  ])('swaps at once with %s', (_label, arrange) => {
    arrange();
    const view = render(<Days date={START} />);
    view.rerender(<Days date="2026-11-28" />);

    expect(shown()).toBe('2026-11-28');
    expect(animate).not.toHaveBeenCalled();
  });
});
