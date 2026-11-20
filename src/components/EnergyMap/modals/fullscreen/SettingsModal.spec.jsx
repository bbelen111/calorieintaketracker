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
    expect(
      screen.getByText('Rest day baseline:', { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Training Day/ })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Training Day/ }));
    expect(onDailyActivityClick).toHaveBeenCalledTimes(1);

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
