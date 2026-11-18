import React, { useEffect, useCallback, useRef } from 'react';
import { EnergyMapCalculator } from './components/EnergyMap/EnergyMapCalculator';
import { useEnergyMapStore } from './store/useEnergyMapStore';
import { useKeyboardVisible } from './hooks/useKeyboardVisible';
import { applyNativeTheme, getThemeClass } from './utils/theme';

const THEME_CLASSES = [
  'theme-light',
  'theme-amoled-dark',
  'theme-forest',
  'theme-dawn',
  'theme-dusk',
  'theme-midnight',
];

const App = () => {
  const theme = useEnergyMapStore((state) => state.theme);
  const isLoaded = useEnergyMapStore((state) => state.isLoaded);

  // Single app-wide publisher for the keyboard state: `--keyboard-inset` on
  // `:root` (consumed by `.keyboard-bottom-inset`) plus the visible flag the
  // floating tab bar reads. Mounted here so the signal exists even when no
  // modal is open; the hook is a module-scoped singleton, so consumers that call
  // it again (ScreenTabs) share this one subscription.
  useKeyboardVisible();

  // True once the first theme has been applied, so only a *change* (the user
  // picking a theme in Settings) cross-fades - the initial paint never does.
  const hasAppliedThemeRef = useRef(false);

  const applyTheme = useCallback((themeValue, { animate = false } = {}) => {
    const swapThemeClass = () => {
      // Remove all theme classes first
      document.body.classList.remove(...THEME_CLASSES);

      // Get the appropriate class for the theme (resolves 'auto' to system preference)
      const themeClass = getThemeClass(themeValue);
      if (themeClass) {
        document.body.classList.add(themeClass);
      }
    };

    // Cross-fade the whole page between palettes where the View Transition API
    // exists; everywhere else (and under reduced motion) it is the same instant
    // class swap as before. The swap itself is synchronous either way.
    const canCrossFade =
      animate &&
      typeof document.startViewTransition === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (canCrossFade) {
      document.startViewTransition(swapThemeClass);
    } else {
      swapThemeClass();
    }

    // Apply native platform theme (status bar, nav bar, keyboard)
    applyNativeTheme(themeValue);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    // Apply theme immediately (animated only when switching, not on first apply)
    applyTheme(theme, { animate: hasAppliedThemeRef.current });
    hasAppliedThemeRef.current = true;

    // If theme is 'auto', listen for system preference changes
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('auto');

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme, isLoaded, applyTheme]);

  return <EnergyMapCalculator />;
};

export default App;
