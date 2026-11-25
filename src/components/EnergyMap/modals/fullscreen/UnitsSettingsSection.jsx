import React from 'react';
import {
  UNIT_OPTIONS,
  UNIT_PRESETS,
  applyUnitPreset,
  matchUnitPreset,
  normalizeUnitPreferences,
} from '../../../../constants/units/units';
import { createUnitFormatter } from '../../../../utils/units/unitFormatter';

// Sample values (canonical kg / cm / km / g / kcal) shown under each row, so
// the choice is previewed the way the app will write it.
const ROWS = [
  {
    quantity: 'bodyWeight',
    label: 'Body weight',
    example: (units) => units.bodyWeight.format(74.5),
  },
  {
    quantity: 'height',
    label: 'Height',
    example: (units) => units.height.format(175),
  },
  {
    quantity: 'distance',
    label: 'Distance',
    example: (units) => units.distance.format(5.2),
  },
  {
    quantity: 'foodWeight',
    label: 'Food weight',
    example: (units) => units.food.format(170),
  },
  {
    quantity: 'energy',
    label: 'Energy',
    example: (units) => units.energy.format(2100),
  },
];

const COLUMN_CLASS = { 2: 'grid-cols-2', 3: 'grid-cols-3' };

/**
 * Settings -> Units. Presets set body weight, height, distance and food weight
 * together; every quantity can also be chosen on its own. Changes apply
 * immediately and only affect how values are shown and entered.
 *
 * `SegmentedButton` / `SettingLabel` are passed in so this page uses the same
 * controls as the rest of `SettingsModal`.
 */
export const UnitsSettingsSection = ({
  userData,
  onFieldChange,
  SegmentedButton,
  SettingLabel,
  activeClassName,
}) => {
  const preferences = normalizeUnitPreferences(userData?.unitPreferences);
  const units = createUnitFormatter(preferences);
  const activePreset = matchUnitPreset(preferences);

  const change = (next) => onFieldChange?.('unitPreferences', next);

  return (
    <div className="space-y-6">
      <div>
        <SettingLabel>Preset</SettingLabel>
        <div
          role="group"
          aria-label="Unit preset"
          className="grid grid-cols-3 gap-2"
        >
          {UNIT_PRESETS.map(({ key, label }) => (
            <SegmentedButton
              key={key}
              active={activePreset === key}
              activeClassName={activeClassName}
              aria-pressed={activePreset === key}
              onClick={() => change(applyUnitPreset(preferences, key))}
            >
              <span className="text-sm">{label}</span>
            </SegmentedButton>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {activePreset ? 'Sets' : 'Custom mix. A preset sets'} body weight,
          height, distance and food weight. Energy is chosen separately.
        </p>
      </div>

      {ROWS.map(({ quantity, label, example }) => {
        const options = UNIT_OPTIONS[quantity];
        return (
          <div key={quantity}>
            <SettingLabel>{label}</SettingLabel>
            <div
              role="group"
              aria-label={label}
              className={`grid gap-2 ${COLUMN_CLASS[options.length]}`}
            >
              {options.map((option) => (
                <SegmentedButton
                  key={option.key}
                  active={preferences[quantity] === option.key}
                  activeClassName={activeClassName}
                  aria-pressed={preferences[quantity] === option.key}
                  onClick={() =>
                    change({ ...preferences, [quantity]: option.key })
                  }
                >
                  <span className="text-sm">{option.label}</span>
                </SegmentedButton>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">e.g. {example(units)}</p>
          </div>
        );
      })}

      <p className="text-xs text-muted">
        Your logged data is not changed. Macros and nutrients stay in grams and
        milligrams.
      </p>
    </div>
  );
};
