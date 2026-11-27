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
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../../utils/data/storage';
import { DEFAULT_UNIT_PREFERENCES } from '../../../constants/units/units';
import { getTodayDateKey } from '../../../utils/data/dateKeys';

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

const seedStore = (overrides = {}) =>
  act(() => {
    useEnergyMapStore.setState({
      userData: { ...getDefaultEnergyMapData(), ...overrides },
    });
  });

const eatenToday = (calories) => ({
  [getTodayDateKey()]: {
    lunch: [
      { id: 1, name: 'Test meal', calories, protein: 0, carbs: 0, fats: 0 },
    ],
  },
});

const totalLine = () => screen.getByTestId('tracker-calorie-total');
const rangeLine = () => screen.getByTestId('tracker-calorie-range');
const remainingLine = () => screen.getByTestId('tracker-calorie-remaining');
const calorieBar = () => screen.getByTestId('tracker-calorie-bar');
const targetRow = () => screen.getByRole('button', { name: /Maintenance/ });

describe('TrackerScreen target range', () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    seedStore();
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = false;
    seedStore();
  });

  it('writes the target as the on-target range in both places', () => {
    renderScreen({ nutritionData: eatenToday(1950) });

    expect(totalLine()).toHaveTextContent('1,950 kcal');
    expect(rangeLine()).toHaveTextContent('of 2,400 – 2,600 kcal');
    expect(targetRow()).toHaveTextContent('2,400 – 2,600 kcal(Maintenance)');
  });

  it('follows the On-target range setting as it changes', async () => {
    seedStore({ onTargetToleranceKcal: 250 });
    renderScreen();
    expect(rangeLine()).toHaveTextContent('of 2,250 – 2,750 kcal');

    seedStore({ onTargetToleranceKcal: 50 });

    await waitFor(() =>
      expect(rangeLine()).toHaveTextContent('of 2,450 – 2,550 kcal')
    );
    await waitFor(() =>
      expect(targetRow()).toHaveTextContent('2,450 – 2,550 kcal')
    );
  });

  it('prefers the tolerance prop over the stored setting', () => {
    seedStore({ onTargetToleranceKcal: 50 });
    renderScreen({ onTargetToleranceKcal: 150 });

    expect(rangeLine()).toHaveTextContent('of 2,350 – 2,650 kcal');
  });

  it('writes the range in kilojoules for kJ users', () => {
    seedStore({
      unitPreferences: { ...DEFAULT_UNIT_PREFERENCES, energy: 'kJ' },
    });
    renderScreen({ nutritionData: eatenToday(2000) });

    expect(totalLine()).toHaveTextContent('8,368 kJ');
    expect(rangeLine()).toHaveTextContent('of 10,042 – 10,878 kJ');
    expect(targetRow()).toHaveTextContent('10,042 – 10,878 kJ');
    expect(remainingLine()).toHaveTextContent('1,674 – 2,510 remaining');
  });

  it('reads as remaining, in emerald, below the range', () => {
    renderScreen({ nutritionData: eatenToday(2000) });

    expect(remainingLine()).toHaveTextContent(/^400 – 600 remaining$/);
    expect(screen.getByText('80%')).toHaveClass('text-accent-emerald');
    expect(calorieBar()).toHaveClass('bg-accent-emerald');
  });

  it('turns green inside the range while still under the target', () => {
    renderScreen({ nutritionData: eatenToday(2440) });

    expect(remainingLine()).toHaveTextContent(/^up to 160 remaining$/);
    expect(screen.getByText('98%')).toHaveClass('text-accent-green');
    expect(calorieBar()).toHaveClass('bg-accent-green');
  });

  it('stays green, with room left, just over the single target', () => {
    renderScreen({ nutritionData: eatenToday(2560) });

    expect(remainingLine()).toHaveTextContent(/^up to 40 remaining$/);
    expect(screen.getByText('102%')).toHaveClass('text-accent-green');
    expect(calorieBar()).toHaveClass('bg-accent-green');
  });

  it('turns red and says over target above the range', () => {
    renderScreen({ nutritionData: eatenToday(2700) });

    expect(remainingLine()).toHaveTextContent(/^100 over target$/);
    expect(screen.getByText('108%')).toHaveClass('text-accent-red');
    expect(calorieBar()).toHaveClass('bg-accent-red');
  });

  it('gives a day with nothing logged no verdict', () => {
    renderScreen();

    expect(remainingLine()).toHaveTextContent(/^2,400 – 2,600 remaining$/);
    expect(calorieBar()).toHaveClass('bg-accent-emerald');
    expect(calorieBar()).not.toHaveClass('bg-accent-green');
  });
});

describe('TrackerScreen card header day', () => {
  const subtitle = () => screen.getByTestId('tracker-intake-day');
  const todayDot = () => screen.queryByTestId('tracker-today-dot');
  const dayProps = (selectedDate) => ({
    selectedDate,
    onSelectedDateChange: vi.fn(),
  });

  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 27, 12));
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = false;
    vi.useRealTimers();
  });

  it("reads Today's intake, with the dot, on today", () => {
    renderScreen(dayProps('2026-11-27'));

    expect(subtitle()).toHaveTextContent('Today’s intake');
    expect(todayDot()).toBeInTheDocument();
  });

  it('names the date, without the dot, on any other day', () => {
    renderScreen(dayProps('2026-11-24'));

    expect(subtitle()).toHaveTextContent(/^Tue, Nov 24$/);
    expect(todayDot()).toBeNull();
  });

  it('adds the year for a date in another year', () => {
    renderScreen(dayProps('2025-11-24'));

    expect(subtitle()).toHaveTextContent(/^Mon, Nov 24, 2025$/);
  });

  it('swaps the subtitle when the selected day changes', async () => {
    const view = renderScreen(dayProps('2026-11-27'));

    view.rerender(
      <TrackerScreen nutritionData={{}} {...dayProps('2026-11-28')} />
    );

    await waitFor(() => expect(subtitle()).toHaveTextContent(/^Sat, Nov 28$/));
    expect(todayDot()).toBeNull();
  });
});

describe('TrackerScreen saved day targets', () => {
  // Today is Fri 27; the strip runs Sun 22 to Sat 28.
  const meal = (calories) => ({
    lunch: [
      { id: 1, name: 'Test meal', calories, protein: 0, carbs: 0, fats: 0 },
    ],
  });
  const nutritionData = {
    '2026-11-24': meal(2200),
    '2026-11-25': meal(2200),
    '2026-11-27': meal(1000),
    '2026-11-28': meal(1000),
  };
  const renderDay = (selectedDate) =>
    renderScreen({
      nutritionData,
      selectedDate,
      onSelectedDateChange: vi.fn(),
    });
  const target = () => screen.getByTestId('tracker-calorie-target');
  const dateButton = (weekday) => screen.getByText(weekday).closest('button');
  const rim = (weekday) => {
    const rect = dateButton(weekday).querySelector(
      'rect[data-part="progress"]'
    );
    return (
      rect && [
        rect.getAttribute('stroke-dasharray'),
        rect.getAttribute('stroke'),
      ]
    );
  };

  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 27, 12));
    // Saved targets of 2,200 (TDEE 2,500, 300 deficit).
    const saved = { tdee: 2500, goalTarget: 300, goalAtSnapshot: 'cutting' };
    seedStore({
      dailySnapshots: {
        '2026-11-24': saved,
        '2026-11-27': saved,
        '2026-11-28': saved,
      },
    });
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = false;
    vi.useRealTimers();
    seedStore();
  });

  it('judges a past day against its saved target, read-only', () => {
    renderDay('2026-11-24');

    expect(rangeLine()).toHaveTextContent('of 2,100 – 2,300 kcal');
    expect(calorieBar()).toHaveClass('bg-accent-green');
    expect(target()).toHaveTextContent('(Saved that day)');
    expect(target().tagName).toBe('DIV');
  });

  it.each([
    ['today, whatever its snapshot says', '2026-11-27'],
    ['a past day with no saved target', '2026-11-25'],
    ['a future day', '2026-11-28'],
  ])('keeps the picked target for %s', (_label, selectedDate) => {
    renderDay(selectedDate);

    expect(rangeLine()).toHaveTextContent('of 2,400 – 2,600 kcal');
    expect(target()).toHaveTextContent('(Maintenance)');
    expect(target().tagName).toBe('BUTTON');
  });

  it('outlines each date in white, filled against its own target', () => {
    renderDay('2026-11-27');

    // 2,200 of the saved 2,200; the text colour is white on the dark themes.
    expect(rim('Tue')).toEqual(['100 100', 'rgb(var(--foreground) / 1)']);
    // 1,000 of the live 2,500; selected, so on the blue fill.
    expect(rim('Fri')).toEqual([
      '40 100',
      'rgb(var(--primary-foreground) / 1)',
    ]);
    // Eaten but no saved target, nothing eaten, and a future day.
    expect(rim('Wed')).toBeNull();
    expect(rim('Thu')).toBeNull();
    expect(rim('Sat')).toBeNull();
  });
});

describe('TrackerScreen dates behind UTC', () => {
  beforeEach(() => {
    // Node honours a runtime TZ change.
    vi.stubEnv('TZ', 'America/New_York');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('gives each week strip day its own weekday and month', () => {
    // Guard: UTC midnight must really be the evening before in this zone.
    expect(new Date('2026-11-01T00:00:00Z').getDate()).toBe(31);

    // 2026-11-01 is a Sunday and the first of its month.
    renderScreen({
      selectedDate: '2026-11-01',
      onSelectedDateChange: vi.fn(),
    });

    expect(screen.getByText('Sun').closest('button')).toHaveTextContent(
      /^Sun1$/
    );
    expect(screen.getByText('Sat').closest('button')).toHaveTextContent(
      /^Sat7$/
    );
    expect(screen.getByText('November 2026')).toBeInTheDocument();
  });
});

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
