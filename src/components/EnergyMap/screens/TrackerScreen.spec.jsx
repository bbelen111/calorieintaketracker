import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrackerScreen } from './TrackerScreen';

const HINT_TEXT = 'Tap your macros to edit the split';

const renderScreen = (props = {}) =>
  render(
    <TrackerScreen
      nutritionData={{}}
      calorieTargetCalories={2500}
      calorieTargetLabel="Maintenance"
      onOpenMacroPicker={vi.fn()}
      {...props}
    />
  );

describe('TrackerScreen macro helper', () => {
  beforeEach(() => {
    // Same switch the app flips for the "Animations: off" preference, so the
    // bubble's exit resolves immediately instead of depending on jsdom frames.
    MotionGlobalConfig.skipAnimations = true;
    // Only the hint's own timer is faked: Framer's frame loop needs the real
    // requestAnimationFrame to finish the exit.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = false;
    vi.useRealTimers();
  });

  it('opens the macro picker when the macro rings are tapped', () => {
    const onOpenMacroPicker = vi.fn();
    renderScreen({ onOpenMacroPicker });

    fireEvent.click(screen.getByRole('button', { name: 'Edit macro split' }));

    expect(onOpenMacroPicker).toHaveBeenCalledTimes(1);
  });

  it('shows no helper while the screen is not the visible one', () => {
    const onMacroHintSeen = vi.fn();
    renderScreen({
      isScreenActive: false,
      macroHintSeen: false,
      onMacroHintSeen,
    });

    expect(screen.queryByText(HINT_TEXT)).toBeNull();
    expect(onMacroHintSeen).not.toHaveBeenCalled();
  });

  it('shows the helper on first view, records it as seen, then removes it', async () => {
    const onMacroHintSeen = vi.fn();
    renderScreen({
      isScreenActive: true,
      macroHintSeen: false,
      onMacroHintSeen,
    });

    expect(screen.getByText(HINT_TEXT)).toBeTruthy();
    expect(onMacroHintSeen).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    // The exit animation unmounts it on the real clock.
    vi.useRealTimers();

    await waitFor(() => expect(screen.queryByText(HINT_TEXT)).toBeNull());
  });

  it('never shows the helper once it has been seen', () => {
    const onMacroHintSeen = vi.fn();
    renderScreen({
      isScreenActive: true,
      macroHintSeen: true,
      onMacroHintSeen,
    });

    expect(screen.queryByText(HINT_TEXT)).toBeNull();
    expect(onMacroHintSeen).not.toHaveBeenCalled();
  });

  it('dismisses the helper when the rings are tapped', async () => {
    renderScreen({ isScreenActive: true, macroHintSeen: false });
    expect(screen.getByText(HINT_TEXT)).toBeTruthy();
    vi.useRealTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Edit macro split' }));

    await waitFor(() => expect(screen.queryByText(HINT_TEXT)).toBeNull());
  });
});
