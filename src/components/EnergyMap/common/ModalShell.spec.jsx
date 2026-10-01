import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ModalShell } from './ModalShell';
import { CapacitorMock } from '../../../tests/mocks/capacitor.js';

/**
 * ModalShell owns the keyboard-aware geometry for *centered* modals. Android
 * needs nothing from it (`adjustResize` already ends the layout viewport at the
 * keyboard, so `--keyboard-inset` is 0 there), but iOS keeps `resize: "none"`, so
 * the covered height arrives as `--keyboard-inset`: the centering band has to
 * shrink and the content has to be capped to what is left of it — and none of
 * that may come back as a measured `height` write on either node (the removed
 * viewport lock is what used to leave the backdrop short and clip the modal).
 */

const renderShell = (props = {}) =>
  render(
    <ModalShell isOpen {...props}>
      <p>modal body</p>
    </ModalShell>
  );

const overlayNode = () => screen.getByRole('dialog');
const contentNode = () => overlayNode().firstElementChild;

describe('ModalShell keyboard sizing', () => {
  beforeEach(() => {
    CapacitorMock.isNativePlatform.mockReturnValue(false);
  });

  it('sizes a centered modal against the keyboard without writing a height', () => {
    renderShell();

    const overlay = overlayNode();
    const content = contentNode();

    expect(overlay.style.paddingBottom).toBe(
      'max(1rem, var(--keyboard-inset, 0px))'
    );
    expect(content.style.maxHeight).toBe(
      'min(90dvh, calc(100dvh - var(--keyboard-inset, 0px) - 2rem))'
    );

    // The removed viewport lock must not come back.
    expect(overlay.style.height).toBe('');
    expect(content.style.height).toBe('');
  });

  it('leaves the fullscreen takeover layout to the modal itself', () => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    renderShell({ fullHeight: true });

    // Fullscreen modals bring their own `fixed inset-0 h-screen` content (and
    // `.keyboard-bottom-inset`), so the centering path must not add anything.
    expect(overlayNode().style.paddingBottom).toBe('');
    expect(contentNode().style.maxHeight).toBe('');
    expect(contentNode().style.height).toBe('');
  });
});
