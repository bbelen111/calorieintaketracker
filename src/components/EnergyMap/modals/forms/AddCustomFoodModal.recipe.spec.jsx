import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AddCustomFoodModal } from './AddCustomFoodModal';
import {
  resetMotionMode,
  setMotionMode,
} from '../../../../utils/visuals/motionPreference';

// Reduced motion makes every reveal / collapse instant, so assertions about
// what is (or is no longer) on screen do not wait for an exit animation. The
// animation wiring itself is asserted through class names and DOM identity.
beforeEach(() => {
  setMotionMode('reduced');
});

afterEach(() => {
  resetMotionMode();
});

// The real picker (a fullscreen page: search, filters, online paging, portion
// wheel) has its own spec; here it is a stand-in that hands one known
// ingredient back and echoes what the form passes it, so this file only covers
// how the form reacts to ingredients.
vi.mock('../fullscreen/RecipeIngredientPickerModal', () => ({
  RecipeIngredientPickerModal: ({
    isOpen,
    onPickIngredient,
    onClose,
    ingredientCount,
    customFoods = [],
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Ingredient picker stub">
        <p data-testid="picker-count">{ingredientCount}</p>
        <ul aria-label="Foods the user added">
          {customFoods.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            onPickIngredient({
              food: {
                id: 'usda_beef',
                name: 'Beef',
                category: 'protein',
                per100g: {
                  calories: 250,
                  protein: 26,
                  carbs: 0,
                  fats: 15,
                  fiber: 0,
                  sodium: 72,
                  saturatedFats: 6,
                  sugars: 0,
                },
              },
              grams: 150,
              portionLabel: null,
            })
          }
        >
          Stub add beef
        </button>
        <button type="button" onClick={onClose}>
          Stub done
        </button>
      </div>
    ) : null,
}));

const SAVED_RECIPE = {
  id: 'recipe_saved',
  name: 'Beef bowl',
  category: 'protein',
  tags: ['protein'],
  servings: 2,
  cookedWeightGrams: null,
  ingredients: [
    {
      id: 'ingredient_1',
      foodId: 'usda_beef',
      name: 'Beef',
      grams: 150,
      per100g: {
        calories: 250,
        protein: 26,
        carbs: 0,
        fats: 15,
        fiber: 0,
        sodium: 72,
        saturatedFats: 6,
        sugars: 0,
      },
    },
  ],
  portions: [{ id: 'bowl', label: 'Big bowl', grams: 400 }],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const renderModal = (props = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onSaveFood: vi.fn(),
    onSaveRecipe: vi.fn(),
    onDeleteRecipe: vi.fn(),
  };
  render(
    <AddCustomFoodModal isOpen isClosing={false} {...handlers} {...props} />
  );
  return handlers;
};

const switchToRecipe = (user) =>
  user.click(screen.getByRole('button', { name: /^recipe$/i }));

const addStubIngredient = async (user) => {
  await user.click(screen.getByRole('button', { name: /add ingredient/i }));
  await user.click(
    await screen.findByRole('button', { name: /stub add beef/i })
  );
  await user.click(screen.getByRole('button', { name: /stub done/i }));
};

describe('AddCustomFoodModal - Recipe mode', () => {
  it('offers a Food | Recipe switch that starts on Food', () => {
    renderModal();

    const group = screen.getByRole('group', { name: /food type/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^food$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /^recipe$/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(
      screen.getByRole('heading', { name: 'Add Custom Food' })
    ).toBeInTheDocument();
  });

  it('swaps the per-100g pickers for the ingredient builder', async () => {
    const user = userEvent.setup();
    renderModal();

    await switchToRecipe(user);

    expect(
      screen.getByRole('heading', { name: 'New Recipe' })
    ).toBeInTheDocument();
    expect(screen.getByText('Recipe Name')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open calories picker' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add ingredient/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^save recipe$/i })
    ).toBeDisabled();
  });

  it('keeps the name and category when switching back and forth', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(
      screen.getByPlaceholderText("e.g., Mom's Chicken Curry"),
      'Beef bowl'
    );
    await user.click(screen.getByRole('button', { name: /^Proteins$/i }));

    await switchToRecipe(user);
    expect(screen.getByPlaceholderText('e.g., Beef bowl')).toHaveValue(
      'Beef bowl'
    );
    expect(screen.getByRole('button', { name: /^Proteins$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await user.click(screen.getByRole('button', { name: /^food$/i }));
    expect(
      screen.getByRole('button', { name: 'Open calories picker' })
    ).toBeInTheDocument();
  });

  it('adds ingredients, shows live nutrition and saves a recipe', async () => {
    const user = userEvent.setup();
    const { onSaveRecipe, onSaveFood, onClose } = renderModal();

    await switchToRecipe(user);
    await user.type(
      screen.getByPlaceholderText('e.g., Beef bowl'),
      '  Beef bowl '
    );
    await addStubIngredient(user);

    expect(screen.getByText('1 ingredient')).toBeInTheDocument();
    expect(screen.getByText('375 kcal')).toBeInTheDocument();
    // One serving = the whole 150 g of beef until servings are raised.
    expect(screen.getByText(/1 serving ≈ 150 g/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Increase servings' }));
    expect(screen.getByText(/1 serving ≈ 75 g/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^save recipe$/i }));

    expect(onSaveFood).not.toHaveBeenCalled();
    expect(onSaveRecipe).toHaveBeenCalledTimes(1);
    const [recipe, options] = onSaveRecipe.mock.calls[0];
    expect(recipe.id).toMatch(/^recipe_/);
    expect(recipe.name).toBe('Beef bowl');
    expect(recipe.category).toBe('custom');
    expect(recipe.servings).toBe(2);
    expect(recipe.cookedWeightGrams).toBeNull();
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.ingredients[0]).toMatchObject({
      foodId: 'usda_beef',
      name: 'Beef',
      grams: 150,
    });
    expect(options).toEqual({ log: false, isEditing: false });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Save & log asks the orchestrator to open the logging flow', async () => {
    const user = userEvent.setup();
    const { onSaveRecipe } = renderModal();

    await switchToRecipe(user);
    await user.type(
      screen.getByPlaceholderText('e.g., Beef bowl'),
      'Beef bowl'
    );
    await addStubIngredient(user);
    await user.click(screen.getByRole('button', { name: /save & log/i }));

    expect(onSaveRecipe).toHaveBeenCalledTimes(1);
    expect(onSaveRecipe.mock.calls[0][1]).toEqual({
      log: true,
      isEditing: false,
    });
  });

  it('cannot be saved without a name or without an ingredient', async () => {
    const user = userEvent.setup();
    const { onSaveRecipe } = renderModal();

    await switchToRecipe(user);
    await addStubIngredient(user);
    expect(
      screen.getByRole('button', { name: /^save recipe$/i })
    ).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText('e.g., Beef bowl'),
      'Beef bowl'
    );
    expect(
      screen.getByRole('button', { name: /^save recipe$/i })
    ).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Remove Beef' }));
    expect(
      screen.getByRole('button', { name: /^save recipe$/i })
    ).toBeDisabled();
    expect(onSaveRecipe).not.toHaveBeenCalled();
  });

  it('blocks a serving that would be heavier than the portion wheel allows', async () => {
    const user = userEvent.setup();
    renderModal({
      editingRecipe: {
        ...SAVED_RECIPE,
        servings: 1,
        ingredients: [
          { ...SAVED_RECIPE.ingredients[0], id: 'a', grams: 700 },
          { ...SAVED_RECIPE.ingredients[0], id: 'b', grams: 700 },
        ],
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 2 servings/i);
    expect(
      screen.getByRole('button', { name: /^save changes$/i })
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Increase servings' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^save changes$/i })
    ).toBeEnabled();
  });

  describe('editing a saved recipe', () => {
    it('opens pre-filled, without the Food | Recipe switch', () => {
      renderModal({ editingRecipe: SAVED_RECIPE });

      expect(
        screen.getByRole('heading', { name: 'Edit Recipe' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: /food type/i })
      ).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Beef bowl')).toHaveValue(
        'Beef bowl'
      );
      expect(
        screen.getByRole('button', { name: /^Proteins$/i })
      ).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Beef')).toBeInTheDocument();
      expect(screen.getByText('Big bowl')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // servings
    });

    it('saves under the same id and flags it as an edit', async () => {
      const user = userEvent.setup();
      const { onSaveRecipe } = renderModal({ editingRecipe: SAVED_RECIPE });

      await user.click(
        screen.getByRole('button', { name: 'Increase servings' })
      );
      await user.click(screen.getByRole('button', { name: /^save changes$/i }));

      const [recipe, options] = onSaveRecipe.mock.calls[0];
      expect(recipe.id).toBe('recipe_saved');
      expect(recipe.createdAt).toBe(1700000000000);
      expect(recipe.servings).toBe(3);
      expect(recipe.category).toBe('protein');
      expect(recipe.portions).toEqual([
        { id: 'bowl', label: 'Big bowl', grams: 400 },
      ]);
      expect(options).toEqual({ log: false, isEditing: true });
    });

    it('asks before deleting and keeps the recipe on Keep', async () => {
      const user = userEvent.setup();
      const { onDeleteRecipe, onClose } = renderModal({
        editingRecipe: SAVED_RECIPE,
      });

      await user.click(screen.getByRole('button', { name: /delete recipe/i }));
      expect(
        await screen.findByRole('heading', { name: /delete this recipe/i })
      ).toBeInTheDocument();
      expect(
        screen.getByText(/keep their calories and macros/i)
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^keep$/i }));
      expect(onDeleteRecipe).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('deletes after confirmation and closes the form', async () => {
      const user = userEvent.setup();
      const { onDeleteRecipe, onClose } = renderModal({
        editingRecipe: SAVED_RECIPE,
      });

      await user.click(screen.getByRole('button', { name: /delete recipe/i }));
      await user.click(
        await screen.findByRole('button', { name: /^delete$/i })
      );

      expect(onDeleteRecipe).toHaveBeenCalledWith(SAVED_RECIPE);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('ingredient picker hand-off', () => {
    it('tells the picker how many ingredients are already in the recipe', async () => {
      const user = userEvent.setup();
      renderModal();

      await switchToRecipe(user);
      await user.click(screen.getByRole('button', { name: /add ingredient/i }));
      expect(await screen.findByTestId('picker-count')).toHaveTextContent('0');

      await user.click(screen.getByRole('button', { name: /stub add beef/i }));
      expect(screen.getByTestId('picker-count')).toHaveTextContent('1');
    });

    it('lists the foods the user added this session in the picker', async () => {
      const user = userEvent.setup();
      renderModal({
        userFoods: [{ id: 'user_1', name: 'Mom’s curry', per100g: {} }],
      });

      await switchToRecipe(user);
      await user.click(screen.getByRole('button', { name: /add ingredient/i }));

      expect(
        within(
          await screen.findByRole('list', { name: /foods the user added/i })
        ).getByText('Mom’s curry')
      ).toBeInTheDocument();
    });
  });

  describe('animation wiring', () => {
    const swapWrapper = () =>
      screen.getByText('Recipe Name').closest('.space-y-5').children[2];

    it('slides ONE toggle pill, in the same blue as the form header, in both modes', async () => {
      const user = userEvent.setup();
      renderModal();

      const pill = screen.getByTestId('segmented-toggle-pill');
      expect(pill.style.transform).toBe('translateX(0%)');
      expect(pill.className).toContain('bg-accent-blue');
      expect(
        screen.getByRole('heading', { name: 'Add Custom Food' })
          .previousElementSibling
      ).toHaveClass('text-accent-blue');

      await switchToRecipe(user);

      // The same element glided; it did not remount and it did not change colour.
      expect(screen.getByTestId('segmented-toggle-pill')).toBe(pill);
      expect(pill.style.transform).toBe('translateX(100%)');
      expect(pill.className).toContain('bg-accent-blue');
      expect(pill.className).not.toContain('bg-accent-pink');
      expect(
        screen.getByRole('heading', { name: 'New Recipe' })
          .previousElementSibling
      ).toHaveClass('text-accent-blue');
    });

    it('plays no swap animation when the form opens', () => {
      renderModal();

      expect(document.querySelector('.settings-page-enter')).toBeNull();
      expect(document.querySelector('.settings-page-back')).toBeNull();
      expect(document.querySelector('.header-stat-in')).toBeNull();
    });

    it('plays no swap animation when a recipe is opened to edit', () => {
      renderModal({ editingRecipe: SAVED_RECIPE });

      expect(document.querySelector('.settings-page-enter')).toBeNull();
      expect(document.querySelector('.settings-page-back')).toBeNull();
      expect(document.querySelector('.header-stat-in')).toBeNull();
    });

    it('eases the new section in from the right, and back from the left', async () => {
      const user = userEvent.setup();
      renderModal();

      await switchToRecipe(user);
      expect(swapWrapper()).toHaveClass('settings-page-enter');
      expect(
        document.querySelector('.settings-page-enter > div')
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^food$/i }));
      const back = document.querySelector('.settings-page-back');
      expect(back).toBeInTheDocument();
      expect(document.querySelector('.settings-page-enter')).toBeNull();
    });

    it('re-keys the title and the save label so they ease in on a switch', async () => {
      const user = userEvent.setup();
      renderModal();

      const foodTitle = screen.getByRole('heading', {
        name: 'Add Custom Food',
      });
      await switchToRecipe(user);

      const recipeTitle = screen.getByRole('heading', { name: 'New Recipe' });
      expect(recipeTitle.parentElement).toHaveClass('header-stat-in');
      expect(foodTitle).not.toBeInTheDocument();
      expect(screen.getByText('Save recipe').closest('span')).toHaveClass(
        'header-stat-in'
      );
    });

    it('adds and removes custom portions', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.type(screen.getByPlaceholderText('e.g., 1 serving'), '1 bowl');
      await user.click(
        screen.getByRole('button', { name: 'Open portion grams picker' })
      );
      const heading = await screen.findByRole('heading', {
        name: /portion grams/i,
      });
      const dialog = heading.closest('[role="dialog"]');
      await user.click(within(dialog).getByText('30'));
      await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
      await user.click(screen.getByRole('button', { name: /add portion/i }));

      expect(screen.getByText('1 bowl')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Remove 1 bowl' }));
      expect(screen.queryByText('1 bowl')).not.toBeInTheDocument();
    });
  });
});
