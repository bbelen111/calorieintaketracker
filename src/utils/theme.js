/**
 * Theme Utility - Centralized theme management for native platform integration
 * Handles Status Bar, Navigation Bar, Keyboard appearance based on theme
 */

import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import { isAndroid, isIOS, isNative } from './platform.js';

const toHexChannel = (value) => {
  const normalized = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  return normalized.toString(16).padStart(2, '0');
};

const toHexColor = (rgb, alpha = null) => {
  const [r, g, b] = Array.isArray(rgb) ? rgb : [0, 0, 0];
  const prefix = `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
  return alpha == null ? prefix : `${prefix}${toHexChannel(alpha)}`;
};

const NATIVE_THEME_RGB = {
  dark: [15, 23, 42],
  light: [241, 245, 249],
  amoled_dark: [0, 0, 0],
  forest: [13, 31, 27],
  dawn: [255, 247, 237],
  dusk: [31, 24, 43],
  midnight: [8, 18, 34],
};

const TRANSPARENT_COLOR = toHexColor([0, 0, 0], 0);

/**
 * Theme configuration for native platform styling
 * Maps theme keys to their native platform appearance settings
 */
const THEME_CONFIG = {
  dark: {
    isDark: true,
    statusBarColor: toHexColor(NATIVE_THEME_RGB.dark),
    navigationBarColor: toHexColor(NATIVE_THEME_RGB.dark),
    statusBarStyle: Style.Dark, // Light icons on dark bg
    keyboardStyle: KeyboardStyle.Dark,
  },
  light: {
    isDark: false,
    statusBarColor: toHexColor(NATIVE_THEME_RGB.light),
    navigationBarColor: toHexColor(NATIVE_THEME_RGB.light),
    statusBarStyle: Style.Light, // Dark icons on light bg
    keyboardStyle: KeyboardStyle.Light,
  },
  amoled_dark: {
    isDark: true,
    statusBarColor: toHexColor(NATIVE_THEME_RGB.amoled_dark),
    navigationBarColor: toHexColor(NATIVE_THEME_RGB.amoled_dark),
    statusBarStyle: Style.Dark, // Light icons on dark bg
    keyboardStyle: KeyboardStyle.Dark,
  },
  forest: {
    isDark: true,
    statusBarColor: toHexColor(NATIVE_THEME_RGB.forest),
    navigationBarColor: toHexColor(NATIVE_THEME_RGB.forest),
    statusBarStyle: Style.Dark,
    keyboardStyle: KeyboardStyle.Dark,
  },
  dawn: {
    isDark: false,
    statusBarColor: toHexColor(NATIVE_THEME_RGB.dawn),
    navigationBarColor: toHexColor(NATIVE_THEME_RGB.dawn),
    statusBarStyle: Style.Light,
    keyboardStyle: KeyboardStyle.Light,
  },
  dusk: {
    isDark: true,
    statusBarColor: toHexColor(NATIVE_THEME_RGB.dusk),
    navigationBarColor: toHexColor(NATIVE_THEME_RGB.dusk),
    statusBarStyle: Style.Dark,
    keyboardStyle: KeyboardStyle.Dark,
  },
  midnight: {
    isDark: true,
    statusBarColor: toHexColor(NATIVE_THEME_RGB.midnight),
    navigationBarColor: toHexColor(NATIVE_THEME_RGB.midnight),
    statusBarStyle: Style.Dark,
    keyboardStyle: KeyboardStyle.Dark,
  },
};

/**
 * Get the system's preferred color scheme
 * @returns {'dark' | 'light'} The system theme preference
 */
export const getSystemTheme = () => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

/**
 * Resolve 'auto' theme to actual theme based on system preference
 * @param {string} theme - Theme key including 'auto'
 * @returns {string} Resolved theme key
 */
export const resolveTheme = (theme) => {
  if (theme === 'auto') {
    return getSystemTheme();
  }
  return theme;
};

/**
 * Status bar — the one place where iOS and Android genuinely diverge.
 *
 * ANDROID draws its own status-bar background, so the WebView is inset below
 * the bar (`overlay: false`) and the bar is painted with the theme colour.
 *
 * iOS must stay OVERLAYING. The app renders its own gradient vignette
 * (`.status-bar-vignette`, `calc(var(--sat) + 24px)`) under the status bar and
 * derives every other top inset from `env(safe-area-inset-top)` — which reads 0
 * once the WebView is inset. Worse, `setOverlaysWebView(false)` makes the plugin
 * insert its own opaque background view AND resize the WebView, so the previous
 * platform-agnostic `overlay: false` produced a flat opaque bar (killing the
 * vignette), zeroed `--sat`, and shifted the whole layout down mid-launch
 * because iOS boots with `overlaysWebView: true` and only flipped it once
 * `App.jsx` had hydrated. `setBackgroundColor` is skipped on iOS: it only ever
 * tinted that plugin-owned background view.
 */
const applyStatusBarTheme = async (config, results) => {
  try {
    await StatusBar.setOverlaysWebView({ overlay: isIOS() });
    if (!isIOS()) {
      await StatusBar.setBackgroundColor({ color: config.statusBarColor });
    }
    await StatusBar.setStyle({ style: config.statusBarStyle });
    results.statusBar = { success: true };
  } catch (error) {
    console.warn('Failed to set status bar style:', error);
    results.statusBar = { success: false, error: error.message };
  }
};

/**
 * Android navigation bar styling. `@capgo/capacitor-navigation-bar` is an
 * Android-only plugin — on iOS the call rejects, so it is gated rather than
 * attempted-and-caught.
 */
const applyNavigationBarTheme = async (results) => {
  if (!isAndroid()) {
    return;
  }

  try {
    await NavigationBar.setTransparency({ isTransparent: true });
    await NavigationBar.setColor({ color: TRANSPARENT_COLOR });
    results.navigationBar = { success: true };
  } catch (error) {
    console.warn('Failed to set navigation bar style:', error);
    results.navigationBar = { success: false, error: error.message };
  }
};

/**
 * Keyboard styling. `Keyboard.setStyle` is documented as iOS-only, so on
 * Android it used to reject and log `Failed to set keyboard style` on every
 * single theme change.
 */
const applyKeyboardTheme = async (config, results) => {
  if (!isIOS()) {
    return;
  }

  try {
    await Keyboard.setStyle({ style: config.keyboardStyle });
    results.keyboard = { success: true };
  } catch (error) {
    console.warn('Failed to set keyboard style:', error);
    results.keyboard = { success: false, error: error.message };
  }
};

/**
 * Apply theme to all native platform components.
 *
 * Each platform only calls the APIs it actually owns; a key that the platform
 * does not handle is reported as `null` (not as a failure) so a caller can tell
 * "not applicable here" apart from "tried and failed".
 *
 * @param {string} theme - Theme key
 */
export const applyNativeTheme = async (theme) => {
  if (!isNative()) {
    return { success: false, message: 'Not on native platform' };
  }

  const resolvedTheme = resolveTheme(theme);
  const config = THEME_CONFIG[resolvedTheme] ?? THEME_CONFIG.dark;
  const results = {
    statusBar: null,
    navigationBar: null,
    keyboard: null,
  };

  await applyStatusBarTheme(config, results);
  await applyNavigationBarTheme(results);
  await applyKeyboardTheme(config, results);

  return { success: true, results };
};

/**
 * Get CSS custom property value for vignette gradient
 * Returns the appropriate RGB color for the status bar vignette based on theme
 * @param {string} theme - Theme key
 * @returns {string} RGB color string for use in gradients
 */
export const getVignetteColor = (theme) => {
  const resolvedTheme = resolveTheme(theme);
  const rgb = NATIVE_THEME_RGB[resolvedTheme] ?? NATIVE_THEME_RGB.dark;
  return rgb.join(', ');
};

/**
 * Check if theme is a dark variant
 * @param {string} theme - Theme key
 * @returns {boolean}
 */
export const isDarkTheme = (theme) => {
  const resolvedTheme = resolveTheme(theme);
  const config = THEME_CONFIG[resolvedTheme];
  return config?.isDark ?? true;
};

/**
 * Get the CSS class name for a theme
 * @param {string} theme - Theme key including 'auto'
 * @returns {string | null} CSS class name or null for default dark theme
 */
export const getThemeClass = (theme) => {
  const resolvedTheme = resolveTheme(theme);
  switch (resolvedTheme) {
    case 'light':
      return 'theme-light';
    case 'amoled_dark':
      return 'theme-amoled-dark';
    case 'forest':
      return 'theme-forest';
    case 'dawn':
      return 'theme-dawn';
    case 'dusk':
      return 'theme-dusk';
    case 'midnight':
      return 'theme-midnight';
    case 'dark':
    default:
      return null; // Default theme uses :root, no class needed
  }
};
