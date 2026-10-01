import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useContentRefresh } from './useContentRefresh';

/**
 * Same-state content refresh for the Daily Ledger / Calendar dual panels.
 *
 * The contract under test is WHEN the subtle animation plays: only when an
 * already-visible panel changes its content identity. A first fill, a hidden
 * panel and a hidden -> visible flip must all stay untouched so the tween never
 * stacks on top of the panels' existing state-transition crossfade.
 */
const Harness = ({ identity, enabled = true }) => {
  const ref = useContentRefresh(identity, { enabled });
  return <div data-testid="panel" ref={ref} />;
};

describe('useContentRefresh', () => {
  it('does not animate on mount', () => {
    const { getByTestId } = render(<Harness identity="2026-03-10" />);
    const node = getByTestId('panel');

    expect(node.style.opacity).toBe('');
    expect(node.style.transform).toBe('');
  });

  it('writes a subtle start style when the identity changes while visible', () => {
    const { getByTestId, rerender } = render(<Harness identity="2026-03-10" />);
    const node = getByTestId('panel');

    rerender(<Harness identity="2026-03-11" />);

    expect(node.style.opacity).toBe('0.6');
    expect(node.style.transform).toBe('translateY(2px)');
  });

  it('skips the refresh while the panel is hidden', () => {
    const { getByTestId, rerender } = render(
      <Harness identity="2026-03-10" enabled={false} />
    );
    const node = getByTestId('panel');

    rerender(<Harness identity="2026-03-11" enabled={false} />);

    expect(node.style.opacity).toBe('');
  });

  it('skips the refresh when a hidden panel becomes visible', () => {
    const { getByTestId, rerender } = render(
      <Harness identity="2026-03-10" enabled={false} />
    );
    const node = getByTestId('panel');

    rerender(<Harness identity="2026-03-11" enabled />);

    expect(node.style.opacity).toBe('');
  });

  it('accepts custom tuning', () => {
    const Custom = ({ identity }) => {
      const ref = useContentRefresh(identity, {
        fromOpacity: 0.4,
        fromOffsetPx: 4,
      });
      return <div data-testid="custom" ref={ref} />;
    };
    const { getByTestId, rerender } = render(<Custom identity="a" />);
    const node = getByTestId('custom');

    rerender(<Custom identity="b" />);

    expect(node.style.opacity).toBe('0.4');
    expect(node.style.transform).toBe('translateY(4px)');
  });
});
