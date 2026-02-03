/**
 * Theme Utility - Centralized theme management for native platform integration
 * Handles Status Bar, Navigation Bar, Keyboard appearance based on theme
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';

/**
 * Theme configuration for native platform styling
 * Maps theme keys to their native platform appearance settings
 */
const THEME_CONFIG = {
  dark: {
    isDark: true,
    statusBarColor: '#0f172a', // slate-900 (--background)
    navigationBarColor: '#0f172a',
    statusBarStyle: Style.Dark, // Light icons on dark bg
    keyboardStyle: KeyboardStyle.Dark,
  },
  light: {
    isDark: false,
    statusBarColor: '#f1f5f9', // slate-100 (--background)
    navigationBarColor: '#f1f5f9',
    statusBarStyle: Style.Light, // Dark icons on light bg
    keyboardStyle: KeyboardStyle.Light,
  },
  amoled_dark: {
    isDark: true,
    statusBarColor: '#000000', // Pure black (--background)
    navigationBarColor: '#000000',
    statusBarStyle: Style.Dark, // Light icons on dark bg
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
 * @returns {string} Resolved theme key ('dark' | 'light' | 'amoled_dark')
 */
export const resolveTheme = (theme) => {
  if (theme === 'auto') {
    return getSystemTheme();
  }
  return theme;
};

/**
 * Apply theme to all native platform components
 * @param {string} theme - Theme key: 'auto' | 'dark' | 'light' | 'amoled_dark'
 */
export const applyNativeTheme = async (theme) => {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, message: 'Not on native platform' };
  }

  const resolvedTheme = resolveTheme(theme);
  const config = THEME_CONFIG[resolvedTheme] ?? THEME_CONFIG.dark;
  const results = {
    statusBar: null,
    navigationBar: null,
    keyboard: null,
  };

  // Apply Status Bar styling
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: config.statusBarColor });
    await StatusBar.setStyle({ style: config.statusBarStyle });
    results.statusBar = { success: true };
  } catch (error) {
    console.warn('Failed to set status bar style:', error);
    results.statusBar = { success: false, error: error.message };
  }

  // Apply Navigation Bar styling (Android only)
  if (Capacitor.getPlatform() === 'android') {
    try {
      await NavigationBar.setColor({ color: config.navigationBarColor });
      await NavigationBar.setTransparency({ isTransparent: false });
      results.navigationBar = { success: true };
    } catch (error) {
      console.warn('Failed to set navigation bar style:', error);
      results.navigationBar = { success: false, error: error.message };
    }
  }

  // Apply Keyboard styling (iOS primarily)
  try {
    await Keyboard.setStyle({ style: config.keyboardStyle });
    results.keyboard = { success: true };
  } catch (error) {
    console.warn('Failed to set keyboard style:', error);
    results.keyboard = { success: false, error: error.message };
  }

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
  switch (resolvedTheme) {
    case 'light':
      return '241, 245, 249'; // slate-100
    case 'amoled_dark':
      return '0, 0, 0'; // pure black
    case 'dark':
    default:
      return '15, 23, 42'; // slate-900
  }
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
    case 'dark':
    default:
      return null; // Default theme uses :root, no class needed
  }
};
