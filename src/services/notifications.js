/**
 * Unified Notification Subsystem (Layer 1 Local + Layer 2 Remote Push).
 *
 * A module singleton mirroring `services/heartRateSync.js`, exposed to React
 * via `useNotificationState()` (`useSyncExternalStore`).
 *
 * Responsibilities:
 * - Permission lifecycle for local, exact-alarm (Android), background health
 *   reads, and remote push notifications
 * - Android battery-optimization awareness & one-tap settings shortcut
 * - Android channel registration (`reminders`, `insights`, `workouts`, `announcements`)
 * - Idempotent diff-and-reconcile scheduling of planned local notifications
 * - One-shot immediate alerts (Smart AT unlock, unimported health workouts)
 * - Native background workout sync context (Android WorkManager / iOS HealthKit)
 * - Live BLE heart-rate recording guard (ongoing banner + 2.5h forgot-to-stop)
 * - Remote push token registration & backend sync (`/api/push/register|unregister`)
 * - Tap deep-link routing with cold-start buffering until the UI mounts
 */
import { useSyncExternalStore } from 'react';
import { Preferences } from '@capacitor/preferences';
import {
  MANAGED_SCHEDULE_ID_MAX,
  MANAGED_SCHEDULE_ID_MIN,
  NOTIFICATION_CHANNEL_IDS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_ID_RANGES,
  NOTIFICATION_ROUTES,
  PUSH_TOPICS,
  normalizeNotificationSettings,
} from '../constants/notifications/notificationConfig.js';
import { isHeartRateTrackingEnabled } from '../constants/health/heartRate.js';
import {
  buildLiveHrGuardNotifications,
  buildNotificationPlan,
  findUnimportedHealthWorkouts,
} from '../utils/notifications/notificationPlanner.js';
import {
  addLocalNotificationActionListener,
  addPushNotificationListeners,
  cancelLocalNotifications,
  checkBatteryOptimizationIgnored,
  checkExactAlarmPermission,
  checkHealthBackgroundPermission,
  checkLocalNotificationPermission,
  checkPushNotificationPermission,
  createNotificationChannels,
  getPendingLocalNotifications,
  isNotificationPlatform,
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  registerForRemotePush,
  removeDeliveredLocalNotifications,
  requestHealthBackgroundPermission,
  requestLocalNotificationPermission,
  requestPushNotificationPermission,
  scheduleLocalNotifications,
  syncBackgroundWorkoutContext,
  unregisterFromRemotePush,
} from './notificationBridge.js';
import {
  loadPushRegistrationCache,
  registerPushDeviceWithServer,
  unregisterPushDeviceWithServer,
} from './pushRegistration.js';
import { useEnergyMapStore } from '../store/useEnergyMapStore.js';

const NOTIFIED_WORKOUTS_KEY = 'energyMapNotifiedHealthWorkouts';
const MAX_STORED_WORKOUT_IDS = 80;
const BG_SESSION_LOOKBACK_MS = 72 * 3600_000;

const INITIAL_STATE = Object.freeze({
  platformSupported: false,
  permission: 'unavailable', // 'unavailable' | 'prompt' | 'granted' | 'denied'
  exactAlarmPermission: 'unavailable', // 'unavailable' | 'granted' | 'denied'
  batteryOptimizationIgnored: null, // null | boolean (Android only)
  backgroundHealthPermission: 'unavailable', // 'unavailable' | 'granted' | 'denied'
  pushPermission: 'unavailable',
  pushStatus: 'idle', // 'idle' | 'registering' | 'registered' | 'pending_sync' | 'error'
  pushToken: null,
  pushError: null,
  pendingCount: 0,
  lastReconciledAt: null,
  lastTestSentAt: null,
  lastBannerPreview: null, // Used in web dev so test/immediate alerts are visible
  error: null,
});

let state = INITIAL_STATE;
const listeners = new Set();

let isInitialized = false;
let localActionHandle = null;
let pushListenerHandles = null;
let tapHandler = null;
let bufferedTapAction = null;
let lastScheduleSignatureMap = new Map();
let activeLiveHrSessionStartedAt = null;
let unimportedWorkoutSeq = 0;

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const getNotificationState = () => state;

export const subscribeNotificationState = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useNotificationState = () =>
  useSyncExternalStore(
    subscribeNotificationState,
    getNotificationState,
    getNotificationState
  );

const buildSignature = (item) =>
  JSON.stringify({
    title: item.title,
    body: item.body,
    channelId: item.channelId,
    exact: Boolean(item.isExactNotification),
    at: item.schedule?.at instanceof Date ? item.schedule.at.getTime() : null,
    extra: item.extra ?? null,
  });

const dispatchTapAction = (extra) => {
  if (!extra || typeof extra !== 'object') {
    return;
  }
  const route = extra.route;
  if (!route) {
    return;
  }
  if (typeof tapHandler === 'function') {
    tapHandler(extra);
  } else {
    bufferedTapAction = extra;
  }
};

/**
 * Registers the UI orchestrator's tap handler and immediately flushes any
 * cold-start notification tap that arrived before hydration completed.
 */
export const registerNotificationTapHandler = (handler) => {
  tapHandler = typeof handler === 'function' ? handler : null;
  if (tapHandler && bufferedTapAction) {
    const pending = bufferedTapAction;
    bufferedTapAction = null;
    tapHandler(pending);
  }
  return () => {
    if (tapHandler === handler) {
      tapHandler = null;
    }
  };
};

const handleRemotePushRegistrationToken = async (tokenEvent) => {
  const token = String(tokenEvent?.value ?? '').trim();
  if (!token) {
    return;
  }
  setState({ pushToken: token, pushError: null });

  const settings = normalizeNotificationSettings(
    useEnergyMapStore.getState().userData?.notifications
  );
  if (!settings.enabled || !settings.remotePush.announcementsEnabled) {
    return;
  }

  const result = await registerPushDeviceWithServer({
    token,
    topics: [PUSH_TOPICS.ANNOUNCEMENTS],
  });
  if (result.ok) {
    setState({ pushStatus: 'registered', pushError: null });
  } else {
    setState({
      pushStatus: 'pending_sync',
      pushError: result.error || 'Could not register for remote updates.',
    });
  }
};

const handleRemotePushRegistrationError = (errorEvent) => {
  const message =
    String(errorEvent?.error ?? errorEvent?.message ?? '').trim() ||
    'Remote push registration failed on this device.';
  setState({ pushStatus: 'error', pushError: message });
};

const handleRemotePushAction = (actionEvent) => {
  const data = actionEvent?.notification?.data;
  if (data && typeof data === 'object') {
    dispatchTapAction({
      route: data.route || NOTIFICATION_ROUTES.OPEN_HOME,
      ...data,
    });
  }
};

const loadNotifiedWorkoutIds = async () => {
  try {
    const { value } = await Preferences.get({ key: NOTIFIED_WORKOUTS_KEY });
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveNotifiedWorkoutIds = async (ids) => {
  try {
    const trimmed = ids.slice(-MAX_STORED_WORKOUT_IDS);
    await Preferences.set({
      key: NOTIFIED_WORKOUTS_KEY,
      value: JSON.stringify(trimmed),
    });
  } catch (error) {
    console.warn('[Notifications] Could not save notified workout IDs:', error);
  }
};

const buildBackgroundWorkoutSyncPayload = ({
  userData = {},
  permission = state.permission,
  notifiedWorkoutIds = [],
  nowMs = Date.now(),
} = {}) => {
  const settings = normalizeNotificationSettings(userData.notifications);
  const enabled = Boolean(
    settings.enabled &&
    settings.rules.unimportedWorkout.enabled &&
    permission === 'granted' &&
    userData?.heartRateSyncEnabled &&
    isHeartRateTrackingEnabled(userData)
  );

  const allSessions = [
    ...(Array.isArray(userData.cardioSessions) ? userData.cardioSessions : []),
    ...(Array.isArray(userData.trainingSessions)
      ? userData.trainingSessions
      : []),
  ];

  const loggedIdSet = new Set();
  const loggedSessionWindows = [];
  const cutoffMs = nowMs - BG_SESSION_LOOKBACK_MS;

  allSessions.forEach((session) => {
    if (!session || typeof session !== 'object') {
      return;
    }
    const workoutId = String(
      session.healthWorkoutId ?? session.importedWorkoutId ?? ''
    ).trim();
    if (workoutId) {
      loggedIdSet.add(workoutId);
    }
    const startMs = Number(
      session.timestamp ?? session.startTimestamp ?? session.startedAt
    );
    const endMs = Number(session.endTimestamp ?? session.endedAt);
    if (
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      endMs > startMs &&
      endMs >= cutoffMs
    ) {
      loggedSessionWindows.push({ startMs, endMs });
    }
  });

  return {
    enabled,
    loggedWorkoutIds: Array.from(loggedIdSet).slice(-MAX_STORED_WORKOUT_IDS),
    loggedSessionWindows: loggedSessionWindows.slice(-60),
    notifiedWorkoutIds: Array.isArray(notifiedWorkoutIds)
      ? notifiedWorkoutIds.slice(-MAX_STORED_WORKOUT_IDS)
      : [],
  };
};

const pushBackgroundWorkoutSyncContext = async ({
  userData,
  permission,
  notifiedWorkoutIds,
  nowMs,
} = {}) => {
  if (!isNotificationPlatform()) {
    return { scheduled: false, backgroundPermission: 'unavailable' };
  }
  const ids = notifiedWorkoutIds ?? (await loadNotifiedWorkoutIds());
  const payload = buildBackgroundWorkoutSyncPayload({
    userData: userData ?? useEnergyMapStore.getState().userData ?? {},
    permission: permission ?? state.permission,
    notifiedWorkoutIds: ids,
    nowMs,
  });
  return syncBackgroundWorkoutContext(payload);
};

/**
 * Initializes notification channels, permission state, exact-alarm & battery
 * reliability status, cached remote push state, and OS tap/push listeners.
 * Safe to call repeatedly.
 */
export const initializeNotifications = async () => {
  const supported = isNotificationPlatform();
  if (!supported) {
    setState({
      platformSupported: false,
      permission: 'unavailable',
      exactAlarmPermission: 'unavailable',
      batteryOptimizationIgnored: null,
      backgroundHealthPermission: 'unavailable',
      pushPermission: 'unavailable',
    });
    return false;
  }

  try {
    await createNotificationChannels(NOTIFICATION_CHANNELS);
    const [
      permission,
      exactAlarmPermission,
      batteryOptimizationIgnored,
      backgroundHealthPermission,
      pushPermission,
      cachedPush,
    ] = await Promise.all([
      checkLocalNotificationPermission(),
      checkExactAlarmPermission(),
      checkBatteryOptimizationIgnored(),
      checkHealthBackgroundPermission(),
      checkPushNotificationPermission(),
      loadPushRegistrationCache(),
    ]);

    setState({
      platformSupported: true,
      permission,
      exactAlarmPermission,
      batteryOptimizationIgnored,
      backgroundHealthPermission,
      pushPermission,
      pushToken: cachedPush?.token ?? state.pushToken,
      pushStatus:
        cachedPush?.synced === true
          ? 'registered'
          : cachedPush?.token
            ? 'pending_sync'
            : 'idle',
      error: null,
    });

    if (!isInitialized) {
      localActionHandle = await addLocalNotificationActionListener((event) => {
        const extra = event?.notification?.extra;
        if (extra) {
          dispatchTapAction(extra);
        }
      });

      pushListenerHandles = await addPushNotificationListeners({
        onRegistration: handleRemotePushRegistrationToken,
        onRegistrationError: handleRemotePushRegistrationError,
        onActionPerformed: handleRemotePushAction,
      });
      isInitialized = true;
    }

    return true;
  } catch (error) {
    console.warn('[Notifications] Initialization failed:', error);
    setState({
      platformSupported: supported,
      error: error?.message || 'Could not initialize notifications.',
    });
    return false;
  }
};

/**
 * Requests OS notification permission cleanly in response to user action.
 */
export const requestNotificationPermission = async () => {
  if (!isNotificationPlatform()) {
    setState({ platformSupported: false, permission: 'unavailable' });
    return 'unavailable';
  }
  try {
    await createNotificationChannels(NOTIFICATION_CHANNELS);
    const permission = await requestLocalNotificationPermission();
    setState({ permission, error: null });
    return permission;
  } catch (error) {
    console.warn('[Notifications] Permission request failed:', error);
    setState({ error: 'Could not request notification permission.' });
    return state.permission;
  }
};

/**
 * Opens Android's Alarms & reminders settings so scheduled reminders can use
 * exact alarms (`setExactAndAllowWhileIdle`) instead of deferred inexact alarms.
 * Immediately re-reconciles pending schedules once granted.
 */
export const requestExactAlarmPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  const exactAlarmPermission = await openExactAlarmSettings();
  setState({ exactAlarmPermission, error: null });
  if (exactAlarmPermission === 'granted') {
    await reconcileNotifications();
  }
  return exactAlarmPermission;
};

/**
 * Opens the app's Android Battery / App Info screen so the user can switch
 * Battery to Unrestricted and prevent OEM Sleeping Apps from holding alarms.
 */
export const openBatterySettings = async () => {
  if (!isNotificationPlatform()) {
    return false;
  }
  const opened = await openBatteryOptimizationSettings();
  const batteryOptimizationIgnored = await checkBatteryOptimizationIgnored();
  setState({ batteryOptimizationIgnored });
  return opened;
};

/**
 * Requests background health-read access (Android Health Connect
 * `READ_HEALTH_DATA_IN_BACKGROUND`; iOS HealthKit uses background delivery
 * automatically once authorized) and updates the native background workout sync.
 */
export const requestBackgroundWorkoutPermission = async () => {
  if (!isNotificationPlatform()) {
    return 'unavailable';
  }
  const backgroundHealthPermission = await requestHealthBackgroundPermission();
  setState({ backgroundHealthPermission, error: null });
  await pushBackgroundWorkoutSyncContext();
  return backgroundHealthPermission;
};

/**
 * Coordinates Layer 2 remote push opt-in/out with OS registration + backend.
 */
export const syncRemotePushSubscription = async (notificationsSettings) => {
  const settings = normalizeNotificationSettings(notificationsSettings);
  const wantsRemote =
    settings.enabled && settings.remotePush.announcementsEnabled;

  if (!isNotificationPlatform()) {
    setState({
      pushStatus: wantsRemote ? 'pending_sync' : 'idle',
      pushError: null,
    });
    return false;
  }

  if (!wantsRemote) {
    if (
      state.pushStatus === 'registered' ||
      state.pushStatus === 'pending_sync' ||
      state.pushToken
    ) {
      await unregisterPushDeviceWithServer();
      try {
        await unregisterFromRemotePush();
      } catch {
        // Best-effort OS unregistration.
      }
    }
    setState({ pushStatus: 'idle', pushError: null });
    return true;
  }

  try {
    setState({ pushStatus: 'registering', pushError: null });
    let pushPermission = await checkPushNotificationPermission();
    if (pushPermission !== 'granted') {
      pushPermission = await requestPushNotificationPermission();
    }
    setState({ pushPermission });

    if (pushPermission !== 'granted') {
      setState({
        pushStatus: 'error',
        pushError: 'Push notification permission was denied.',
      });
      return false;
    }

    await registerForRemotePush();

    if (state.pushToken) {
      const result = await registerPushDeviceWithServer({
        token: state.pushToken,
        topics: [PUSH_TOPICS.ANNOUNCEMENTS],
      });
      if (result.ok) {
        setState({ pushStatus: 'registered', pushError: null });
        return true;
      }
      setState({
        pushStatus: 'pending_sync',
        pushError: result.error || 'Could not register for remote updates.',
      });
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[Notifications] Remote push sync failed:', error);
    setState({
      pushStatus: 'error',
      pushError: error?.message || 'Remote push registration failed.',
    });
    return false;
  }
};

const markAtUnlockNotifiedInStore = () => {
  const store = useEnergyMapStore.getState();
  const current = normalizeNotificationSettings(store.userData?.notifications);
  if (current.meta.atUnlockNotified) {
    return;
  }
  store.handleUserDataChange('notifications', {
    ...current,
    meta: {
      ...current.meta,
      atUnlockNotified: true,
    },
  });
};

/**
 * Reconciles the OS local notification queue against the pure planner output.
 * Cancels only stale/changed IDs and schedules only new/changed IDs.
 * Upgrades scheduled items to exact alarms whenever OS exact-alarm permission
 * is granted, and keeps native background workout sync context fresh.
 */
export const reconcileNotifications = async ({
  userData,
  derivedState,
  now = new Date(),
} = {}) => {
  const storeState = useEnergyMapStore.getState();
  const resolvedUserData = userData ?? storeState.userData ?? {};
  const resolvedDerived = derivedState ?? storeState;
  const settings = normalizeNotificationSettings(
    resolvedUserData.notifications
  );

  const plan = buildNotificationPlan({
    userData: resolvedUserData,
    derivedState: resolvedDerived,
    now,
  });

  if (!isNotificationPlatform()) {
    setState({
      pendingCount: plan.scheduled.length,
      lastReconciledAt: new Date(now),
    });
    return plan;
  }

  const [
    permission,
    exactAlarmPermission,
    batteryOptimizationIgnored,
    backgroundHealthPermission,
  ] = await Promise.all([
    checkLocalNotificationPermission(),
    checkExactAlarmPermission(),
    checkBatteryOptimizationIgnored(),
    checkHealthBackgroundPermission(),
  ]);

  setState({
    permission,
    exactAlarmPermission,
    batteryOptimizationIgnored,
    backgroundHealthPermission,
  });

  await pushBackgroundWorkoutSyncContext({
    userData: resolvedUserData,
    permission,
    nowMs: now instanceof Date ? now.getTime() : Date.now(),
  });

  if (!settings.enabled || permission !== 'granted') {
    const pending = await getPendingLocalNotifications();
    const managedIds = pending
      .map((item) => Number(item?.id))
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id >= MANAGED_SCHEDULE_ID_MIN &&
          id <= MANAGED_SCHEDULE_ID_MAX
      );
    if (managedIds.length > 0) {
      await cancelLocalNotifications(managedIds);
    }
    lastScheduleSignatureMap = new Map();
    setState({
      pendingCount: 0,
      lastReconciledAt: new Date(now),
    });
    return { scheduled: [], immediateEvents: [] };
  }

  const useExactAlarms = exactAlarmPermission === 'granted';
  const resolvedScheduled = plan.scheduled.map((item) => ({
    ...item,
    isExactNotification: useExactAlarms,
  }));

  const pending = await getPendingLocalNotifications();
  const pendingManagedIds = new Set(
    pending
      .map((item) => Number(item?.id))
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id >= MANAGED_SCHEDULE_ID_MIN &&
          id <= MANAGED_SCHEDULE_ID_MAX
      )
  );

  const nextSignatureMap = new Map();
  const toSchedule = [];
  const toCancel = [];

  resolvedScheduled.forEach((item) => {
    const signature = buildSignature(item);
    nextSignatureMap.set(item.id, signature);
    const alreadyPending = pendingManagedIds.has(item.id);
    const prevSignature = lastScheduleSignatureMap.get(item.id);
    if (!alreadyPending || prevSignature !== signature) {
      if (alreadyPending) {
        toCancel.push(item.id);
      }
      toSchedule.push(item);
    }
  });

  pendingManagedIds.forEach((id) => {
    if (!nextSignatureMap.has(id)) {
      toCancel.push(id);
    }
  });

  if (toCancel.length > 0) {
    await cancelLocalNotifications(toCancel);
  }
  if (toSchedule.length > 0) {
    await scheduleLocalNotifications(toSchedule);
  }

  // Fire any one-shot immediate events (e.g. Smart AT unlock).
  // Omit `schedule` so Android posts via NotificationManager.notify() right
  // away rather than waiting on an inexact AlarmManager batch window.
  if (plan.immediateEvents.length > 0) {
    const immediatePayloads = plan.immediateEvents.map((event) => ({
      id: event.id,
      title: event.title,
      body: event.body,
      channelId: event.channelId,
      foreground: true,
      isExactNotification: false,
      extra: event.extra,
    }));
    await scheduleLocalNotifications(immediatePayloads);
    plan.immediateEvents.forEach((event) => {
      if (event.key === 'at_smart_unlock') {
        markAtUnlockNotifiedInStore();
      }
    });
  }

  lastScheduleSignatureMap = nextSignatureMap;
  setState({
    pendingCount: resolvedScheduled.length,
    lastReconciledAt: new Date(now),
    error: null,
  });
  return {
    scheduled: resolvedScheduled,
    immediateEvents: plan.immediateEvents,
  };
};

/**
 * Fires a quick test notification so the user can verify banners/sounds.
 */
export const sendTestNotification = async () => {
  const now = new Date();
  if (!isNotificationPlatform()) {
    setState({
      lastTestSentAt: now,
      lastBannerPreview: {
        title: 'Energy Map test notification',
        body: 'Notifications are active. On iOS and Android this arrives in your system tray.',
        sentAt: now.getTime(),
      },
    });
    return { ok: true, mode: 'preview' };
  }

  let permission = await checkLocalNotificationPermission();
  if (permission !== 'granted') {
    permission = await requestLocalNotificationPermission();
    setState({ permission });
  }
  if (permission !== 'granted') {
    return {
      ok: false,
      error: 'Allow notifications in system settings to run a test.',
    };
  }

  try {
    await createNotificationChannels(NOTIFICATION_CHANNELS);
    // Omit `schedule` + set `foreground: true` so Android delivers immediately
    // via NotificationManager.notify() instead of deferring through an inexact
    // AlarmManager batch window (which can delay delivery by minutes on One UI).
    await scheduleLocalNotifications([
      {
        id: NOTIFICATION_ID_RANGES.TEST_NOTIFICATION,
        title: 'Energy Map test notification',
        body: 'Notifications are configured and ready for your daily ledger.',
        channelId: NOTIFICATION_CHANNEL_IDS.REMINDERS,
        foreground: true,
        isExactNotification: false,
        extra: {
          route: NOTIFICATION_ROUTES.OPEN_HOME,
        },
      },
    ]);

    setState({ lastTestSentAt: now, error: null });
    return { ok: true, mode: 'native' };
  } catch (error) {
    console.warn('[Notifications] Test notification failed:', error);
    const message =
      error?.message || 'Could not deliver the test notification.';
    setState({ error: message });
    return { ok: false, error: message };
  }
};

// ---------------------------------------------------------------------------
// #11: Unimported Health Workouts Alert
// ---------------------------------------------------------------------------

/**
 * Inspects newly synced health workouts and fires a local alert for any
 * unimported workout not previously notified.
 */
export const notifyUnimportedHealthWorkouts = async (workouts = []) => {
  const storeState = useEnergyMapStore.getState();
  const userData = storeState.userData ?? {};
  const settings = normalizeNotificationSettings(userData.notifications);
  if (!settings.enabled || !settings.rules.unimportedWorkout.enabled) {
    return 0;
  }

  const notifiedIds = await loadNotifiedWorkoutIds();
  const unimported = findUnimportedHealthWorkouts({
    workouts,
    cardioSessions: userData.cardioSessions ?? [],
    trainingSessions: userData.trainingSessions ?? [],
    notifiedIds,
  });

  if (unimported.length === 0) {
    return 0;
  }

  const nextIds = [...notifiedIds, ...unimported.map((w) => String(w.id))];
  await saveNotifiedWorkoutIds(nextIds);
  await pushBackgroundWorkoutSyncContext({
    userData,
    notifiedWorkoutIds: nextIds,
  });

  if (!isNotificationPlatform() || state.permission !== 'granted') {
    return unimported.length;
  }

  const first = unimported[0];
  const count = unimported.length;
  const title =
    count === 1
      ? 'Unimported workout detected'
      : `${count} unimported workouts detected`;
  const body =
    count === 1
      ? `${first.durationMinutes} min ${first.workoutType} from ${first.sourceName || 'Health'}. Tap to import so today’s TDEE includes it.`
      : `Tap to import ${count} synced workouts from Health into your activity log.`;

  const id =
    NOTIFICATION_ID_RANGES.UNIMPORTED_WORKOUT + (unimportedWorkoutSeq % 50);
  unimportedWorkoutSeq += 1;

  await scheduleLocalNotifications([
    {
      id,
      title,
      body,
      channelId: NOTIFICATION_CHANNEL_IDS.WORKOUTS,
      foreground: true,
      isExactNotification: false,
      extra: {
        route: NOTIFICATION_ROUTES.OPEN_CARDIO_IMPORT,
      },
    },
  ]);

  return unimported.length;
};

// ---------------------------------------------------------------------------
// #12: Live BLE Heart-Rate Recording Guard
// ---------------------------------------------------------------------------

/**
 * Synchronizes the live BLE HR recording ongoing status notification and
 * 2.5-hour forgot-to-stop alert whenever recording state changes.
 */
export const syncLiveHeartRateGuard = async (recording) => {
  const storeState = useEnergyMapStore.getState();
  const settings = normalizeNotificationSettings(
    storeState.userData?.notifications
  );
  const guardEnabled = settings.enabled && settings.rules.liveHrGuard.enabled;

  if (!recording || !guardEnabled) {
    if (activeLiveHrSessionStartedAt !== null) {
      activeLiveHrSessionStartedAt = null;
      if (isNotificationPlatform()) {
        const ids = [
          NOTIFICATION_ID_RANGES.LIVE_HR_ONGOING,
          NOTIFICATION_ID_RANGES.LIVE_HR_FORGOT,
        ];
        await cancelLocalNotifications(ids);
        await removeDeliveredLocalNotifications(ids);
      }
    }
    return;
  }

  if (activeLiveHrSessionStartedAt === recording.startedAt) {
    return;
  }
  activeLiveHrSessionStartedAt = recording.startedAt;

  if (!isNotificationPlatform() || state.permission !== 'granted') {
    return;
  }

  const { ongoing, forgotAlert } = buildLiveHrGuardNotifications({
    startedAtMs: recording.startedAt,
    kind: recording.kind,
  });

  const batch = [];
  if (ongoing) {
    batch.push(ongoing);
  }
  if (forgotAlert) {
    batch.push({
      ...forgotAlert,
      isExactNotification: state.exactAlarmPermission === 'granted',
    });
  }
  if (batch.length > 0) {
    await scheduleLocalNotifications(batch);
  }
};

/** Test seam: restores pristine module state. */
export const resetNotificationState = async () => {
  try {
    await localActionHandle?.remove?.();
  } catch {
    // ignore
  }
  try {
    await pushListenerHandles?.removeAll?.();
  } catch {
    // ignore
  }
  isInitialized = false;
  localActionHandle = null;
  pushListenerHandles = null;
  tapHandler = null;
  bufferedTapAction = null;
  lastScheduleSignatureMap = new Map();
  activeLiveHrSessionStartedAt = null;
  unimportedWorkoutSeq = 0;
  state = INITIAL_STATE;
  listeners.forEach((listener) => listener());
};
