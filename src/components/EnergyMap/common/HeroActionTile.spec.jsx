import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HeroActionTile } from './HeroActionTile';
import { buildHeroActionModel } from '../../../utils/calculations/heroActionMetrics';

const attrValue = (element, name) =>
  Array.from(element.attributes).find(
    (attribute) => attribute.name.toLowerCase() === name.toLowerCase()
  )?.value ?? null;

describe('HeroActionTile', () => {
  it('reads label / value / caption like the original tiles and is one tap target', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <HeroActionTile
        model={buildHeroActionModel({
          metric: 'steps',
          steps: 6420,
          stepGoal: 10000,
        })}
        onPress={onPress}
      />
    );

    const tile = screen.getByRole('button', {
      name: /^Steps today,.*Open step tracker$/,
    });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(tile).toHaveTextContent('Steps');
    expect(tile).toHaveTextContent('6,420');
    expect(tile).toHaveTextContent('of 10,000 steps');

    await user.click(tile);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('copies the sibling tiles’ design classes and uses only theme tokens', () => {
    const { container } = render(
      <HeroActionTile model={buildHeroActionModel({ metric: 'burn' })} />
    );

    const tile = screen.getByRole('button');
    // Same surface, radius, border and press behaviour as Weight / Body Fat.
    expect(tile).toHaveClass(
      'bg-surface-highlight/50',
      'rounded-xl',
      'border',
      'border-border/50',
      'pressable-card',
      'focus-ring'
    );
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3}/);
  });

  it('draws a progress outline for a metric with a goal, in the pill’s palette', () => {
    const { container } = render(
      <HeroActionTile
        model={buildHeroActionModel({
          metric: 'steps',
          steps: 5000,
          stepGoal: 10000,
        })}
      />
    );

    const rect = container.querySelector('rect');
    expect(attrValue(rect, 'stroke')).toBe('rgb(var(--accent-green) / 1)');
    expect(attrValue(rect, 'stroke-opacity')).toBe('1');
    expect(attrValue(rect, 'stroke-dasharray')).toBe('50 100');
    expect(attrValue(rect, 'pathlength')).toBe('100');

    // Stretched to the tile's own box, never letterboxed, glow not clipped.
    const svg = container.querySelector('svg');
    expect(attrValue(svg, 'preserveaspectratio')).toBe('none');
    expect(svg).toHaveClass('h-full', 'w-full');
    expect(svg.getAttribute('style')).toContain('overflow: visible');
  });

  it('stays flat like its neighbours for a plain reading or an empty goal', () => {
    const flat = (model) => {
      const { container, unmount } = render(<HeroActionTile model={model} />);
      const rect = container.querySelector('rect');
      const result = [
        attrValue(rect, 'stroke-dasharray'),
        attrValue(rect, 'stroke-opacity'),
      ];
      unmount();
      return result;
    };

    // A reading with no goal (Weight) and a goal with nothing done yet (0 steps).
    expect(
      flat(
        buildHeroActionModel({ metric: 'weight', weight: { display: '74' } })
      )
    ).toEqual(['0 100', '0']);
    expect(
      flat(buildHeroActionModel({ metric: 'steps', steps: 0, stepGoal: 10000 }))
    ).toEqual(['0 100', '0']);
  });

  it('shows the staleness note beside Weight and Body Fat values', () => {
    render(
      <HeroActionTile
        model={buildHeroActionModel({
          metric: 'weight',
          weight: {
            display: '74',
            dateLabel: 'Tue, Nov 24, 2026',
            warning: '9d old',
          },
        })}
      />
    );

    const tile = screen.getByRole('button', {
      name: 'Weight, 74 kg. Open weight tracker',
    });
    expect(tile).toHaveTextContent('74 kg');
    expect(tile).toHaveTextContent('9d old');
    expect(tile).toHaveTextContent('Tue, Nov 24, 2026');
  });

  it('keeps its third line when a metric has no caption', () => {
    render(
      <HeroActionTile
        model={{ ...buildHeroActionModel({ metric: 'burn' }), caption: '' }}
      />
    );

    // A non-breaking space holds the line so the tile is as tall as its
    // neighbour; it must never collapse and resize the row.
    const lines = screen.getByRole('button').querySelectorAll('p');
    expect(lines).toHaveLength(3);
    expect(lines[2].textContent).toBe(' ');
  });
});
