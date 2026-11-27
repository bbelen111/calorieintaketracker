import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FoodSearchModal } from './FoodSearchModal';
import { closeTopmostStackedModal } from '../../../../utils/visuals/modalStack';
import { installFakeCamera } from '../../../../tests/helpers/fakeCamera';

vi.mock('../../../../services/foodSearch', async (importOriginal) => ({
  ...(await importOriginal()),
  searchFoodsLocal: vi.fn(async () => ({ results: [], nextOffset: 0 })),
}));

vi.mock('../../../../services/foodCatalog', () => ({
  getDistinctSubcategories: vi.fn(async () => []),
  searchFoods: vi.fn(async () => []),
  getFoodById: vi.fn(),
  getFoodsByIds: vi.fn(async () => []),
  warmUpFoodCatalog: vi.fn(),
}));

// The modal's `[]` prop defaults are new on every render and would re-run its
// search effects forever; the orchestrator always passes these.
const STABLE_LISTS = {
  favourites: [],
  pinnedFoods: [],
  cachedFoods: [],
  mealNutritionEntries: [],
};

const renderModal = (onClose = vi.fn()) =>
  render(<FoodSearchModal isOpen onClose={onClose} {...STABLE_LISTS} />);

const viewfinder = () => screen.queryByRole('group', { name: 'Camera' });

const openCamera = async (user) => {
  await user.click(screen.getByRole('button', { name: 'AI Chat' }));
  await user.click(await screen.findByRole('button', { name: 'Take photo' }));
  await screen.findByRole('button', { name: 'Capture photo' });
};

describe('FoodSearchModal inline camera', () => {
  let camera;

  beforeEach(() => {
    camera = installFakeCamera();
  });

  afterEach(() => {
    camera.uninstall();
  });

  it('lets Escape close the camera before the page', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(onClose);
    await openCamera(user);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(viewfinder()).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(camera.streams[0].track.stop).toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('treats the Android back press the same way', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(onClose);
    await openCamera(user);

    // Pressed once, and outside `waitFor`: a retried press would close the page.
    let consumed;
    act(() => {
      consumed = closeTopmostStackedModal();
    });

    expect(consumed).toBe(true);
    await waitFor(() => expect(viewfinder()).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('releases the camera when the user leaves the chat view', async () => {
    const user = userEvent.setup();
    renderModal();
    await openCamera(user);

    await user.click(screen.getByRole('button', { name: 'Recents' }));

    await waitFor(() => expect(viewfinder()).not.toBeInTheDocument());
    expect(camera.streams[0].track.stop).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'AI Chat' }));
    await screen.findByRole('button', { name: 'Take photo' });
    expect(viewfinder()).not.toBeInTheDocument();
  });
});
