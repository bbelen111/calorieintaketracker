import {
  BarChart3,
  ClipboardList,
  Home,
  Map as MapIcon,
  Target,
} from 'lucide-react';
import {
  SCREEN_DEFINITIONS,
  SCREEN_KEYS,
} from '../../../constants/navigation/screens';

export const SCREEN_ICONS = Object.freeze({
  [SCREEN_KEYS.LOGBOOK]: ClipboardList,
  [SCREEN_KEYS.TRACKER]: Target,
  [SCREEN_KEYS.HOME]: Home,
  [SCREEN_KEYS.CALORIE_MAP]: MapIcon,
  [SCREEN_KEYS.INSIGHTS]: BarChart3,
});

/** The tab list for an (already normalized) screen order. */
export const buildScreenTabs = (order) =>
  order.map((key) => ({
    key,
    label: SCREEN_DEFINITIONS[key].label,
    icon: SCREEN_ICONS[key],
  }));
