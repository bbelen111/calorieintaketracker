import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddCustomFoodModal } from './modals/forms/AddCustomFoodModal';
import { CalorieBreakdownModal } from './modals/info/CalorieBreakdownModal';
import { RollingEnergyBalanceInfoModal } from './modals/info/RollingEnergyBalanceInfoModal';
import { CaloriesPerHourGuideModal } from './modals/info/CaloriesPerHourGuideModal';
import { AdaptiveThermogenesisInfoModal } from './modals/info/AdaptiveThermogenesisInfoModal';
import { TrackerScreen } from './screens/TrackerScreen';
import { useEnergyMapStore } from '../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../utils/data/storage';
import { DEFAULT_UNIT_PREFERENCES } from '../../constants/units/units';
import { calculateCalorieBreakdown } from '../../utils/calculations/calculations';
import { getTodayDateKey } from '../../utils/data/dateKeys';

const KJ = { ...DEFAULT_UNIT_PREFERENCES, energy: 'kJ' };

const seed = (unitPreferences) =>
  act(() => {
    useEnergyMapStore.setState({
      userData: { ...getDefaultEnergyMapData(), unitPreferences },
    });
  });

afterEach(() => seed(DEFAULT_UNIT_PREFERENCES));

describe('energy in kilojoules', () => {
  it('enters a custom food from a kJ label and stores kcal', async () => {
    seed(KJ);
    const user = userEvent.setup();
    const onSaveFood = vi.fn();
    render(
      <AddCustomFoodModal
        isOpen
        isClosing={false}
        onClose={vi.fn()}
        onSaveFood={onSaveFood}
      />
    );

    await user.type(
      screen.getByPlaceholderText("e.g., Mom's Chicken Curry"),
      'Yoghurt'
    );
    await user.click(
      screen.getByRole('button', { name: 'Open calories picker' })
    );
    const dialog = (
      await screen.findByRole('heading', { name: 'Energy' })
    ).closest('[role="dialog"]');
    const row = (wheel, name) =>
      within(within(dialog).getByRole('listbox', { name: wheel })).getByRole(
        'option',
        { name }
      );
    await user.click(row('Hundreds', '8'));
    await user.click(row('Units', '46'));
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(
      screen.getByRole('button', { name: 'Open calories picker' })
    ).toHaveTextContent('846 kJ');
    await user.click(screen.getByRole('button', { name: /^save food$/i }));

    expect(onSaveFood.mock.calls[0][0].per100g.calories).toBe(202.2);
  });

  it('writes the calorie breakdown in kJ and keeps SI equations', () => {
    seed(KJ);
    const userData = getDefaultEnergyMapData();
    const breakdown = calculateCalorieBreakdown({
      steps: 10000,
      isTrainingDay: false,
      userData,
      bmr: 1700,
      cardioTypes: {},
      trainingTypes: userData.trainingType,
    });
    const { baseElement } = render(
      <CalorieBreakdownModal
        isOpen
        isClosing={false}
        stepRange={10000}
        selectedDay="rest"
        selectedGoal="maintenance"
        breakdown={breakdown}
        targetCalories={breakdown.total}
        onClose={vi.fn()}
      />
    );

    const total = `${Math.round(breakdown.total * 4.184).toLocaleString()} kJ`;
    expect(screen.getByText(total)).toBeInTheDocument();
    expect(screen.getByText(/kJ\/km/)).toBeInTheDocument();
    // The Mifflin line stays in kcal with the kJ result appended.
    expect(baseElement.textContent).toMatch(/[\d,]+ kcal \([\d,]+ kJ\)/);
  });

  it('writes the tracker totals and rows in kJ', () => {
    seed(KJ);
    const today = getTodayDateKey();
    render(
      <TrackerScreen
        nutritionData={{
          [today]: {
            lunch: [
              {
                id: 1,
                name: 'Rice',
                grams: 100,
                calories: 100,
                protein: 2,
                carbs: 22,
                fats: 0,
              },
            ],
          },
        }}
        selectedDate={today}
        onSelectedDateChange={vi.fn()}
        calendarModal={{ open: vi.fn() }}
        calorieTargetCalories={2000}
      />
    );

    expect(screen.getByText('Total Energy')).toBeInTheDocument();
    // 2,000 kcal target ± the default 100 kcal range, each end converted.
    expect(screen.getByTestId('tracker-calorie-total')).toHaveTextContent(
      '418 kJ'
    );
    expect(screen.getByTestId('tracker-calorie-range')).toHaveTextContent(
      'of 7,950 – 8,786 kJ'
    );
  });

  it('restates the figures in the info sheets', () => {
    seed({ ...KJ, bodyWeight: 'lb' });
    const { unmount } = render(
      <RollingEnergyBalanceInfoModal isOpen onClose={vi.fn()} />
    );
    expect(screen.getByText(/14,613 kJ per pound/)).toBeInTheDocument();
    unmount();

    const second = render(
      <CaloriesPerHourGuideModal isOpen onClose={vi.fn()} />
    );
    expect(screen.getByText('~753-1004 kJ')).toBeInTheDocument();
    second.unmount();

    render(<AdaptiveThermogenesisInfoModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText(/±1255 kJ\/day/)).toBeInTheDocument();
  });

  it('keeps the info sheet figures in kcal by default', () => {
    render(<RollingEnergyBalanceInfoModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText(/7,700 kcal per kilogram/)).toBeInTheDocument();
  });
});
