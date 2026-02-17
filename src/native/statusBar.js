/**
 * Status Bar Plugin - Control system status bar icon color (top bar)
 *
 * @deprecated Use applyNativeTheme() from utils/theme.js instead for centralized theme management.
 * This file is kept for backward compatibility.
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * @deprecated Use applyNativeTheme() from utils/theme.js instead.
 */
export const setLightStatusBar = async (light = true) => {
  try {
    if (!Capacitor.isNativePlatform()) {
      return { success: false, message: 'Not on native platform' };
    }

    // light=true means light icons (for dark background) -> Style.Dark
    // light=false means dark icons (for light background) -> Style.Light
    const style = light ? Style.Dark : Style.Light;

    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#0f172a' }); // slate-900
    await StatusBar.setStyle({ style });

    return { success: true };
  } catch (error) {
    console.error('Failed to set status bar style:', error);
    return { success: false, error: error.message };
  }
};
