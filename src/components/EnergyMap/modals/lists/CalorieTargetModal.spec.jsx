import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalorieTargetModal } from './CalorieTargetModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../../../utils/data/storage';
import { DEFAULT_UNIT_PREFERENCES } from '../../../../constants/units/units';

const SAMPLE_OPTIONS = [
  {
    id: 'step_range:10k',
    key: 'step_range:10k',
    type: 'step_range',
    label: 'Step Range',
    steps: '10k',
    targetCalories: 2965,
    tdee: 2465,
    difference: 500,
  },
  {
    id: 'step_range:12k',
    key: 'step_range:12k',
    type: 'step_range',
    label: 'Step Range',
    steps: '12k',
    targetCalories: 3045,
    tdee: 2545,
    difference: 500,
  },
];

const seedStore = (overrides = {}) =>
  act(() => {
    useEnergyMapStore.setState({
      userData: { ...getDefaultEnergyMapData(), ...overrides },
      pinnedCalorieTargets: [],
    });
  });

const renderModal = (props = {}) =>
  render(
    <CalorieTargetModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      options={SAMPLE_OPTIONS}
      selectedKey="step_range:12k"
      onSelect={vi.fn()}
      selectedGoal="aggressive_bulk"
      selectedDay="training"
      {...props}
    />
  );

describe('CalorieTargetModal', () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    seedStore();
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = false;
    seedStore();
  });

  it('shows the ± on-target range inline to the left of each option’s target calories', () => {
    renderModal();

    const ranges = screen.getAllByTestId('calorie-target-range');
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toHaveTextContent('(2,865 – 3,065)');
    expect(ranges[0]).toHaveClass('text-muted');
    expect(ranges[1]).toHaveTextContent('(2,945 – 3,145)');
    expect(ranges[1]).toHaveClass('text-primary-foreground/85');
    expect(ranges[1].parentElement).toHaveClass('whitespace-nowrap');
    expect(ranges[1].parentElement).not.toHaveClass('flex-wrap');
    expect(ranges[1].parentElement).toHaveTextContent('(2,945 – 3,145)3,045');
  });

  it('follows the On-target range setting from the store as it changes', async () => {
    seedStore({ onTargetToleranceKcal: 250 });
    renderModal();

    expect(screen.getAllByTestId('calorie-target-range')[1]).toHaveTextContent(
      '(2,795 – 3,295)'
    );

    seedStore({ onTargetToleranceKcal: 50 });

    await waitFor(() =>
      expect(
        screen.getAllByTestId('calorie-target-range')[1]
      ).toHaveTextContent('(2,995 – 3,095)')
    );
  });

  it('prefers the tolerance prop over the stored setting and normalizes invalid values', () => {
    seedStore({ onTargetToleranceKcal: 50 });
    const { rerender } = renderModal({ onTargetToleranceKcal: 150 });

    expect(screen.getAllByTestId('calorie-target-range')[1]).toHaveTextContent(
      '(2,895 – 3,195)'
    );

    rerender(
      <CalorieTargetModal
        isOpen
        isClosing={false}
        onClose={vi.fn()}
        options={SAMPLE_OPTIONS}
        selectedKey="step_range:12k"
        onSelect={vi.fn()}
        selectedGoal="aggressive_bulk"
        selectedDay="training"
        onTargetToleranceKcal="invalid"
      />
    );

    expect(screen.getAllByTestId('calorie-target-range')[1]).toHaveTextContent(
      '(2,945 – 3,145)'
    );
  });

  it('writes each end of the range in kilojoules for kJ users', () => {
    seedStore({
      unitPreferences: { ...DEFAULT_UNIT_PREFERENCES, energy: 'kJ' },
    });
    renderModal({
      options: [
        {
          id: 'step_range:10k',
          key: 'step_range:10k',
          label: 'Step Range',
          steps: '10k',
          targetCalories: 2000,
          tdee: 2000,
          difference: 0,
        },
      ],
      selectedKey: 'step_range:10k',
    });

    // 2,000 kcal ± 100 kcal -> 1,900 – 2,100 kcal -> 7,950 – 8,786 kJ
    expect(screen.getByTestId('calorie-target-range')).toHaveTextContent(
      '(7,950 – 8,786)'
    );
  });

  it('omits the range when targetCalories is not positive and clamps the lower bound at zero', () => {
    renderModal({
      onTargetToleranceKcal: 250,
      options: [
        {
          id: 'zero',
          key: 'zero',
          label: 'Step Range',
          steps: '0',
          targetCalories: 0,
          tdee: 0,
          difference: 0,
        },
        {
          id: 'low',
          key: 'low',
          label: 'Step Range',
          steps: '2k',
          targetCalories: 150,
          tdee: 150,
          difference: 0,
        },
      ],
      selectedKey: 'low',
    });

    const ranges = screen.getAllByTestId('calorie-target-range');
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toHaveTextContent('(0 – 400)');
  });

  it('shows up-to-date guidance in the info popover and dismisses on outside tap or modal close', async () => {
    seedStore({
      onTargetToleranceKcal: 150,
      unitPreferences: { ...DEFAULT_UNIT_PREFERENCES, energy: 'kJ' },
    });
    const { rerender } = renderModal();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show calorie target list info' })
    );

    const popover = screen.getByRole('region', {
      name: 'Calorie target list info',
    });
    expect(popover).toHaveTextContent('±628 kJ');
    expect(popover).toHaveTextContent('Live Steps');
    expect(popover).toHaveTextContent('Press and hold');
    expect(popover).toHaveTextContent('Activity & Steps');
    expect(popover).toHaveTextContent('Food & Macros');

    // Clicking the backdrop closes the popover.
    fireEvent.click(screen.getByTestId('calorie-target-info-backdrop'));
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Calorie target list info' })
      ).not.toBeInTheDocument()
    );

    // Re-opening and closing the modal resets the popover state for next open.
    fireEvent.click(
      screen.getByRole('button', { name: 'Show calorie target list info' })
    );
    expect(
      screen.getByRole('region', { name: 'Calorie target list info' })
    ).toBeInTheDocument();

    rerender(
      <CalorieTargetModal
        isOpen={false}
        isClosing={false}
        onClose={vi.fn()}
        options={SAMPLE_OPTIONS}
        selectedKey="step_range:12k"
        onSelect={vi.fn()}
        selectedGoal="aggressive_bulk"
        selectedDay="training"
      />
    );
    rerender(
      <CalorieTargetModal
        isOpen
        isClosing={false}
        onClose={vi.fn()}
        options={SAMPLE_OPTIONS}
        selectedKey="step_range:12k"
        onSelect={vi.fn()}
        selectedGoal="aggressive_bulk"
        selectedDay="training"
      />
    );

    expect(
      screen.queryByRole('region', { name: 'Calorie target list info' })
    ).not.toBeInTheDocument();
  });
});
