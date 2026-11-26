import React, { useCallback, useState } from 'react';
import { Bell, Clock, Send, ShieldAlert } from 'lucide-react';
import {
  DAILY_NEAT_DAYS_MODES,
  STALE_WEIGH_IN_DAY_OPTIONS,
  WEEKDAY_OPTIONS,
  normalizeNotificationSettings,
} from '../../../../constants/notifications/notificationConfig';
import {
  openBatterySettings,
  requestBackgroundWorkoutPermission,
  requestExactAlarmPermission,
  requestNotificationPermission,
  sendTestNotification,
  useNotificationState,
} from '../../../../services/notifications';
import { isAndroid, isIOS } from '../../../../utils/platform';
import { SettingsReveal } from './SettingsReveal';

const formatTime12h = (timeStr) => {
  const match = String(timeStr ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr || '—';
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
};

const SwitchControl = ({ checked, onClick, ariaLabel, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    aria-disabled={disabled}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex items-center rounded-full shrink-0 ${
      disabled ? 'cursor-not-allowed opacity-60' : 'focus-ring pressable-inline'
    }`}
  >
    <span
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-[background-color,border-color,box-shadow] duration-300 ${
        checked
          ? 'bg-accent-emerald border-accent-emerald/70 shadow-[0_0_10px_rgb(var(--accent-emerald)/0.4)]'
          : 'bg-surface-highlight border-border shadow-none'
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-primary-foreground shadow-xs transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </span>
  </button>
);

const TimeChipButton = ({ label, time, onClick, ariaLabel }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-highlight px-3 py-1.5 text-sm font-medium text-foreground transition-all pressable-inline focus-ring md:hover:border-muted/50"
  >
    <Clock size={14} className="text-muted shrink-0" aria-hidden="true" />
    {label ? <span className="text-muted font-normal">{label}</span> : null}
    <span>{formatTime12h(time)}</span>
  </button>
);

const RuleCard = ({
  title,
  description,
  detail,
  checked,
  onToggle,
  ariaLabel,
  children,
}) => (
  <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium leading-tight">
          {title}
        </p>
        {description ? (
          <p className="text-muted text-xs mt-0.5">{description}</p>
        ) : null}
      </div>
      <SwitchControl
        checked={checked}
        onClick={onToggle}
        ariaLabel={ariaLabel}
      />
    </div>
    {detail ? (
      <p className="mt-1.5 text-xs text-foreground/80">{detail}</p>
    ) : null}
    {children ? (
      <SettingsReveal open={checked}>
        <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
      </SettingsReveal>
    ) : null}
  </div>
);

const SmallChipToggle = ({
  active,
  onClick,
  children,
  ariaLabel,
  compact = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={ariaLabel}
    className={`inline-flex items-center justify-center rounded-lg border py-1.5 text-sm font-medium transition-all pressable-inline focus-ring ${
      compact ? 'px-1' : 'px-3'
    } ${
      active
        ? 'bg-primary border-primary text-primary-foreground'
        : 'bg-surface-highlight border-border text-muted md:hover:border-muted/50'
    }`}
  >
    {children}
  </button>
);

const GroupHeading = ({ children }) => (
  <p className="text-foreground/80 text-sm font-medium mb-2">{children}</p>
);

const describePushStatus = (notifState, enabled) => {
  if (!enabled) {
    return 'Off — this device is not registered for remote announcements.';
  }
  if (!notifState.platformSupported) {
    return 'Saved for native builds (FCM on Android, APNs on iOS).';
  }
  if (notifState.pushStatus === 'registered') {
    return 'Registered anonymously for app & food-catalog announcements.';
  }
  if (notifState.pushStatus === 'registering') {
    return 'Registering device token…';
  }
  if (notifState.pushStatus === 'pending_sync') {
    return (
      notifState.pushError || 'Waiting for network to finish registration.'
    );
  }
  if (notifState.pushStatus === 'error') {
    return notifState.pushError || 'Remote push registration failed.';
  }
  return 'Ready to register on this device.';
};

export const NotificationsSettingsSection = ({
  userData,
  onFieldChange,
  onOpenTimePicker,
}) => {
  const notifState = useNotificationState();
  const settings = normalizeNotificationSettings(userData?.notifications);
  const { quietHours, rules, remotePush } = settings;
  const [testFeedback, setTestFeedback] = useState(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const updateNotifications = useCallback(
    (updater) => {
      const current = normalizeNotificationSettings(userData?.notifications);
      const next = updater(current);
      onFieldChange?.('notifications', next);
    },
    [onFieldChange, userData?.notifications]
  );

  const updateRule = useCallback(
    (ruleKey, patch) => {
      updateNotifications((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          [ruleKey]: {
            ...prev.rules[ruleKey],
            ...patch,
          },
        },
      }));
    },
    [updateNotifications]
  );

  const updateMealRule = useCallback(
    (mealKey, patch) => {
      updateNotifications((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          meals: {
            ...prev.rules.meals,
            [mealKey]: {
              ...prev.rules.meals[mealKey],
              ...patch,
            },
          },
        },
      }));
    },
    [updateNotifications]
  );

  const handleMasterToggle = useCallback(async () => {
    const nextEnabled = !settings.enabled;
    if (nextEnabled && notifState.platformSupported) {
      const permission = await requestNotificationPermission();
      if (permission === 'denied') {
        updateNotifications((prev) => ({ ...prev, enabled: false }));
        return;
      }
    }
    updateNotifications((prev) => ({ ...prev, enabled: nextEnabled }));
  }, [notifState.platformSupported, settings.enabled, updateNotifications]);

  const handleRequestPermission = useCallback(async () => {
    const permission = await requestNotificationPermission();
    if (permission === 'granted' && !settings.enabled) {
      updateNotifications((prev) => ({ ...prev, enabled: true }));
    }
  }, [settings.enabled, updateNotifications]);

  const handleRequestExactAlarm = useCallback(async () => {
    await requestExactAlarmPermission();
  }, []);

  const handleOpenBatterySettings = useCallback(async () => {
    await openBatterySettings();
  }, []);

  const handleRequestBackgroundWorkout = useCallback(async () => {
    await requestBackgroundWorkoutPermission();
  }, []);

  const handleSendTest = useCallback(async () => {
    setIsSendingTest(true);
    setTestFeedback(null);
    try {
      const result = await sendTestNotification();
      if (result.ok) {
        setTestFeedback(
          result.mode === 'native'
            ? 'Test notification sent — check your notification bar.'
            : 'Preview sent — on iOS and Android this appears in the OS notification tray.'
        );
      } else {
        setTestFeedback(result.error || 'Could not send test notification.');
      }
    } finally {
      setIsSendingTest(false);
    }
  }, []);

  const pickTime = useCallback(
    (title, currentValue, onSave) => {
      onOpenTimePicker?.({
        title,
        value: currentValue,
        onSave,
      });
    },
    [onOpenTimePicker]
  );

  const showDeniedBanner =
    notifState.platformSupported && notifState.permission === 'denied';
  const showPromptBanner =
    notifState.platformSupported &&
    settings.enabled &&
    notifState.permission === 'prompt';
  const showExactAlarmBanner =
    notifState.platformSupported &&
    isAndroid() &&
    settings.enabled &&
    notifState.permission === 'granted' &&
    notifState.exactAlarmPermission === 'denied';
  const showBatteryOptimizationBanner =
    notifState.platformSupported &&
    isAndroid() &&
    settings.enabled &&
    notifState.permission === 'granted' &&
    notifState.batteryOptimizationIgnored === false;
  const showBackgroundWorkoutPrompt =
    notifState.platformSupported &&
    isAndroid() &&
    Boolean(userData?.heartRateSyncEnabled) &&
    notifState.backgroundHealthPermission === 'denied';
  const backgroundWorkoutDetail =
    notifState.platformSupported &&
    rules.unimportedWorkout.enabled &&
    Boolean(userData?.heartRateSyncEnabled) &&
    notifState.backgroundHealthPermission === 'granted'
      ? 'Checks in the background when new workouts sync.'
      : null;

  return (
    <div className="space-y-7">
      {/* Master toggle + permission status, using the same header grammar as
          the Metabolic Adjustments sections (title row with the switch, then
          plain muted copy instead of an icon tile). */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-3">
          <span className="text-foreground/80 text-sm font-medium">
            Enable notifications
          </span>
          <SwitchControl
            checked={settings.enabled}
            onClick={handleMasterToggle}
            ariaLabel="Enable notifications"
          />
        </div>
        <p className="text-muted text-xs">
          {settings.enabled
            ? notifState.pendingCount > 0
              ? `${notifState.pendingCount} upcoming reminders scheduled on device`
              : 'Local reminders run on-device and work offline'
            : 'Off — no scheduled reminders or push alerts'}
        </p>

        <div className="mt-2 space-y-2">
          {showDeniedBanner ? (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-3 py-2.5 text-xs text-foreground"
            >
              <ShieldAlert
                size={16}
                className="mt-0.5 shrink-0 text-accent-amber"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">
                  Notifications are blocked in system settings
                </p>
                <p className="mt-0.5 text-muted">
                  {isIOS()
                    ? 'Open iOS Settings → Notifications → Energy Map and enable Allow Notifications.'
                    : 'Open Android Settings → Apps → Energy Map → Notifications and turn them on.'}
                </p>
              </div>
            </div>
          ) : null}

          {showPromptBanner ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-2.5">
              <p className="text-xs text-foreground">
                Grant notification permission so reminders can appear on your
                lock screen.
              </p>
              <button
                type="button"
                onClick={handleRequestPermission}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground pressable-inline focus-ring md:hover:brightness-110"
              >
                Allow
              </button>
            </div>
          ) : null}

          {showExactAlarmBanner ? (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-3 py-2.5"
            >
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-foreground">
                  Allow on-time reminders
                </p>
                <p className="mt-0.5 text-muted">
                  Grant Alarms &amp; reminders so Android fires reminders on
                  time while the app is closed.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestExactAlarm}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground pressable-inline focus-ring md:hover:brightness-110"
              >
                Allow
              </button>
            </div>
          ) : null}

          {showBatteryOptimizationBanner ? (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-2.5"
            >
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-foreground">
                  Prevent background delays
                </p>
                <p className="mt-0.5 text-muted">
                  Set Battery to Unrestricted in app settings so Android
                  doesn&rsquo;t pause reminders until you open the app.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenBatterySettings}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground pressable-inline focus-ring md:hover:brightness-110"
              >
                Open settings
              </button>
            </div>
          ) : null}

          {!notifState.platformSupported ? (
            <p className="text-xs text-muted">
              Browser dev preview: preferences save normally, while OS banners
              and FCM/APNs delivery run on iOS and Android builds.
            </p>
          ) : null}
        </div>
      </div>

      <SettingsReveal open={settings.enabled}>
        <div className="space-y-7">
          {/* Quiet hours */}
          <div className="space-y-2">
            <GroupHeading>Quiet hours</GroupHeading>
            <RuleCard
              title="Silence overnight reminders"
              description="Shifts reminders inside quiet hours to when quiet hours end"
              checked={quietHours.enabled}
              ariaLabel="Toggle quiet hours"
              onToggle={() =>
                updateNotifications((prev) => ({
                  ...prev,
                  quietHours: {
                    ...prev.quietHours,
                    enabled: !prev.quietHours.enabled,
                  },
                }))
              }
            >
              <TimeChipButton
                label="From"
                time={quietHours.start}
                ariaLabel="Set quiet hours start time"
                onClick={() =>
                  pickTime('Quiet Hours Start', quietHours.start, (nextTime) =>
                    updateNotifications((prev) => ({
                      ...prev,
                      quietHours: { ...prev.quietHours, start: nextTime },
                    }))
                  )
                }
              />
              <TimeChipButton
                label="Until"
                time={quietHours.end}
                ariaLabel="Set quiet hours end time"
                onClick={() =>
                  pickTime('Quiet Hours End', quietHours.end, (nextTime) =>
                    updateNotifications((prev) => ({
                      ...prev,
                      quietHours: { ...prev.quietHours, end: nextTime },
                    }))
                  )
                }
              />
            </RuleCard>
          </div>

          {/* Tier 1: Daily Logging */}
          <div className="space-y-2">
            <GroupHeading>Daily logging</GroupHeading>

            <RuleCard
              title="Morning weigh-in"
              description="Reminds you to weigh in; skips today once logged"
              checked={rules.morningWeighIn.enabled}
              ariaLabel="Toggle morning weigh-in reminder"
              onToggle={() =>
                updateRule('morningWeighIn', {
                  enabled: !rules.morningWeighIn.enabled,
                })
              }
            >
              <TimeChipButton
                time={rules.morningWeighIn.time}
                ariaLabel="Set morning weigh-in reminder time"
                onClick={() =>
                  pickTime(
                    'Morning Weigh-in Time',
                    rules.morningWeighIn.time,
                    (nextTime) =>
                      updateRule('morningWeighIn', { time: nextTime })
                  )
                }
              />
              <SmallChipToggle
                active={rules.morningWeighIn.skipIfLogged}
                ariaLabel="Skip morning weigh-in reminder if already logged"
                onClick={() =>
                  updateRule('morningWeighIn', {
                    skipIfLogged: !rules.morningWeighIn.skipIfLogged,
                  })
                }
              >
                Skip if logged
              </SmallChipToggle>
            </RuleCard>

            {userData?.bodyFatTrackingEnabled ? (
              <RuleCard
                title="Weekly body fat check-in"
                description="Keeps Katch-McArdle BMR and lean-mass trends current"
                checked={rules.bodyFatCheckIn.enabled}
                ariaLabel="Toggle weekly body fat check-in"
                onToggle={() =>
                  updateRule('bodyFatCheckIn', {
                    enabled: !rules.bodyFatCheckIn.enabled,
                  })
                }
              >
                <TimeChipButton
                  time={rules.bodyFatCheckIn.time}
                  ariaLabel="Set body fat check-in time"
                  onClick={() =>
                    pickTime(
                      'Body Fat Check-in Time',
                      rules.bodyFatCheckIn.time,
                      (nextTime) =>
                        updateRule('bodyFatCheckIn', { time: nextTime })
                    )
                  }
                />
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAY_OPTIONS.map(({ value, shortLabel, label }) => (
                    <SmallChipToggle
                      key={value}
                      compact
                      active={rules.bodyFatCheckIn.dayOfWeek === value}
                      ariaLabel={`Body fat check-in on ${label}`}
                      onClick={() =>
                        updateRule('bodyFatCheckIn', { dayOfWeek: value })
                      }
                    >
                      {shortLabel}
                    </SmallChipToggle>
                  ))}
                </div>
              </RuleCard>
            ) : null}

            {/* Meal nudges */}
            <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
              <p className="text-foreground text-sm font-medium leading-tight">
                Meal logging nudges
              </p>
              <p className="text-muted text-xs mt-0.5">
                Only fires if that meal slot is still empty today
              </p>
              <div className="mt-3 space-y-2">
                {[
                  { key: 'breakfast', label: 'Breakfast' },
                  { key: 'lunch', label: 'Lunch' },
                  { key: 'dinner', label: 'Dinner' },
                ].map(({ key, label }) => {
                  const mealRule = rules.meals[key];
                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground font-medium">
                          {label}
                        </span>
                        <SettingsReveal open={mealRule.enabled}>
                          <TimeChipButton
                            time={mealRule.time}
                            ariaLabel={`Set ${label.toLowerCase()} reminder time`}
                            onClick={() =>
                              pickTime(
                                `${label} Reminder Time`,
                                mealRule.time,
                                (nextTime) =>
                                  updateMealRule(key, { time: nextTime })
                              )
                            }
                          />
                        </SettingsReveal>
                      </div>
                      <SwitchControl
                        checked={mealRule.enabled}
                        ariaLabel={`Toggle ${label.toLowerCase()} reminder`}
                        onClick={() =>
                          updateMealRule(key, { enabled: !mealRule.enabled })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <RuleCard
              title="Evening ledger close-out"
              description="Summarizes meals logged and remaining calories before midnight"
              checked={rules.eveningLedger.enabled}
              ariaLabel="Toggle evening ledger close-out reminder"
              onToggle={() =>
                updateRule('eveningLedger', {
                  enabled: !rules.eveningLedger.enabled,
                })
              }
            >
              <TimeChipButton
                time={rules.eveningLedger.time}
                ariaLabel="Set evening ledger reminder time"
                onClick={() =>
                  pickTime(
                    'Evening Ledger Time',
                    rules.eveningLedger.time,
                    (nextTime) =>
                      updateRule('eveningLedger', { time: nextTime })
                  )
                }
              />
            </RuleCard>

            <RuleCard
              title="Daily NEAT override check-in"
              description="Prompts a one-day NEAT override when your routine differs"
              checked={rules.dailyNeatCheckIn.enabled}
              ariaLabel="Toggle daily NEAT override check-in"
              onToggle={() =>
                updateRule('dailyNeatCheckIn', {
                  enabled: !rules.dailyNeatCheckIn.enabled,
                })
              }
            >
              <TimeChipButton
                time={rules.dailyNeatCheckIn.time}
                ariaLabel="Set daily NEAT check-in time"
                onClick={() =>
                  pickTime(
                    'NEAT Check-in Time',
                    rules.dailyNeatCheckIn.time,
                    (nextTime) =>
                      updateRule('dailyNeatCheckIn', { time: nextTime })
                  )
                }
              />
              {DAILY_NEAT_DAYS_MODES.map((mode) => (
                <SmallChipToggle
                  key={mode}
                  active={rules.dailyNeatCheckIn.daysMode === mode}
                  ariaLabel={`NEAT check-in ${mode}`}
                  onClick={() =>
                    updateRule('dailyNeatCheckIn', { daysMode: mode })
                  }
                >
                  {mode === 'weekends' ? 'Weekends' : 'Every day'}
                </SmallChipToggle>
              ))}
            </RuleCard>
          </div>

          {/* Tier 2: Metabolic & Phase Intelligence */}
          <div className="space-y-2">
            <GroupHeading>Metabolic &amp; phase insights</GroupHeading>

            <RuleCard
              title="Phase lifecycle milestones"
              description="Start eve, midpoint check-in, 3 days left, and phase completion"
              checked={rules.phaseMilestones.enabled}
              ariaLabel="Toggle phase milestone alerts"
              onToggle={() =>
                updateRule('phaseMilestones', {
                  enabled: !rules.phaseMilestones.enabled,
                })
              }
            />

            <RuleCard
              title="Smart Adaptive Thermogenesis unlock"
              description="One-time alert once you collect enough snapshots and weigh-ins"
              checked={rules.atUnlockAlert.enabled}
              ariaLabel="Toggle Smart Adaptive Thermogenesis unlock alert"
              onToggle={() =>
                updateRule('atUnlockAlert', {
                  enabled: !rules.atUnlockAlert.enabled,
                })
              }
            />

            <RuleCard
              title="Weekly energy balance digest"
              description="7-day rolling deficit/surplus vs your goal target"
              checked={rules.weeklyDigest.enabled}
              ariaLabel="Toggle weekly energy balance digest"
              onToggle={() =>
                updateRule('weeklyDigest', {
                  enabled: !rules.weeklyDigest.enabled,
                })
              }
            >
              <TimeChipButton
                time={rules.weeklyDigest.time}
                ariaLabel="Set weekly digest time"
                onClick={() =>
                  pickTime(
                    'Weekly Digest Time',
                    rules.weeklyDigest.time,
                    (nextTime) => updateRule('weeklyDigest', { time: nextTime })
                  )
                }
              />
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_OPTIONS.map(({ value, shortLabel, label }) => (
                  <SmallChipToggle
                    key={value}
                    compact
                    active={rules.weeklyDigest.dayOfWeek === value}
                    ariaLabel={`Weekly digest on ${label}`}
                    onClick={() =>
                      updateRule('weeklyDigest', { dayOfWeek: value })
                    }
                  >
                    {shortLabel}
                  </SmallChipToggle>
                ))}
              </div>
            </RuleCard>

            <RuleCard
              title="Stale weigh-in warning"
              description="Alerts during active phases or Smart AT if weigh-ins lapse"
              checked={rules.staleWeighIn.enabled}
              ariaLabel="Toggle stale weigh-in warning"
              onToggle={() =>
                updateRule('staleWeighIn', {
                  enabled: !rules.staleWeighIn.enabled,
                })
              }
            >
              <span className="text-sm text-muted">After</span>
              {STALE_WEIGH_IN_DAY_OPTIONS.map((days) => (
                <SmallChipToggle
                  key={days}
                  active={rules.staleWeighIn.thresholdDays === days}
                  ariaLabel={`Warn after ${days} days without a weigh-in`}
                  onClick={() =>
                    updateRule('staleWeighIn', { thresholdDays: days })
                  }
                >
                  {days}d
                </SmallChipToggle>
              ))}
            </RuleCard>

            <RuleCard
              title="Post-workout EPOC refuel"
              description="Nudges after moderate or vigorous workouts while EPOC is active"
              checked={rules.epocRefuel.enabled}
              ariaLabel="Toggle post-workout EPOC refuel alerts"
              onToggle={() =>
                updateRule('epocRefuel', {
                  enabled: !rules.epocRefuel.enabled,
                })
              }
            />
          </div>

          {/* Tier 3: Activity, Health Sync & Live Heart Rate */}
          <div className="space-y-2">
            <GroupHeading>Activity &amp; heart rate</GroupHeading>

            <RuleCard
              title="Step goal close-out"
              description="Shows remaining steps if your daily goal isn’t reached yet"
              checked={rules.stepCheckIn.enabled}
              ariaLabel="Toggle step goal close-out reminder"
              onToggle={() =>
                updateRule('stepCheckIn', {
                  enabled: !rules.stepCheckIn.enabled,
                })
              }
            >
              <TimeChipButton
                time={rules.stepCheckIn.time}
                ariaLabel="Set step goal reminder time"
                onClick={() =>
                  pickTime(
                    'Step Check-in Time',
                    rules.stepCheckIn.time,
                    (nextTime) => updateRule('stepCheckIn', { time: nextTime })
                  )
                }
              />
            </RuleCard>

            <RuleCard
              title="Unimported health workouts"
              description="Alerts when synced Health workouts haven’t been added to your log"
              detail={backgroundWorkoutDetail}
              checked={rules.unimportedWorkout.enabled}
              ariaLabel="Toggle unimported health workout alerts"
              onToggle={() =>
                updateRule('unimportedWorkout', {
                  enabled: !rules.unimportedWorkout.enabled,
                })
              }
            >
              {showBackgroundWorkoutPrompt ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <p className="text-xs text-muted">
                    Allow Health Connect background reads to detect workouts
                    while the app is closed.
                  </p>
                  <button
                    type="button"
                    onClick={handleRequestBackgroundWorkout}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground pressable-inline focus-ring md:hover:brightness-110"
                  >
                    Allow
                  </button>
                </div>
              ) : null}
            </RuleCard>

            <RuleCard
              title="Live heart-rate recording guard"
              description="Active status banner and a 2.5-hour forgot-to-stop alert"
              checked={rules.liveHrGuard.enabled}
              ariaLabel="Toggle live heart-rate recording guard"
              onToggle={() =>
                updateRule('liveHrGuard', {
                  enabled: !rules.liveHrGuard.enabled,
                })
              }
            />
          </div>

          {/* Layer 2: Remote Push Announcements */}
          <div className="space-y-2">
            <GroupHeading>Remote push updates</GroupHeading>
            <RuleCard
              title="App & food-catalog announcements"
              description="Optional remote push notifications. Uses an anonymous device token only — no account or tracking data is shared."
              detail={describePushStatus(
                notifState,
                remotePush.announcementsEnabled
              )}
              checked={remotePush.announcementsEnabled}
              ariaLabel="Toggle remote app and catalog announcements"
              onToggle={() =>
                updateNotifications((prev) => ({
                  ...prev,
                  remotePush: {
                    ...prev.remotePush,
                    announcementsEnabled: !prev.remotePush.announcementsEnabled,
                  },
                }))
              }
            />
          </div>

          {/* Test notification utility */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSendTest}
              disabled={isSendingTest}
              aria-label="Send test notification"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all press-feedback focus-ring md:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={15} className="shrink-0" aria-hidden="true" />
              <span>
                {isSendingTest ? 'Sending test…' : 'Send test notification'}
              </span>
            </button>
            {testFeedback ? (
              <p
                role="status"
                className="flex items-center gap-1.5 text-xs text-muted"
              >
                <Bell size={13} className="shrink-0 text-accent-emerald" />
                <span>{testFeedback}</span>
              </p>
            ) : null}
          </div>
        </div>
      </SettingsReveal>
    </div>
  );
};
