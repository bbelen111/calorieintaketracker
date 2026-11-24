import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeIngredientPickerModal } from './RecipeIngredientPickerModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  searchFoodsLocal,
  searchFoodsOnline,
} from '../../../../services/foodSearch';
import { getDistinctSubcategories } from '../../../../services/foodCatalog';
import {
  resetMotionMode,
  setMotionMode,
} from '../../../../utils/visuals/motionPreference';

vi.mock('../../../../services/foodSearch', () => ({
  searchFoodsLocal: vi.fn(),
  searchFoodsOnline: vi.fn(),
}));

vi.mock('../../../../services/foodCatalog', () => ({
  getDistinctSubcategories: vi.fn(),
  // Pulled in statically by constants/food/foodDatabase.
  searchFoods: vi.fn(),
  getFoodById: vi.fn(),
  getFoodsByIds: vi.fn(),
  warmUpFoodCatalog: vi.fn(),
}));

const per100g = (calories, extra = {}) => ({
  calories,
  protein: 10,
  carbs: 20,
  fats: 5,
  fiber: null,
  sodium: null,
  saturatedFats: null,
  sugars: null,
  ...extra,
});

const food = (id, name, calories = 100, extra = {}) => ({
  id,
  name,
  category: 'protein',
  per100g: per100g(calories),
  portions: [],
  ...extra,
});

const localPage = (results, extra = {}) => ({
  results,
  nextOffset: results.length,
  hasMoreLocal: false,
  ...extra,
});

const CATALOG = [
  food('usda_apple', 'Apple', 52, { category: 'carbs' }),
  food('usda_beef', 'Beef, raw', 250),
  food('usda_chicken', 'Chicken breast, raw', 120),
];

// Food row titles only: the Filters menu has its own h4 ("Filters & Sort").
const rowTitles = () =>
  screen
    .queryAllByRole('heading', { level: 4 })
    .filter((heading) => heading.className.includes('truncate'))
    .map((heading) => heading.textContent);

// "Carbs" is both a category and a sort option in the menu; the category list
// comes first.
const clickCategory = (menu, name, user) =>
  user.click(within(menu).getAllByRole('button', { name })[0]);

const setOnline = (isOnline) =>
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(isOnline);

const renderPicker = (props = {}) => {
  const onClose = vi.fn();
  const onPickIngredient = vi.fn();
  render(
    <RecipeIngredientPickerModal
      isOpen
      isClosing={false}
      onClose={onClose}
      onPickIngredient={onPickIngredient}
      ingredientCount={0}
      {...props}
    />
  );
  return { onClose, onPickIngredient };
};

beforeEach(() => {
  setMotionMode('reduced');
  vi.mocked(searchFoodsLocal).mockReset();
  vi.mocked(searchFoodsOnline).mockReset();
  vi.mocked(getDistinctSubcategories).mockReset();
  vi.mocked(searchFoodsLocal).mockResolvedValue(localPage(CATALOG));
  vi.mocked(searchFoodsOnline).mockResolvedValue({
    results: [],
    errorsBySource: {},
  });
  vi.mocked(getDistinctSubcategories).mockResolvedValue([]);
  useEnergyMapStore.setState({
    foodFavourites: [],
    pinnedFoods: [],
    cachedFoods: [],
  });
  setOnline(true);
});

afterEach(() => {
  resetMotionMode();
  vi.restoreAllMocks();
});

describe('RecipeIngredientPickerModal - page', () => {
  it('is a fullscreen page that looks like Food Search browse', async () => {
    renderPicker({ ingredientCount: 2 });

    expect(
      screen.getByRole('heading', { name: 'Add ingredient' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByLabelText('2 in recipe')).toBeInTheDocument();

    expect(
      screen.getByRole('group', { name: 'Ingredient source' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Online' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(
      screen.getByPlaceholderText('Search local foods...')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /filters/i })
    ).toBeInTheDocument();
    await screen.findByText('Apple');
  });

  it('loads the default catalog list on open, without typing anything', async () => {
    renderPicker();

    expect(await screen.findByText('Beef, raw')).toBeInTheDocument();
    expect(searchFoodsLocal).toHaveBeenCalledWith(
      expect.objectContaining({ query: '', offset: 0, limit: 500 })
    );
    expect(rowTitles()).toEqual(['Apple', 'Beef, raw', 'Chicken breast, raw']);
    expect(screen.getByText('3 foods found')).toBeInTheDocument();
  });

  it('shows the skeleton, not a half-built list, until the first load lands', async () => {
    renderPicker({ customFoods: [food('user_1', 'My granola', 400)] });

    expect(rowTitles()).toEqual([]);
    expect(screen.getByText('Searching local foods...')).toBeInTheDocument();

    expect(await screen.findByText('My granola')).toBeInTheDocument();
  });

  it('lists pinned foods first', async () => {
    useEnergyMapStore.setState({ pinnedFoods: ['usda_chicken'] });
    renderPicker();

    await screen.findByText('Apple');
    expect(rowTitles()[0]).toBe('Chicken breast, raw');
    expect(searchFoodsLocal).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedFoodIds: ['usda_chicken'] })
    );
  });

  it('merges favourites, cached and user-added foods with the catalog', async () => {
    useEnergyMapStore.setState({
      foodFavourites: [
        {
          id: 1,
          foodId: 'fav_food',
          name: 'Favourite soup',
          category: 'carbs',
          grams: 250,
          per100g: per100g(60),
        },
        // Weightless manual entry: cannot be an ingredient.
        { id: 2, name: 'Protein bar', source: 'manual', grams: null },
        // A recipe cannot contain a recipe.
        {
          id: 3,
          foodId: 'recipe_x',
          name: 'Some recipe',
          isRecipe: true,
          source: 'recipe',
          per100g: per100g(300),
        },
      ],
      cachedFoods: [
        food('cloud_1', 'Cached oats', 380, {
          isCached: true,
          category: 'cached',
        }),
      ],
    });
    renderPicker({
      customFoods: [
        food('user_1', 'My granola', 400, { isCustom: true, source: 'user' }),
        food('recipe_y', 'Another recipe', 200, { isRecipe: true }),
      ],
    });

    await screen.findByText('My granola');

    expect(rowTitles().sort()).toEqual(
      [
        'Apple',
        'Beef, raw',
        'Cached oats',
        'Chicken breast, raw',
        'Favourite soup',
        'My granola',
      ].sort()
    );
    expect(screen.getByText('(+1 cached)')).toBeInTheDocument();
  });

  it('searches the catalog as you type and narrows the list', async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText('Apple');

    await user.type(screen.getByLabelText('Search ingredients'), 'beef');

    expect(searchFoodsLocal).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'beef' })
    );
    expect(rowTitles()).toEqual(['Beef, raw']);

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(rowTitles()).toHaveLength(3);
  });

  it('filters by category from the Filters menu and can clear it', async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText('Apple');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    const menu = screen
      .getByText('Filters & Sort')
      .closest('div').parentElement;
    await clickCategory(menu, 'Carbs', user);

    expect(searchFoodsLocal).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'carbs' })
    );
    expect(rowTitles()).toEqual(['Apple']);
    expect(
      screen.getByRole('button', { name: /view filters/i })
    ).toBeInTheDocument();

    await user.click(within(menu).getByRole('button', { name: 'Clear All' }));
    expect(rowTitles()).toHaveLength(3);
  });

  it('sorts from the Filters menu', async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText('Apple');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    const menu = screen
      .getByText('Filters & Sort')
      .closest('div').parentElement;
    await user.click(within(menu).getByRole('button', { name: 'Calories' }));
    await user.click(within(menu).getByRole('button', { name: /descending/i }));

    expect(rowTitles()).toEqual(['Beef, raw', 'Chicken breast, raw', 'Apple']);
  });
});

describe('RecipeIngredientPickerModal - choosing an ingredient', () => {
  it('hands the food and amount back and stays open for the next one', async () => {
    const user = userEvent.setup();
    const { onPickIngredient, onClose } = renderPicker();

    await user.click(await screen.findByText('Chicken breast, raw'));

    // The portion sheet opens in ingredient mode: no logging actions.
    const confirm = await screen.findByRole('button', {
      name: /add to recipe/i,
    });
    expect(
      screen.queryByRole('button', { name: /log entry/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /save & favourite/i })
    ).not.toBeInTheDocument();

    await user.click(confirm);

    expect(onPickIngredient).toHaveBeenCalledTimes(1);
    const [picked] = onPickIngredient.mock.calls[0];
    expect(picked.food.id).toBe('usda_chicken');
    expect(picked.grams).toBe(100);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Added Chicken breast, raw · 100 g')
    ).toBeInTheDocument();
  });

  it('closes from Done and from Back', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPicker();
    await screen.findByText('Apple');

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('RecipeIngredientPickerModal - online', () => {
  const goOnline = async (user, text = 'oats') => {
    await user.click(screen.getByRole('button', { name: 'Online' }));
    await user.type(screen.getByLabelText('Search ingredients'), text);
  };

  it('slides the toggle pill to Online and recolours it', async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText('Apple');

    const pill = screen.getByTestId('segmented-toggle-pill');
    expect(pill.style.transform).toBe('translateX(0%)');
    expect(pill.className).toContain('bg-accent-blue');

    await user.click(screen.getByRole('button', { name: 'Online' }));

    expect(screen.getByTestId('segmented-toggle-pill')).toBe(pill);
    expect(pill.style.transform).toBe('translateX(100%)');
    expect(pill.className).toContain('bg-accent-emerald');
    expect(
      screen.getByPlaceholderText('Search the online food database...')
    ).toBeInTheDocument();
  });

  it('searches the first page and lists the results', async () => {
    const user = userEvent.setup();
    vi.mocked(searchFoodsOnline).mockResolvedValue({
      results: [food('cloud_oats', 'Rolled oats', 379, { type: 'Generic' })],
      errorsBySource: {},
    });
    renderPicker();
    await screen.findByText('Apple');

    await goOnline(user);

    expect(
      await screen.findByText('Rolled oats', {}, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(searchFoodsOnline).toHaveBeenCalledWith({
      query: 'oats',
      onlinePage: 1,
      onlinePageSize: 50,
    });
  });

  it('caches a picked online food so it works offline later', async () => {
    const user = userEvent.setup();
    vi.mocked(searchFoodsOnline).mockResolvedValue({
      results: [food('cloud_oats', 'Rolled oats', 379, { type: 'Generic' })],
      errorsBySource: {},
    });
    renderPicker();
    await screen.findByText('Apple');

    await goOnline(user);
    await user.click(
      await screen.findByText('Rolled oats', {}, { timeout: 3000 })
    );

    const cached = useEnergyMapStore.getState().cachedFoods;
    expect(cached.find((item) => item.id === 'cloud_oats')?.isCached).toBe(
      true
    );
  });

  it('shows more results from the next server page', async () => {
    const user = userEvent.setup();
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      food(
        `cloud_${index}`,
        `Oat food ${String(index).padStart(2, '0')}`,
        300,
        {
          type: 'Generic',
        }
      )
    );
    vi.mocked(searchFoodsOnline)
      .mockResolvedValueOnce({ results: firstPage, errorsBySource: {} })
      .mockResolvedValueOnce({
        results: [
          firstPage[49],
          food('cloud_50', 'Oat food 50', 300, { type: 'Generic' }),
        ],
        errorsBySource: {},
      });
    renderPicker();
    await screen.findByText('Apple');

    await goOnline(user);
    await user.click(
      await screen.findByRole(
        'button',
        { name: /show more/i },
        { timeout: 3000 }
      )
    );

    expect(await screen.findByText('Oat food 50')).toBeInTheDocument();
    expect(searchFoodsOnline).toHaveBeenLastCalledWith({
      query: 'oats',
      onlinePage: 2,
      onlinePageSize: 50,
    });
    expect(screen.getAllByText('Oat food 49')).toHaveLength(1);
  });

  it('disables Online and explains when the device is offline', async () => {
    setOnline(false);
    renderPicker();
    await screen.findByText('Apple');

    expect(screen.getByRole('button', { name: 'Online' })).toBeDisabled();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    expect(searchFoodsOnline).not.toHaveBeenCalled();
  });

  it('shows a source error with a way to retry', async () => {
    const user = userEvent.setup();
    vi.mocked(searchFoodsOnline)
      .mockResolvedValueOnce({
        results: [],
        errorsBySource: { cloud: 'The food service is unavailable.' },
      })
      .mockResolvedValueOnce({
        results: [food('cloud_ok', 'Oatmeal', 150, { type: 'Generic' })],
        errorsBySource: {},
      });
    renderPicker();
    await screen.findByText('Apple');

    await goOnline(user);
    expect(
      await screen.findByText(
        'The food service is unavailable.',
        {},
        { timeout: 3000 }
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(
      await screen.findByText('Oatmeal', {}, { timeout: 3000 })
    ).toBeInTheDocument();
  });
});
