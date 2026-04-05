import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const goals = {
  aggressive_bulk: {
    color: 'bg-accent-purple',
    icon: TrendingUp,
    label: 'Aggressive Bulk',
    desc: '+500 kcal surplus',
    warning: 'May lead to increased fat gain. Monitor progress closely.',
  },
  bulking: {
    color: 'bg-accent-green',
    icon: TrendingUp,
    label: 'Lean Bulk',
    desc: '+300 kcal surplus',
    warning: null,
  },
  maintenance: {
    color: 'bg-accent-blue',
    icon: Minus,
    label: 'Maintenance',
    desc: 'At TDEE',
    warning: null,
  },
  cutting: {
    color: 'bg-accent-yellow',
    icon: TrendingDown,
    label: 'Moderate Cut',
    desc: '-300 kcal deficit',
    warning: null,
  },
  aggressive_cut: {
    color: 'bg-accent-orange',
    icon: TrendingDown,
    label: 'Aggressive Cut',
    desc: '-500 kcal deficit',
    warning: 'Risk of muscle loss and fatigue. Ensure high protein intake.',
  },
};
