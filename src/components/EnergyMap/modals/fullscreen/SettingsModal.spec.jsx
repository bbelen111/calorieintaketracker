import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
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
