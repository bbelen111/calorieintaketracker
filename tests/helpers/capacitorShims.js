/**
 * Shared Node-environment shims for `node --test`.
 *
 * `@capacitor/preferences`' web implementation reads `window.localStorage`,
 * which does not exist in Node. Logic specs that hydrate the store or exercise
 * `utils/data/storage.js` need an in-memory LocalStorage shim; it used to be
 * copy-pasted per spec file, so keep this the single source of truth.
 *
 * This module intentionally lives in `tests/helpers/` and carries no
 * `*.test.js` suffix so Node's default test discovery never executes it.
 */

/**
 * Minimal in-memory `window.localStorage` implementation.
 */
export const createMemoryLocalStorage = () => {
  const store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };
};

/**
 * Install a fresh in-memory LocalStorage shim as `globalThis.window` and
 * return the shimmed localStorage instance.
 */
export const installWindowStorage = () => {
  const localStorage = createMemoryLocalStorage();
  globalThis.window = { localStorage };
  return localStorage;
};

/**
 * Run `fn` with a fresh LocalStorage shim installed, restoring the previous
 * `globalThis.window` afterwards. `fn` receives `{ localStorage }`.
 */
export const withWindowStorage = async (run) => {
  const originalWindow = globalThis.window;
  const localStorage = installWindowStorage();

  try {
    return await run({ localStorage });
  } finally {
    globalThis.window = originalWindow;
  }
};

/**
 * Local (not UTC) `YYYY-MM-DD` key for today, matching the app's day-boundary
 * semantics used by the snapshot helpers.
 */
export const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
