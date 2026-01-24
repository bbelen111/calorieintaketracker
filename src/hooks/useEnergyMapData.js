import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../store/useEnergyMapStore';

// Deprecated: retained for compatibility. Prefer useEnergyMapStore directly.
export const useEnergyMapData = () =>
  useEnergyMapStore((state) => ({ ...state }), shallow);
