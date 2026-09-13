import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkNetworkStatus,
  useNetworkStatus,
} from '../hooks/useNetworkStatus';

/**
 * `useNetworkStatus` gates online-only UI (online food search, barcode lookup).
 * The contract: it reflects `navigator.onLine`, reacts to browser connectivity
 * events and to returning-to-the-app visibility changes, and cleans up its
 * listeners on unmount.
 */
describe('useNetworkStatus', () => {
  const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(
    window.navigator,
    'onLine'
  );
  const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState'
  );

  const setOnLine = (value) => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => value,
    });
  };

  const setVisibility = (value) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => value,
    });
  };

  afterEach(() => {
    if (originalOnLineDescriptor) {
      Object.defineProperty(
        window.navigator,
        'onLine',
        originalOnLineDescriptor
      );
    }
    if (originalVisibilityDescriptor) {
      Object.defineProperty(
        document,
        'visibilityState',
        originalVisibilityDescriptor
      );
    }
    vi.restoreAllMocks();
  });

  it('seeds state from navigator.onLine', () => {
    setOnLine(true);
    const online = renderHook(() => useNetworkStatus());
    expect(online.result.current.isOnline).toBe(true);
    online.unmount();

    setOnLine(false);
    const offline = renderHook(() => useNetworkStatus());
    expect(offline.result.current.isOnline).toBe(false);
    offline.unmount();
  });

  it('tracks offline and online window events', () => {
    setOnLine(true);
    const { result } = renderHook(() => useNetworkStatus());

    setOnLine(false);
    act(() => {
      window.dispatchEvent(new window.Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);

    setOnLine(true);
    act(() => {
      window.dispatchEvent(new window.Event('online'));
    });
    expect(result.current.isOnline).toBe(true);
  });

  it('re-reads connectivity when the document becomes visible again', () => {
    setOnLine(true);
    const { result } = renderHook(() => useNetworkStatus());

    // Connectivity dropped while the app was backgrounded: no browser event
    // reaches us, so the visibility handler must re-poll.
    setOnLine(false);
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new window.Event('visibilitychange'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('ignores visibility changes that are not "visible"', () => {
    setOnLine(true);
    const { result } = renderHook(() => useNetworkStatus());

    setOnLine(false);
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new window.Event('visibilitychange'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('refresh() re-reads navigator.onLine and stamps lastChecked', () => {
    setOnLine(true);
    const { result } = renderHook(() => useNetworkStatus());
    const before = result.current.lastChecked;

    setOnLine(false);
    act(() => {
      result.current.refresh();
    });

    expect(result.current.isOnline).toBe(false);
    expect(result.current.lastChecked).toBeGreaterThanOrEqual(before);
  });

  it('removes its listeners on unmount', () => {
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();

    const windowEvents = removeWindowListener.mock.calls.map((call) => call[0]);
    expect(windowEvents).toContain('online');
    expect(windowEvents).toContain('offline');
    expect(removeDocumentListener.mock.calls.map((call) => call[0])).toContain(
      'visibilitychange'
    );
  });

  it('checkNetworkStatus mirrors navigator.onLine for non-hook callers', () => {
    setOnLine(false);
    expect(checkNetworkStatus()).toBe(false);

    setOnLine(true);
    expect(checkNetworkStatus()).toBe(true);
  });
});
