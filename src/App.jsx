import React, { useEffect, useCallback } from 'react';
import { EnergyMapCalculator } from './components/EnergyMap/EnergyMapCalculator';
import { useEnergyMapStore } from './store/useEnergyMapStore';
import { applyNativeTheme, getThemeClass } from './utils/theme';

const THEME_CLASSES = ['theme-light', 'theme-amoled-dark'];

const App = () => {
  const theme = useEnergyMapStore((state) => state.theme);
  const isLoaded = useEnergyMapStore((state) => state.isLoaded);

  const applyTheme = useCallback((themeValue) => {
    // Remove all theme classes first
    document.body.classList.remove(...THEME_CLASSES);

    // Get the appropriate class for the theme (resolves 'auto' to system preference)
    const themeClass = getThemeClass(themeValue);
    if (themeClass) {
      document.body.classList.add(themeClass);
    }

    // Apply native platform theme (status bar, nav bar, keyboard)
    applyNativeTheme(themeValue);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    // Apply theme immediately
    applyTheme(theme);

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
