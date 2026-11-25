import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FoodPortionModal } from './FoodPortionModal';

const FOOD = {
  id: 'usda_rice',
  name: 'Rice',
  category: 'carbs',
  per100g: {
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fats: 0.3,
    fiber: null,
    sodium: null,
    saturatedFats: null,
    sugars: null,
  },
  portions: [{ id: 'cup', label: '1 cup', grams: 158 }],
};

const renderModal = (props = {}) =>
  render(
    <FoodPortionModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      selectedFood={FOOD}
      {...props}
    />
  );

describe('FoodPortionModal', () => {
  it('logs by default: Log entry, Log & exit and favourite are offered', async () => {
    const user = userEvent.setup();
    const onAddFood = vi.fn();
    renderModal({ onAddFood, onSaveAsFavourite: vi.fn() });

    expect(
      screen.getByRole('button', { name: /log & exit/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /save as favourite/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^log entry$/i }));

    expect(onAddFood).toHaveBeenCalledTimes(1);
    expect(onAddFood.mock.calls[0][0]).toMatchObject({
      foodId: 'usda_rice',
      category: 'carbs',
      grams: 100,
      calories: 130,
    });
  });

  describe('ingredient mode', () => {
    it('replaces the logging actions with a single confirm button', () => {
      renderModal({
        ingredientMode: true,
        onConfirmIngredient: vi.fn(),
        onAddFood: vi.fn(),
        onSaveAsFavourite: vi.fn(),
      });

      expect(
        screen.getByRole('button', { name: /^add to recipe$/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /log entry/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /log & exit/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /favourite/i })
      ).not.toBeInTheDocument();
    });

    it('honours a custom confirm label', () => {
      renderModal({
        ingredientMode: true,
        confirmLabel: 'Use this amount',
        onConfirmIngredient: vi.fn(),
      });

      expect(
        screen.getByRole('button', { name: /^use this amount$/i })
      ).toBeInTheDocument();
    });

    it('returns the food and grams without logging anything', async () => {
      const user = userEvent.setup();
      const onConfirmIngredient = vi.fn();
      const onAddFood = vi.fn();
      renderModal({
        ingredientMode: true,
        initialGrams: 250,
        onConfirmIngredient,
        onAddFood,
      });

      await user.click(
        screen.getByRole('button', { name: /^add to recipe$/i })
      );

      expect(onAddFood).not.toHaveBeenCalled();
      expect(onConfirmIngredient).toHaveBeenCalledTimes(1);
      expect(onConfirmIngredient).toHaveBeenCalledWith({
        food: FOOD,
        grams: 250,
        portionLabel: null,
      });
    });
  });
});
