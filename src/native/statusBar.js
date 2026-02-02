/**
 * Status Bar Plugin - Control system status bar icon color (top bar)
 * Allows app to switch status bar icon contrast (dark vs light) based on theme
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export const setLightStatusBar = async (light = true) => {
  try {
    if (!Capacitor.isNativePlatform()) {
      // Not on native platform (web/browser), silently ignore
      return { success: false, message: 'Not on native platform' };
    }

    // light=true means light icons (for dark background) -> Style.Dark
    // light=false means dark icons (for light background) -> Style.Light
    const style = light ? Style.Dark : Style.Light;
    
    // Set overlaysWebView to false so background color is visible
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#0f172a' }); // slate-900
    await StatusBar.setStyle({ style });

    return { success: true };
  } catch (error) {
    console.error('Failed to set status bar style:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Usage in your theme switching logic:
 *
 * // When switching to dark theme (dark bg, light/white icons)
 * await setLightStatusBar(true);
 *
 * // When switching to light theme (light bg, dark icons)
 * await setLightStatusBar(false);
 */
