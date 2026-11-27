import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MacroPickerModal } from './MacroPickerModal';

const USER_DATA = { weight: 74, bodyFatTrackingEnabled: false };

const Harness = ({ locks }) => {
  const [split, setSplit] = useState({ protein: 0.3, carbs: 0.45, fats: 0.25 });
  return (
    <MacroPickerModal
      isOpen
      isClosing={false}
      value={split}
      onChange={setSplit}
      macroLocks={locks}
      targetCalories={2500}
      userData={USER_DATA}
      targetLabel="Maintenance"
    />
  );
};

// The chip's accessible name carries the live grams ("Lock Fats at 69.4g").
const gramsOf = (label) => {
  const chip = screen.getByRole('button', {
    name: new RegExp(`^Lock ${label} at`),
  });
  return Number(chip.getAttribute('aria-label').match(/at ([\d.]+)g/)[1]);
};

describe('MacroPickerModal one-lock slider direction', () => {
  it.each([
    { locks: { protein: 150 }, left: 'Carbs', right: 'Fats' },
    { locks: { carbs: 250 }, left: 'Protein', right: 'Fats' },
    { locks: { fats: 70 }, left: 'Protein', right: 'Carbs' },
  ])(
    'dragging right raises $right and lowers $left',
    ({ locks, left, right }) => {
      render(<Harness locks={locks} />);
      const slider = screen.getByRole('slider', {
        name: `Balance ${left} vs ${right}`,
      });
      const drag = (value) =>
        fireEvent.change(slider, { target: { value: String(value) } });
      const min = Number(slider.min);
      const max = Number(slider.max);

      drag(min);
      const atLeftEnd = { left: gramsOf(left), right: gramsOf(right) };
      const leftThumb = Number(slider.value);

      drag((min + max) / 2);
      const atMiddle = { left: gramsOf(left), right: gramsOf(right) };
      const middleThumb = Number(slider.value);

      drag(max);
      const atRightEnd = { left: gramsOf(left), right: gramsOf(right) };
      const rightThumb = Number(slider.value);

      expect(atMiddle.right).toBeGreaterThan(atLeftEnd.right);
      expect(atRightEnd.right).toBeGreaterThan(atMiddle.right);
      expect(atMiddle.left).toBeLessThan(atLeftEnd.left);
      expect(atRightEnd.left).toBeLessThan(atMiddle.left);

      // The thumb stays where it was dragged (within the 1 g step).
      expect(Math.abs(leftThumb - min)).toBeLessThanOrEqual(1);
      expect(Math.abs(middleThumb - (min + max) / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(rightThumb - max)).toBeLessThanOrEqual(1);
    }
  );
});
