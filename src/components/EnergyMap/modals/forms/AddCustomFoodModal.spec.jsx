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
});
