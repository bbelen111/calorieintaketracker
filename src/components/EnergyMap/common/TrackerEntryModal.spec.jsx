import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrackerEntryModal } from './TrackerEntryModal';
import { SCROLL_SETTLE_DELAY } from '../../../utils/visuals/scroll';

const FakeWheel = ({ onChange }) => (
  <button type="button" onClick={() => onChange(42)}>
    flick wheel
  </button>
);

const renderModal = (props = {}) =>
  render(
    <TrackerEntryModal
      isOpen
      isClosing={false}
      title="Add Thing Entry"
      unitLabel="Units"
      value={10}
      date="2026-03-10"
      deleteTitle="Delete thing entry?"
      deleteDescription="Removes it."
      Picker={FakeWheel}
      onValueChange={vi.fn()}
      onDateChange={vi.fn()}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      {...props}
    />
  );

describe('TrackerEntryModal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the title, unit label, picker and date', () => {
    renderModal();
    expect(screen.getByText('Add Thing Entry')).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText(/10 Mar 2026/)).toBeInTheDocument();
  });

  it('locks the date and offers delete only in edit mode', () => {
    const { unmount } = renderModal({ onDelete: vi.fn() });
    expect(screen.queryByText(/date cannot be changed/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /delete entry/i })).toBeNull();
    unmount();

    renderModal({ mode: 'edit', onDelete: vi.fn() });
    expect(screen.getByText(/date cannot be changed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /delete entry/i })
    ).toBeInTheDocument();
  });

  it('hides delete when the owner says it is not allowed', () => {
    renderModal({ mode: 'edit', canDelete: false, onDelete: vi.fn() });
    expect(screen.queryByRole('button', { name: /delete entry/i })).toBeNull();
  });

  it('confirms before deleting, and keeps the entry on cancel', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderModal({ mode: 'edit', onDelete });

    await user.click(screen.getByRole('button', { name: /delete entry/i }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /keep entry/i }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /delete entry/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('relays wheel drafts on settle, not per frame', () => {
    vi.useFakeTimers();
    const onValueChange = vi.fn();
    renderModal({ onValueChange });

    fireEvent.click(screen.getByText('flick wheel'));
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SCROLL_SETTLE_DELAY);
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(42);
  });

  it('saves the live wheel value even before the draft has relayed', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const onValueChange = vi.fn();
    renderModal({ onSave, onValueChange });

    fireEvent.click(screen.getByText('flick wheel'));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(42);

    // The trailing commit is dropped once saved, so it cannot land late.
    act(() => {
      vi.advanceTimersByTime(SCROLL_SETTLE_DELAY * 2);
    });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('saves the draft value when the wheel was never touched', () => {
    const onSave = vi.fn();
    renderModal({ onSave, value: 17 });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(17);
  });

  it('shows errors and disables save on request', () => {
    renderModal({ error: 'Select a valid date.', saveDisabled: true });
    expect(screen.getByText('Select a valid date.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });
});
