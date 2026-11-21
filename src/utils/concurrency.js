/**
 * Shared async mapping helper with a concurrency limit.
 *
 * Extracted from `services/foodLookupContext.js` so the per-term lookup loops
 * in `services/foodSearch.js` can reuse the exact same semantics (results keep
 * their input order; the limit is floored at 1) without importing across the
 * service boundary in a way that would create a module cycle.
 */

export const mapWithConcurrencyLimit = async (items, limit, mapper) => {
  const safeItems = Array.isArray(items) ? items : [];

  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));

  const results = new Array(safeItems.length);

  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(normalizedLimit, safeItems.length) },
    async () => {
      while (cursor < safeItems.length) {
        const currentIndex = cursor;

        cursor += 1;

        results[currentIndex] = await mapper(
          safeItems[currentIndex],
          currentIndex
        );
      }
    }
  );

  await Promise.all(workers);

  return results;
};
