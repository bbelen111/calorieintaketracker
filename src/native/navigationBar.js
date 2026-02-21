/**
 * Navigation Bar Plugin - Control system navigation bar icon color (Android 11+)
 *
 * @deprecated Use applyNativeTheme() from utils/theme.js instead for centralized theme management.
 * This file is kept for backward compatibility.
 */

import { Capacitor } from '@capacitor/core';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';

/**
 * @deprecated Use applyNativeTheme() from utils/theme.js instead.
 */
export const setLightNavigationBar = async (light = true) => {
  try {
    if (!Capacitor.isNativePlatform()) {
      return { success: false, message: 'Not on native platform' };
    }

    // This old API used a custom plugin, now we use @capgo/capacitor-navigation-bar
    // light=true means dark icons (light bg), light=false means light icons (dark bg)
    const color = light ? '#f1f5f9' : '#0f172a';
    await NavigationBar.setColor({ color });
    await NavigationBar.setTransparency({ isTransparent: false });

    return { success: true };
  } catch (error) {
    console.error('Failed to set navigation bar style:', error);
    return { success: false, error: error.message };
  }
};
