export const MEAL_TYPES = {
  breakfast: {
    id: 'breakfast',
    label: 'Breakfast',
    icon: '🌅',
    color: 'orange',
    order: 1,
  },
  lunch: {
    id: 'lunch',
    label: 'Lunch',
    icon: '☀️',
    color: 'yellow',
    order: 2,
  },
  dinner: {
    id: 'dinner',
    label: 'Dinner',
    icon: '🌙',
    color: 'indigo',
    order: 3,
  },
  snacks: {
    id: 'snacks',
    label: 'Snacks',
    icon: '🍎',
    color: 'green',
    order: 4,
  },
  other: {
    id: 'other',
    label: 'Other',
    icon: '🍽️',
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
