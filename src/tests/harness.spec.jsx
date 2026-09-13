import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CapacitorMock } from './mocks/capacitor.js';
import { ConfirmActionModal } from '../components/EnergyMap/modals/common/ConfirmActionModal';

/**
 * Harness smoke test.
 *
 * This exists to protect the UI tier's own wiring (jsdom document, React JSX
 * transform, testing-library render, jest-dom matchers, Capacitor plugin
 * doubles, ModalShell portal rendering). If this spec fails, every other UI
 * spec failure is noise — fix the harness first.
 */
describe('UI test harness', () => {
  it('runs inside a jsdom document', () => {
    expect(typeof document.createElement).toBe('function');
    expect(document.documentElement).toBeTruthy();
  });

  it('has the Capacitor plugin double registered', () => {
    // Surfaced through the setup-file vi.mock of '@capacitor/core'.
    expect(CapacitorMock.isNativePlatform()).toBe(false);
  });

  it('mounts a real component through ModalShell (portal + matchers)', () => {
    render(
      <ConfirmActionModal
        isOpen
        isClosing={false}
        title="Delete Entry?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Delete Entry?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
