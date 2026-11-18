// UI tier (jsdom). jsdom has no layout engine and no Web Animations API, so the
// three inputs the hook reads are driven explicitly: the sheet's `offsetTop`
// (layout position), `window.innerWidth/Height` (the viewport) and
// `Element.prototype.animate` (a recording stub). What is under test is the
// decision logic - when to glide, from where, and when to stay out of the way.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardGlide } from './useKeyboardGlide';

const setViewport = (width, height) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
};

let layoutTop;
let animations;

const makeSheet = () => {
  const sheet = document.createElement('div');
  Object.defineProperty(sheet, 'offsetTop', {
    configurable: true,
    get: () => layoutTop,
  });
  document.body.appendChild(sheet);
  return sheet;
};

const keyboardOpens = (nextHeight, nextTop, width = 390) => {
  layoutTop = nextTop;
  setViewport(width, nextHeight);
  window.dispatchEvent(new window.Event('resize'));
};

beforeEach(() => {
  layoutTop = 260;
  animations = [];
  setViewport(390, 844);
  window.Element.prototype.animate = vi.fn(function animate(frames, options) {
    const animation = { frames, options, cancel: vi.fn() };
    animations.push(animation);
    return animation;
  });
  window.matchMedia = vi.fn(() => ({ matches: false }));
});

afterEach(() => {
  delete window.Element.prototype.animate;
  document.body.innerHTML = '';
});

describe('useKeyboardGlide', () => {
  it('glides a keyboard-sized viewport change from the old position to the new one', () => {
    const sheet = makeSheet();
    renderHook(() =>
      useKeyboardGlide({ enabled: true, contentRef: { current: sheet } })
    );

    keyboardOpens(520, 99); // 844 -> 520 moved the centred sheet 260 -> 99

    expect(animations).toHaveLength(1);
    expect(animations[0].frames).toEqual([
      { translate: '0 161px' }, // starts where it was: 260 - 99
      { translate: '0 0' },
    ]);
    expect(animations[0].options.duration).toBe(280);
  });

  it('glides back down when the keyboard closes', () => {
    const sheet = makeSheet();
    renderHook(() =>
      useKeyboardGlide({ enabled: true, contentRef: { current: sheet } })
    );

    keyboardOpens(520, 99);
    keyboardOpens(844, 260);

    expect(animations).toHaveLength(2);
    expect(animations[1].frames[0]).toEqual({ translate: '0 -161px' });
    // The previous glide is replaced, never stacked.
    expect(animations[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('ignores a viewport change too small to be a keyboard', () => {
    const sheet = makeSheet();
    renderHook(() =>
      useKeyboardGlide({ enabled: true, contentRef: { current: sheet } })
    );

    keyboardOpens(820, 250); // URL-bar sized: 24px

    expect(animations).toHaveLength(0);
  });

  it('ignores a rotation (the width changes too)', () => {
    const sheet = makeSheet();
    renderHook(() =>
      useKeyboardGlide({ enabled: true, contentRef: { current: sheet } })
    );

    keyboardOpens(390, 40, 844);

    expect(animations).toHaveLength(0);
  });

  it('does nothing when the sheet did not actually move', () => {
    const sheet = makeSheet();
    renderHook(() =>
      useKeyboardGlide({ enabled: true, contentRef: { current: sheet } })
    );

    keyboardOpens(520, 260);

    expect(animations).toHaveLength(0);
  });

  it('does nothing under reduced motion', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const sheet = makeSheet();
    renderHook(() =>
      useKeyboardGlide({ enabled: true, contentRef: { current: sheet } })
    );

    keyboardOpens(520, 99);

    expect(animations).toHaveLength(0);
  });

  it('does nothing while disabled (the fullscreen layout)', () => {
    const sheet = makeSheet();
    renderHook(() =>
      useKeyboardGlide({ enabled: false, contentRef: { current: sheet } })
    );

    keyboardOpens(520, 99);

    expect(animations).toHaveLength(0);
  });

  it('degrades to the plain snap where the Web Animations API is missing', () => {
    delete window.Element.prototype.animate;
    const sheet = makeSheet();
    expect(() => {
      renderHook(() =>
        useKeyboardGlide({ enabled: true, contentRef: { current: sheet } })
      );
      keyboardOpens(520, 99);
    }).not.toThrow();
  });

  it('stops listening and ends an in-flight glide when unmounted', () => {
    const sheet = makeSheet();
    const { unmount } = renderHook(() =>
      useKeyboardGlide({ enabled: true, contentRef: { current: sheet } })
    );

    keyboardOpens(520, 99);
    unmount();
    keyboardOpens(844, 260);

    expect(animations).toHaveLength(1);
    expect(animations[0].cancel).toHaveBeenCalled();
  });
});
