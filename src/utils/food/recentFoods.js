// "Recents" is derived from the food log. Nothing extra is stored, so the list
// always follows edits and deletes.

import { getTodayDateKey, getWindowDateKeys } from '../data/dateKeys.js';
import { isRecipeId } from './recipe.js';

export const RECENT_FOODS_LIMIT = 50;

// Food ids minted for a single log, so they can't say two logs are one food.
const PER_LOG_FOOD_ID = /^(ai|manual)_/;

const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** What makes two logged entries the same food; `null` for a nameless one. */
export const getRecentFoodKey = (entry) => {
  const foodId = String(entry?.foodId ?? '').trim();
  if (foodId && !PER_LOG_FOOD_ID.test(foodId)) {
    return `id:${foodId}`;
  }

  const name = normalizeText(entry?.name);
  return name ? `name:${normalizeText(entry?.brand)}|${name}` : null;
};

// When the entry was logged (an ISO string or epoch ms), falling back to the
// day it sits on.
const resolveLoggedAt = (timestamp, dateKey) => {
  const logged =
    typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
  if (Number.isFinite(logged)) {
    return logged;
  }

  const day = Date.parse(`${dateKey}T00:00:00`);
  return Number.isFinite(day) ? day : 0;
};

/**
 * One item per food, most recently logged first:
 * `{ key, entry, dateKey, mealType, loggedAt }`, where `entry` is that latest log.
 */
export const buildRecentFoods = (nutritionData) => {
  const latestByKey = new Map();

  Object.entries(nutritionData ?? {}).forEach(([dateKey, meals]) => {
    Object.entries(meals ?? {}).forEach(([mealType, entries]) => {
      if (!Array.isArray(entries)) {
        return;
      }

      entries.forEach((entry) => {
        const key = getRecentFoodKey(entry);
        if (!key) {
          return;
        }

        const loggedAt = resolveLoggedAt(entry.timestamp, dateKey);
        const latest = latestByKey.get(key);
        if (!latest || loggedAt >= latest.loggedAt) {
          latestByKey.set(key, { key, entry, dateKey, mealType, loggedAt });
        }
      });
    });
  });

  return [...latestByKey.values()].sort((a, b) => b.loggedAt - a.loggedAt);
};

/**
 * The rows to show: every word of the query must appear in the brand or name.
 * Searches all recent foods, then caps the result.
 */
export const searchRecentFoods = (
  recentFoods,
  query,
  limit = RECENT_FOODS_LIMIT
) => {
  const words = normalizeText(query).split(' ').filter(Boolean);
  const matches = words.length
    ? recentFoods.filter(({ entry }) => {
        const text = normalizeText(`${entry.brand ?? ''} ${entry.name ?? ''}`);
        return words.every((word) => text.includes(word));
      })
    : recentFoods;

  return matches.slice(0, limit);
};

/** "Today", "Yesterday" or "Nov 3" (with the year when it isn't this one). */
export const formatRecentDayLabel = (dateKey, todayKey = getTodayDateKey()) => {
  if (dateKey === todayKey) {
    return 'Today';
  }
  if (dateKey === getWindowDateKeys(todayKey, 2)[0]) {
    return 'Yesterday';
  }

  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return String(dateKey);
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(String(todayKey).startsWith(`${year}-`) ? {} : { year: 'numeric' }),
  });
};

const resolveEntrySource = (entry) => {
  const foodId = String(entry?.foodId ?? '');
  if (isRecipeId(foodId)) {
    return 'recipe';
  }
  if (foodId.startsWith('user_')) {
    return 'user';
  }
  if (entry?.source) {
    return entry.source;
  }
  if (foodId.startsWith('ai_')) {
    return 'ai';
  }
  // No food and no weight: it was typed in by hand.
  return !foodId && !(Number(entry?.grams) > 0) ? 'manual' : null;
};

/**
 * A logged entry in the shape the shared food tag badges read. Entries don't
 * record every source flag, so it is recovered from the food id.
 */
export const toRecentDisplayFood = (entry) => ({
  name: entry?.name,
  brand: entry?.brand ?? null,
  category: entry?.category ?? null,
  source: resolveEntrySource(entry),
});
