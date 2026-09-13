import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnimatedModal } from '../hooks/useAnimatedModal';

/**
 * `useAnimatedModal` owns the open → closing → closed lifecycle for every modal
 * in the app. The contract that matters: `requestClose` must keep the modal
 * mounted (isOpen true) for the animation window, then unmount it, and it must
 * be safe to call repeatedly / during a pending close.
 */
describe('useAnimatedModal', () => {
  const CLOSE_MS = 180; // DEFAULT_CLOSE_DURATION in the hook

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed by default', () => {
    const { result } = renderHook(() => useAnimatedModal());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isClosing).toBe(false);
  });

  it('honours initiallyOpen', () => {
    const { result } = renderHook(() => useAnimatedModal(true));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isClosing).toBe(false);
  });

  it('open() opens immediately', () => {
    const { result } = renderHook(() => useAnimatedModal());

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isClosing).toBe(false);
  });

  it('requestClose() keeps the modal mounted for the animation window, then closes', () => {
    const { result } = renderHook(() => useAnimatedModal(true));

    act(() => {
      result.current.requestClose();
    });

    // Exit animation window: still mounted, flagged as closing.
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isClosing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(CLOSE_MS - 1);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isClosing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isClosing).toBe(false);
  });

  it('uses the configured animation duration', () => {
    const { result } = renderHook(() => useAnimatedModal(true, 50));

    act(() => {
      result.current.requestClose();
    });

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('requestClose() is a no-op while already closing (does not restart the timer)', () => {
    const { result } = renderHook(() => useAnimatedModal(true));

    act(() => {
      result.current.requestClose();
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Second call must not reschedule the close from this point.
    act(() => {
      result.current.requestClose();
    });

    act(() => {
      vi.advanceTimersByTime(80); // 180ms total from the FIRST call
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isClosing).toBe(false);
  });

  it('requestClose() is a no-op when already closed', () => {
    const { result } = renderHook(() => useAnimatedModal());

    act(() => {
      result.current.requestClose();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isClosing).toBe(false);

    act(() => {
      vi.advanceTimersByTime(CLOSE_MS * 2);
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isClosing).toBe(false);
  });

  it('open() during a pending close cancels the close', () => {
    const { result } = renderHook(() => useAnimatedModal(true));

    act(() => {
      result.current.requestClose();
    });

    act(() => {
      vi.advanceTimersByTime(CLOSE_MS - 1);
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isClosing).toBe(false);

    // The cancelled close timer must not fire late and unmount the modal.
    act(() => {
      vi.advanceTimersByTime(CLOSE_MS * 2);
    });

    expect(result.current.isOpen).toBe(true);
  });

  it('forceClose() unmounts immediately without waiting for the animation', () => {
    const { result } = renderHook(() => useAnimatedModal(true));

    act(() => {
      result.current.forceClose();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isClosing).toBe(false);
  });
});
