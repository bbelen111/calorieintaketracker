/**
 * Navigation Bar Plugin - Control system navigation bar icon color (Android 11+)
 * Allows app to switch nav bar icon contrast (dark vs light) based on theme
 */

import { Capacitor } from '@capacitor/core';

export const setLightNavigationBar = async (light = true) => {
  try {
    if (!Capacitor.isNativePlatform()) {
      // Not on native platform (web/browser), silently ignore
      return { success: false, message: 'Not on native platform' };
    }

    const result = await Capacitor.Plugins.NavigationBar.setLightNavigationBar({
      light,
    });

    return { success: true, ...result };
  } catch (error) {
    console.error('Failed to set navigation bar style:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Usage in your theme switching logic:
 *
 * // When switching to light theme (light bg, dark icons)
 * await setLightNavigationBar(true);
 *
 * // When switching to dark theme (dark bg, light icons)
 * await setLightNavigationBar(false);
 */
