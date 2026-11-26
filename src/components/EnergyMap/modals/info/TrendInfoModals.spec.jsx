import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BodyFatTrendInfoModal } from './BodyFatTrendInfoModal';
import { WeightTrendInfoModal } from './WeightTrendInfoModal';

/**
 * The trend info sheets print the goal band and the label edges the trend
 * calculators actually use, both read from the goal table
 * (`constants/goals/goalDefinitions.js`), never their own copies.
 */
const row = (label) => screen.getByText(label).parentElement;

describe('trend info sheets', () => {
  it('Body Fat: body-fat bands and label edges, not the weight numbers', () => {
    render(
      <BodyFatTrendInfoModal
        isOpen
        isClosing={false}
        trend={{ label: 'Gradual body fat loss', weeklyRate: -0.1 }}
        selectedGoal="cutting"
        onClose={() => {}}
      />
    );

    expect(screen.getByText('-0.15 to -0.08 %/week')).toBeTruthy();
    expect(row('Stable')).toHaveTextContent('< 0.08 %/week');
    expect(row('Gradual change')).toHaveTextContent('0.08 - 0.15 %/week');
    expect(row('Moderate change')).toHaveTextContent('0.15 - 0.24 %/week');
    expect(row('Aggressive change')).toHaveTextContent('0.24 - 0.36 %/week');
    expect(row('Severe change')).toHaveTextContent('> 0.36 %/week');
  });

  it('Weight: the goal band follows the table; label edges are unchanged', () => {
    render(
      <WeightTrendInfoModal
        isOpen
        isClosing={false}
        trend={{ label: 'Gradual weight gain', weeklyRate: 0.3 }}
        selectedGoal="bulking"
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/\+0\.25 to \+0\.45 kg\/week/)).toBeTruthy();
    expect(row('Stable')).toHaveTextContent('< 0.1 kg/week');
    expect(row('Gradual change')).toHaveTextContent('0.1 - 0.45 kg/week');
    expect(row('Moderate change')).toHaveTextContent('0.45 - 0.8 kg/week');
    expect(row('Aggressive change')).toHaveTextContent('0.8 - 1.2 kg/week');
    expect(row('Severe change')).toHaveTextContent('> 1.2 kg/week');
  });
});
