import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CapacitorMock,
  LocalNotificationsMock,
  NotificationReliabilityMock,
  PreferencesMock,
  PushNotificationsMock,
} from '../tests/mocks/capacitor.js';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_ID_RANGES,
  NOTIFICATION_ROUTES,
  createDefaultNotificationSettings,
} from '../constants/notifications/notificationConfig.js';
import {
  getNotificationState,
  initializeNotifications,
  notifyUnimportedHealthWorkouts,
  openBatterySettings,
  reconcileNotifications,
  registerNotificationTapHandler,
  requestBackgroundWorkoutPermission,
  requestExactAlarmPermission,
  requestNotificationPermission,
  resetNotificationState,
  sendTestNotification,
  syncLiveHeartRateGuard,
  syncRemotePushSubscription,
} from './notifications.js';
import { useEnergyMapStore } from '../store/useEnergyMapStore.js';

describe('notifications service (Layer 1 local + Layer 2 remote push)', () => {
  beforeEach(async () => {
    await resetNotificationState();
    await PreferencesMock.clear();
    useEnergyMapStore.setState(useEnergyMapStore.getInitialState());

    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    LocalNotificationsMock.checkPermissions.mockResolvedValue({
      display: 'granted',
    });
    LocalNotificationsMock.requestPermissions.mockResolvedValue({
      display: 'granted',
    });
    LocalNotificationsMock.checkExactNotificationSetting.mockResolvedValue({
      exact_alarm: 'granted',
    });
    LocalNotificationsMock.changeExactNotificationSetting.mockResolvedValue({
      exact_alarm: 'granted',
    });
    LocalNotificationsMock.getPending.mockResolvedValue({ notifications: [] });
    LocalNotificationsMock.schedule.mockResolvedValue({ notifications: [] });
    LocalNotificationsMock.cancel.mockResolvedValue();
    LocalNotificationsMock.createChannel.mockResolvedValue();
    LocalNotificationsMock.removeDeliveredNotifications.mockResolvedValue();

    NotificationReliabilityMock.isIgnoringBatteryOptimizations.mockResolvedValue(
      { ignoring: true }
    );
    NotificationReliabilityMock.openBatteryOptimizationSettings.mockResolvedValue(
      { opened: true }
    );
    NotificationReliabilityMock.checkHealthBackgroundPermission.mockResolvedValue(
      { status: 'granted' }
    );
    NotificationReliabilityMock.requestHealthBackgroundPermission.mockResolvedValue(
      { status: 'granted' }
    );
    NotificationReliabilityMock.syncBackgroundWorkoutContext.mockResolvedValue({
      scheduled: true,
      backgroundPermission: 'granted',
    });

    PushNotificationsMock.checkPermissions.mockResolvedValue({
      receive: 'granted',
    });
    PushNotificationsMock.requestPermissions.mockResolvedValue({
      receive: 'granted',
    });
    PushNotificationsMock.register.mockResolvedValue();
    PushNotificationsMock.unregister.mockResolvedValue();
  });

  afterEach(async () => {
    await resetNotificationState();
    CapacitorMock.isNativePlatform.mockReturnValue(false);
    CapacitorMock.getPlatform.mockReturnValue('web');
    vi.restoreAllMocks();
  });

  it('creates Android notification channels on init and tracks permission state', async () => {
    const ok = await initializeNotifications();
    expect(ok).toBe(true);
    expect(LocalNotificationsMock.createChannel).toHaveBeenCalledTimes(
      NOTIFICATION_CHANNELS.length
    );
    expect(getNotificationState().permission).toBe('granted');
    expect(getNotificationState().platformSupported).toBe(true);
  });

  it('buffers a cold-start notification tap until the UI handler registers', async () => {
    let capturedActionCallback = null;
    LocalNotificationsMock.addListener.mockImplementation(
      async (_event, cb) => {
        capturedActionCallback = cb;
        return { remove: vi.fn(async () => {}) };
      }
    );

    await initializeNotifications();
    capturedActionCallback({
      notification: {
        extra: {
          route: NOTIFICATION_ROUTES.OPEN_WEIGHT_ENTRY,
          dateKey: '2026-05-10',
        },
      },
    });

    const handler = vi.fn();
    registerNotificationTapHandler(handler);
    expect(handler).toHaveBeenCalledWith({
      route: NOTIFICATION_ROUTES.OPEN_WEIGHT_ENTRY,
      dateKey: '2026-05-10',
    });
  });

  it('reconciles schedules idempotently and cancels managed IDs when disabled', async () => {
    await initializeNotifications();
    const now = new Date(2026, 4, 10, 6, 0, 0, 0);
    const enabledNotifs = {
      ...createDefaultNotificationSettings(),
      enabled: true,
    };

    const plan = await reconcileNotifications({
      now,
      userData: { notifications: enabledNotifs, stepGoal: 10000 },
      derivedState: {},
    });

    expect(plan.scheduled.length).toBeGreaterThan(0);
    expect(LocalNotificationsMock.schedule).toHaveBeenCalledTimes(1);

    // Simulate OS holding those pending IDs; disabling cancels all managed IDs.
    LocalNotificationsMock.getPending.mockResolvedValue({
      notifications: plan.scheduled.map((item) => ({ id: item.id })),
    });
    await reconcileNotifications({
      now,
      userData: {
        notifications: { ...enabledNotifs, enabled: false },
      },
      derivedState: {},
    });

    expect(LocalNotificationsMock.cancel).toHaveBeenCalledTimes(1);
    expect(getNotificationState().pendingCount).toBe(0);
  });

  it('sends a native test notification and supports web dev preview mode', async () => {
    const nativeResult = await sendTestNotification();
    expect(nativeResult).toEqual({ ok: true, mode: 'native' });
    expect(LocalNotificationsMock.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        notifications: [
          expect.objectContaining({
            id: NOTIFICATION_ID_RANGES.TEST_NOTIFICATION,
            foreground: true,
            isExactNotification: false,
          }),
        ],
      })
    );
    const scheduledTest =
      LocalNotificationsMock.schedule.mock.calls[0][0].notifications[0];
    expect(scheduledTest.schedule).toBeUndefined();

    CapacitorMock.isNativePlatform.mockReturnValue(false);
    const previewResult = await sendTestNotification();
    expect(previewResult).toEqual({ ok: true, mode: 'preview' });
    expect(getNotificationState().lastBannerPreview?.title).toMatch(/test/i);
  });

  it('notifies once per unimported health workout (#11) and deduplicates repeats', async () => {
    await initializeNotifications();
    useEnergyMapStore.getState().handleUserDataChange('notifications', {
      ...createDefaultNotificationSettings(),
      enabled: true,
    });

    const workouts = [
      {
        id: 'hc-run-1',
        workoutType: 'running',
        startMs: Date.now() - 3600_000,
        endMs: Date.now() - 1800_000,
        durationMinutes: 30,
        sourceName: 'Pixel Watch',
      },
    ];

    const firstCount = await notifyUnimportedHealthWorkouts(workouts);
    expect(firstCount).toBe(1);
    expect(LocalNotificationsMock.schedule).toHaveBeenCalledTimes(1);

    // Same workout synced again -> deduped, no second alert
    const secondCount = await notifyUnimportedHealthWorkouts(workouts);
    expect(secondCount).toBe(0);
    expect(LocalNotificationsMock.schedule).toHaveBeenCalledTimes(1);
  });

  it('arms and clears live BLE heart-rate recording guard notifications (#12)', async () => {
    await initializeNotifications();
    useEnergyMapStore.getState().handleUserDataChange('notifications', {
      ...createDefaultNotificationSettings(),
      enabled: true,
    });

    const startedAt = Date.now();
    await syncLiveHeartRateGuard({ startedAt, kind: 'cardio' });
    expect(LocalNotificationsMock.schedule).toHaveBeenCalledTimes(1);
    const scheduledBatch =
      LocalNotificationsMock.schedule.mock.calls[0][0].notifications;
    expect(scheduledBatch.map((item) => item.id)).toEqual([
      NOTIFICATION_ID_RANGES.LIVE_HR_ONGOING,
      NOTIFICATION_ID_RANGES.LIVE_HR_FORGOT,
    ]);

    // Stopping recording cancels + clears delivered guard notifications
    await syncLiveHeartRateGuard(null);
    expect(LocalNotificationsMock.cancel).toHaveBeenCalledWith({
      notifications: [
        { id: NOTIFICATION_ID_RANGES.LIVE_HR_ONGOING },
        { id: NOTIFICATION_ID_RANGES.LIVE_HR_FORGOT },
      ],
    });
    expect(
      LocalNotificationsMock.removeDeliveredNotifications
    ).toHaveBeenCalledTimes(1);
  });

  it('registers and unregisters Layer 2 remote push tokens with the backend', async () => {
    let registrationCallback = null;
    PushNotificationsMock.addListener.mockImplementation(async (event, cb) => {
      if (event === 'registration') {
        registrationCallback = cb;
      }
      return { remove: vi.fn(async () => {}) };
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await initializeNotifications();

    const optedInSettings = {
      ...createDefaultNotificationSettings(),
      enabled: true,
      remotePush: { announcementsEnabled: true },
    };
    useEnergyMapStore
      .getState()
      .handleUserDataChange('notifications', optedInSettings);

    await syncRemotePushSubscription(optedInSettings);
    expect(PushNotificationsMock.register).toHaveBeenCalledTimes(1);

    await registrationCallback({ value: 'fcm-device-token-123' });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/push\/register$/),
      expect.objectContaining({ method: 'POST' })
    );
    expect(getNotificationState().pushStatus).toBe('registered');

    // Opting back out unregisters on backend and OS
    await syncRemotePushSubscription({
      ...optedInSettings,
      remotePush: { announcementsEnabled: false },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/push\/unregister$/),
      expect.objectContaining({ method: 'POST' })
    );
    expect(PushNotificationsMock.unregister).toHaveBeenCalledTimes(1);
    expect(getNotificationState().pushStatus).toBe('idle');
  });

  it('requests local permission cleanly via requestNotificationPermission', async () => {
    LocalNotificationsMock.requestPermissions.mockResolvedValue({
      display: 'denied',
    });
    const perm = await requestNotificationPermission();
    expect(perm).toBe('denied');
    expect(getNotificationState().permission).toBe('denied');
  });

  it('schedules inexact alarms when exact permission is denied and upgrades to exact once granted', async () => {
    LocalNotificationsMock.checkExactNotificationSetting.mockResolvedValue({
      exact_alarm: 'denied',
    });

    await initializeNotifications();
    expect(getNotificationState().exactAlarmPermission).toBe('denied');

    const now = new Date(2026, 4, 10, 6, 0, 0, 0);
    const enabledNotifs = {
      ...createDefaultNotificationSettings(),
      enabled: true,
    };
    useEnergyMapStore
      .getState()
      .handleUserDataChange('notifications', enabledNotifs);

    const firstPlan = await reconcileNotifications({
      now,
      userData: { notifications: enabledNotifs, stepGoal: 10000 },
      derivedState: {},
    });
    expect(
      firstPlan.scheduled.every((item) => item.isExactNotification === false)
    ).toBe(true);

    // Simulate OS holding those inexact IDs, then user grants Alarms & reminders.
    LocalNotificationsMock.getPending.mockResolvedValue({
      notifications: firstPlan.scheduled.map((item) => ({ id: item.id })),
    });
    LocalNotificationsMock.checkExactNotificationSetting.mockResolvedValue({
      exact_alarm: 'granted',
    });
    LocalNotificationsMock.changeExactNotificationSetting.mockResolvedValue({
      exact_alarm: 'granted',
    });

    const result = await requestExactAlarmPermission();
    expect(result).toBe('granted');
    expect(getNotificationState().exactAlarmPermission).toBe('granted');
    // Signature changed (exact: false -> true), so old inexact alarms are cancelled and rescheduled as exact.
    expect(LocalNotificationsMock.cancel).toHaveBeenCalledTimes(1);
    const latestScheduleCall =
      LocalNotificationsMock.schedule.mock.calls.at(-1)[0].notifications;
    expect(
      latestScheduleCall.every((item) => item.isExactNotification === true)
    ).toBe(true);
  });

  it('tracks Android battery optimization status and opens battery settings', async () => {
    NotificationReliabilityMock.isIgnoringBatteryOptimizations.mockResolvedValueOnce(
      { ignoring: false }
    );
    await initializeNotifications();
    expect(getNotificationState().batteryOptimizationIgnored).toBe(false);

    NotificationReliabilityMock.isIgnoringBatteryOptimizations.mockResolvedValueOnce(
      { ignoring: true }
    );
    const opened = await openBatterySettings();
    expect(opened).toBe(true);
    expect(
      NotificationReliabilityMock.openBatteryOptimizationSettings
    ).toHaveBeenCalledTimes(1);
    expect(getNotificationState().batteryOptimizationIgnored).toBe(true);
  });

  it('syncs background workout context and requests Health Connect background permission', async () => {
    NotificationReliabilityMock.checkHealthBackgroundPermission.mockResolvedValue(
      { status: 'denied' }
    );
    await initializeNotifications();
    expect(getNotificationState().backgroundHealthPermission).toBe('denied');

    const now = new Date(2026, 4, 10, 6, 0, 0, 0);
    const enabledNotifs = {
      ...createDefaultNotificationSettings(),
      enabled: true,
    };
    useEnergyMapStore
      .getState()
      .handleUserDataChange('heartRateSyncEnabled', true);
    useEnergyMapStore
      .getState()
      .handleUserDataChange('notifications', enabledNotifs);

    await reconcileNotifications({
      now,
      userData: {
        notifications: enabledNotifs,
        heartRateSyncEnabled: true,
        cardioSessions: [
          {
            id: 'c-1',
            healthWorkoutId: 'hc-logged-1',
            startedAt: now.getTime() - 3600_000,
            endedAt: now.getTime() - 1800_000,
          },
        ],
      },
      derivedState: {},
    });

    expect(
      NotificationReliabilityMock.syncBackgroundWorkoutContext
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        loggedWorkoutIds: ['hc-logged-1'],
        loggedSessionWindows: [
          {
            startMs: now.getTime() - 3600_000,
            endMs: now.getTime() - 1800_000,
          },
        ],
      })
    );

    NotificationReliabilityMock.requestHealthBackgroundPermission.mockResolvedValue(
      { status: 'granted' }
    );
    const bgStatus = await requestBackgroundWorkoutPermission();
    expect(bgStatus).toBe('granted');
    expect(getNotificationState().backgroundHealthPermission).toBe('granted');
  });
});
