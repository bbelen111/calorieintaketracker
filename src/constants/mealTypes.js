import { Coffee, Sun, Moon, Apple, Utensils } from 'lucide-react';

export const MEAL_TYPES = {
  breakfast: {
    id: 'breakfast',
    label: 'Breakfast',
    icon: Coffee,
    color: 'orange',
    order: 1,
  },
  lunch: {
    id: 'lunch',
    label: 'Lunch',
    icon: Sun,
    color: 'yellow',
    order: 2,
  },
  dinner: {
    id: 'dinner',
    label: 'Dinner',
    icon: Moon,
    color: 'indigo',
    order: 3,
  },
  snacks: {
    id: 'snacks',
    label: 'Snacks',
    icon: Apple,
    color: 'green',
    order: 4,
  },
  other: {
    id: 'other',
    label: 'Other',
    icon: Utensils,
    color: 'slate',
    order: 5,
  },
};

export const MEAL_TYPE_ORDER = [
  'breakfast',
  'lunch',
  'dinner',
  'snacks',
  'other',
];

export const getMealTypeById = (id) => MEAL_TYPES[id] || MEAL_TYPES.other;
