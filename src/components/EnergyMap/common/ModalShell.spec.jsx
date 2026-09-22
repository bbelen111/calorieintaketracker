import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CapacitorMock } from '../../../tests/mocks/capacitor.js';
import { ModalShell } from './ModalShell';

const setViewportSize = ({ width, height }) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
  Object.assign(window.visualViewport, { width, height });
};

describe('ModalShell keyboard-safe sizing', () => {
  beforeEach(() => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    setViewportSize({ width: 400, height: 900 });
  });

  it('re-sizes and bottom-aligns non-full-height modals when keyboard-safe mode is enabled', async () => {
    render(
      <ModalShell isOpen allowKeyboardViewportResize>
        <div>Body</div>
      </ModalShell>
    );

    const dialog = screen.getByRole('dialog');
    const content = dialog.querySelector('.modal-content');
    expect(content?.style.maxHeight).toBe('876px');

    setViewportSize({ width: 400, height: 620 });
    window.visualViewport.dispatchEvent(new window.Event('resize'));

    await waitFor(() => {
      expect(dialog.style.alignItems).toBe('flex-end');
      expect(dialog.style.height).toBe('620px');
      expect(content?.style.maxHeight).toBe('596px');
    });
  });

  it('keeps keyboard-sized viewport changes ignored when keyboard-safe mode is disabled', async () => {
    render(
      <ModalShell isOpen>
        <div>Body</div>
      </ModalShell>
    );

    const dialog = screen.getByRole('dialog');
    const content = dialog.querySelector('.modal-content');
    expect(content?.style.maxHeight).toBe('810px');

    setViewportSize({ width: 400, height: 620 });
    window.visualViewport.dispatchEvent(new window.Event('resize'));

    await waitFor(() => {
      expect(dialog.style.alignItems).toBe('center');
      expect(dialog.style.height).toBe('900px');
      expect(content?.style.maxHeight).toBe('810px');
    });
  });
});
