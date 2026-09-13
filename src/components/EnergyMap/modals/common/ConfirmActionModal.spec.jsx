import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmActionModal } from './ConfirmActionModal';

/**
 * `ConfirmActionModal` is the shared destructive-action dialog (delete entry,
 * discard draft, ...). Contract: tone drives the confirm button treatment, all
 * labels are overridable, and cancel/confirm wire straight through to handlers.
 */
describe('ConfirmActionModal', () => {
  const renderModal = (props = {}) =>
    render(
      <ConfirmActionModal
        isOpen
        isClosing={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    );

  it('renders the title, description and default labels', () => {
    renderModal({ description: 'This cannot be undone.' });

    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('omits the description when not provided', () => {
    renderModal();

    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(
      screen.queryByText('This cannot be undone.')
    ).not.toBeInTheDocument();
  });

  it('uses custom labels when supplied', () => {
    renderModal({ confirmLabel: 'Delete', cancelLabel: 'Keep' });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('defaults to the danger tone', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass(
      'bg-accent-red'
    );
  });

  it('applies the success tone treatment', () => {
    renderModal({ tone: 'success', confirmLabel: 'Finish' });

    expect(screen.getByRole('button', { name: 'Finish' })).toHaveClass(
      'bg-accent-green'
    );
  });

  it('falls back to the primary treatment for an unknown tone', () => {
    renderModal({ tone: 'neutral', confirmLabel: 'OK' });

    const confirmButton = screen.getByRole('button', { name: 'OK' });
    expect(confirmButton).toHaveClass('bg-primary');
    expect(confirmButton).not.toHaveClass('bg-accent-red');
    expect(confirmButton).not.toHaveClass('bg-accent-green');
  });

  it('calls onConfirm and onCancel from the matching buttons', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    renderModal({ onConfirm, onCancel });

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });
});
