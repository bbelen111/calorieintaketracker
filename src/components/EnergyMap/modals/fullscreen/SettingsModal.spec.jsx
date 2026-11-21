import React, { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SettingsModal } from './SettingsModal';

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
      ['Open Profile & Measurements', 'Profile & Measurements', /^Age$/],
      ['Open Appearance', 'Appearance', 'Color theme'],
      ['Open Daily Activity', 'Daily Activity', /Daily NEAT/],
      [
        'Open Calorie Adjustments',
        'Calorie Adjustments',
        /EPOC \(Post-Exercise Burn\)/,
      ],
      ['Open Food & Nutrition', 'Food & Nutrition', 'Food search opens in'],
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
      screen.getByRole('button', { name: 'Open Profile & Measurements' })
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

  it('keeps Daily Activity and calorie adjustment controls on their own pages', async () => {
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
      screen.getByRole('button', { name: 'Open Daily Activity' })
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
      screen.getByRole('button', { name: 'Open Calorie Adjustments' })
    );

    expect(screen.getByText('EPOC (Post-Exercise Burn)')).toBeInTheDocument();
    expect(screen.getByText('Smart TEF', { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText('Adaptive Thermogenesis', { exact: true })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Toggle EPOC' }));
    expect(onFieldChange).toHaveBeenCalledWith('epocEnabled', false);
  });

  it('opens the step goal and step range editors from Daily Activity', async () => {
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
      screen.getByRole('button', { name: 'Open Daily Activity' })
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

  it('exposes food search, macro and cached-food controls on Food & Nutrition', async () => {
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
      screen.getByRole('button', { name: 'Open Food & Nutrition' })
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
      screen.getByRole('button', { name: 'Open Food & Nutrition' })
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
