/**
 * Health-store vocabulary shared by the bridge hook and the UI.
 *
 * This module is deliberately leaf-level (it imports only the platform helper),
 * so `hooks/useHealthConnect.js` and
 * `components/EnergyMap/screens/CalorieMapScreen.jsx` can both consume it with no
 * possibility of a circular import — which is the reason the screen used to keep
 * its own inline copy of the status constants (a copy that could silently drift
 * from the hook's).
 */
import { isIOS } from '../../utils/platform.js';

/**
 * Connection status states.
 *
 * Named for Health Connect (the Android provider) but shared by BOTH native
 * platforms: on iOS the same lifecycle describes HealthKit access. `UNAVAILABLE`
 * is the single "no usable health store here" state on iOS (where the user
 * cannot install one); `NOT_INSTALLED` only ever comes from Android, where
 * Health Connect is a separate Play Store app.
 *
 * @type {Object}
 */
export const HealthConnectStatus = {
  UNAVAILABLE: 'unavailable', // No health store on this platform (web, iPad, old Android)
  NOT_INSTALLED: 'not_installed', // Android only: Health Connect app not installed
  DISCONNECTED: 'disconnected', // Available but not authorized
  CONNECTING: 'connecting', // Requesting permissions
  CONNECTED: 'connected', // Authorized and ready
  ERROR: 'error', // An error occurred
};

/**
 * User-facing name of the on-device health store for the current platform.
 * Resolved lazily so specs can drive both branches and so the label can never be
 * frozen before the native bridge boots.
 */
export const getHealthSourceName = () =>
  isIOS() ? 'Apple Health' : 'Health Connect';
