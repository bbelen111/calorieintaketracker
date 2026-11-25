import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DualWheel } from '../../common/DualWheel';
import { WeightPicker, WeightPickerModal } from '../forms/WeightEntryModal';
import { HeightPickerModal } from './HeightPickerModal';
import { EnergyPickerModal } from './EnergyPickerModal';
import { CaloriesPerHourPickerModal } from './CaloriesPerHourPickerModal';
import { FoodPortionModal } from './FoodPortionModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../../../utils/data/storage';
import { DEFAULT_UNIT_PREFERENCES } from '../../../../constants/units/units';
import { buildTenthsWheel } from '../../../../utils/units/wheelConfigs';

const setUnits = (overrides) =>
  act(() => {
    useEnergyMapStore.setState({
      userData: {
        ...getDefaultEnergyMapData(),
        unitPreferences: { ...DEFAULT_UNIT_PREFERENCES, ...overrides },
      },
    });
  });

// The wheels align on an animation frame after mounting.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

const option = (wheel, name) =>
  within(screen.getByRole('listbox', { name: wheel })).getByRole('option', {
    name,
  });

const selected = (wheel) =>
  within(screen.getByRole('listbox', { name: wheel }))
    .getAllByRole('option', { selected: true })
    .map((node) => node.textContent);

afterEach(() => setUnits({}));

describe('DualWheel', () => {
  const config = buildTenthsWheel({ min: 1.5, max: 3.2, majorLabel: 'Whole' });

  it('joins the two wheels and disables rows outside the range', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DualWheel value={2} config={config} onChange={onChange} />);
    await settle();

    await user.click(option('Decimal', '.7'));
    expect(onChange).toHaveBeenLastCalledWith(2.7);

    await user.click(option('Whole', '3'));
    // 3.7 is past the maximum, so the decimal is pulled back.
    expect(onChange).toHaveBeenLastCalledWith(3.2);
    expect(option('Decimal', '.5')).toHaveAttribute('aria-disabled', 'true');
    expect(selected('Decimal')).toEqual(['.2']);
  });
});

describe('weight picker units', () => {
  it('shows pounds and reports kilograms', async () => {
    setUnits({ bodyWeight: 'lb' });
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeightPicker value={81.65} onChange={onChange} />);
    await settle();

    expect(selected('Whole')).toEqual(['180']);
    expect(selected('Decimal')).toEqual(['.0']);

    await user.click(option('Whole', '181'));
    expect(onChange).toHaveBeenLastCalledWith(82.1);
  });

  it('hands the original kilograms back when scrolled back', async () => {
    setUnits({ bodyWeight: 'lb' });
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeightPicker value={81.65} onChange={onChange} />);
    await settle();

    await user.click(option('Whole', '181'));
    await user.click(option('Whole', '180'));
    expect(onChange).toHaveBeenLastCalledWith(81.65);
  });

  it('offers stone and half pounds', async () => {
    setUnits({ bodyWeight: 'st' });
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <WeightPickerModal
        isOpen
        value={74.5}
        onCancel={vi.fn()}
        onSave={onSave}
      />
    );
    await settle();

    expect(screen.getByText('Stone and pounds')).toBeInTheDocument();
    expect(selected('Stone')).toEqual(['11 st']);
    expect(selected('Pounds')).toEqual(['10 lb']);

    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(74.5);
  });
});

describe('height picker in feet', () => {
  it('saves centimetres and keeps an untouched value', async () => {
    setUnits({ height: 'ft' });
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <HeightPickerModal
        isOpen
        value={182}
        onCancel={vi.fn()}
        onSave={onSave}
      />
    );
    await settle();

    expect(selected('Feet')).toEqual(['6 ft']);
    expect(selected('Inches')).toEqual(['0 in']);
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenLastCalledWith(182);

    await user.click(option('Inches', '1 in'));
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenLastCalledWith(185);
  });
});

describe('energy pickers in kJ', () => {
  it('enters a label value to the kilojoule', async () => {
    setUnits({ energy: 'kJ' });
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EnergyPickerModal isOpen value={0} onCancel={vi.fn()} onSave={onSave} />
    );
    await settle();

    await user.click(option('Hundreds', '8'));
    await user.click(option('Units', '46'));
    expect(screen.getByText('846 kJ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(202.2);
  });

  it('keeps an untouched per-hour value and converts a new one', async () => {
    setUnits({ energy: 'kJ' });
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <CaloriesPerHourPickerModal
        isOpen
        value={220}
        onCancel={vi.fn()}
        onSave={onSave}
      />
    );
    await settle();

    expect(screen.getByText('Energy Per Hour')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenLastCalledWith(220);

    fireEvent.click(screen.getByText('1,000'));
    await settle();
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenLastCalledWith(239.01);
  });
});

describe('food portion in ounces', () => {
  const FOOD = {
    id: 'usda_rice',
    name: 'Rice',
    per100g: { calories: 130, protein: 2.7, carbs: 28, fats: 0.3 },
    portions: [],
  };

  const renderPortion = (props = {}) => {
    const onAddFood = vi.fn();
    render(
      <FoodPortionModal
        isOpen
        isClosing={false}
        onClose={vi.fn()}
        selectedFood={FOOD}
        onAddFood={onAddFood}
        {...props}
      />
    );
    return onAddFood;
  };

  const log = async (user, onAddFood) => {
    await user.click(screen.getByRole('button', { name: /^log entry$/i }));
    return onAddFood.mock.calls.at(-1)[0];
  };

  it('starts a new log at 4 oz', async () => {
    setUnits({ foodWeight: 'oz' });
    const user = userEvent.setup();
    const onAddFood = renderPortion();
    await settle();

    expect((await log(user, onAddFood)).grams).toBe(113.4);
  });

  it('keeps the exact grams of an untouched entry', async () => {
    setUnits({ foodWeight: 'oz' });
    const user = userEvent.setup();
    const onAddFood = renderPortion({ initialGrams: 100 });
    await settle();

    expect((await log(user, onAddFood)).grams).toBe(100);
  });

  it('lets a metric user switch one entry to ounces', async () => {
    const user = userEvent.setup();
    const onAddFood = renderPortion({ initialGrams: 100 });
    await settle();

    await user.click(screen.getByRole('button', { name: /grammes/i }));
    await user.click(screen.getByRole('option', { name: /ounces/i }));
    await settle();

    expect((await log(user, onAddFood)).grams).toBe(113.4);
  });
});
