import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RestingHeartRateEntryModal } from './RestingHeartRateEntryModal';

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
    renderModal({
      onSave,
      existingEntry: {
        date: '2026-03-10',
        restingHr: 58,
        restingHrMethod: 'device',
      },
    });

    // A watch reading pre-fills the value and is named as such
    expect(screen.getByText(/current 58 bpm \(watch\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith('2026-03-10', 58);
  });

  it('cannot save without a value', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('offers Clear only for a manual reading', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { unmount } = renderModal({
      existingEntry: {
        date: '2026-03-10',
        restingHr: 58,
        restingHrMethod: 'device',
      },
    });
    expect(
      screen.queryByRole('button', { name: /clear manual reading/i })
    ).toBeNull();
    unmount();

    renderModal({
      onClear,
      existingEntry: {
        date: '2026-03-10',
        restingHr: 52,
        restingHrMethod: 'manual',
      },
    });
    await user.click(
      screen.getByRole('button', { name: /clear manual reading/i })
    );
    expect(onClear).toHaveBeenCalledWith('2026-03-10');
  });
});
