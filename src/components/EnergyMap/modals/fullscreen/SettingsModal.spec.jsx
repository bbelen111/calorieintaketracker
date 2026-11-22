import React, { useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsModal } from './SettingsModal';
import { exportAllDataAsJSON } from '../../../../utils/export';
import { buildFullExportPayload } from '../../../../utils/data/fullExport';
import {
  connectHeartRateSync,
  resetHeartRateSyncState,
} from '../../../../services/heartRateSync';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { HealthConnectStatus } from '../../../../constants/health/healthSources';
import {
  CapacitorMock,
  HealthMock,
} from '../../../../tests/mocks/capacitor.js';

vi.mock('../../../../utils/export', () => ({
  exportAllDataAsJSON: vi.fn(),
}));

const createUserData = (overrides = {}) => ({
  age: 32,
  gender: 'male',
  height: 180,
  weight: 82,
  theme: 'dark',
  bodyFatTrackingEnabled: true,
  activityPresets: { training: 'default', rest: 'default' },
  activityMultipliers: { training: 0.2, rest: 0.22 },
  epocEnabled: true,
  epocCarryoverHours: 6,
  smartTefEnabled: false,
  adaptiveThermogenesisEnabled: false,
  ...overrides,
});

const SettingsHarness = ({
  onCancel = vi.fn(),
  onFieldChange = vi.fn(),
  onDailyActivityClick = vi.fn(),
  openers = {},
  stepSync = null,
  userData = createUserData(),
}) => {
  const [activePage, setActivePage] = useState('home');
  const handleBack = () => {
    if (activePage !== 'home') {
      setActivePage('home');
      return;
    }
    onCancel();
  };

  return (
    <SettingsModal
      isOpen
      isClosing={false}
      activePage={activePage}
      onNavigate={setActivePage}
      onRequestBack={handleBack}
      userData={userData}
      bmr={1800}
      weightEntries={[]}
      bodyFatEntries={[]}
      stepSync={stepSync}
      actions={{
        onFieldChange,
        openers: {
          agePicker: vi.fn(),
          heightPicker: vi.fn(),
          manageWeight: vi.fn(),
          manageBodyFat: vi.fn(),
          dailyActivity: onDailyActivityClick,
          epocWindowPicker: vi.fn(),
          stepGoalPicker: vi.fn(),
          stepRanges: vi.fn(),
          macroPicker: vi.fn(),
          clearCachedFoods: vi.fn(),
          ...openers,
        },
        info: {
          tef: vi.fn(),
          adaptiveThermogenesis: vi.fn(),
          epoc: vi.fn(),
        },
        lifecycle: { cancel: onCancel },
        navigation: {
          activePage,
          navigate: setActivePage,
          back: handleBack,
        },
      }}
    />
  );
};

describe('SettingsModal segmented navigation', () => {
  it('opens each category from a simple list of Settings buttons', async () => {
    const user = userEvent.setup();
    render(<SettingsHarness />);

    const categoryNavigation = screen.getByRole('navigation', {
      name: 'Settings categories',
    });
    expect(categoryNavigation).toBeInTheDocument();
    expect(categoryNavigation).not.toHaveTextContent(
      /Personal details|01|02|03|04/
    );
    expect(screen.getAllByRole('heading', { name: 'Settings' })).toHaveLength(
      1
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    const pages = [
      ['Open Profile & Health', 'Profile & Health', /^Age$/],
      ['Open Appearance', 'Appearance', 'Color theme'],
      ['Open Activity & Steps', 'Activity & Steps', /Daily NEAT/],
      [
        'Open Metabolic Adjustments',
        'Metabolic Adjustments',
        /EPOC \(Post-Exercise Burn\)/,
      ],
      ['Open Food & Macros', 'Food & Macros', 'Food search opens in'],
      ['Open Integrations', 'Integrations', 'Devices'],
    ];

    for (const [buttonName, pageTitle, contentMatcher] of pages) {
      await user.click(screen.getByRole('button', { name: buttonName }));

      expect(
        screen.getByRole('heading', { name: pageTitle })
      ).toBeInTheDocument();
      expect(screen.getByText(contentMatcher)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(
        screen.getByRole('navigation', { name: 'Settings categories' })
      ).toBeInTheDocument();
    }
  });

  it('applies profile and appearance changes immediately through the existing callback', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    render(<SettingsHarness onFieldChange={onFieldChange} />);

    await user.click(
      screen.getByRole('button', { name: 'Open Profile & Health' })
    );
    await user.click(screen.getByRole('button', { name: 'Female' }));
    expect(onFieldChange).toHaveBeenCalledWith('gender', 'female');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));
    await user.click(screen.getByRole('button', { name: 'Forest' }));

    expect(onFieldChange).toHaveBeenLastCalledWith('theme', 'forest');
  });

  it('offers Text size and Density on the Appearance page and reports each choice', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    render(<SettingsHarness onFieldChange={onFieldChange} />);

    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));

    expect(screen.getByText('Text size')).toBeInTheDocument();
    expect(screen.getByText('Density')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Large' }));
    expect(onFieldChange).toHaveBeenLastCalledWith('fontScale', 'large');

    await user.click(screen.getByRole('button', { name: 'Largest' }));
    expect(onFieldChange).toHaveBeenLastCalledWith('fontScale', 'xlarge');

    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(onFieldChange).toHaveBeenLastCalledWith('uiDensity', 'compact');

    await user.click(screen.getByRole('button', { name: 'Comfortable' }));
    expect(onFieldChange).toHaveBeenLastCalledWith('uiDensity', 'comfortable');
  });

  it('shows the stored text size and density as pressed, and Default when unset or invalid', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <SettingsHarness
        userData={createUserData({ fontScale: 'small', uiDensity: 'compact' })}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));

    expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    unmount();

    // Unset (an older profile) and corrupt values both read as Default.
    render(
      <SettingsHarness userData={createUserData({ fontScale: 'galactic' })} />
    );
    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));

    const defaults = screen.getAllByRole('button', { name: 'Default' });
    expect(defaults).toHaveLength(2); // one per row
    defaults.forEach((button) =>
      expect(button).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('offers an Animations preference and reports each choice', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    render(<SettingsHarness onFieldChange={onFieldChange} />);

    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));
    expect(screen.getByText('Animations')).toBeInTheDocument();
    // "Auto" also exists in the Color theme row, so scope to the group.
    const animations = within(
      screen.getByRole('group', { name: 'Animations' })
    );

    await user.click(animations.getByRole('button', { name: 'Full' }));
    expect(onFieldChange).toHaveBeenLastCalledWith('motionPreference', 'full');

    await user.click(animations.getByRole('button', { name: 'Reduced' }));
    expect(onFieldChange).toHaveBeenLastCalledWith(
      'motionPreference',
      'reduced'
    );

    await user.click(animations.getByRole('button', { name: 'Off' }));
    expect(onFieldChange).toHaveBeenLastCalledWith('motionPreference', 'off');

    await user.click(animations.getByRole('button', { name: 'Auto' }));
    expect(onFieldChange).toHaveBeenLastCalledWith(
      'motionPreference',
      'system'
    );
  });

  it('shows the stored Animations preference as pressed, and Auto when unset or invalid', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <SettingsHarness userData={createUserData({ motionPreference: 'off' })} />
    );
    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));

    expect(
      within(screen.getByRole('group', { name: 'Animations' })).getByRole(
        'button',
        { name: 'Off' }
      )
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('group', { name: 'Animations' })).getByRole(
        'button',
        { name: 'Auto' }
      )
    ).toHaveAttribute('aria-pressed', 'false');
    unmount();

    render(
      <SettingsHarness
        userData={createUserData({ motionPreference: 'ludicrous' })}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));
    expect(
      within(screen.getByRole('group', { name: 'Animations' })).getByRole(
        'button',
        { name: 'Auto' }
      )
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps Activity & Steps and calorie adjustment controls on their own pages', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    const onDailyActivityClick = vi.fn();
    render(
      <SettingsHarness
        onFieldChange={onFieldChange}
        onDailyActivityClick={onDailyActivityClick}
        userData={createUserData({ smartTefEnabled: true })}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Activity & Steps' })
    );
    expect(screen.getAllByText('(BMR + NEAT)', { exact: false }).length).toBe(
      2
    );
    await user.click(screen.getByRole('button', { name: /Training Day/ }));
    expect(onDailyActivityClick).toHaveBeenLastCalledWith('training');
    await user.click(screen.getByRole('button', { name: /Rest Day/ }));
    expect(onDailyActivityClick).toHaveBeenLastCalledWith('rest');
    expect(onDailyActivityClick).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(
      screen.getByRole('button', { name: 'Open Metabolic Adjustments' })
    );

    expect(screen.getByText('EPOC (Post-Exercise Burn)')).toBeInTheDocument();
    expect(screen.getByText('Smart TEF', { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText('Adaptive Thermogenesis', { exact: true })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Toggle EPOC' }));
    expect(onFieldChange).toHaveBeenCalledWith('epocEnabled', false);
  });

  it('opens the step goal and step range editors from Activity & Steps', async () => {
    const user = userEvent.setup();
    const stepGoalPicker = vi.fn();
    const stepRanges = vi.fn();
    render(
      <SettingsHarness
        openers={{ stepGoalPicker, stepRanges }}
        userData={createUserData({
          stepGoal: 12000,
          stepRanges: ['<10k', '10k', '>20k'],
        })}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Activity & Steps' })
    );

    const goalButton = screen.getByRole('button', {
      name: 'Open step goal picker',
    });
    expect(goalButton).toHaveTextContent(/12,000 steps/);
    await user.click(goalButton);
    expect(stepGoalPicker).toHaveBeenCalledTimes(1);

    const rangesButton = screen.getByRole('button', {
      name: 'Open step ranges',
    });
    expect(rangesButton).toHaveTextContent('3 ranges');
    expect(rangesButton).toHaveTextContent('<10k · 10k · >20k');
    await user.click(rangesButton);
    expect(stepRanges).toHaveBeenCalledTimes(1);
  });

  it('lets the swipe tip be shown again only once it has been seen', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    const { unmount } = render(
      <SettingsHarness
        onFieldChange={onFieldChange}
        userData={createUserData({ hasSeenSwipeHint: true })}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));
    await user.click(
      screen.getByRole('button', { name: 'Show swipe tip again' })
    );
    expect(onFieldChange).toHaveBeenLastCalledWith('hasSeenSwipeHint', false);
    unmount();

    // Not seen yet: it is already pending, so there is nothing to reset.
    render(
      <SettingsHarness userData={createUserData({ hasSeenSwipeHint: false })} />
    );
    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));
    expect(
      screen.getByRole('button', { name: 'Show swipe tip again' })
    ).toBeDisabled();
  });

  it('exposes food search, macro and cached-food controls on Food & Macros', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    const macroPicker = vi.fn();
    const clearCachedFoods = vi.fn();
    render(
      <SettingsHarness
        onFieldChange={onFieldChange}
        openers={{ macroPicker, clearCachedFoods }}
        userData={createUserData({
          foodSearchDefaultEntry: 'favourites',
          macroRecommendationSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
          macroLocks: { protein: 150, carbs: null, fats: null },
          cachedFoods: [{ id: 'a' }, { id: 'b' }],
        })}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Food & Macros' })
    );

    const entryGroup = within(
      screen.getByRole('group', { name: 'Food search default view' })
    );
    expect(
      entryGroup.getByRole('button', { name: 'Favorites' })
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(
      entryGroup.getByRole('button', { name: 'Search · Online' })
    );
    expect(onFieldChange).toHaveBeenLastCalledWith(
      'foodSearchDefaultEntry',
      'search_online'
    );

    const macroButton = screen.getByRole('button', {
      name: 'Open macro split picker',
    });
    expect(macroButton).toHaveTextContent('P 30% · C 40% · F 30%');
    expect(macroButton).toHaveTextContent('1 macro locked to grams');
    await user.click(macroButton);
    expect(macroPicker).toHaveBeenCalledTimes(1);

    expect(screen.getByText(/2 foods saved/)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Clear cached foods' })
    );
    expect(clearCachedFoods).toHaveBeenCalledTimes(1);
  });

  it('disables Clear cached foods when nothing is cached and falls back to Local search', async () => {
    const user = userEvent.setup();
    render(
      <SettingsHarness
        userData={createUserData({ foodSearchDefaultEntry: 'nonsense' })}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Food & Macros' })
    );

    expect(
      screen.getByRole('button', { name: 'Clear cached foods' })
    ).toBeDisabled();
    expect(
      within(
        screen.getByRole('group', { name: 'Food search default view' })
      ).getByRole('button', { name: 'Search · Local' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('returns to the hub on Escape from a subpage and closes from the hub', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<SettingsHarness onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Open Appearance' }));
    await user.keyboard('{Escape}');

    expect(
      screen.getByRole('navigation', { name: 'Settings categories' })
    ).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

const createStepSync = (overrides = {}) => ({
  status: HealthConnectStatus.DISCONNECTED,
  isLoading: false,
  error: null,
  lastSynced: null,
  connect: vi.fn(),
  refresh: vi.fn(),
  openSettings: vi.fn(),
  ...overrides,
});

const openIntegrations = (user) =>
  user.click(screen.getByRole('button', { name: 'Open Integrations' }));

const HR_SWITCH = 'Sync heart rate from Health Connect';

describe('SettingsModal Integrations page', () => {
  beforeEach(() => {
    resetHeartRateSyncState();
    useEnergyMapStore.setState(useEnergyMapStore.getInitialState());
    exportAllDataAsJSON.mockReset();
    HealthMock.isAvailable.mockReset().mockResolvedValue({ available: true });
    HealthMock.checkAuthorization.mockReset().mockResolvedValue({
      readAuthorized: ['heartRate', 'restingHeartRate', 'vo2Max', 'workouts'],
      writeAuthorized: [],
    });
    HealthMock.requestAuthorization.mockReset().mockResolvedValue({
      readAuthorized: ['heartRate', 'restingHeartRate', 'vo2Max', 'workouts'],
      writeAuthorized: [],
    });
    HealthMock.queryAggregated.mockReset().mockResolvedValue({ samples: [] });
    HealthMock.readSamples.mockReset().mockResolvedValue({ samples: [] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    CapacitorMock.isNativePlatform.mockReturnValue(false);
    CapacitorMock.getPlatform.mockReturnValue('web');
    vi.restoreAllMocks();
  });

  it('takes watch sync and the sensor out of Profile & Health', async () => {
    const user = userEvent.setup();
    render(<SettingsHarness />);

    await user.click(
      screen.getByRole('button', { name: 'Open Profile & Health' })
    );

    expect(screen.getByText('Resting heart rate')).toBeInTheDocument();
    expect(screen.getByText('Max heart rate')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: HR_SWITCH })).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'Pair a Bluetooth heart-rate sensor',
      })
    ).toBeNull();
  });

  it('says so when no health store exists instead of rendering an empty group', async () => {
    const user = userEvent.setup();
    render(<SettingsHarness />);
    await openIntegrations(user);

    expect(
      screen.getByText("Health Connect isn't available on this device.")
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sync now/ })).toBeNull();
  });

  it('points to Google Play when Health Connect is not installed', async () => {
    const user = userEvent.setup();
    render(
      <SettingsHarness
        stepSync={createStepSync({
          status: HealthConnectStatus.NOT_INSTALLED,
        })}
      />
    );
    await openIntegrations(user);

    expect(screen.getByText(/isn't installed/)).toBeInTheDocument();
  });

  it('offers Connect for steps while disconnected', async () => {
    const user = userEvent.setup();
    const stepSync = createStepSync();
    render(<SettingsHarness stepSync={stepSync} />);
    await openIntegrations(user);

    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sync now/ })).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Connect steps to Health Connect' })
    );
    expect(stepSync.connect).toHaveBeenCalledTimes(1);
  });

  it('shows a connected step source with its last sync, a manual sync and Android permissions', async () => {
    const user = userEvent.setup();
    const stepSync = createStepSync({
      status: HealthConnectStatus.CONNECTED,
      lastSynced: new Date(),
    });
    render(<SettingsHarness stepSync={stepSync} />);
    await openIntegrations(user);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Synced just now')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sync now/ }));
    expect(stepSync.refresh).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Manage permissions' })
    );
    expect(stepSync.openSettings).toHaveBeenCalledTimes(1);
  });

  it('shows a step sync error in place of the status line and offers Retry', async () => {
    const user = userEvent.setup();
    render(
      <SettingsHarness
        stepSync={createStepSync({
          status: HealthConnectStatus.ERROR,
          error: 'Failed to connect',
        })}
      />
    );
    await openIntegrations(user);

    expect(screen.getByText('Failed to connect')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Connect steps/ })
    ).toHaveTextContent('Retry');
  });

  it('uses Apple Health copy on iOS and has no permissions button', async () => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('ios');
    const user = userEvent.setup();
    render(
      <SettingsHarness
        stepSync={createStepSync({ status: HealthConnectStatus.CONNECTED })}
      />
    );
    await openIntegrations(user);

    expect(screen.getByText('Apple Health')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Manage permissions' })
    ).toBeNull();
    expect(screen.getByText(/Profile → Privacy → Apps/)).toBeInTheDocument();
  });

  it('toggles heart-rate sync through the shared sync service', async () => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    await act(async () => {
      await connectHeartRateSync();
    });
    expect(useEnergyMapStore.getState().userData.heartRateSyncEnabled).toBe(
      true
    );

    const user = userEvent.setup();
    render(
      <SettingsHarness
        userData={createUserData({ heartRateSyncEnabled: true })}
      />
    );
    await openIntegrations(user);

    const toggle = screen.getByRole('switch', { name: HR_SWITCH });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    expect(useEnergyMapStore.getState().userData.heartRateSyncEnabled).toBe(
      false
    );
    expect(screen.getByRole('switch', { name: HR_SWITCH })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('opens the sensor pairing flow from Devices', async () => {
    const user = userEvent.setup();
    const heartRateSensor = vi.fn();
    render(<SettingsHarness openers={{ heartRateSensor }} />);
    await openIntegrations(user);

    await user.click(
      screen.getByRole('button', { name: 'Pair a Bluetooth heart-rate sensor' })
    );
    expect(heartRateSensor).toHaveBeenCalledTimes(1);
  });

  it('exports all data and reports the saved file', async () => {
    exportAllDataAsJSON.mockResolvedValue({
      success: true,
      method: 'download',
      fileName: 'energy-map-export_2026-03-10.json',
    });
    const user = userEvent.setup();
    const userData = createUserData();
    render(<SettingsHarness userData={userData} />);
    await openIntegrations(user);

    await user.click(screen.getByRole('button', { name: 'Export all data' }));

    expect(exportAllDataAsJSON).toHaveBeenCalledWith(userData);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved energy-map-export_2026-03-10.json'
    );
  });

  it('on Android, Export saves to Documents and a separate Share opens the share sheet', async () => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    exportAllDataAsJSON.mockResolvedValue({
      success: true,
      method: 'saved',
      fileName: 'energy-map-export_2026-03-10_1432.json',
      location: 'Documents',
    });
    const user = userEvent.setup();
    const userData = createUserData();
    render(<SettingsHarness userData={userData} />);
    await openIntegrations(user);

    await user.click(screen.getByRole('button', { name: 'Export all data' }));
    expect(exportAllDataAsJSON).toHaveBeenLastCalledWith(userData);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved to Documents/energy-map-export_2026-03-10_1432.json'
    );

    exportAllDataAsJSON.mockResolvedValue({
      success: true,
      method: 'share',
      fileName: 'x.json',
    });
    await user.click(screen.getByRole('button', { name: 'Share export' }));
    expect(exportAllDataAsJSON).toHaveBeenLastCalledWith(userData, {
      share: true,
    });
  });

  it('has no separate Share button on iOS, where Export already opens the share sheet', async () => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('ios');
    exportAllDataAsJSON.mockResolvedValue({
      success: true,
      method: 'share',
      fileName: 'x.json',
      canceled: false,
    });
    const user = userEvent.setup();
    render(<SettingsHarness />);
    await openIntegrations(user);

    expect(screen.queryByRole('button', { name: 'Share export' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Export all data' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Save to Files/
    );
  });

  describe('import', () => {
    const exportFile = (data = { age: 41 }) =>
      new File(
        [JSON.stringify(buildFullExportPayload(data, new Date('2026-03-10')))],
        'energy-map-export.json',
        { type: 'application/json' }
      );

    it('opens the file picker from the Import button', async () => {
      const clickSpy = vi
        .spyOn(HTMLInputElement.prototype, 'click')
        .mockImplementation(() => {});
      const user = userEvent.setup();
      render(<SettingsHarness />);
      await openIntegrations(user);

      await user.click(
        screen.getByRole('button', { name: 'Import data from file' })
      );

      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('validates the file, hands it to the confirmation step and reports the result', async () => {
      const user = userEvent.setup();
      const importData = vi.fn();
      render(<SettingsHarness openers={{ importData }} />);
      await openIntegrations(user);

      await user.upload(
        screen.getByTestId('import-file-input'),
        exportFile({
          age: 41,
          weightEntries: [{ date: '2026-03-01', weight: 80 }],
        })
      );

      await vi.waitFor(() => expect(importData).toHaveBeenCalledTimes(1));
      const [parsed, onResult] = importData.mock.calls[0];
      expect(parsed.ok).toBe(true);
      expect(parsed.data.age).toBe(41);
      expect(parsed.summary.weighIns).toBe(1);

      // Nothing is claimed until the user confirms and the import finishes.
      expect(screen.queryByRole('status')).toBeNull();

      act(() => onResult(true));
      expect(screen.getByRole('status')).toHaveTextContent(
        'Import complete. Your data has been replaced.'
      );

      act(() => onResult(false));
      expect(screen.getByRole('status')).toHaveTextContent(
        'Import failed. Your current data was left as it is.'
      );
    });

    it('rejects a file that is not an Energy Map export without opening the confirmation', async () => {
      const user = userEvent.setup();
      const importData = vi.fn();
      render(<SettingsHarness openers={{ importData }} />);
      await openIntegrations(user);

      await user.upload(
        screen.getByTestId('import-file-input'),
        new File(['{"hello":"world"}'], 'notes.json', {
          type: 'application/json',
        })
      );

      expect(await screen.findByRole('status')).toHaveTextContent(
        "This isn't an Energy Map export file."
      );
      expect(importData).not.toHaveBeenCalled();
    });

    it('rejects a file that is not JSON at all', async () => {
      const user = userEvent.setup();
      const importData = vi.fn();
      render(<SettingsHarness openers={{ importData }} />);
      await openIntegrations(user);

      await user.upload(
        screen.getByTestId('import-file-input'),
        new File(['definitely not json'], 'x.json', {
          type: 'application/json',
        })
      );

      expect(await screen.findByRole('status')).toHaveTextContent(
        "This file isn't valid JSON."
      );
      expect(importData).not.toHaveBeenCalled();
    });
  });

  it('surfaces an export failure and stays quiet when the share sheet is dismissed', async () => {
    exportAllDataAsJSON.mockResolvedValueOnce({
      success: false,
      method: 'none',
      error: 'disk full',
    });
    const user = userEvent.setup();
    render(<SettingsHarness />);
    await openIntegrations(user);

    await user.click(screen.getByRole('button', { name: 'Export all data' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Export failed: disk full'
    );

    exportAllDataAsJSON.mockResolvedValueOnce({
      success: true,
      method: 'share',
      fileName: 'x.json',
      canceled: true,
    });
    await user.click(screen.getByRole('button', { name: 'Export all data' }));
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
