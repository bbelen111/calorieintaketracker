import {
  Coffee,
  Sun,
  Moon,
  Apple,
  Utensils,
  Cookie,
  IceCream,
} from 'lucide-react';

export const MEAL_TYPES = {
  breakfast: {
    id: 'breakfast',
    label: 'Breakfast',
    icon: Coffee,
    color: 'orange',
    order: 1,
  },
  morning_snack: {
    id: 'morning_snack',
    label: 'Morning Snack',
    icon: Cookie,
    color: 'amber',
    order: 2,
  },
  lunch: {
    id: 'lunch',
    label: 'Lunch',
    icon: Sun,
    color: 'yellow',
    order: 3,
  },
  afternoon_snack: {
    id: 'afternoon_snack',
    label: 'Afternoon Snack',
    icon: Apple,
    color: 'lime',
    order: 4,
  },
  dinner: {
    id: 'dinner',
    label: 'Dinner',
    icon: Moon,
    color: 'indigo',
    order: 5,
  },
  evening_snack: {
    id: 'evening_snack',
    label: 'Evening Snack',
    icon: IceCream,
    color: 'pink',
    order: 6,
  },
  other: {
    id: 'other',
    label: 'Other',
    icon: Utensils,
    color: 'slate',
    order: 7,
  },
};

export const MEAL_TYPE_ORDER = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'evening_snack',
  'other',
];

export const getMealTypeById = (id) => MEAL_TYPES[id] || MEAL_TYPES.other;
