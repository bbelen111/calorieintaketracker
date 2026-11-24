import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FoodTagBadges } from './FoodTagBadges';

describe('FoodTagBadges', () => {
  it('labels a recipe with a Recipe badge and its serving count', () => {
    render(
      <FoodTagBadges
        food={{
          id: 'recipe_a',
          isRecipe: true,
          isCustom: true,
          source: 'recipe',
          category: 'protein',
          servings: 4,
          portions: [{ id: 'recipe_serving', label: '1 serving', grams: 100 }],
        }}
      />
    );

    expect(screen.getByText('Recipe')).toBeInTheDocument();
    expect(screen.getByText('4 servings')).toBeInTheDocument();
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
    expect(screen.queryByText('1 portion')).not.toBeInTheDocument();
  });

  it('drops the redundant Custom chip from a recipe with no macro category', () => {
    render(
      <FoodTagBadges
        food={{
          id: 'recipe_c',
          isRecipe: true,
          isCustom: true,
          source: 'recipe',
          category: 'custom',
          servings: 2,
        }}
      />
    );

    expect(screen.getByText('Recipe')).toBeInTheDocument();
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('keeps a recipe category chip the user chose', () => {
    render(
      <FoodTagBadges
        food={{
          id: 'recipe_d',
          isRecipe: true,
          source: 'recipe',
          category: 'carbs',
          servings: 2,
        }}
      />
    );

    expect(screen.getByText('Carbs')).toBeInTheDocument();
    expect(screen.getByText('Recipe')).toBeInTheDocument();
  });

  it('uses the singular for a one-serving recipe', () => {
    render(
      <FoodTagBadges
        food={{ id: 'recipe_b', isRecipe: true, source: 'recipe', servings: 1 }}
      />
    );

    expect(screen.getByText('1 serving')).toBeInTheDocument();
  });

  it('keeps showing portions for foods that are not recipes', () => {
    render(
      <FoodTagBadges
        food={{
          id: 'user_1',
          source: 'user',
          isCustom: true,
          category: 'carbs',
          portions: [{ id: 'p', label: 'Bowl', grams: 200 }],
        }}
      />
    );

    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('1 portion')).toBeInTheDocument();
  });
});
