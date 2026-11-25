// The five main screens and the user's arrangement of them
// (Settings -> Navigation). Screens can only be re-ordered, never added or
// removed, so a stored order is always settled back to a full permutation.

export const SCREEN_KEYS = Object.freeze({
  LOGBOOK: 'logbook',
  TRACKER: 'tracker',
  HOME: 'home',
  CALORIE_MAP: 'calorie-map',
  INSIGHTS: 'insights',
});

export const SCREEN_DEFINITIONS = Object.freeze({
  [SCREEN_KEYS.LOGBOOK]: {
    label: 'Logbook',
    description: 'Phases and daily ledger',
  },
  [SCREEN_KEYS.TRACKER]: {
    label: 'Tracker',
    description: 'Meals, calories and macros',
  },
  [SCREEN_KEYS.HOME]: {
    label: 'Home',
    description: 'Goal and today’s activity',
  },
  [SCREEN_KEYS.CALORIE_MAP]: {
    label: 'Calorie Map',
    description: 'Calorie targets by step range',
  },
  [SCREEN_KEYS.INSIGHTS]: {
    label: 'Insights',
    description: 'Body metrics and trends',
  },
});

export const DEFAULT_SCREEN_ORDER = Object.freeze([
  SCREEN_KEYS.LOGBOOK,
  SCREEN_KEYS.TRACKER,
  SCREEN_KEYS.HOME,
  SCREEN_KEYS.CALORIE_MAP,
  SCREEN_KEYS.INSIGHTS,
]);

/**
 * Settle any stored value into a full order: unknown keys and repeats are
 * dropped, and screens the value lacks are appended in their default order.
 */
export const normalizeScreenOrder = (value) => {
  const stored = Array.isArray(value)
    ? value.filter((key) => DEFAULT_SCREEN_ORDER.includes(key))
    : [];

  return [...new Set([...stored, ...DEFAULT_SCREEN_ORDER])];
};

export const isSameScreenOrder = (first, second) =>
  Array.isArray(first) &&
  Array.isArray(second) &&
  first.length === second.length &&
  first.every((key, index) => key === second[index]);

/** Exchange the slots of two screens. Unknown keys leave the order alone. */
export const swapScreens = (order, firstKey, secondKey) => {
  const first = order.indexOf(firstKey);
  const second = order.indexOf(secondKey);
  if (first < 0 || second < 0 || first === second) {
    return order;
  }

  const next = [...order];
  next[first] = secondKey;
  next[second] = firstKey;
  return next;
};

/** Move one screen to another slot, shifting the ones in between. */
export const moveScreen = (order, key, toIndex) => {
  const from = order.indexOf(key);
  const to = Math.max(0, Math.min(Math.round(toIndex), order.length - 1));
  if (from < 0 || !Number.isFinite(to) || from === to) {
    return order;
  }

  const next = order.filter((item) => item !== key);
  next.splice(to, 0, key);
  return next;
};
