import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import { CalendarPickerModal } from './CalendarPickerModal';

const snapshotDay = (date, deficit, overrides = {}) => ({
  date,
  tdee: 2500,
  intake: 2500 - deficit,
  deficit,
  goalAtSnapshot: 'cutting',
  goalTarget: 300, // saved calorie target = 2200
  ...overrides,
});

const mealEntry = (calories) => ({
  breakfast: [
    {
      id: `entry-${calories}`,
      name: 'Meal',
      calories,
      protein: 150,
      carbs: 200,
      fats: 60,
    },
  ],
});

// March 2026 is in the past, so every day is finished.
const MARCH_SNAPSHOTS = {
  '2026-03-01': snapshotDay('2026-03-01', 320), // intake 2180 -> on target at 100
  '2026-03-02': snapshotDay('2026-03-02', 60), // intake 2440 -> 140 over [2100, 2300]
  '2026-03-03': snapshotDay('2026-03-03', 380), // intake 2120 -> on target at 100, 30 under at 50
  '2026-03-04': snapshotDay('2026-03-04', 2500, { intake: 0 }), // seeded, unlogged
  '2026-03-05': snapshotDay('2026-03-05', 750), // intake 1750 -> 350 under [2100, 2300]
};

const MARCH_NUTRITION = {
  '2026-03-01': mealEntry(2180),
  '2026-03-02': mealEntry(2440),
  '2026-03-03': mealEntry(2120),
  '2026-03-05': mealEntry(1750),
  // Food logged with no snapshot at all: never judged against live target.
  '2026-03-06': mealEntry(2200),
};

const renderModal = (props = {}) =>
  render(
    <CalendarPickerModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      onSelectDate={vi.fn()}
      nutritionData={MARCH_NUTRITION}
      dailySnapshots={MARCH_SNAPSHOTS}
      selectedDate="2026-03-01"
      currentMonth={2}
      currentYear={2026}
      onMonthChange={vi.fn()}
      liveTargetCalories={2200}
      {...props}
    />
  );

const clickCalendarDay = (dayNum) => {
  const buttons = screen
    .getAllByRole('button')
    .filter(
      (btn) =>
        !btn.disabled &&
        btn.getAttribute('aria-label')?.startsWith('Preview ') &&
        btn.textContent.trim() === String(dayNum)
    );
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);
};

describe('CalendarPickerModal on-target indicators', () => {
  it('shows the finished-day on-target pill in the Monthly Averages header and respects tolerance', () => {
    const { rerender } = renderModal();

    expect(screen.getByText(/2 on target/)).toBeInTheDocument();

    rerender(
      <CalendarPickerModal
        isOpen
        isClosing={false}
        onClose={vi.fn()}
        onSelectDate={vi.fn()}
        nutritionData={MARCH_NUTRITION}
        dailySnapshots={MARCH_SNAPSHOTS}
        onTargetTolerance={50}
        selectedDate="2026-03-01"
        currentMonth={2}
        currentYear={2026}
        onMonthChange={vi.fn()}
        liveTargetCalories={2200}
      />
    );

    expect(screen.getByText(/1 on target/)).toBeInTheDocument();
  });

  it('hides the month on-target pill when no days can be judged', () => {
    renderModal({
      dailySnapshots: {
        '2026-03-04': snapshotDay('2026-03-04', 2500, { intake: 0 }),
      },
    });

    expect(screen.queryByText(/on target/)).not.toBeInTheDocument();
  });

  it('shows intake target range and under / on-target / over verdicts in the day preview', () => {
    renderModal();

    // Day 1: 2,180 kcal inside [2,100, 2,300] -> on target (green)
    clickCalendarDay(1);
    expect(screen.getByText(/Target 2,100 – 2,300 kcal/)).toBeInTheDocument();
    const onTargetVerdict = screen.getByText(/· on target/);
    expect(onTargetVerdict).toHaveClass('text-accent-green');

    // Day 2: 2,440 kcal -> 140 over (red)
    clickCalendarDay(2);
    const overVerdict = screen.getByText(/· 140 over/);
    expect(overVerdict).toHaveClass('text-accent-red');

    // Day 5: 1,750 kcal -> 350 under (emerald)
    clickCalendarDay(5);
    const underVerdict = screen.getByText(/· 350 under/);
    expect(underVerdict).toHaveClass('text-accent-emerald');
  });

  it('omits the target verdict for past days without a saved snapshot and empty days', () => {
    renderModal();

    // Day 6: food logged, no snapshot
    clickCalendarDay(6);
    expect(screen.queryByText(/Target /)).not.toBeInTheDocument();

    // Day 7: empty day
    clickCalendarDay(7);
    expect(screen.queryByText(/Target /)).not.toBeInTheDocument();
    expect(
      screen.getByText('No food logged for this day yet.')
    ).toBeInTheDocument();
  });

  it('judges today against liveTargetCalories and leaves future dates unjudged', () => {
    const todayKey = getTodayDateKey();
    const [yearStr, monthStr, dayStr] = todayKey.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const todayDay = Number(dayStr);
    const daysInMonth = new Date(
      Date.UTC(year, monthIndex + 1, 0)
    ).getUTCDate();
    const hasFutureDayInMonth = todayDay < daysInMonth;
    const futureDay = hasFutureDayInMonth ? todayDay + 1 : null;
    const futureKey = futureDay
      ? `${yearStr}-${monthStr}-${String(futureDay).padStart(2, '0')}`
      : null;

    renderModal({
      currentYear: year,
      currentMonth: monthIndex,
      selectedDate: todayKey,
      dailySnapshots: {},
      liveTargetCalories: 2200,
      nutritionData: {
        [todayKey]: mealEntry(600),
        ...(futureKey ? { [futureKey]: mealEntry(2200) } : {}),
      },
    });

    clickCalendarDay(todayDay);
    expect(screen.getByText(/Target 2,100 – 2,300 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/· 1,500 under/)).toHaveClass(
      'text-accent-emerald'
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();

    if (futureDay) {
      clickCalendarDay(futureDay);
      expect(screen.queryByText(/Target /)).not.toBeInTheDocument();
    }
  });

  it('keeps calendar cells neutral rather than balance-coloured', () => {
    renderModal();

    const day1Cell = screen
      .getAllByRole('button')
      .find(
        (btn) =>
          !btn.disabled &&
          btn.getAttribute('aria-label')?.startsWith('Preview ') &&
          btn.textContent.trim() === '2'
      );
    expect(day1Cell).toBeDefined();
    expect(day1Cell.className).not.toContain('bg-accent-red');
    expect(day1Cell.className).not.toContain('bg-accent-green');
  });
});
