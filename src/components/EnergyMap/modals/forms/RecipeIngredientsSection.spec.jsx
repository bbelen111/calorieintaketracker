import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeIngredientsSection } from './RecipeIngredientsSection';
import {
  resetMotionMode,
  setMotionMode,
} from '../../../../utils/visuals/motionPreference';
import {
  buildRecipeFood,
  validateRecipeDraft,
} from '../../../../utils/food/recipe';

const BEEF = {
  calories: 250,
  protein: 26,
  carbs: 0,
  fats: 15,
  fiber: 0,
  sodium: 72,
  saturatedFats: 6,
  sugars: 0,
};
const RICE = {
  calories: 130,
  protein: 2.7,
  carbs: 28,
  fats: 0.3,
  fiber: 0.4,
  sodium: 1,
  saturatedFats: 0.1,
  sugars: 0.1,
};

const INGREDIENTS = [
  { id: 'beef', name: 'Beef', grams: 150, per100g: BEEF, portionLabel: null },
  {
    id: 'rice',
    name: 'Rice',
    brand: 'Uncle Ben',
    grams: 200,
    per100g: RICE,
    portionLabel: '1 × 1 cup',
  },
];

const renderSection = (props = {}) => {
  const ingredients = props.ingredients ?? INGREDIENTS;
  const servings = props.servings ?? 2;
  const cookedWeightGrams = props.cookedWeightGrams ?? '';
  const draft = {
    name: 'Beef bowl',
    servings,
    cookedWeightGrams: cookedWeightGrams === '' ? null : cookedWeightGrams,
    ingredients,
  };
  const handlers = {
    onAddIngredient: vi.fn(),
    onChangeIngredientGrams: vi.fn(),
    onRemoveIngredient: vi.fn(),
    onChangeServings: vi.fn(),
    onChangeCookedWeight: vi.fn(),
  };

  render(
    <RecipeIngredientsSection
      ingredients={ingredients}
      servings={servings}
      cookedWeightGrams={cookedWeightGrams}
      previewFood={buildRecipeFood({
        ...draft,
        id: 'recipe_preview',
      })}
      validation={validateRecipeDraft(draft)}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

const pickValue = async (user, headingName, value) => {
  const heading = await screen.findByRole('heading', { name: headingName });
  const dialog = heading.closest('[role="dialog"]');
  await user.click(within(dialog).getByText(String(value)));
  await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
};

describe('RecipeIngredientsSection', () => {
  it('invites the first ingredient when the recipe is empty', async () => {
    const user = userEvent.setup();
    const handlers = renderSection({ ingredients: [] });

    expect(screen.getByText(/add the foods that go into/i)).toBeInTheDocument();
    expect(
      screen.getByText(/add an ingredient to see the nutrition/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add ingredient/i }));
    expect(handlers.onAddIngredient).toHaveBeenCalledTimes(1);
  });

  it('lists each ingredient with its weight and calories', () => {
    renderSection();

    expect(screen.getByText('2 ingredients')).toBeInTheDocument();
    expect(screen.getByText('Beef')).toBeInTheDocument();
    expect(screen.getByText('375 kcal')).toBeInTheDocument(); // 150 g x 250/100
    // Brand-first display name + how the amount was picked.
    expect(screen.getByText('Uncle Ben - Rice')).toBeInTheDocument();
    expect(screen.getByText('1 × 1 cup · 260 kcal')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change Beef weight' })
    ).toHaveTextContent('150 g');
  });

  it('shows the per-serving nutrition and the serving weight', () => {
    renderSection();

    // 635 kcal over 2 servings, within the whole-kcal rounding of a logged serving.
    expect(screen.getByText('Per serving')).toBeInTheDocument();
    expect(screen.getByText('318')).toBeInTheDocument();
    expect(screen.getByText(/1 serving ≈ 175 g/)).toBeInTheDocument();
    expect(screen.getByText(/350 g total/)).toBeInTheDocument();
  });

  it('removes an ingredient', async () => {
    const user = userEvent.setup();
    const handlers = renderSection();

    await user.click(screen.getByRole('button', { name: 'Remove Beef' }));

    expect(handlers.onRemoveIngredient).toHaveBeenCalledWith('beef');
  });

  it('steps servings within bounds', async () => {
    const user = userEvent.setup();
    const handlers = renderSection({ servings: 4 });

    await user.click(screen.getByRole('button', { name: 'Increase servings' }));
    await user.click(screen.getByRole('button', { name: 'Decrease servings' }));

    expect(handlers.onChangeServings).toHaveBeenNthCalledWith(1, 5);
    expect(handlers.onChangeServings).toHaveBeenNthCalledWith(2, 3);
  });

  it('disables the stepper at the limits', () => {
    renderSection({ servings: 1 });
    expect(
      screen.getByRole('button', { name: 'Decrease servings' })
    ).toBeDisabled();
  });

  it('changes an ingredient weight from the shared wheel picker', async () => {
    const user = userEvent.setup();
    const handlers = renderSection();

    await user.click(
      screen.getByRole('button', { name: 'Change Beef weight' })
    );
    await pickValue(user, /ingredient weight/i, 250);

    expect(handlers.onChangeIngredientGrams).toHaveBeenCalledWith('beef', 250);
  });

  it('keeps cooked weight behind a disclosure and reports the picked value', async () => {
    const user = userEvent.setup();
    const handlers = renderSection();

    expect(
      screen.queryByRole('button', { name: /open cooked weight picker/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cooked weight/i }));
    await user.click(
      screen.getByRole('button', { name: /open cooked weight picker/i })
    );
    await pickValue(user, /cooked weight/i, 300);

    expect(handlers.onChangeCookedWeight).toHaveBeenCalledWith('300');
  });

  it('opens the disclosure by itself when a cooked weight is already set', async () => {
    const user = userEvent.setup();
    const handlers = renderSection({ cookedWeightGrams: '300' });

    expect(
      screen.getByRole('button', { name: /open cooked weight picker/i })
    ).toHaveTextContent('300 g');

    await user.click(
      screen.getByRole('button', { name: /clear cooked weight/i })
    );
    expect(handlers.onChangeCookedWeight).toHaveBeenCalledWith('');
  });

  it('explains a serving that would outgrow the portion wheel', () => {
    const heavy = [
      {
        id: 'stew',
        name: 'Stew base',
        grams: 900,
        per100g: RICE,
        portionLabel: null,
      },
      {
        id: 'stew2',
        name: 'More stew',
        grams: 900,
        per100g: RICE,
        portionLabel: null,
      },
    ];
    renderSection({ ingredients: heavy, servings: 1 });

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 2 servings/i);
  });
});

/**
 * Motion. Full motion runs the real framer-motion code paths with animations
 * skipped (instant but through the same enter / exit lifecycle); reduced motion
 * must take the plain path.
 */
describe('RecipeIngredientsSection motion', () => {
  const build = (ingredients, servings = 2) => {
    const draft = { name: 'Beef bowl', servings, ingredients };
    return (
      <RecipeIngredientsSection
        ingredients={ingredients}
        servings={servings}
        cookedWeightGrams=""
        previewFood={buildRecipeFood({ ...draft, id: 'recipe_preview' })}
        validation={validateRecipeDraft(draft)}
        onAddIngredient={() => {}}
        onChangeIngredientGrams={() => {}}
        onRemoveIngredient={() => {}}
        onChangeServings={() => {}}
        onChangeCookedWeight={() => {}}
      />
    );
  };

  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = false;
    resetMotionMode();
  });

  it('adds and removes ingredient rows through the animated lifecycle', async () => {
    const { rerender } = render(build([INGREDIENTS[0]]));
    expect(screen.getByText('Beef')).toBeInTheDocument();

    rerender(build(INGREDIENTS));
    expect(await screen.findByText('Uncle Ben - Rice')).toBeInTheDocument();

    rerender(build([INGREDIENTS[1]]));
    await waitFor(() =>
      expect(screen.queryByText('Beef')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Uncle Ben - Rice')).toBeInTheDocument();
  });

  it('removes a row at once in reduced motion', () => {
    setMotionMode('reduced');
    const { rerender } = render(build(INGREDIENTS));

    rerender(build([INGREDIENTS[1]]));

    expect(screen.queryByText('Beef')).not.toBeInTheDocument();
  });

  it('swaps the empty state and the list as ingredients come and go', async () => {
    const { rerender } = render(build([]));
    expect(screen.getByText(/add the foods that go into/i)).toBeInTheDocument();

    rerender(build([INGREDIENTS[0]]));
    await waitFor(() =>
      expect(
        screen.queryByText(/add the foods that go into/i)
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText('Beef')).toBeInTheDocument();

    rerender(build([]));
    expect(
      await screen.findByText(/add the foods that go into/i)
    ).toBeInTheDocument();
  });

  it('ticks a number only when it changes, never when it first appears', () => {
    const { rerender } = render(build(INGREDIENTS, 2));

    // Nothing has changed since mount: no tick anywhere.
    expect(document.querySelector('.header-stat-in')).toBeNull();

    rerender(build(INGREDIENTS, 3));

    const ticked = [...document.querySelectorAll('.header-stat-in')].map(
      (element) => element.textContent
    );
    // The servings count and the per-serving values that depend on it ticked.
    expect(ticked).toContain('3');
    expect(ticked.length).toBeGreaterThan(1);

    // An unchanged value keeps its element still: the ingredient count line.
    expect(screen.getByText('2 ingredients')).not.toHaveClass('header-stat-in');
  });

  it('reveals the cooked-weight options by height, not by a hard swap', async () => {
    const user = userEvent.setup();
    render(build(INGREDIENTS));

    expect(
      screen.queryByRole('button', { name: /open cooked weight picker/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cooked weight/i }));
    expect(
      await screen.findByRole('button', { name: /open cooked weight picker/i })
    ).toBeInTheDocument();

    // Open, the picker button also contains "cooked weight": anchor the name.
    await user.click(screen.getByRole('button', { name: /^cooked weight/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /open cooked weight picker/i })
      ).not.toBeInTheDocument()
    );
  });

  it('uses one root whose children are the blocks the section swap staggers', () => {
    render(build(INGREDIENTS));

    const root = screen.getByText('Ingredients').closest('.space-y-5');
    expect(root.parentElement).not.toBeNull();
    // Ingredients, servings, summary card, cooked weight.
    expect(root.children).toHaveLength(4);
  });
});
