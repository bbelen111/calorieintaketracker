import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StepRangesModal } from './StepRangesModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  DEFAULT_STEP_RANGES,
  STEP_RANGE_PRESETS,
  getStepDetails,
} from '../../../../utils/calculations/steps';

const BASE_PROFILE = {
  weight: 75,
  height: 175,
  gender: 'male',
  stepGoal: 10000,
  stepRanges: DEFAULT_STEP_RANGES,
  unitPreferences: {
    energy: 'kcal',
    bodyWeight: 'kg',
    height: 'cm',
    distance: 'km',
    foodWeight: 'g',
  },
};

let initialStoreState;

beforeEach(() => {
  initialStoreState = useEnergyMapStore.getState();
  useEnergyMapStore.setState({
    ...initialStoreState,
    stepGoal: BASE_PROFILE.stepGoal,
    userData: {
      ...initialStoreState.userData,
      ...BASE_PROFILE,
    },
  });
});

afterEach(() => {
  useEnergyMapStore.setState(initialStoreState, true);
});

const renderModal = (props = {}) =>
  render(
    <StepRangesModal
      isOpen
      isClosing={false}
      stepRanges={DEFAULT_STEP_RANGES}
      activeStepRange="12k"
      onSelectActiveRange={vi.fn()}
      onOpenCalorieTargetModal={vi.fn()}
      onAddRange={vi.fn()}
      onRemoveRange={vi.fn()}
      onReplaceRanges={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  );

describe('StepRangesModal', () => {
  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText('Step Ranges')).not.toBeInTheDocument();
  });

  it('shows each range with estimated steps, burn, and locks the Active goal row', () => {
    renderModal();

    const list = screen.getByRole('list', { name: 'Configured step ranges' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(DEFAULT_STEP_RANGES.length);

    expect(within(list).getByText('~7,500 steps')).toBeInTheDocument();
    expect(within(list).getByText('10,000 steps')).toBeInTheDocument();
    expect(within(list).getByText('~23,000 steps')).toBeInTheDocument();

    const expected10kBurn = getStepDetails('10k', BASE_PROFILE).calories;
    expect(
      within(list).getByText(`+${expected10kBurn} kcal`)
    ).toBeInTheDocument();

    // 12k is the active goal: badged "Active goal" and locked instead of deletable.
    const activeRow = items[2];
    expect(within(activeRow).getByText('12k')).toBeInTheDocument();
    expect(within(activeRow).getByText('Active goal')).toBeInTheDocument();
    expect(
      within(activeRow).getByLabelText(
        '12k is the active goal and cannot be removed'
      )
    ).toBeInTheDocument();
    expect(
      within(activeRow).queryByRole('button', {
        name: 'Remove 12k step range',
      })
    ).not.toBeInTheDocument();
  });

  it('opens the Calorie Target modal from the header Target button', async () => {
    const user = userEvent.setup();
    const onOpenCalorieTargetModal = vi.fn();

    renderModal({ onOpenCalorieTargetModal });

    await user.click(screen.getByRole('button', { name: /Target/i }));
    expect(onOpenCalorieTargetModal).toHaveBeenCalledTimes(1);
  });

  it('respects kJ energy unit preference for range burn values', () => {
    useEnergyMapStore.setState((state) => ({
      ...state,
      userData: {
        ...state.userData,
        unitPreferences: {
          ...state.userData.unitPreferences,
          energy: 'kJ',
        },
      },
    }));

    renderModal({ stepRanges: ['10k'] });

    const list = screen.getByRole('list', { name: 'Configured step ranges' });
    expect(within(list).getByText(/\+[\d,]+ kJ/)).toBeInTheDocument();
    expect(within(list).queryByText(/kcal/)).not.toBeInTheDocument();
  });

  it('adds exact, under, over, and bracket ranges from the builder', async () => {
    const user = userEvent.setup();
    const onAddRange = vi.fn();

    renderModal({ onAddRange });

    // Default suggestion for DEFAULT_STEP_RANGES is 15k (not yet in defaults).
    await user.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(onAddRange).toHaveBeenLastCalledWith('15k');

    // Nudge +1,000 -> 16k (already in defaults), then +1,000 -> 17k (new).
    await user.click(
      screen.getByRole('button', { name: 'Increase step count' })
    );
    expect(screen.getByText(/Already added/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Add$/ })).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Increase step count' })
    );
    await user.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(onAddRange).toHaveBeenLastCalledWith('17k');

    // Switch to Under -> nudges to <8k if coming from 15k, or decrement from 17k.
    await user.click(screen.getByRole('button', { name: 'Under' }));
    await user.click(
      screen.getByRole('button', { name: 'Decrease step count' })
    );
    await user.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(onAddRange).toHaveBeenLastCalledWith('<16k');

    // Switch to Over -> defaults up to >25k if <= 15k, or stays at current >16k.
    await user.click(screen.getByRole('button', { name: 'Over' }));
    await user.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(onAddRange).toHaveBeenLastCalledWith('>16k');

    // Switch to Range -> defaults to 10k-12k.
    await user.click(screen.getByRole('button', { name: 'Range' }));
    await user.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(onAddRange).toHaveBeenLastCalledWith('10k-12k');
  });

  it('supports selecting 500-step values through the wheel picker', async () => {
    const user = userEvent.setup();
    const onAddRange = vi.fn();

    renderModal({ onAddRange });

    await user.click(
      screen.getByRole('button', { name: 'Open step count wheel picker' })
    );
    expect(screen.getByText('Step Count')).toBeInTheDocument();

    await user.click(screen.getByText('7,500'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await user.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(onAddRange).toHaveBeenCalledWith('7.5k');
  });

  it('blocks semantically equivalent legacy ranges with explanatory feedback', async () => {
    const user = userEvent.setup();

    renderModal({ stepRanges: ['<10k', '10000', '20k+'] });

    // Switch to Over (>25k default), then nudge down to >20k (covered by 20k+).
    await user.click(screen.getByRole('button', { name: 'Over' }));
    for (let i = 0; i < 5; i += 1) {
      await user.click(
        screen.getByRole('button', { name: 'Decrease step count' })
      );
    }

    expect(screen.getByText(/Covered by 20k\+/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Add$/ })).toBeDisabled();
  });

  it('removes a non-active range directly', async () => {
    const user = userEvent.setup();
    const onRemoveRange = vi.fn();

    renderModal({ onRemoveRange });

    await user.click(
      screen.getByRole('button', { name: 'Remove 14k step range' })
    );
    expect(onRemoveRange).toHaveBeenCalledWith('14k');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('lets the user switch to a preset ladder and remaps active goal when missing', async () => {
    const user = userEvent.setup();
    const onReplaceRanges = vi.fn();
    const onSelectActiveRange = vi.fn();

    renderModal({
      activeStepRange: '14k',
      onReplaceRanges,
      onSelectActiveRange,
    });

    await user.click(screen.getByRole('button', { name: 'Presets' }));
    expect(screen.getByText('Active')).toBeInTheDocument();

    const bandedPreset = STEP_RANGE_PRESETS.find((p) => p.id === 'banded');
    await user.click(screen.getByRole('button', { name: /Banded/ }));

    expect(onReplaceRanges).toHaveBeenCalledWith(bandedPreset.ranges);
    expect(onSelectActiveRange).toHaveBeenCalledWith('12k-15k');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('prunes stale pinnedCalorieTargets when removing or replacing step ranges in the store', async () => {
    const user = userEvent.setup();
    useEnergyMapStore.setState((state) => ({
      ...state,
      pinnedCalorieTargets: ['live_steps', 'step_range:14k', 'step_range:12k'],
      userData: {
        ...state.userData,
        pinnedCalorieTargets: [
          'live_steps',
          'step_range:14k',
          'step_range:12k',
        ],
      },
    }));

    render(
      <StepRangesModal
        isOpen
        isClosing={false}
        activeStepRange="12k"
        onClose={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Remove 14k step range' })
    );

    expect(useEnergyMapStore.getState().pinnedCalorieTargets).toEqual([
      'live_steps',
      'step_range:12k',
    ]);
  });

  it('renders an actionable empty state with Restore defaults', async () => {
    const user = userEvent.setup();
    const onReplaceRanges = vi.fn();

    renderModal({ stepRanges: [], onReplaceRanges });

    expect(screen.getByText('No step ranges yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore defaults' }));

    expect(onReplaceRanges).toHaveBeenCalledWith(DEFAULT_STEP_RANGES);
  });

  it('toggles the estimation info popover', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(
      screen.getByRole('button', { name: 'How step ranges are estimated' })
    );
    expect(screen.getByText('How ranges are estimated')).toBeInTheDocument();
    expect(screen.getByText(/75% of the limit/)).toBeInTheDocument();
    expect(screen.getByText(/115% of the floor/)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Close step range info' })
    );
    await waitFor(() => {
      expect(
        screen.queryByText('How ranges are estimated')
      ).not.toBeInTheDocument();
    });
  });

  it('closes on Done button and Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderModal({ onClose });

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('uses the standard accented sliding pill and updates live store rows on add and delete', async () => {
    const user = userEvent.setup();

    render(<StepRangesModal isOpen isClosing={false} onClose={vi.fn()} />);

    expect(screen.getByTestId('segmented-toggle-pill')).toHaveClass(
      'bg-accent-blue'
    );

    // Add 15k directly into the store and confirm the new row mounts.
    await user.click(screen.getByRole('button', { name: /^Add$/ }));
    const list = screen.getByRole('list', { name: 'Configured step ranges' });
    expect(within(list).getByText('15k')).toBeInTheDocument();

    // Remove 15k and confirm it unmounts after its exit animation.
    await user.click(
      screen.getByRole('button', { name: 'Remove 15k step range' })
    );
    await waitFor(() => {
      expect(within(list).queryByText('15k')).not.toBeInTheDocument();
    });
  });
});
