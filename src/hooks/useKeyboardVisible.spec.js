import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useKeyboardVisible } from './useKeyboardVisible';
import { CapacitorMock, KeyboardMock } from '../tests/mocks/capacitor.js';
import {
  KEYBOARD_INSET_CSS_VAR,
  MIN_KEYBOARD_INSET_PX,
} from '../utils/visuals/keyboardInset';
import {
  restoreKeyboardViewport,
  setKeyboardViewport,
} from '../tests/helpers/keyboardViewport';

/**
 * The app-wide keyboard signal: the Capacitor keyboard events plus the
 * visual-viewport shrink, resolved into `{ isKeyboardVisible, keyboardInset }`
 * and published as `--keyboard-inset` on `:root`.
 *
 * The module is a singleton, so every case starts by putting the viewport back
 * into its keyboard-free state and lets the hook's own subscribe-time recompute
 * establish the baseline.
 */

const KEYBOARD_FREE_LAYOUT_HEIGHT = 900;

const getPluginHandler = (eventName) =>
  KeyboardMock.addListener.mock.calls.find(
    ([event]) => event === eventName
  )?.[1];

const fireKeyboardEvent = (eventName, info = {}) => {
  const handler = getPluginHandler(eventName);
  expect(handler, `${eventName} listener was not registered`).toBeTypeOf(
    'function'
  );

  act(() => {
    handler(info);
  });
};

const readCssInset = () =>
  document.documentElement.style.getPropertyValue(KEYBOARD_INSET_CSS_VAR);

describe('useKeyboardVisible', () => {
  beforeEach(() => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    setKeyboardViewport({
      layoutHeight: KEYBOARD_FREE_LAYOUT_HEIGHT,
      visualHeight: KEYBOARD_FREE_LAYOUT_HEIGHT,
    });
  });

  afterEach(() => {
    restoreKeyboardViewport();
  });

  it('starts idle and subscribes to the keyboard events', () => {
    const { result } = renderHook(() => useKeyboardVisible());

    expect(result.current).toEqual({
      isKeyboardVisible: false,
      keyboardInset: 0,
    });
    expect(KeyboardMock.addListener).toHaveBeenCalledWith(
      'keyboardDidShow',
      expect.any(Function)
    );
    expect(KeyboardMock.addListener).toHaveBeenCalledWith(
      'keyboardDidHide',
      expect.any(Function)
    );
    expect(readCssInset()).toBe('0px');
  });

  it('publishes the covered height when the keyboard overlays the page (iOS resize:none)', () => {
    const { result } = renderHook(() => useKeyboardVisible());

    act(() => {
      setKeyboardViewport({ layoutHeight: 900, visualHeight: 580 });
    });
    fireKeyboardEvent('keyboardDidShow', { keyboardHeight: 320 });

    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardInset: 320,
    });
    expect(readCssInset()).toBe('320px');

    act(() => {
      setKeyboardViewport({ layoutHeight: 900, visualHeight: 900 });
    });
    fireKeyboardEvent('keyboardDidHide');

    expect(result.current).toEqual({
      isKeyboardVisible: false,
      keyboardInset: 0,
    });
    expect(readCssInset()).toBe('0px');
  });

  it('reports the keyboard without padding when the window itself resized (Android `adjustResize`)', () => {
    const { result } = renderHook(() => useKeyboardVisible());

    act(() => {
      setKeyboardViewport({ layoutHeight: 560, visualHeight: 560 });
    });
    fireKeyboardEvent('keyboardDidShow', { keyboardHeight: 340 });

    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardInset: 0,
    });
    expect(readCssInset()).toBe('0px');
  });

  it('detects the keyboard from the visual viewport alone', () => {
    const { result } = renderHook(() => useKeyboardVisible());

    act(() => {
      setKeyboardViewport({ layoutHeight: 900, visualHeight: 600 });
    });

    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardInset: 300,
    });

    act(() => {
      setKeyboardViewport({ layoutHeight: 900, visualHeight: 900 });
    });

    expect(result.current).toEqual({
      isKeyboardVisible: false,
      keyboardInset: 0,
    });
  });

  it('ignores viewport changes smaller than a keyboard', () => {
    const { result } = renderHook(() => useKeyboardVisible());

    act(() => {
      setKeyboardViewport({
        layoutHeight: 900,
        visualHeight: 900 - (MIN_KEYBOARD_INSET_PX - 1),
      });
    });

    expect(result.current).toEqual({
      isKeyboardVisible: false,
      keyboardInset: 0,
    });
  });

  it('keeps the layout viewport as the reference while the keyboard is up', () => {
    const { result } = renderHook(() => useKeyboardVisible());

    // Window-resizing keyboard (Android adjustResize): the layout viewport
    // already ends at the keyboard, so there is nothing to pad.
    fireKeyboardEvent('keyboardDidShow', { keyboardHeight: 340 });
    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardInset: 0,
    });

    // Overlay keyboard (iOS resize:none): the visual viewport shrink is the inset.
    act(() => {
      setKeyboardViewport({ layoutHeight: 900, visualHeight: 560 });
    });
    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardInset: 340,
    });

    act(() => {
      setKeyboardViewport({ layoutHeight: 900, visualHeight: 900 });
    });
    fireKeyboardEvent('keyboardDidHide');

    expect(result.current).toEqual({
      isKeyboardVisible: false,
      keyboardInset: 0,
    });
  });

  it('never pads when the plugin event lands before the window resize', () => {
    const { result } = renderHook(() => useKeyboardVisible());

    fireKeyboardEvent('keyboardDidShow', { keyboardHeight: 340 });
    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardInset: 0,
    });

    act(() => {
      setKeyboardViewport({ layoutHeight: 560, visualHeight: 560 });
    });

    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardInset: 0,
    });
  });

  it('still detects the keyboard off native platforms, without plugin listeners', () => {
    CapacitorMock.isNativePlatform.mockReturnValue(false);

    const { result } = renderHook(() => useKeyboardVisible());

    expect(KeyboardMock.addListener).not.toHaveBeenCalled();

    act(() => {
      setKeyboardViewport({ layoutHeight: 900, visualHeight: 620 });
    });

    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardInset: 280,
    });
  });

  it('releases every listener and the plugin handle when the last subscriber unmounts', async () => {
    const { unmount } = renderHook(() => useKeyboardVisible());

    await act(async () => {});
    const handles = await Promise.all(
      KeyboardMock.addListener.mock.results.map((call) => call.value)
    );
    expect(handles).toHaveLength(2);

    unmount();

    handles.forEach((handle) => {
      expect(handle.remove).toHaveBeenCalled();
    });

    // With the viewport listener gone, a keyboard-sized change must no longer
    // publish anything (the CSS variable stays where it was).
    act(() => {
      setKeyboardViewport({ layoutHeight: 900, visualHeight: 560 });
    });

    expect(readCssInset()).toBe('0px');
  });
});
