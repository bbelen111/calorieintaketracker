import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  CalorieProgressPill,
  getCalorieProgressPercent,
} from './CalorieProgressPill';

// There is exactly one rect: the progress outline. No track is drawn, so at rest
// the button stays flat and identical to its sibling hero buttons.
const getProgressRect = (container) => container.querySelector('rect');

// jsdom/React disagree on SVG attribute casing (`pathLength` vs `pathlength`),
// so read attributes case-insensitively.
const attrValue = (element, name) =>
  Array.from(element.attributes).find(
    (attribute) => attribute.name.toLowerCase() === name.toLowerCase()
  )?.value ?? null;

describe('getCalorieProgressPercent', () => {
  it('clamps to 0-100', () => {
    expect(getCalorieProgressPercent(0, 2000)).toBe(0);
    expect(getCalorieProgressPercent(50, 200)).toBe(25);
    expect(getCalorieProgressPercent(200, 200)).toBe(100);
    expect(getCalorieProgressPercent(400, 200)).toBe(100);
    expect(getCalorieProgressPercent(-10, 200)).toBe(0);
  });

  it('treats a missing or invalid goal as no progress', () => {
    expect(getCalorieProgressPercent(100, 0)).toBe(0);
    expect(getCalorieProgressPercent(100, -5)).toBe(0);
    expect(getCalorieProgressPercent(100, null)).toBe(0);
    expect(getCalorieProgressPercent(100, undefined)).toBe(0);
    expect(getCalorieProgressPercent(100, 'nope')).toBe(0);
    expect(getCalorieProgressPercent(NaN, 200)).toBe(0);
  });
});

describe('CalorieProgressPill', () => {
  it('is a single tap target that reads consumed / goal kcal', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <CalorieProgressPill consumed={1272} goal={2545} onPress={onPress} />
    );

    const pill = screen.getByRole('button', {
      name: 'Add meal, 1272 of 2545 kcal',
    });

    // One tap target: not a readout pill plus a separate add-meal button.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    // Same box and finish as the other screens' hero buttons, plus `shrink-0` so
    // the hero title row wraps the pill instead of squeezing it (a squeezed box
    // letterboxed the outline inside the fill).
    expect(pill).toHaveClass(
      'py-2',
      'px-4',
      'rounded-lg',
      'bg-primary',
      'font-semibold',
      'shrink-0'
    );
    // The box is *derived* like the siblings' (padding + a 20px icon), never a
    // fixed rem height: `h-9` (2.25rem) was 3.4px short on phones and `h-10`
    // (2.5rem) 0.25px over.
    expect(pill).not.toHaveClass('h-9');
    expect(pill).not.toHaveClass('h-10');
    expect(pill).not.toHaveClass('shadow-md');
    const svgs = pill.querySelectorAll('svg');
    expect(svgs[svgs.length - 1].getAttribute('width')).toBe('20');
    expect(pill).toHaveTextContent('1,272 / 2,545 kcal');

    await user.click(pill);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws the outline with the tracker palette without clipping the glow', () => {
    const { container } = render(
      <CalorieProgressPill consumed={1000} goal={2000} />
    );

    const progress = getProgressRect(container);
    expect(attrValue(progress, 'stroke')).toBe('rgb(var(--accent-green) / 1)');
    expect(attrValue(progress, 'stroke-opacity')).toBe('1');
    expect(attrValue(progress, 'stroke-linecap')).toBe('round');
    expect(attrValue(progress, 'pathlength')).toBe('100');
    expect(attrValue(progress, 'stroke-dasharray')).toBe('50 100');
    expect(progress.getAttribute('style')).toContain(
      'drop-shadow(0 0 2px rgb(var(--accent-green) / 0.35))'
    );
    expect(progress.getAttribute('style')).toContain(
      'transition: stroke-dasharray'
    );

    // The rim is stretched to the button's own box, so it can never drift from
    // the fill's shape at any width (a squeezed fixed-viewBox outline was the
    // small-screen bug).
    const svg = container.querySelector('svg');
    expect(attrValue(svg, 'pointer-events')).toBe('none');
    expect(attrValue(svg, 'preserveaspectratio')).toBe('none');
    expect(svg).toHaveClass('h-full', 'w-full');
    expect(svg.getAttribute('style')).toContain('overflow: visible');
  });

  it('clamps the outline at a full ring past the goal', () => {
    const { container } = render(
      <CalorieProgressPill consumed={5000} goal={2000} />
    );

    expect(attrValue(getProgressRect(container), 'stroke-dasharray')).toBe(
      '100 100'
    );
  });

  it('falls back to a dash and the plain action label without a goal', () => {
    const { container } = render(<CalorieProgressPill consumed={800} />);

    expect(screen.getByRole('button', { name: 'Add meal' })).toHaveTextContent(
      '800 / —'
    );
    expect(attrValue(getProgressRect(container), 'stroke-dasharray')).toBe(
      '0 100'
    );
  });

  it('stays flat at rest, with no outline, rim or shadow', () => {
    const { container } = render(
      <CalorieProgressPill consumed={0} goal={2000} />
    );

    // A visible rim/dot at 0 % was the "colours seem wrong" complaint: until you
    // log something the button has to be indistinguishable from its siblings.
    expect(container.querySelectorAll('rect')).toHaveLength(1);
    const progress = getProgressRect(container);
    expect(attrValue(progress, 'stroke-dasharray')).toBe('0 100');
    expect(attrValue(progress, 'stroke-opacity')).toBe('0');
    expect(screen.getByRole('button')).not.toHaveClass('shadow-md');
  });

  it('uses only theme tokens and no inline geometry', () => {
    const { container } = render(
      <CalorieProgressPill consumed={1000} goal={2000} />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-primary', 'text-primary-foreground');
    // Content-hugging: a longer number widens the pill instead of clipping it.
    expect(button.getAttribute('style')).toBeNull();
    expect(button).not.toHaveClass('shadow-md');
    expect(button).not.toHaveClass('shadow-lg');

    // Design-system guard: no hardcoded colours anywhere in the markup.
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3}/);
  });
});
