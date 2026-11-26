/**
 * Thin, platform-guarded dynamic-import bridge over `@capacitor/local-notifications`
 * (Layer 1), `@capacitor/push-notifications` (Layer 2), and the app's native
 * `NotificationReliability` plugin (Android battery optimization + background
 * Health Connect / HealthKit workout sync).
 *
 * Both official plugins are imported dynamically so they never enter the
 * boot-critical `chunk-capacitor` bundle (see `vite.config.js`). On web dev
 * (`localhost:5173`), every call degrades cleanly without throwing.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isAndroid, isNative } from '../utils/platform.js';

// Return the ES module namespace (NOT the plugin proxy itself!) from these
// loaders. Capacitor plugins are JS `Proxy` objects: returning a proxy directly
// from an `async` function makes JS Promise resolution probe `proxy.then`,
// which invokes the native bridge and throws:
//   `"LocalNotifications.then()" is not implemented on android`
const loadLocalPluginModule = () => import('@capacitor/local-notifications');
const loadPushPluginModule = () => import('@capacitor/push-notifications');

let reliabilityPlugin = null;
const getReliabilityPlugin = () => {
  if (!isNative()) {
    return null;
  }
  if (!reliabilityPlugin && typeof registerPlugin === 'function') {
    reliabilityPlugin = registerPlugin('NotificationReliability');
  }
  if (
    reliabilityPlugin &&
    typeof Capacitor?.isPluginAvailable === 'function' &&
    !Capacitor.isPluginAvailable('NotificationReliability')
  ) {
    return null;
  }
  return reliabilityPlugin;
};

export const normalizePermissionState = (raw) => {
  const value = String(raw?.display ?? raw?.receive ?? raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'granted') {
    return 'granted';
  }
  if (value === 'denied') {
    return 'denied';
  }
  if (value === 'prompt' || value === 'prompt-with-rationale') {
    return 'prompt';
  }
  return 'prompt';
};

export const normalizeExactAlarmState = (raw) => {
  const value = String(raw?.exact_alarm ?? raw ?? '')
    .trim()
    .toLowerCase();
  return value === 'granted' ? 'granted' : 'denied';
};

export const normalizeBackgroundHealthState = (raw) => {
  const value = String(raw?.status ?? raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'granted') {
    return 'granted';
  }
  if (value === 'denied') {
    return 'denied';
  }
  return 'unavailable';
};

export const isNotificationPlatform = () => isNative();

// ---------------------------------------------------------------------------
// Layer 1: Local Notifications
// ---------------------------------------------------------------------------

export const checkLocalNotificationPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  const { LocalNotifications } = await loadLocalPluginModule();
  const result = await LocalNotifications.checkPermissions();
  return normalizePermissionState(result);
};

export const requestLocalNotificationPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  const { LocalNotifications } = await loadLocalPluginModule();
  const result = await LocalNotifications.requestPermissions();
  return normalizePermissionState(result);
};

export const checkExactAlarmPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  if (!isAndroid()) {
    // iOS UNUserNotificationCenter triggers are exact by default.
    return 'granted';
  }
  try {
    const { LocalNotifications } = await loadLocalPluginModule();
    if (
      typeof LocalNotifications.checkExactNotificationSetting !== 'function'
    ) {
      return 'denied';
    }
    const result = await LocalNotifications.checkExactNotificationSetting();
    return normalizeExactAlarmState(result);
  } catch (error) {
    console.warn('[Notifications] Exact alarm check failed:', error);
    return 'denied';
  }
};

export const openExactAlarmSettings = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  if (!isAndroid()) {
    return 'granted';
  }
  try {
    const { LocalNotifications } = await loadLocalPluginModule();
    if (
      typeof LocalNotifications.changeExactNotificationSetting !== 'function'
    ) {
      return checkExactAlarmPermission();
    }
    const result = await LocalNotifications.changeExactNotificationSetting();
    return normalizeExactAlarmState(result);
  } catch (error) {
    console.warn('[Notifications] Could not open exact alarm settings:', error);
    return checkExactAlarmPermission();
  }
};

export const createNotificationChannels = async (channels = []) => {
  if (!isAndroid() || !Array.isArray(channels) || channels.length === 0) {
    return;
  }
  const { LocalNotifications } = await loadLocalPluginModule();
  for (const channel of channels) {
    try {
      await LocalNotifications.createChannel(channel);
    } catch (error) {
      console.warn(
        `[Notifications] Could not create channel ${channel?.id}:`,
        error
      );
    }
  }
};

export const getPendingLocalNotifications = async () => {
  if (!isNotificationPlatform()) {
    return [];
  }
  const { LocalNotifications } = await loadLocalPluginModule();
  const result = await LocalNotifications.getPending();
  return Array.isArray(result?.notifications) ? result.notifications : [];
};

export const scheduleLocalNotifications = async (notifications = []) => {
  if (
    !isNotificationPlatform() ||
    !Array.isArray(notifications) ||
    notifications.length === 0
  ) {
    return;
  }
  const { LocalNotifications } = await loadLocalPluginModule();
  // Capacitor 8 defaults `isExactNotification` to `true`, which launches the
  // Android 12+ Alarms & Reminders settings screen if permission is missing.
  // Keep `false` as the safe default unless the caller explicitly verified
  // exact-alarm permission and passed `isExactNotification: true`.
  const normalized = notifications.map((item) => ({
    ...item,
    isExactNotification: item?.isExactNotification ?? false,
  }));
  await LocalNotifications.schedule({ notifications: normalized });
};

export const cancelLocalNotifications = async (ids = []) => {
  if (!isNotificationPlatform() || !Array.isArray(ids) || ids.length === 0) {
    return;
  }
  const { LocalNotifications } = await loadLocalPluginModule();
  await LocalNotifications.cancel({
    notifications: ids.map((id) => ({ id })),
  });
};

export const removeDeliveredLocalNotifications = async (ids = []) => {
  if (!isNotificationPlatform() || !Array.isArray(ids) || ids.length === 0) {
    return;
  }
  const { LocalNotifications } = await loadLocalPluginModule();
  if (typeof LocalNotifications.removeDeliveredNotifications !== 'function') {
    return;
  }
  await LocalNotifications.removeDeliveredNotifications({
    notifications: ids.map((id) => ({ id })),
  });
};

export const addLocalNotificationActionListener = async (callback) => {
  if (!isNotificationPlatform()) {
    return { remove: async () => {} };
  }
  const { LocalNotifications } = await loadLocalPluginModule();
  return LocalNotifications.addListener(
    'localNotificationActionPerformed',
    callback
  );
};

// ---------------------------------------------------------------------------
// Native Reliability: Android Battery Optimization & Background Health Sync
// ---------------------------------------------------------------------------

export const checkBatteryOptimizationIgnored = async () => {
  if (!isAndroid()) {
    return null;
  }
  const plugin = getReliabilityPlugin();
  if (typeof plugin?.isIgnoringBatteryOptimizations !== 'function') {
    return null;
  }
  try {
    const result = await plugin.isIgnoringBatteryOptimizations();
    return typeof result?.ignoring === 'boolean' ? result.ignoring : null;
  } catch (error) {
    console.warn('[Notifications] Battery optimization check failed:', error);
    return null;
  }
};

export const openBatteryOptimizationSettings = async () => {
  if (!isAndroid()) {
    return false;
  }
  const plugin = getReliabilityPlugin();
  if (typeof plugin?.openBatteryOptimizationSettings !== 'function') {
    return false;
  }
  try {
    const result = await plugin.openBatteryOptimizationSettings();
    return Boolean(result?.opened);
  } catch (error) {
    console.warn('[Notifications] Could not open battery settings:', error);
    return false;
  }
};

export const checkHealthBackgroundPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  const plugin = getReliabilityPlugin();
  if (typeof plugin?.checkHealthBackgroundPermission !== 'function') {
    return 'unavailable';
  }
  try {
    const result = await plugin.checkHealthBackgroundPermission();
    return normalizeBackgroundHealthState(result);
  } catch (error) {
    console.warn(
      '[Notifications] Background health permission check failed:',
      error
    );
    return 'unavailable';
  }
};

export const requestHealthBackgroundPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  const plugin = getReliabilityPlugin();
  if (typeof plugin?.requestHealthBackgroundPermission !== 'function') {
    return 'unavailable';
  }
  try {
    const result = await plugin.requestHealthBackgroundPermission();
    return normalizeBackgroundHealthState(result);
  } catch (error) {
    console.warn(
      '[Notifications] Background health permission request failed:',
      error
    );
    return 'denied';
  }
};

export const syncBackgroundWorkoutContext = async (payload) => {
  if (!isNotificationPlatform()) {
    return { scheduled: false, backgroundPermission: 'unavailable' };
  }
  const plugin = getReliabilityPlugin();
  if (typeof plugin?.syncBackgroundWorkoutContext !== 'function') {
    return { scheduled: false, backgroundPermission: 'unavailable' };
  }
  try {
    const result = await plugin.syncBackgroundWorkoutContext(payload);
    return {
      scheduled: Boolean(result?.scheduled),
      backgroundPermission: normalizeBackgroundHealthState(
        result?.backgroundPermission
      ),
    };
  } catch (error) {
    console.warn(
      '[Notifications] Background workout sync context update failed:',
      error
    );
    return { scheduled: false, backgroundPermission: 'unavailable' };
  }
};

// ---------------------------------------------------------------------------
// Layer 2: Remote Push Notifications (FCM / APNs)
// ---------------------------------------------------------------------------

export const checkPushNotificationPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  const { PushNotifications } = await loadPushPluginModule();
  const result = await PushNotifications.checkPermissions();
  return normalizePermissionState(result);
};

export const requestPushNotificationPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  const { PushNotifications } = await loadPushPluginModule();
  const result = await PushNotifications.requestPermissions();
  return normalizePermissionState(result);
};

export const registerForRemotePush = async () => {
  if (!isNotificationPlatform()) {
    return;
  }
  const { PushNotifications } = await loadPushPluginModule();
  await PushNotifications.register();
};

export const unregisterFromRemotePush = async () => {
  if (!isNotificationPlatform()) {
    return;
  }
  const { PushNotifications } = await loadPushPluginModule();
  if (typeof PushNotifications.unregister === 'function') {
    await PushNotifications.unregister();
  }
};

export const addPushNotificationListeners = async ({
  onRegistration,
  onRegistrationError,
  onReceived,
  onActionPerformed,
} = {}) => {
  if (!isNotificationPlatform()) {
    return { removeAll: async () => {} };
  }
  const { PushNotifications } = await loadPushPluginModule();
  const handles = [];

  if (typeof onRegistration === 'function') {
    handles.push(
      await PushNotifications.addListener('registration', onRegistration)
    );
  }
  if (typeof onRegistrationError === 'function') {
    handles.push(
      await PushNotifications.addListener(
        'registrationError',
        onRegistrationError
      )
    );
  }
  if (typeof onReceived === 'function') {
    handles.push(
      await PushNotifications.addListener(
        'pushNotificationReceived',
        onReceived
      )
    );
  }
  if (typeof onActionPerformed === 'function') {
    handles.push(
      await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        onActionPerformed
      )
    );
  }

  return {
    removeAll: async () => {
      for (const handle of handles) {
        try {
          await handle?.remove?.();
        } catch {
          // Best-effort cleanup.
        }
      }
    },
  };
};
