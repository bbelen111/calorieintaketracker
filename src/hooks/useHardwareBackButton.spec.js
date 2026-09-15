import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHardwareBackButton } from './useHardwareBackButton';
import { AppMock, CapacitorMock } from '../tests/mocks/capacitor.js';

const EXIT_WINDOW_MS = 2000;
const HOME_INDEX = 2;

/**
 * Native back-button policy: a modal wins, otherwise return Home, and only from
 * Home does a second press within the confirm window exit the app.
 *
 * The listener is registered through `App.addListener` (mocked here), so these
 * tests drive the real callback the hook hands to the plugin.
 */
describe('useHardwareBackButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    AppMock.exitApp.mockClear();
    AppMock.addListener.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderBackButton = (props = {}) =>
    renderHook(
      (overrides = {}) =>
        useHardwareBackButton({
          currentScreen: HOME_INDEX,
          homeIndex: HOME_INDEX,
          goToScreen: vi.fn(),
          closeTopmostModal: vi.fn(() => false),
          ...overrides,
        }),
      { initialProps: props }
    );

  /** The plugin callback the hook registered for the back button. */
  const getBackHandler = () =>
    AppMock.addListener.mock.calls.find(
      ([event]) => event === 'backButton'
    )?.[1];

  const pressBack = () => {
    const handler = getBackHandler();
    expect(handler, 'backButton listener was not registered').toBeTypeOf(
      'function'
    );
    act(() => {
      handler();
    });
  };

  it('registers a back listener on native platforms', () => {
    renderBackButton();

    expect(getBackHandler()).toBeTypeOf('function');
  });

  it('does not register anything off-platform', () => {
    CapacitorMock.isNativePlatform.mockReturnValue(false);

    renderBackButton();

    expect(getBackHandler()).toBeUndefined();
    expect(AppMock.addListener).not.toHaveBeenCalled();
  });

  it('prefers closing the topmost modal over any navigation', () => {
    const closeTopmostModal = vi.fn(() => true);
    const goToScreen = vi.fn();
    const { result } = renderBackButton({
      currentScreen: 1,
      closeTopmostModal,
      goToScreen,
    });

    pressBack();

    expect(closeTopmostModal).toHaveBeenCalledTimes(1);
    expect(goToScreen).not.toHaveBeenCalled();
    expect(AppMock.exitApp).not.toHaveBeenCalled();
    expect(result.current.showExitHint).toBe(false);
  });

  it('navigates home from another screen instead of exiting', () => {
    const goToScreen = vi.fn();
    const { result } = renderBackButton({ currentScreen: 4, goToScreen });

    pressBack();

    expect(goToScreen).toHaveBeenCalledWith(HOME_INDEX);
    expect(AppMock.exitApp).not.toHaveBeenCalled();
    expect(result.current.showExitHint).toBe(false);
  });

  it('shows the exit hint on the first press from Home', () => {
    const { result } = renderBackButton();

    pressBack();

    expect(result.current.showExitHint).toBe(true);
    expect(AppMock.exitApp).not.toHaveBeenCalled();
  });

  it('exits on a second press inside the confirm window', () => {
    const { result } = renderBackButton();

    pressBack();
    act(() => {
      vi.advanceTimersByTime(EXIT_WINDOW_MS - 500);
    });
    pressBack();

    expect(AppMock.exitApp).toHaveBeenCalledTimes(1);
    expect(result.current.showExitHint).toBe(false);
  });

  it('does not exit when the second press falls outside the window', () => {
    const { result } = renderBackButton();

    pressBack();
    act(() => {
      vi.advanceTimersByTime(EXIT_WINDOW_MS + 500);
    });
    pressBack();

    expect(AppMock.exitApp).not.toHaveBeenCalled();
    expect(result.current.showExitHint).toBe(true);
  });

  it('hides the hint after the confirm window elapses', () => {
    const { result } = renderBackButton();

    pressBack();
    expect(result.current.showExitHint).toBe(true);

    act(() => {
      vi.advanceTimersByTime(EXIT_WINDOW_MS + 1);
    });

    expect(result.current.showExitHint).toBe(false);
  });

  it('honours a custom confirm window', () => {
    renderBackButton({ exitConfirmWindowMs: 500 });

    pressBack();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    pressBack();

    expect(AppMock.exitApp).not.toHaveBeenCalled();
  });

  it('resets the pending exit when the user leaves Home', () => {
    const { rerender } = renderBackButton();

    pressBack();

    // Leaving Home cancels the pending second-press window.
    act(() => {
      rerender({ currentScreen: 1 });
    });
    act(() => {
      rerender({ currentScreen: HOME_INDEX });
    });
    pressBack();

    expect(AppMock.exitApp).not.toHaveBeenCalled();
  });

  it('removes the plugin listener on unmount', async () => {
    const { unmount } = renderBackButton();

    const handle = await AppMock.addListener.mock.results[0].value;
    unmount();

    expect(handle.remove).toHaveBeenCalledTimes(1);
  });
});
