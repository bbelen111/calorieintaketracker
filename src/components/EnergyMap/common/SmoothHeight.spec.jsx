import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SmoothHeight } from './SmoothHeight';
import {
  resetMotionMode,
  setMotionMode,
} from '../../../utils/visuals/motionPreference';

// jsdom has no layout and no ResizeObserver: drive both by hand.
let notifyResize;
let contentHeight;

beforeEach(() => {
  contentHeight = 100;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        notifyResize = () => act(() => callback([]));
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(
    window.HTMLElement.prototype,
    'offsetHeight',
    'get'
  ).mockImplementation(() => contentHeight);
});

afterEach(() => {
  resetMotionMode();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderRegion = (mode = 'a') => {
  const view = render(
    <SmoothHeight swapKey={mode}>
      <p>Mode {mode}</p>
    </SmoothHeight>
  );
  return { ...view, frame: view.container.firstChild };
};

describe('SmoothHeight', () => {
  it('pins the first height without clipping anything', () => {
    const { frame } = renderRegion();
    notifyResize();

    expect(frame.style.height).toBe('100px');
    expect(frame.style.clipPath).toBe('');
    expect(frame.style.transition).toContain('height');
  });

  it('moves to the new height, clipping only until it arrives', () => {
    const { frame } = renderRegion();
    notifyResize();

    contentHeight = 180;
    notifyResize();

    expect(frame.style.height).toBe('180px');
    expect(frame.style.clipPath).toContain('inset');

    fireEvent.transitionEnd(frame, { propertyName: 'height' });
    expect(frame.style.clipPath).toBe('');
  });

  it('fades new content in only after the mode changes', () => {
    const { rerender } = renderRegion('a');
    expect(screen.getByText('Mode a').parentElement).not.toHaveClass(
      'header-stat-in'
    );

    rerender(
      <SmoothHeight swapKey="b">
        <p>Mode b</p>
      </SmoothHeight>
    );

    expect(screen.getByText('Mode b').parentElement).toHaveClass(
      'header-stat-in'
    );
  });

  it.each(['reduced', 'off'])('snaps in %s motion', (mode) => {
    setMotionMode(mode);
    const { frame } = renderRegion();
    notifyResize();

    contentHeight = 180;
    notifyResize();

    expect(frame.style.height).toBe('180px');
    expect(frame.style.transition).toBe('');
    expect(frame.style.clipPath).toBe('');
  });
});
