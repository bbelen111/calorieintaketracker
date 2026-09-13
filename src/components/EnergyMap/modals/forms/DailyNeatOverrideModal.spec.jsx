import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DailyNeatOverrideModal } from './DailyNeatOverrideModal';
import {
  ACTIVITY_PRESET_OPTIONS,
  DEFAULT_ACTIVITY_MULTIPLIERS,
} from '../../../../constants/activity/activityPresets';

const renderModal = (props = {}) =>
  render(
    <DailyNeatOverrideModal
      isOpen
      isClosing={false}
      dayType="rest"
      globalMultiplier={DEFAULT_ACTIVITY_MULTIPLIERS.rest}
      currentPresetKey={null}
      onApply={vi.fn()}
      onClear={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  );

const findPresetButton = (label) =>
  screen.getByRole('button', { name: new RegExp(label) });

/**
 * The daily NEAT override quick-sheet. Contract: it stages a preset (or the
 * clear action) and only commits on Apply — `onApply` for a preset,
 * `onClear` when the user is falling back to global settings.
 */
describe('DailyNeatOverrideModal', () => {
  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByText('Activity Level')).not.toBeInTheDocument();
  });

  it('renders every preset for a rest day', () => {
    renderModal({ dayType: 'rest' });

    expect(screen.getByText('Activity Level')).toBeInTheDocument();
    expect(screen.getByText('Rest Day')).toBeInTheDocument();

    for (const option of ACTIVITY_PRESET_OPTIONS.rest) {
      expect(findPresetButton(option.label)).toBeInTheDocument();
    }
  });

  it('renders training presets and the colour-coded training pill', () => {
    renderModal({ dayType: 'training' });

    const pill = screen.getByText('Training Day');
    expect(pill).toHaveClass('text-accent-blue');
    expect(screen.queryByText('Rest Day')).toBeNull();

    for (const option of ACTIVITY_PRESET_OPTIONS.training) {
      expect(findPresetButton(option.label)).toBeInTheDocument();
    }
  });

  it('falls back to the rest day for an unknown day type', () => {
    renderModal({ dayType: 'nonsense' });

    expect(screen.getByText('Rest Day')).toBeInTheDocument();
  });

  it('stages a preset and commits it on apply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClear = vi.fn();
    const target = ACTIVITY_PRESET_OPTIONS.rest[2];

    renderModal({ onApply, onClear });

    await user.click(findPresetButton(target.label));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Apply to today' }));

    expect(onApply).toHaveBeenCalledWith({
      multiplier: target.value,
      presetKey: target.key,
      label: target.label,
    });
    expect(onClear).not.toHaveBeenCalled();
  });

  it('deselects a staged preset when tapped again', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClear = vi.fn();
    const target = ACTIVITY_PRESET_OPTIONS.rest[0];

    renderModal({ onApply, onClear });

    await user.click(findPresetButton(target.label));
    await user.click(findPresetButton(target.label));

    // Nothing staged → the primary action becomes the clear action.
    await user.click(screen.getByRole('button', { name: 'Use default' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('clears today’s override when nothing is staged', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClear = vi.fn();

    renderModal({ onApply, onClear });

    await user.click(screen.getByRole('button', { name: 'Use default' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it.fails(
    'clears the override when the "Use my settings (default)" card is applied (KNOWN DEFECT)',
    async () => {
      // The clear card is staged under the key 'default', which collides with the
      // 'default' entry inside ACTIVITY_PRESET_OPTIONS, so `handleApply` finds a
      // preset instead of falling through to `onClear`. For a user whose global
      // NEAT multiplier is customised (e.g. 0.25), tapping "Use my settings
      // (default)" therefore writes a 0.22 override instead of clearing — the
      // override is silently wrong for the day.
      //
      // Marked `fails` on purpose: this test asserts the DESIRED behaviour, so it
      // currently fails (suite stays green) and will be reported as an unexpected
      // pass as soon as the defect is fixed, prompting it to become a normal test.
      const user = userEvent.setup();
      const onApply = vi.fn();
      const onClear = vi.fn();

      renderModal({ onApply, onClear, globalMultiplier: 0.25 });

      await user.click(
        screen.getByRole('button', { name: /Use my settings \(default\)/ })
      );
      await user.click(screen.getByRole('button', { name: 'Apply to today' }));

      expect(onClear).toHaveBeenCalledTimes(1);
      expect(onApply).not.toHaveBeenCalled();
    }
  );

  it('seeds the staged selection from the active override', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const seeded = ACTIVITY_PRESET_OPTIONS.rest[1];

    renderModal({ currentPresetKey: seeded.key, onApply });

    // Pre-staged, so the primary action is already the apply action.
    await user.click(screen.getByRole('button', { name: 'Apply to today' }));

    expect(onApply).toHaveBeenCalledWith({
      multiplier: seeded.value,
      presetKey: seeded.key,
      label: seeded.label,
    });
  });

  it('ignores a stale preset key that is not valid for the day type', () => {
    // 'intense' is a training-only preset.
    renderModal({ currentPresetKey: 'intense' });

    expect(
      screen.getByRole('button', { name: 'Use default' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply to today' })
    ).not.toBeInTheDocument();
  });

  it('advertises the global fallback multiplier', () => {
    renderModal({ globalMultiplier: 0.2 });

    expect(screen.getByText(/fall back to 20% NEAT/)).toBeInTheDocument();
  });

  it('falls back to the canonical default when the global multiplier is missing', () => {
    renderModal({ globalMultiplier: undefined });

    const expectedPercent = `${Math.round(
      DEFAULT_ACTIVITY_MULTIPLIERS.rest * 100
    )}%`;
    expect(
      screen.getByText(new RegExp(`fall back to ${expectedPercent} NEAT`))
    ).toBeInTheDocument();
  });

  it('coerces a null global multiplier to 0% rather than the default (characterised)', () => {
    // `Number(null)` is 0, and 0 is finite, so the `Number.isFinite` guard in the
    // component does not catch `null`. Callers always pass a real number today
    // (activityMultipliers[dayType]); this pins the observed behaviour so a
    // change is deliberate.
    renderModal({ globalMultiplier: null });

    expect(screen.getByText(/fall back to 0% NEAT/)).toBeInTheDocument();
  });

  it('closes without committing on cancel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onApply = vi.fn();
    const onClear = vi.fn();

    renderModal({ onClose, onApply, onClear });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });
});
