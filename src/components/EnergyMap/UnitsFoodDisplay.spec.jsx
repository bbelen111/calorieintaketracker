import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddCustomFoodModal } from './modals/forms/AddCustomFoodModal';
import { FoodSearchRecentsPanel } from './modals/fullscreen/panels/FoodSearchRecentsPanel';
import { FoodSearchMealPreviewPanel } from './modals/fullscreen/panels/FoodSearchMealPreviewPanel';
import { FoodTagBadges } from './common/FoodTagBadges';
import { useEnergyMapStore } from '../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../utils/data/storage';
import { DEFAULT_UNIT_PREFERENCES } from '../../constants/units/units';
import { createUnitFormatter } from '../../utils/units/unitFormatter';
import { validateRecipeDraft } from '../../utils/food/recipe';
import { getTodayDateKey } from '../../utils/data/dateKeys';

const OZ = { ...DEFAULT_UNIT_PREFERENCES, foodWeight: 'oz' };

const seed = (unitPreferences, userData = {}) =>
  act(() => {
    useEnergyMapStore.setState({
      userData: {
        ...getDefaultEnergyMapData(),
        ...userData,
        unitPreferences,
      },
    });
  });

afterEach(() => seed(DEFAULT_UNIT_PREFERENCES));

const CUSTOM_FOOD = {
  id: 'user_oats',
  name: 'Oats',
  isCustom: true,
  per100g: {
    calories: 389,
    protein: 16.9,
    carbs: 66.3,
    fats: 6.9,
    fiber: 10.6,
    sodium: 2,
    saturatedFats: null,
    sugars: null,
  },
  portions: [{ id: 'bowl', label: '1 bowl', grams: 85 }],
};

const renderForm = (props = {}) => {
  const onSaveFood = vi.fn();
  render(
    <AddCustomFoodModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      onSaveFood={onSaveFood}
      {...props}
    />
  );
  return onSaveFood;
};

const openPicker = async (user, buttonName, title) => {
  await user.click(screen.getByRole('button', { name: buttonName }));
  const heading = await screen.findByRole('heading', { name: title });
  return heading.closest('[role="dialog"]');
};

const pickRow = async (user, dialog, wheel, name) => {
  await user.click(
    within(within(dialog).getByRole('listbox', { name: wheel })).getByRole(
      'option',
      { name }
    )
  );
};

const save = (user, dialog) =>
  user.click(within(dialog).getByRole('button', { name: /^save$/i }));

describe('custom food in ounces', () => {
  it('saves an untouched food exactly as it was stored', async () => {
    seed(OZ);
    const user = userEvent.setup();
    const onSaveFood = renderForm({ editingFood: CUSTOM_FOOD });

    expect(
      screen.getByRole('button', { name: 'Open label serving picker' })
    ).toHaveTextContent('1 oz');
    // 16.9 g per 100 g is 4.8 g per ounce.
    expect(
      screen.getByRole('button', { name: 'Open protein picker' })
    ).toHaveTextContent('4.8 g');
    expect(screen.getByText('(3oz)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^save changes$/i }));

    expect(onSaveFood.mock.calls[0][0].per100g).toEqual(CUSTOM_FOOD.per100g);
    expect(onSaveFood.mock.calls[0][0].portions).toEqual(CUSTOM_FOOD.portions);
  });

  it('converts a typed per-serving value to per 100 g', async () => {
    seed(OZ);
    const user = userEvent.setup();
    const onSaveFood = renderForm();

    await user.type(
      screen.getByPlaceholderText("e.g., Mom's Chicken Curry"),
      'Bar'
    );

    const basis = await openPicker(
      user,
      'Open label serving picker',
      'Label Serving'
    );
    await user.click(within(basis).getByText('2'));
    await save(user, basis);

    const protein = await openPicker(user, 'Open protein picker', 'Protein');
    await pickRow(user, protein, 'Whole', '10');
    await save(user, protein);

    await user.click(screen.getByRole('button', { name: /^save food$/i }));

    // 10 g in 2 oz (56.699 g) is 17.637 g per 100 g.
    const { per100g } = onSaveFood.mock.calls[0][0];
    expect(per100g.protein).toBe(17.637);
    expect(per100g.fiber).toBeNull();
  });

  it('keeps metric entry on the per-100g wording', () => {
    renderForm({ editingFood: CUSTOM_FOOD });

    expect(screen.getByText('Nutrition per 100g')).toBeInTheDocument();
    expect(screen.getByText('(85g)')).toBeInTheDocument();
  });
});

describe('food weights in lists', () => {
  it('writes logged weights in ounces', () => {
    const entry = {
      id: 1,
      name: 'Rice',
      foodId: 'usda_rice',
      grams: 170.1,
      calories: 221,
      protein: 4.6,
      carbs: 47.6,
      fats: 0.5,
    };
    seed(OZ, {
      nutritionData: { [getTodayDateKey()]: { lunch: [entry] } },
    });

    const { unmount } = render(
      <FoodSearchRecentsPanel
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onSelectRecent={vi.fn()}
        prefersReducedMotion
      />
    );
    expect(screen.getByText(/6oz · Lunch/)).toBeInTheDocument();
    unmount();

    render(
      <FoodSearchMealPreviewPanel
        isOpen
        onClose={vi.fn()}
        mealLabel="Lunch"
        mealEntries={[entry]}
      />
    );
    expect(screen.getByText('6 oz')).toBeInTheDocument();
  });

  it('writes a tag badge weight in ounces', () => {
    seed(OZ);
    render(<FoodTagBadges food={{ name: 'Rice', grams: 56.7 }} />);

    expect(screen.getByText('2oz')).toBeInTheDocument();
  });

  it('explains recipe limits in the chosen unit', () => {
    const draft = {
      name: 'Stew',
      servings: 1,
      ingredients: [
        {
          id: 'a',
          name: 'Beef',
          grams: 1500,
          per100g: { calories: 200, protein: 26, carbs: 0, fats: 10 },
        },
      ],
    };

    expect(validateRecipeDraft(draft).errors.servingWeight).toContain(
      'would weigh 1500 g'
    );
    expect(
      validateRecipeDraft(draft, createUnitFormatter(OZ)).errors.servingWeight
    ).toContain('under 35.3 oz');
  });
});
