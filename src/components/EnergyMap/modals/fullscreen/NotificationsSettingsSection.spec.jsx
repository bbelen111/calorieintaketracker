import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CapacitorMock,
  LocalNotificationsMock,
  NotificationReliabilityMock,
  PreferencesMock,
} from '../../../../tests/mocks/capacitor.js';
import { createDefaultNotificationSettings } from '../../../../constants/notifications/notificationConfig.js';
import {
  initializeNotifications,
  resetNotificationState,
} from '../../../../services/notifications.js';
import { NotificationsSettingsSection } from './NotificationsSettingsSection.jsx';

describe('NotificationsSettingsSection reliability banners', () => {
  beforeEach(async () => {
    await resetNotificationState();
    await PreferencesMock.clear();
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    LocalNotificationsMock.checkPermissions.mockResolvedValue({
      display: 'granted',
    });
    LocalNotificationsMock.checkExactNotificationSetting.mockResolvedValue({
      exact_alarm: 'denied',
    });
    LocalNotificationsMock.changeExactNotificationSetting.mockResolvedValue({
      exact_alarm: 'granted',
    });
    LocalNotificationsMock.getPending.mockResolvedValue({ notifications: [] });
    LocalNotificationsMock.schedule.mockResolvedValue({ notifications: [] });
    LocalNotificationsMock.createChannel.mockResolvedValue();

    NotificationReliabilityMock.isIgnoringBatteryOptimizations.mockResolvedValue(
      { ignoring: false }
    );
    NotificationReliabilityMock.openBatteryOptimizationSettings.mockResolvedValue(
      { opened: true }
    );
    NotificationReliabilityMock.checkHealthBackgroundPermission.mockResolvedValue(
      { status: 'denied' }
    );
    NotificationReliabilityMock.requestHealthBackgroundPermission.mockResolvedValue(
      { status: 'granted' }
    );
    NotificationReliabilityMock.syncBackgroundWorkoutContext.mockResolvedValue({
      scheduled: true,
      backgroundPermission: 'granted',
    });
  });

  afterEach(async () => {
    await resetNotificationState();
    CapacitorMock.isNativePlatform.mockReturnValue(false);
    CapacitorMock.getPlatform.mockReturnValue('web');
    vi.restoreAllMocks();
  });

  it('hides the heart rate rules while heart rate tracking is off', async () => {
    await initializeNotifications();
    render(
      <NotificationsSettingsSection
        userData={{
          heartRateSyncEnabled: true,
          heartRateTrackingEnabled: false,
          notifications: {
            ...createDefaultNotificationSettings(),
            enabled: true,
          },
        }}
        onFieldChange={vi.fn()}
        onOpenTimePicker={vi.fn()}
      />
    );

    expect(screen.getByText('Step goal close-out')).toBeInTheDocument();
    expect(screen.queryByText('Unimported health workouts')).toBeNull();
    expect(screen.queryByText('Live heart-rate recording guard')).toBeNull();
    expect(
      screen.queryByText(/Allow Health Connect background reads/i)
    ).toBeNull();
  });

  it('shows Android exact-alarm, battery optimization, and background health prompts and triggers actions', async () => {
    const user = userEvent.setup();
    await initializeNotifications();

    const userData = {
      heartRateSyncEnabled: true,
      notifications: {
        ...createDefaultNotificationSettings(),
        enabled: true,
      },
    };

    render(
      <NotificationsSettingsSection
        userData={userData}
        onFieldChange={vi.fn()}
        onOpenTimePicker={vi.fn()}
      />
    );

    expect(screen.getByText('Allow on-time reminders')).toBeInTheDocument();
    expect(screen.getByText('Prevent background delays')).toBeInTheDocument();
    expect(
      screen.getByText(/Allow Health Connect background reads/i)
    ).toBeInTheDocument();

    const allowButtons = screen.getAllByRole('button', { name: 'Allow' });
    await user.click(allowButtons[0]);
    expect(
      LocalNotificationsMock.changeExactNotificationSetting
    ).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(
      NotificationReliabilityMock.openBatteryOptimizationSettings
    ).toHaveBeenCalledTimes(1);

    await user.click(allowButtons[1]);
    await waitFor(() => {
      expect(
        NotificationReliabilityMock.requestHealthBackgroundPermission
      ).toHaveBeenCalledTimes(1);
    });
  });

  it('hides Android-only reliability banners on iOS', async () => {
    CapacitorMock.getPlatform.mockReturnValue('ios');
    NotificationReliabilityMock.checkHealthBackgroundPermission.mockResolvedValue(
      { status: 'granted' }
    );
    await initializeNotifications();

    const userData = {
      heartRateSyncEnabled: true,
      notifications: {
        ...createDefaultNotificationSettings(),
        enabled: true,
      },
    };

    render(
      <NotificationsSettingsSection
        userData={userData}
        onFieldChange={vi.fn()}
        onOpenTimePicker={vi.fn()}
      />
    );

    expect(
      screen.queryByText('Allow on-time reminders')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Prevent background delays')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Checks in the background when new workouts sync.')
    ).toBeInTheDocument();
  });
});
