/**
 * Platform resolution — the single source of truth for "which shell are we
 * running in?".
 *
 * Every value is resolved at CALL time, never captured at module scope, for two
 * reasons:
 *
 * 1. The Vitest Capacitor doubles (`src/tests/mocks/capacitor.js`) are `vi.fn`s,
 *    so a spec can drive each branch per test only if we read them lazily.
 * 2. A module-scope read can run before the native bridge has booted.
 *
 * Use these helpers instead of calling `Capacitor.getPlatform()` /
 * `Capacitor.isNativePlatform()` inline in new code. Platform-divergent
 * behaviour is exactly the kind of thing that silently regresses on the
 * platform nobody is testing when the same check is hand-written in ten places
 * — iOS/Android differences are documented at each call site instead.
 *
 * Note the deliberate asymmetry with `@capacitor/core`:
 * - `getPlatform()` reports the shell even when it is `'web'`.
 * - `isIOS()` / `isAndroid()` are ALSO native-gated, because a browser reporting
 *   an odd user agent must never be treated as a native shell that owns
 *   Android-only or iOS-only plugin APIs.
 */
import { Capacitor } from '@capacitor/core';

export const PLATFORM = {
  IOS: 'ios',
  ANDROID: 'android',
  WEB: 'web',
};

/**
 * Raw platform name as reported by the bridge: `'ios' | 'android' | 'web'`.
 */
export const getPlatform = () => Capacitor.getPlatform();

/**
 * True inside a Capacitor native shell (iOS or Android), false on the web.
 */
export const isNative = () => Capacitor.isNativePlatform();

/**
 * True only in the native iOS shell.
 */
export const isIOS = () => isNative() && getPlatform() === PLATFORM.IOS;

/**
 * True only in the native Android shell.
 */
export const isAndroid = () => isNative() && getPlatform() === PLATFORM.ANDROID;
