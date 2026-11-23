import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DayLedgerListModal } from './DayLedgerListModal';

/**
 * The month summary header carries the "N on target" count on its existing
 * second line (one line by construction, so it can never change the panel's
 * height). Days are judged against the target they were lived under, inside
 * the on-target range from Settings; unlogged and in-progress days never count.
 */

const day = (date, deficit, overrides = {}) => ({
  date,
  tdee: 2500,
  intake: 2500 - deficit,
  deficit,
  goalAtSnapshot: 'cutting',
  goalTarget: 300,
  ...overrides,
});

// March 2026 is long past, so every day is finished.
const SNAPSHOTS = {
  '2026-03-01': day('2026-03-01', 320), // on target
  '2026-03-02': day('2026-03-02', 150), // off
  '2026-03-03': day('2026-03-03', 380), // +80: on target at 100, off at 50
  '2026-03-04': day('2026-03-04', 2500, { intake: 0 }), // seeded, never judged
};

const renderModal = (props = {}) =>
  render(
    <DayLedgerListModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      dailySnapshots={SNAPSHOTS}
      currentMonth={2}
      currentYear={2026}
      onMonthChange={vi.fn()}
      onSelectDay={vi.fn()}
      onOpenDayDetail={vi.fn()}
      {...props}
    />
  );

describe('DayLedgerListModal month summary target count', () => {
  it('counts the logged days that hit their target', () => {
    renderModal();

    expect(screen.getByText(/2 on target/)).toBeInTheDocument();
  });

  it('follows the on-target range from Settings', () => {
    renderModal({ onTargetTolerance: 50 });

    expect(screen.getByText(/1 on target/)).toBeInTheDocument();
  });

  it('shows nothing when no day can be judged', () => {
    renderModal({
      dailySnapshots: {
        '2026-03-04': day('2026-03-04', 2500, { intake: 0 }),
      },
    });

    expect(screen.queryByText(/on target/)).not.toBeInTheDocument();
  });
});
