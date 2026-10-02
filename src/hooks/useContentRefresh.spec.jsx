import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useContentRefresh } from './useContentRefresh';

/**
 * Same-state content refresh for the Daily Ledger / Calendar dual panels.
 *
 * The contract under test is WHEN the subtle animation plays (only when an
 * already-visible panel changes its content identity; a first fill, a hidden
 * panel and a hidden -> visible flip all stay untouched) and that it always
 * hands the DOM back untouched.
 *
 * That last part is a regression guard: the first implementation drove framer's
 * imperative `animate()` on a raw DOM element, which reuses per-element state -
 * so the second and later refreshes animated `1 -> 1` (a no-op) and left the
 * panel parked at the start opacity, faded, until the modal was remounted.
 */
const Harness = ({ identity, enabled = true }) => {
  const ref = useContentRefresh(identity, { enabled });
  return <div data-testid="panel" ref={ref} />;
};

describe('useContentRefresh', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not animate on mount', () => {
    const { getByTestId } = render(<Harness identity="2026-03-10" />);
    const node = getByTestId('panel');

    expect(node.style.opacity).toBe('');
    expect(node.style.transform).toBe('');
  });

  it('writes the subtle start style when the identity changes while visible', () => {
    const { getByTestId, rerender } = render(<Harness identity="2026-03-10" />);
    const node = getByTestId('panel');

    rerender(<Harness identity="2026-03-11" />);

    expect(node.style.opacity).toBe('0.6');
    expect(node.style.transform).toBe('translateY(2px)');
  });

  it('replays the start style on every change, not just the first', () => {
    const { getByTestId, rerender } = render(<Harness identity="a" />);
    const node = getByTestId('panel');

    rerender(<Harness identity="b" />);
    expect(node.style.opacity).toBe('0.6');

    rerender(<Harness identity="c" />);
    expect(node.style.opacity).toBe('0.6');

    rerender(<Harness identity="d" />);
    expect(node.style.opacity).toBe('0.6');
  });

  it('clears every inline style once the transition has finished', () => {
    vi.useFakeTimers();
    const { getByTestId, rerender } = render(<Harness identity="a" />);
    const node = getByTestId('panel');

    rerender(<Harness identity="b" />);
    expect(node.style.opacity).toBe('0.6');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(node.style.opacity).toBe('');
    expect(node.style.transform).toBe('');
    expect(node.style.transition).toBe('');
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
