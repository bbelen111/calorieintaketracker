import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CapacitorMock,
  KeyboardMock,
  NavigationBarMock,
  StatusBarMock,
} from '../tests/mocks/capacitor.js';
import { applyNativeTheme } from './theme.js';

/**
 * Native theme contract, per platform.
 *
 * The interesting property is not the colour values — it is WHICH plugin APIs a
 * platform is allowed to touch. Before this split the app called every API on
 * every platform, so the iOS-only keyboard style rejected on Android (logging a
 * warning on each theme change) and iOS silently lost the WebView status-bar
 * overlay that its whole safe-area design depends on.
 *
 * `clearMocks`/`restoreMocks` are on in vitest.config.js, so each test starts
 * from the doubles' pristine state.
 */
const setPlatform = (platform) => {
  CapacitorMock.isNativePlatform.mockReturnValue(platform !== 'web');
  CapacitorMock.getPlatform.mockReturnValue(platform);
};

describe('applyNativeTheme', () => {
  beforeEach(() => {
    setPlatform('ios');
  });

  it('short-circuits off-platform without touching a single plugin', async () => {
    setPlatform('web');

    const result = await applyNativeTheme('dark');

    expect(result).toEqual({
      success: false,
      message: 'Not on native platform',
    });
    expect(StatusBarMock.setOverlaysWebView).not.toHaveBeenCalled();
    expect(StatusBarMock.setStyle).not.toHaveBeenCalled();
    expect(StatusBarMock.setBackgroundColor).not.toHaveBeenCalled();
    expect(KeyboardMock.setStyle).not.toHaveBeenCalled();
    expect(NavigationBarMock.setColor).not.toHaveBeenCalled();
  });

  describe('iOS', () => {
    it('keeps the WebView overlaying the status bar', async () => {
      const result = await applyNativeTheme('dark');

      // The app renders its own vignette under the status bar and derives every
      // top inset from env(safe-area-inset-top), which reads 0 when the WebView
      // is inset — so false here was the bug, not the intent.
      expect(StatusBarMock.setOverlaysWebView).toHaveBeenCalledWith({
        overlay: true,
      });
      expect(StatusBarMock.setStyle).toHaveBeenCalledTimes(1);
      expect(result.results.statusBar).toEqual({ success: true });
    });

    it('never calls Android-only or status-bar background APIs', async () => {
      const result = await applyNativeTheme('dark');

      expect(StatusBarMock.setBackgroundColor).not.toHaveBeenCalled();
      expect(NavigationBarMock.setTransparency).not.toHaveBeenCalled();
      expect(NavigationBarMock.setColor).not.toHaveBeenCalled();

      // "not applicable on this platform" must be reported as null, never as a
      // failure, so a caller can tell the two apart.
      expect(result.results.navigationBar).toBeNull();
    });

    it('applies the iOS-only keyboard style and reports it', async () => {
      const result = await applyNativeTheme('dark');

      expect(KeyboardMock.setStyle).toHaveBeenCalledTimes(1);
      expect(result.results.keyboard).toEqual({ success: true });
    });
  });

  describe('Android', () => {
    beforeEach(() => {
      setPlatform('android');
    });

    it('insets the WebView below the status bar', async () => {
      const result = await applyNativeTheme('dark');

      expect(StatusBarMock.setOverlaysWebView).toHaveBeenCalledWith({
        overlay: false,
      });
      expect(result.results.statusBar).toEqual({ success: true });
    });

    it('paints the status bar with the resolved theme colour', async () => {
      await applyNativeTheme('dark');

      expect(StatusBarMock.setBackgroundColor).toHaveBeenCalledWith({
        color: '#0f172a',
      });
    });

    it('styles the navigation bar', async () => {
      const result = await applyNativeTheme('dark');

      expect(NavigationBarMock.setTransparency).toHaveBeenCalledWith({
        isTransparent: true,
      });
      expect(NavigationBarMock.setColor).toHaveBeenCalledTimes(1);
      expect(result.results.navigationBar).toEqual({ success: true });
    });

    it('never calls the iOS-only keyboard style', async () => {
      const result = await applyNativeTheme('dark');

      // This call is what used to reject on Android and log
      // "Failed to set keyboard style" on every theme change.
      expect(KeyboardMock.setStyle).not.toHaveBeenCalled();
      expect(result.results.keyboard).toBeNull();
    });
  });

  it('surfaces a status-bar failure as a failure, not as a throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    StatusBarMock.setStyle.mockRejectedValueOnce(new Error('bridge exploded'));

    const result = await applyNativeTheme('dark');

    expect(result.success).toBe(true);
    expect(result.results.statusBar).toEqual({
      success: false,
      error: 'bridge exploded',
    });
    expect(warn).toHaveBeenCalledWith(
      'Failed to set status bar style:',
      expect.any(Error)
    );
    // A failed status bar must not stop the rest of the theme from applying.
    expect(KeyboardMock.setStyle).toHaveBeenCalledTimes(1);
  });
});
