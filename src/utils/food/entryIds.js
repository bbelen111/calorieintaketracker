// Entry ids tell apart the foods logged on one day. Deleting and editing match
// by id, so two entries sharing one are removed or overwritten together.

const hasId = (id) => id !== undefined && id !== null && id !== '';

const listDayEntries = (meals) =>
  Object.values(meals ?? {}).flatMap((entries) =>
    Array.isArray(entries) ? entries : []
  );

/** Every id already used by any meal of one day. */
export const collectDayEntryIds = (meals) =>
  new Set(
    listDayEntries(meals)
      .map((entry) => entry?.id)
      .filter(hasId)
  );

/**
 * The id a new entry is stored under: the requested one when it is free,
 * otherwise an unused number.
 */
export const resolveEntryId = (requestedId, takenIds, now = Date.now()) => {
  if (hasId(requestedId) && !takenIds.has(requestedId)) {
    return requestedId;
  }

  let candidate = now;
  while (takenIds.has(candidate)) {
    candidate += 1;
  }
  return candidate;
};

/**
 * Gives repeated or missing ids on one day new ones; the first holder keeps its
 * id. Deterministic, because repaired ids are only written back when the day
 * next changes and must come out the same on every load until then. Returns the
 * same object when nothing needed repair.
 */
export const repairDayEntryIds = (meals) => {
  if (!meals || typeof meals !== 'object') {
    return meals;
  }

  // New ids start above every existing one, so they can't collide with an
  // entry that comes later in the day.
  let lastId = listDayEntries(meals).reduce(
    (max, entry) =>
      Number.isFinite(entry?.id) ? Math.max(max, entry.id) : max,
    0
  );
  const takenIds = new Set();
  let changed = false;

  const repaired = Object.fromEntries(
    Object.entries(meals).map(([mealType, entries]) => {
      if (!Array.isArray(entries)) {
        return [mealType, entries];
      }

      return [
        mealType,
        entries.map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return entry;
          }
          if (hasId(entry.id) && !takenIds.has(entry.id)) {
            takenIds.add(entry.id);
            return entry;
          }
          lastId += 1;
          takenIds.add(lastId);
          changed = true;
          return { ...entry, id: lastId };
        }),
      ];
    })
  );

  return changed ? repaired : meals;
};
