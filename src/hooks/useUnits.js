import { useEnergyMapStore } from '../store/useEnergyMapStore.js';
import { createUnitFormatter } from '../utils/units/unitFormatter.js';

/**
 * The unit formatter for the user's current preferences. Subscribes to that one
 * object only, so memoized screens need no new props; the returned formatter is
 * referentially stable until the preferences change.
 */
export const useUnits = () =>
  createUnitFormatter(
    useEnergyMapStore((state) => state.userData?.unitPreferences)
  );
