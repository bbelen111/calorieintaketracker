import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InsightHeadline, InsightStatus } from './InsightHeadline';

/**
 * The Insights card header's right-hand side is ONE pair of components, so the
 * resting heart rate and adaptive thermogenesis cards cannot drift apart:
 * a number gets the big headline, a state word ("Off") gets a small chip.
 */
describe('InsightHeadline', () => {
  it('renders a large bold value with a small muted unit', () => {
    render(<InsightHeadline testId="h" value="-250" unit="kcal/day" />);
    const headline = screen.getByTestId('h');
    expect(headline).toHaveClass('block', 'text-3xl', 'font-bold');
    expect(screen.getByText('kcal/day')).toHaveClass('text-base', 'text-muted');
    expect(screen.getByText('-250')).toBeInTheDocument();
  });

  it('colours only the value, and a unit-less value stands alone', () => {
    render(
      <InsightHeadline testId="h" value="61" valueClass="text-accent-blue" />
    );
    expect(screen.getByTestId('h')).toHaveClass('text-accent-blue');
    expect(screen.getByTestId('h')).toHaveTextContent(/^61$/);
  });
});

describe('InsightStatus', () => {
  it('shows a state word as a small chip, never in the headline type', () => {
    render(<InsightStatus testId="s" label="Off" />);
    const chip = screen.getByTestId('s');
    expect(chip).toHaveTextContent('Off');
    expect(chip).toHaveClass('rounded-full', 'text-muted');
    expect(chip.className).not.toContain('text-3xl');
    expect(chip.className).not.toContain('font-bold');
  });
});
