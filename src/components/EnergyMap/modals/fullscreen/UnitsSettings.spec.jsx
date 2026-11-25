import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitsSettingsSection } from './UnitsSettingsSection';
import { DEFAULT_UNIT_PREFERENCES } from '../../../../constants/units/units';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../../../utils/data/storage';
import { useUnits } from '../../../../hooks/useUnits';

const SegmentedButton = ({ children, ...rest }) => {
  const props = { ...rest };
  delete props.active;
  delete props.activeClassName;
  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
};
const SettingLabel = ({ children }) => <span>{children}</span>;

// The page wired to the real store, as `SettingsModal` wires it.
const Harness = () => {
  const userData = useEnergyMapStore((state) => state.userData);
  const onFieldChange = useEnergyMapStore(
    (state) => state.handleUserDataChange
  );
  const units = useUnits();
  return (
    <>
      <UnitsSettingsSection
        userData={userData}
        onFieldChange={onFieldChange}
        SegmentedButton={SegmentedButton}
        SettingLabel={SettingLabel}
        activeClassName=""
      />
      <output>{units.energy.format(100)}</output>
    </>
  );
};

const pressed = (group, name) =>
  within(screen.getByRole('group', { name: group }))
    .getByRole('button', { name })
    .getAttribute('aria-pressed');

const prefs = () => useEnergyMapStore.getState().userData.unitPreferences;

describe('Settings -> Units', () => {
  afterEach(() =>
    act(() => {
      useEnergyMapStore.setState({ userData: getDefaultEnergyMapData() });
    })
  );

  it('starts on metric and kcal', () => {
    render(<Harness />);

    expect(pressed('Unit preset', 'Metric')).toBe('true');
    expect(pressed('Body weight', 'kg')).toBe('true');
    expect(pressed('Energy', 'kcal')).toBe('true');
  });

  it('applies a preset without changing the energy unit', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      within(screen.getByRole('group', { name: 'Energy' })).getByRole(
        'button',
        { name: 'kJ' }
      )
    );
    await user.click(screen.getByRole('button', { name: 'US' }));

    expect(prefs()).toEqual({
      bodyWeight: 'lb',
      height: 'ft',
      distance: 'mi',
      foodWeight: 'oz',
      energy: 'kJ',
    });
    expect(pressed('Unit preset', 'US')).toBe('true');
    expect(screen.getByRole('status')).toHaveTextContent('418 kJ');
  });

  it('reads as a custom mix once one quantity differs from every preset', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      within(screen.getByRole('group', { name: 'Distance' })).getByRole(
        'button',
        { name: 'mi' }
      )
    );

    expect(prefs()).toEqual({ ...DEFAULT_UNIT_PREFERENCES, distance: 'mi' });
    expect(screen.getByText(/Custom mix/)).toBeInTheDocument();
    expect(pressed('Unit preset', 'Metric')).toBe('false');
  });

  it('ignores an unknown value and keeps the object when nothing changes', () => {
    render(<Harness />);
    const before = prefs();

    act(() => {
      useEnergyMapStore
        .getState()
        .handleUserDataChange('unitPreferences', { energy: 'btu' });
    });

    expect(prefs()).toBe(before);
  });
});
