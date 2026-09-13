import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Flame, Snowflake } from 'lucide-react';

import { GoalModal } from './GoalModal';

const GOALS_FIXTURE = {
  bulk: {
    label: 'Lean Bulk',
    desc: '+300 kcal surplus',
    color: 'bg-accent-green',
    icon: Flame,
  },
  cut: {
    label: 'Moderate Cut',
    desc: '-300 kcal deficit',
    color: 'bg-accent-yellow',
    warning: 'Hard to sustain long term.',
    icon: Snowflake,
  },
};

const renderModal = (props = {}) =>
  render(
    <GoalModal
      isOpen
      isClosing={false}
      goals={GOALS_FIXTURE}
      tempSelectedGoal={null}
      onSelect={vi.fn()}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      {...props}
    />
  );

/**
 * Goal selection drives the calorie target, so the selection state must be
 * visible (active styling + marker) and every action must be wired.
 */
describe('GoalModal', () => {
  it('renders a card per goal, including descriptions and warnings', () => {
    renderModal();

    expect(screen.getByText('Select Goal')).toBeInTheDocument();
    expect(screen.getByText('Lean Bulk')).toBeInTheDocument();
    expect(screen.getByText('+300 kcal surplus')).toBeInTheDocument();
    expect(screen.getByText('Moderate Cut')).toBeInTheDocument();
    expect(screen.getByText('Hard to sustain long term.')).toBeInTheDocument();
  });

  it('falls back to the canonical goals when none are supplied', () => {
    // The orchestrator normally passes resolved goals, but the modal must stay
    // usable standalone (e.g. nested inside PhaseCreationModal).
    renderModal({ goals: undefined });

    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Aggressive Bulk')).toBeInTheDocument();
  });

  it('highlights only the staged goal', () => {
    renderModal({ tempSelectedGoal: 'cut' });

    const active = screen.getByRole('button', { name: /Moderate Cut/ });
    const inactive = screen.getByRole('button', { name: /Lean Bulk/ });

    expect(active).toHaveClass('bg-accent-yellow', 'border-accent-yellow');
    expect(inactive).not.toHaveClass('bg-accent-green');
    expect(inactive).toHaveClass('bg-surface-highlight');
  });

  it('reports the selected goal key', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderModal({ onSelect });

    await user.click(screen.getByRole('button', { name: /Lean Bulk/ }));
    expect(onSelect).toHaveBeenCalledWith('bulk');
  });

  it('wires cancel and save', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSave = vi.fn();

    renderModal({ onCancel, onSave });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Close/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByText('Select Goal')).not.toBeInTheDocument();
  });
});
