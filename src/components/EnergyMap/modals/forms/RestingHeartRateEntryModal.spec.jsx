import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RestingHeartRateEntryModal } from './RestingHeartRateEntryModal';

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
      mode="add"
      date="2026-03-10"
      bpm={58}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      onCancel={vi.fn()}
      onDateChange={vi.fn()}
      onBpmChange={vi.fn()}
      {...props}
    />
  );

describe('RestingHeartRateEntryModal', () => {
  it('saves the wheel value through the shared entry shell', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ onSave, entries: [deviceEntry] });

    // A watch reading is named as such under the date
    expect(screen.getByText(/current 58 bpm \(watch\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(58);
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

  it('titles and locks the date like the weight modal', () => {
    const { unmount } = renderModal();
    expect(screen.getByText('Add Resting Heart Rate')).toBeInTheDocument();
    expect(screen.queryByText(/date cannot be changed/i)).toBeNull();
    unmount();

    renderModal({ mode: 'edit' });
    expect(screen.getByText('Edit Resting Heart Rate')).toBeInTheDocument();
    expect(screen.getByText(/date cannot be changed/i)).toBeInTheDocument();
  });

  it('offers delete only while editing, and confirms it first', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { unmount } = renderModal({ mode: 'add' });
    expect(screen.queryByRole('button', { name: /delete entry/i })).toBeNull();
    unmount();

    renderModal({ mode: 'edit', onDelete });
    await user.click(screen.getByRole('button', { name: /delete entry/i }));
    // Nothing is removed until the confirm sheet is accepted
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete resting heart rate?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows the owner-reported error', () => {
    renderModal({ error: 'Select a valid date.' });
    expect(screen.getByText('Select a valid date.')).toBeInTheDocument();
  });
});
