import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const goals = {
  aggressive_bulk: {
    color: 'bg-purple-500',
    icon: TrendingUp,
    label: 'Aggressive Bulk',
    desc: '+500 cal surplus',
    warning: '⚠️ May lead to increased fat gain. Monitor weekly weight.'
  },
  bulking: {
    color: 'bg-green-500',
    icon: TrendingUp,
    label: 'Lean Bulk',
    desc: '+300 cal surplus',
    warning: null
  },
  maintenance: {
    color: 'bg-blue-500',
    icon: Minus,
    label: 'Maintenance',
    desc: 'At TDEE',
    warning: null
  },
  cutting: {
    color: 'bg-orange-500',
    icon: TrendingDown,
    label: 'Moderate Cut',
    desc: '-300 cal deficit',
    warning: null
  },
  aggressive_cut: {
    color: 'bg-red-600',
    icon: TrendingDown,
    label: 'Aggressive Cut',
    desc: '-500 cal deficit',
    warning: '⚠️ Risk of muscle loss and fatigue. Ensure high protein intake.'
  }
};
