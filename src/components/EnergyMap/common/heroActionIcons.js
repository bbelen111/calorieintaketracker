import {
  Utensils,
  Beef,
  Footprints,
  Gauge,
  TrendingDown,
  Flag,
  Flame,
  HeartPulse,
  Zap,
  Scale,
  Percent,
} from 'lucide-react';
import { HERO_ACTION_METRICS } from '../../../constants/appearance/heroAction';

// Presentation only: the metric list and copy live in
// `constants/appearance/heroAction.js`. The pill reads the icon off the display
// model's `iconKey`; Settings looks it up by metric key.
export const HERO_ACTION_ICONS_BY_KEY = {
  utensils: Utensils,
  beef: Beef,
  footprints: Footprints,
  gauge: Gauge,
  trendingDown: TrendingDown,
  flag: Flag,
  flame: Flame,
  heartPulse: HeartPulse,
  zap: Zap,
  scale: Scale,
  percent: Percent,
};

export const HERO_ACTION_ICON_KEY_BY_METRIC = {
  [HERO_ACTION_METRICS.CALORIES]: 'utensils',
  [HERO_ACTION_METRICS.CALORIES_LEFT]: 'utensils',
  [HERO_ACTION_METRICS.PROTEIN]: 'beef',
  [HERO_ACTION_METRICS.STEPS]: 'footprints',
  [HERO_ACTION_METRICS.DEFICIT]: 'gauge',
  [HERO_ACTION_METRICS.BALANCE_7D]: 'trendingDown',
  [HERO_ACTION_METRICS.PHASE]: 'flag',
  [HERO_ACTION_METRICS.STREAK]: 'flame',
  [HERO_ACTION_METRICS.RESTING_HR]: 'heartPulse',
  [HERO_ACTION_METRICS.BURN]: 'zap',
  [HERO_ACTION_METRICS.WEIGHT]: 'scale',
  [HERO_ACTION_METRICS.BODY_FAT]: 'percent',
};
