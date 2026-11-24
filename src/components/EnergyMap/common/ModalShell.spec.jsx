import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModalShell } from './ModalShell';
import { CapacitorMock } from '../../../tests/mocks/capacitor.js';
import { closeTopmostStackedModal } from '../../../utils/visuals/modalStack.js';

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

/**
 * Android hardware back = Escape on the topmost modal, at ANY level of the app.
 * The orchestrator's fixed list only knew its own modals, so a child opened from
 * inside one (Add Custom Food over Food Search, the ingredient page over that)
 * was skipped and back closed the parent underneath it. Every ModalShell now
 * registers its dismissal with the shared stack instead.
 */
describe('ModalShell hardware back', () => {
  beforeEach(() => {
    CapacitorMock.isNativePlatform.mockReturnValue(false);
  });

  const Stack = ({
    parent = {},
    child = {},
    childOpen = false,
    childClosing = false,
  }) => (
    <>
      <ModalShell
        isOpen
        onClose={parent.onClose}
        closeOnEscape={parent.closeOnEscape}
      >
        <p>parent</p>
      </ModalShell>
      <ModalShell
        isOpen={childOpen}
        isClosing={childClosing}
        onClose={child.onClose}
        closeOnEscape={child.closeOnEscape}
      >
        <p>child</p>
      </ModalShell>
    </>
  );

  const pressBack = () => {
    let consumed;
    act(() => {
      consumed = closeTopmostStackedModal();
    });
    return consumed;
  };

  it('dismisses a lone modal through its onClose', () => {
    const onClose = vi.fn();
    renderShell({ onClose });

    expect(pressBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses the child that is on top, never the parent beneath it', () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    const { rerender } = render(<Stack parent={{ onClose: parentClose }} />);

    rerender(
      <Stack
        parent={{ onClose: parentClose }}
        child={{ onClose: childClose }}
        childOpen
      />
    );

    expect(pressBack()).toBe(true);
    expect(childClose).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
  });

  it('hands the next press to the parent once the child is closing', () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    const { rerender } = render(<Stack parent={{ onClose: parentClose }} />);
    rerender(
      <Stack
        parent={{ onClose: parentClose }}
        child={{ onClose: childClose }}
        childOpen
      />
    );

    pressBack();
    rerender(
      <Stack
        parent={{ onClose: parentClose }}
        child={{ onClose: childClose }}
        childOpen
        childClosing
      />
    );
    pressBack();

    expect(childClose).toHaveBeenCalledTimes(1);
    expect(parentClose).toHaveBeenCalledTimes(1);
  });

  it('always calls the latest onClose, not the one from when it opened', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderShell({ onClose: first });

    rerender(
      <ModalShell isOpen onClose={second}>
        <p>modal body</p>
      </ModalShell>
    );
    pressBack();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('honours closeOnEscape={false}: the press is consumed and nothing closes', () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    const { rerender } = render(<Stack parent={{ onClose: parentClose }} />);
    rerender(
      <Stack
        parent={{ onClose: parentClose }}
        child={{ onClose: childClose, closeOnEscape: false }}
        childOpen
      />
    );

    // Consumed, so it cannot fall through and close the parent either.
    expect(pressBack()).toBe(true);
    expect(childClose).not.toHaveBeenCalled();
    expect(parentClose).not.toHaveBeenCalled();
  });

  it('does not consume the press for a modal with no onClose', () => {
    renderShell();

    expect(pressBack()).toBe(false);
  });

  it('forgets a modal once it unmounts', () => {
    const onClose = vi.fn();
    const { unmount } = renderShell({ onClose });

    unmount();

    expect(pressBack()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});
