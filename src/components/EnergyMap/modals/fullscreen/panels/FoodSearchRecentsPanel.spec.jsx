import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FoodSearchRecentsPanel } from './FoodSearchRecentsPanel';
import { useEnergyMapStore } from '../../../../../store/useEnergyMapStore';
import { getTodayDateKey } from '../../../../../utils/data/dateKeys';

const INITIAL_STATE = useEnergyMapStore.getState();
const TODAY = getTodayDateKey();

const OMELETTE = {
  id: 1,
  foodId: 'ai_1_0',
  name: 'Egg omelette',
  category: 'protein',
  source: 'ai',
  grams: 170,
  calories: 245,
  protein: 20,
  carbs: 2,
  fats: 17,
  timestamp: '2026-01-02T12:00:00.000Z',
};

const SOUP = {
  id: 2,
  name: 'Home soup',
  grams: null,
  calories: 90,
  protein: 4,
  carbs: 10,
  fats: 3,
  timestamp: '2026-01-01T12:00:00.000Z',
};

const seed = (entries) => {
  useEnergyMapStore.setState({
    userData: {
      ...INITIAL_STATE.userData,
      nutritionData: { [TODAY]: { lunch: entries } },
    },
  });
};

const Harness = ({ onSelectRecent }) => {
  const [query, setQuery] = useState('');
  return (
    <FoodSearchRecentsPanel
      searchQuery={query}
      onSearchQueryChange={setQuery}
      onSelectRecent={onSelectRecent}
      prefersReducedMotion
    />
  );
};

const renderPanel = () => {
  const onSelectRecent = vi.fn();
  render(<Harness onSelectRecent={onSelectRecent} />);
  return onSelectRecent;
};

const rows = () => screen.queryAllByRole('button', { name: /kcal/ });

beforeEach(() => {
  useEnergyMapStore.setState(INITIAL_STATE);
});

describe('FoodSearchRecentsPanel', () => {
  it('explains itself when nothing has been logged', () => {
    renderPanel();

    expect(screen.getByText('Foods you log show up here.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('lists recent foods newest first with their last log', () => {
    seed([SOUP, OMELETTE]);
    renderPanel();

    expect(screen.getByText('2 recent foods')).toBeInTheDocument();
    const [first, second] = rows();
    expect(first).toHaveTextContent('Egg omelette');
    expect(first).toHaveTextContent('170g · Lunch · Today');
    expect(first).toHaveTextContent('245 kcal');
    expect(first).toHaveTextContent('AI');
    expect(second).toHaveTextContent('Home soup');
    expect(second).toHaveTextContent('Manual');
    expect(second).toHaveTextContent('Lunch · Today');
  });

  it('hands the chosen entry to its owner', async () => {
    const user = userEvent.setup();
    seed([OMELETTE]);
    const onSelectRecent = renderPanel();

    await user.click(screen.getByRole('button', { name: /Egg omelette/ }));

    expect(onSelectRecent).toHaveBeenCalledWith(OMELETTE);
  });

  it('searches the list and says when nothing matches', async () => {
    const user = userEvent.setup();
    seed([SOUP, OMELETTE]);
    renderPanel();

    await user.type(screen.getByRole('textbox'), 'soup');
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('1 recent food')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'zzz');
    expect(rows()).toHaveLength(0);
    expect(
      screen.getByText('No recent foods match "soupzzz".')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(rows()).toHaveLength(2);
  });
});
