import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FoodEntryModal } from './FoodEntryModal';

const renderModal = (props = {}) =>
  render(
    <FoodEntryModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
      foodName="Chicken Breast"
      setFoodName={vi.fn()}
      calories="250"
      protein="45"
      carbs="0"
      fats="5"
      fiber=""
      sodium=""
      saturatedFats=""
      sugars=""
      {...props}
    />
  );

describe('FoodEntryModal', () => {
  it('closes only the manual entry modal on Log entry and closes both modals on Log & exit', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ onSave, onSaveAsFavourite: vi.fn() });

    await user.click(screen.getByRole('button', { name: /^log entry$/i }));

    expect(onSave).toHaveBeenNthCalledWith(1, {
      closeEntryModal: true,
      closeSearchModal: false,
    });

    await user.click(screen.getByRole('button', { name: /^log & exit$/i }));

    expect(onSave).toHaveBeenNthCalledWith(2, {
      closeEntryModal: true,
      closeSearchModal: true,
    });
  });

  it('uses the same close behaviour when editing an entry', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ onSave, isEditing: true });

    await user.click(screen.getByRole('button', { name: /^save entry$/i }));

    expect(onSave).toHaveBeenNthCalledWith(1, {
      closeEntryModal: true,
      closeSearchModal: false,
    });

    await user.click(screen.getByRole('button', { name: /^save & exit$/i }));

    expect(onSave).toHaveBeenNthCalledWith(2, {
      closeEntryModal: true,
      closeSearchModal: true,
    });
  });
});
