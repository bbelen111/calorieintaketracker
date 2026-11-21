/**
 * Shared health-store plumbing (Health Connect on Android, HealthKit on iOS)
 * for the step bridge (`hooks/useHealthConnect.js`) and the heart-rate sync
 * (`services/heartRateSync.js`), so both map availability identically.
 *
 * Platform gating goes through `utils/platform.js` (never an inline
 * `Capacitor.getPlatform()`); see the Step Sync section of AGENTS.md for the
 * per-platform authorization semantics.
 */
import { Health } from '@capgo/capacitor-health';
import { isAndroid, isIOS } from '../utils/platform.js';
import { HealthConnectStatus } from '../constants/health/healthSources.js';

/** True when this platform owns a health store the plugin can talk to. */
export const isHealthPlatform = () => isAndroid() || isIOS();

/**
 * Resolves whether a usable health store exists.
 *
 * - Not native (web dev build) -> UNAVAILABLE.
 * - Android without the Health Connect app -> NOT_INSTALLED (installable).
 * - iOS without HealthKit (iPad / restricted) -> UNAVAILABLE (nothing to install).
 * - A throwing check -> UNAVAILABLE.
 *
 * @param {string} [logTag] - Prefix for the warning on a failed check
 * @returns {Promise<{ available: boolean, status: string | null }>} `status`
 *   is the status to show when unavailable, `null` when available.
 */
export const resolveHealthAvailability = async (logTag = '[Health]') => {
  if (!isHealthPlatform()) {
    return { available: false, status: HealthConnectStatus.UNAVAILABLE };
  }

  try {
    const result = await Health.isAvailable();
    if (!result?.available) {
      return {
        available: false,
        status: isIOS()
          ? HealthConnectStatus.UNAVAILABLE
          : HealthConnectStatus.NOT_INSTALLED,
      };
    }
    return { available: true, status: null };
  } catch (err) {
    console.warn(`${logTag} Availability check failed:`, err);
    return { available: false, status: HealthConnectStatus.UNAVAILABLE };
  }
};

/**
 * Read types the user has (on iOS: has been asked for) access to.
 * @returns {Promise<string[]>}
 */
export const checkHealthReadTypes = async (types) => {
  try {
    const result = await Health.checkAuthorization({ read: types });
    return Array.isArray(result?.readAuthorized) ? result.readAuthorized : [];
  } catch (err) {
    console.warn('[Health] Authorization check failed:', err);
    return [];
  }
};

/**
 * Asks for read access to `types` (read-only on both platforms; Health
 * Connect only shows the types not granted yet).
 * @returns {Promise<string[]>} The read types now authorized.
 */
export const requestHealthReadTypes = async (types) => {
  const result = await Health.requestAuthorization({ read: types });
  return Array.isArray(result?.readAuthorized) ? result.readAuthorized : [];
};
