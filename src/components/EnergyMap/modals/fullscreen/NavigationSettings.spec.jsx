import React, { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SettingsModal } from './SettingsModal';

const DEFAULT_LABELS = [
  'Logbook',
  'Tracker',
  'Home',
  'Calorie Map',
  'Insights',
];

/** Settings opened on the Navigation page, applying changes like the app does. */
const Harness = ({ initialUserData, onFieldChange }) => {
  const [userData, setUserData] = useState({
    theme: 'dark',
    gender: 'male',
    activityPresets: { training: 'default', rest: 'default' },
    activityMultipliers: { training: 0.2, rest: 0.22 },
    ...initialUserData,
  });

  return (
    <SettingsModal
      isOpen
      isClosing={false}
      userData={userData}
      bmr={1800}
      weightEntries={[]}
      bodyFatEntries={[]}
      actions={{
        onFieldChange: (field, value) => {
          onFieldChange(field, value);
          setUserData((previous) => ({ ...previous, [field]: value }));
        },
        openers: {},
        info: {},
        lifecycle: { cancel: vi.fn() },
        navigation: {
          activePage: 'navigation',
          navigate: vi.fn(),
          back: vi.fn(),
        },
      }}
    />
  );
};

const renderPage = (initialUserData) => {
  const onFieldChange = vi.fn();
  render(
    <Harness initialUserData={initialUserData} onFieldChange={onFieldChange} />
  );
  return { onFieldChange, user: userEvent.setup() };
};

const listedPages = () =>
  within(screen.getByRole('list', { name: 'Page order' }))
    .getAllByRole('listitem')
    .map(
      (row) =>
        DEFAULT_LABELS.find(
          (label) => within(row).queryByText(label, { exact: true }) !== null
        ) ?? row.textContent
    );

const previewSlots = () =>
  within(screen.getByRole('group', { name: 'Tab bar preview' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label').split(',')[0]);

describe('Settings -> Navigation', () => {
  it('shows the stored order in both the preview and the list', () => {
    renderPage({
      screenOrder: ['insights', 'tracker', 'home', 'calorie-map', 'logbook'],
    });

    const expected = ['Insights', 'Tracker', 'Home', 'Calorie Map', 'Logbook'];
    expect(previewSlots()).toEqual(expected);
    expect(listedPages()).toEqual(expected);
  });

  it('swaps two pages by tapping their preview slots', async () => {
    const { user, onFieldChange } = renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Logbook, slot 1 of 5' })
    );
    expect(
      screen.getByText('Now tap the slot to swap Logbook with.')
    ).toBeInTheDocument();
    expect(onFieldChange).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Insights, slot 5 of 5' })
    );

    expect(onFieldChange).toHaveBeenCalledWith('screenOrder', [
      'insights',
      'tracker',
      'home',
      'calorie-map',
      'logbook',
    ]);
    expect(previewSlots()[0]).toBe('Insights');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Logbook moved to slot 5 of 5.'
    );
  });

  it('cancels a swap when the same slot is tapped twice', async () => {
    const { user, onFieldChange } = renderPage();
    const slot = screen.getByRole('button', { name: 'Home, slot 3 of 5' });

    await user.click(slot);
    expect(slot).toHaveAttribute('aria-pressed', 'true');
    await user.click(slot);

    expect(slot).toHaveAttribute('aria-pressed', 'false');
    expect(onFieldChange).not.toHaveBeenCalled();
  });

  it('moves a page with the arrow keys on its handle', async () => {
    const { user, onFieldChange } = renderPage();
    const handle = screen.getByRole('button', { name: /^Move Home,/ });

    handle.focus();
    await user.keyboard('{ArrowUp}');

    expect(onFieldChange).toHaveBeenLastCalledWith('screenOrder', [
      'logbook',
      'home',
      'tracker',
      'calorie-map',
      'insights',
    ]);
    expect(listedPages()[1]).toBe('Home');
    // The handle keeps focus, so the next press keeps moving the same page.
    await user.keyboard('{ArrowUp}');
    expect(listedPages()[0]).toBe('Home');

    onFieldChange.mockClear();
    await user.keyboard('{ArrowUp}');
    expect(onFieldChange).not.toHaveBeenCalled();
  });

  it('loops by default and can be switched off', async () => {
    const { user, onFieldChange } = renderPage();
    const toggle = screen.getByRole('switch', { name: 'Loop pages' });

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);

    expect(onFieldChange).toHaveBeenCalledWith('screenLoopEnabled', false);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('resets a changed order and leaves the loop setting alone', async () => {
    const { user, onFieldChange } = renderPage({
      screenOrder: ['home', 'logbook', 'tracker', 'calorie-map', 'insights'],
      screenLoopEnabled: false,
    });
    const reset = screen.getByRole('button', { name: 'Reset page order' });

    await user.click(reset);

    expect(onFieldChange).toHaveBeenCalledTimes(1);
    expect(onFieldChange).toHaveBeenCalledWith('screenOrder', [
      'logbook',
      'tracker',
      'home',
      'calorie-map',
      'insights',
    ]);
    expect(listedPages()).toEqual(DEFAULT_LABELS);
    expect(reset).toBeDisabled();
  });
});
