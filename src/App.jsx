import React, { useEffect } from 'react';
import { EnergyMapCalculator } from './components/EnergyMap/EnergyMapCalculator';
import { useEnergyMapStore } from './store/useEnergyMapStore';
import { applyNativeTheme } from './utils/theme';

const THEME_CLASSES = ['theme-light', 'theme-amoled-dark'];

const App = () => {
  const theme = useEnergyMapStore((state) => state.theme);
  const isLoaded = useEnergyMapStore((state) => state.isLoaded);

  useEffect(() => {
    if (!isLoaded) return;

    // Remove all theme classes first
    document.body.classList.remove(...THEME_CLASSES);

    // Apply new theme class if not default (dark)
    if (theme === 'light') {
      document.body.classList.add('theme-light');
    } else if (theme === 'amoled_dark') {
      document.body.classList.add('theme-amoled-dark');
    }
    // 'dark' theme = no class (uses :root defaults)

    // Apply native platform theme (status bar, nav bar, keyboard)
    applyNativeTheme(theme);
  }, [theme, isLoaded]);

  return <EnergyMapCalculator />;
};

export default App;
