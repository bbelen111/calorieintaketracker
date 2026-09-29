import { beforeEach, describe, expect, it } from 'vitest';

import { CapacitorMock } from '../tests/mocks/capacitor.js';
import {
  PLATFORM,
  getPlatform,
  isAndroid,
  isIOS,
  isNative,
} from './platform.js';

/**
 * Platform resolution contract.
 *
 * Every platform-divergent branch in the app keys off these helpers (theme,
 * hardware back button, health sync, native export), so two properties are
 * worth pinning:
 *
 * 1. the values are read LAZILY — a module-scope capture would freeze whatever
 *    the bridge reported at import time, before the native bridge boots;
 * 2. `isIOS()` / `isAndroid()` are ALSO native-gated, so a browser that reports
 *    an unusual platform string can never unlock native-only plugin APIs.
 */
describe('platform', () => {
  beforeEach(() => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('ios');
  });

  it('exposes the platform constants callers switch on', () => {
    expect(PLATFORM).toEqual({
      IOS: 'ios',
      ANDROID: 'android',
      WEB: 'web',
    });
  });

  it('reads the platform lazily instead of at module scope', () => {
    expect(getPlatform()).toBe('ios');

    CapacitorMock.getPlatform.mockReturnValue('android');

    expect(getPlatform()).toBe('android');
  });

  it('passes the native flag straight through from the bridge', () => {
    expect(isNative()).toBe(true);

    CapacitorMock.isNativePlatform.mockReturnValue(false);

    expect(isNative()).toBe(false);
  });

  it('reports iOS only inside the native iOS shell', () => {
    expect(isIOS()).toBe(true);
    expect(isAndroid()).toBe(false);

    // A browser reporting an iOS platform string is NOT the native shell.
    CapacitorMock.isNativePlatform.mockReturnValue(false);

    expect(isIOS()).toBe(false);
  });

  it('reports Android only inside the native Android shell', () => {
    CapacitorMock.getPlatform.mockReturnValue('android');

    expect(isAndroid()).toBe(true);
    expect(isIOS()).toBe(false);

    CapacitorMock.isNativePlatform.mockReturnValue(false);

    expect(isAndroid()).toBe(false);
  });

  it('treats every other platform as neither iOS nor Android', () => {
    CapacitorMock.getPlatform.mockReturnValue('web');

    expect(isIOS()).toBe(false);
    expect(isAndroid()).toBe(false);
  });
});
