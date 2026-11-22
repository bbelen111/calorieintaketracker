import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RestingHeartRateEntryModal } from './RestingHeartRateEntryModal';
import { DEFAULT_RESTING_HEART_RATE_BPM } from '../../../../constants/health/heartRate';

const deviceEntry = {
  date: '2026-03-10',
  restingHr: 58,
  restingHrMethod: 'device',
};

const renderModal = (props = {}) =>
  render(
    <RestingHeartRateEntryModal
      isOpen
      isClosing={false}
      dateKey="2026-03-10"
      onSave={vi.fn()}
      onClear={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />
  );

describe('RestingHeartRateEntryModal', () => {
  it('saves the manual reading for its date', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ onSave, entries: [deviceEntry] });

    // A watch reading pre-fills the wheel and is named as such
    expect(screen.getByText(/current 58 bpm \(watch\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith('2026-03-10', 58);
  });

  it('keeps the wheel and the date input inside the modal', () => {
    renderModal();

    // The wheel is rendered in place (no nested picker sheet to open)...
    expect(screen.getByText('58')).toBeInTheDocument();
    expect(screen.queryByText(/tap to change/i)).toBeNull();
    // ...and the entry date is a DateInput showing the date.
    expect(screen.getByText('Entry Date')).toBeInTheDocument();
    expect(screen.getByText(/10 Mar 2026/)).toBeInTheDocument();
  });

  it('opens an unset day on the default reading and saves it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ onSave });

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(
      '2026-03-10',
      DEFAULT_RESTING_HEART_RATE_BPM
    );
  });

  it('offers Clear only for a manual reading', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { unmount } = renderModal({ entries: [deviceEntry] });
    expect(
      screen.queryByRole('button', { name: /clear manual reading/i })
    ).toBeNull();
    unmount();

    renderModal({
      onClear,
      entries: [
        { date: '2026-03-10', restingHr: 52, restingHrMethod: 'manual' },
      ],
    });
    await user.click(
      screen.getByRole('button', { name: /clear manual reading/i })
    );
    expect(onClear).toHaveBeenCalledWith('2026-03-10');
  });
});
