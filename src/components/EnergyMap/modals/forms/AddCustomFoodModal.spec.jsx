import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddCustomFoodModal } from './AddCustomFoodModal';

const renderModal = (props = {}) =>
  render(
    <AddCustomFoodModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      onSaveFood={vi.fn()}
      {...props}
    />
  );

const openPicker = async (user, fieldName) => {
  await user.click(
    screen.getByRole('button', { name: `Open ${fieldName} picker` })
  );
  return screen.findByRole('heading', {
    name: new RegExp(`^${fieldName}$`, 'i'),
  });
};

const pickValue = async (user, title, value) => {
  const dialog = title.closest('[role="dialog"]');
  await user.click(within(dialog).getByText(String(value)));
  await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
};

/**
 * Add Custom Food must match the Manual Entry form: every numeric value opens
 * the shared wheel picker instead of a free-text input, and the action row is
 * one primary action above two quiet secondaries.
 */
describe('AddCustomFoodModal', () => {
  it('renders a picker button for every numeric field', () => {
    renderModal();

    for (const field of [
      'calories',
      'protein',
      'carbs',
      'fats',
      'fiber',
      'sodium',
      'saturated fat',
      'sugars',
      'portion grams',
    ]) {
      expect(
        screen.getByRole('button', { name: `Open ${field} picker` })
      ).toBeInTheDocument();
    }

    // No free-text numeric inputs remain: only the two text fields are textboxes.
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('marks the selected category as pressed with a subtle accent', async () => {
    const user = userEvent.setup();
    renderModal();

    const chip = screen.getByRole('button', { name: /^Proteins$/i });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip.className).not.toContain('shadow-[');

    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip.className).toContain('text-accent-red');
    expect(chip.className).toContain('shadow-[');

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip.className).not.toContain('shadow-[');
  });

  it('saves a picked calorie value and closes', async () => {
    const user = userEvent.setup();
    const onSaveFood = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSaveFood, onClose });

    await user.type(
      screen.getByPlaceholderText("e.g., Mom's Chicken Curry"),
      'Test stew'
    );
    await user.click(screen.getByRole('button', { name: /^save food$/i }));
    // Invalid without a calorie or macro value.
    expect(onSaveFood).not.toHaveBeenCalled();

    const title = await openPicker(user, 'calories');
    await pickValue(user, title, 25);

    expect(screen.getByText('25 kcal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^save food$/i }));

    expect(onSaveFood).toHaveBeenCalledTimes(1);
    const [customFood, options] = onSaveFood.mock.calls[0];
    expect(customFood.name).toBe('Test stew');
    expect(customFood.per100g.calories).toBe(25);
    expect(options).toEqual({ log: false });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Save & log asks the orchestrator to open the logging flow', async () => {
    const user = userEvent.setup();
    const onSaveFood = vi.fn();
    renderModal({ onSaveFood });

    await user.type(
      screen.getByPlaceholderText("e.g., Mom's Chicken Curry"),
      'Quick oats'
    );
    const title = await openPicker(user, 'protein');
    await pickValue(user, title, 10);

    await user.click(screen.getByRole('button', { name: /save & log/i }));

    expect(onSaveFood).toHaveBeenCalledTimes(1);
    expect(onSaveFood.mock.calls[0][1]).toEqual({ log: true });
    expect(onSaveFood.mock.calls[0][0].per100g.protein).toBe(10);
  });

  it('adds a custom portion from its own grams picker', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByPlaceholderText('e.g., 1 serving'), '1 bowl');
    const title = await openPicker(user, 'portion grams');
    await pickValue(user, title, 30);

    expect(screen.getByText('30 g')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add portion/i }));

    expect(screen.getByText('1 bowl')).toBeInTheDocument();
    expect(screen.getByText('(30g)')).toBeInTheDocument();
  });

  it('cancels without saving', async () => {
    const user = userEvent.setup();
    const onSaveFood = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSaveFood, onClose });

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaveFood).not.toHaveBeenCalled();
  });

  it('pre-fills and updates an existing custom food in edit mode', async () => {
    const user = userEvent.setup();
    const onSaveFood = vi.fn();
    const onClose = vi.fn();
    const existingFood = {
      id: 42,
      foodId: 'user_existing_1',
      name: 'Homemade Granola',
      category: 'carbs',
      tags: ['carbs', 'custom'],
      per100g: {
        calories: 420,
        protein: 10,
        carbs: 60,
        fats: 15,
        fiber: 8,
        sodium: null,
        saturatedFats: null,
        sugars: null,
      },
      portions: [{ id: 'p1', label: '1 scoop', grams: 50 }],
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    renderModal({
      editingFood: existingFood,
      onSaveFood,
      onClose,
      onDeleteFood: vi.fn(),
    });

    expect(
      screen.getByRole('heading', { name: 'Edit Custom Food' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /food type/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save & log/i })).toBeNull();
    expect(
      screen.getByRole('button', { name: /delete food/i })
    ).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("e.g., Mom's Chicken Curry");
    expect(nameInput).toHaveValue('Homemade Granola');
    expect(screen.getByText('420 kcal')).toBeInTheDocument();
    expect(screen.getByText('1 scoop')).toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, 'Crunchy Granola');
    await user.click(screen.getByRole('button', { name: /^save changes$/i }));

    expect(onSaveFood).toHaveBeenCalledTimes(1);
    const [updatedFood, options] = onSaveFood.mock.calls[0];
    expect(updatedFood.id).toBe('user_existing_1');
    expect(updatedFood.name).toBe('Crunchy Granola');
    expect(updatedFood.per100g.calories).toBe(420);
    expect(updatedFood.per100g.fiber).toBe(8);
    expect(updatedFood.per100g.sodium).toBeNull();
    expect(options).toEqual({
      log: false,
      isEditing: true,
      favouriteId: 42,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirms before deleting a custom food in edit mode', async () => {
    const user = userEvent.setup();
    const onDeleteFood = vi.fn();
    const onClose = vi.fn();
    const existingFood = {
      id: 99,
      foodId: 'user_delete_me',
      name: 'Old Sauce',
      category: 'fats',
      per100g: { calories: 300, protein: 1, carbs: 5, fats: 30 },
      portions: [],
    };

    renderModal({
      editingFood: existingFood,
      onDeleteFood,
      onClose,
    });

    await user.click(screen.getByRole('button', { name: /delete food/i }));
    expect(
      await screen.findByRole('heading', { name: 'Delete this custom food?' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDeleteFood).toHaveBeenCalledWith(existingFood);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
