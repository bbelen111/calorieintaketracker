import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FoodSearchResultsPanel } from './FoodSearchResultsPanel';
import { buildRecipeFood } from '../../../../../utils/food/recipe';

const RICE = {
  calories: 130,
  protein: 2.7,
  carbs: 28,
  fats: 0.3,
  fiber: null,
  sodium: null,
  saturatedFats: null,
  sugars: null,
};

const OATS = {
  id: 'usda_oats',
  name: 'Oats',
  category: 'carbs',
  per100g: { ...RICE, calories: 379 },
  portions: [],
};

const RECIPE = buildRecipeFood({
  id: 'recipe_rice_bowl',
  name: 'Rice bowl',
  servings: 2,
  ingredients: [{ id: 'rice', name: 'Rice', grams: 300, per100g: RICE }],
});

const renderPanel = (displayResults, props = {}) => {
  const handlers = {
    handleFoodClick: vi.fn(),
    handlePressStart: vi.fn(),
    handlePressEnd: vi.fn(),
    handleOnlineFoodSelect: vi.fn(),
    performOnlineSearch: vi.fn(),
    onEditRecipe: vi.fn(),
  };
  render(
    <FoodSearchResultsPanel
      searchMode="local"
      activeSearchSource="local"
      fallbackUsed={false}
      searchError={null}
      localSearchError={null}
      isLocalSearching={false}
      isSearching={false}
      displayResults={displayResults}
      searchQuery=""
      loadingFoodId={null}
      resolvedPinnedFoods={[]}
      longPressingId={null}
      animatedFoodIds={{}}
      prefersReducedMotion
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('FoodSearchResultsPanel - recipe rows', () => {
  it('shows a recipe with its badge, servings and a separate edit button', () => {
    renderPanel([RECIPE]);

    expect(screen.getByText('Rice bowl')).toBeInTheDocument();
    expect(screen.getByText('Recipe')).toBeInTheDocument();
    expect(screen.getByText('2 servings')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit recipe Rice bowl' })
    ).toBeInTheDocument();
  });

  it('never nests the edit button inside the card button', () => {
    renderPanel([RECIPE]);

    const edit = screen.getByRole('button', { name: 'Edit recipe Rice bowl' });
    expect(edit.parentElement.closest('button')).toBeNull();

    // The card's name comes from its content, so it starts with the title
    // (the edit button's label starts with "Edit recipe").
    const card = screen.getByRole('button', { name: /^Rice bowl/ });
    expect(within(card).queryByRole('button')).toBeNull();
  });

  it('opens the recipe for logging when the card is tapped', async () => {
    const user = userEvent.setup();
    const { handleFoodClick, onEditRecipe } = renderPanel([RECIPE]);

    await user.click(screen.getByText('Rice bowl'));

    expect(handleFoodClick).toHaveBeenCalledWith(RECIPE);
    expect(onEditRecipe).not.toHaveBeenCalled();
  });

  it('edits without logging or starting a pin press', async () => {
    const user = userEvent.setup();
    const { handleFoodClick, handlePressStart, onEditRecipe } = renderPanel([
      RECIPE,
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Edit recipe Rice bowl' })
    );

    expect(onEditRecipe).toHaveBeenCalledWith(RECIPE);
    expect(handleFoodClick).not.toHaveBeenCalled();
    expect(handlePressStart).not.toHaveBeenCalled();
  });

  it('keeps the card long-press (pin) working on a recipe', async () => {
    const user = userEvent.setup();
    const { handlePressStart } = renderPanel([RECIPE]);

    await user.pointer({
      keys: '[MouseLeft>]',
      target: screen.getByText('Rice bowl'),
    });

    expect(handlePressStart).toHaveBeenCalledWith(
      'recipe_rice_bowl',
      expect.anything()
    );
  });

  it('leaves every other food as a single plain card with no edit button', () => {
    renderPanel([OATS, RECIPE]);

    expect(screen.getByText('Oats')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Edit recipe/ })
    ).toHaveLength(1);
  });

  it('shows no edit button when the host does not support editing', () => {
    renderPanel([RECIPE], { onEditRecipe: undefined });

    expect(
      screen.queryByRole('button', { name: /^Edit recipe/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Rice bowl')).toBeInTheDocument();
  });
});
