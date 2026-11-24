import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SegmentedToggle } from './SegmentedToggle';
import {
  resetMotionMode,
  setMotionMode,
} from '../../../utils/visuals/motionPreference';

const OPTIONS = [
  { id: 'local', label: 'Local', pillClassName: 'bg-accent-blue' },
  { id: 'online', label: 'Online', pillClassName: 'bg-accent-emerald' },
  { id: 'saved', label: 'Saved', pillClassName: 'bg-accent-indigo' },
];

const renderToggle = (props = {}) => {
  const onChange = vi.fn();
  const view = render(
    <SegmentedToggle
      ariaLabel="Source"
      options={OPTIONS}
      value="local"
      onChange={onChange}
      {...props}
    />
  );
  return { onChange, ...view };
};

const pill = () => screen.getByTestId('segmented-toggle-pill');

afterEach(() => {
  resetMotionMode();
});

describe('SegmentedToggle', () => {
  it('is a labelled group whose segments report which one is active', () => {
    renderToggle({ value: 'online' });

    expect(screen.getByRole('group', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Online' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('slides ONE pill to the active segment and takes its colour', () => {
    const { rerender } = renderToggle({ value: 'local' });
    const element = pill();

    expect(element.style.transform).toBe('translateX(0%)');
    expect(element.className).toContain('bg-accent-blue');
    // One third of the track (minus the 0.25rem padding either side).
    expect(element.style.width).toContain('100% - 0.5rem');

    rerender(
      <SegmentedToggle
        ariaLabel="Source"
        options={OPTIONS}
        value="saved"
        onChange={() => {}}
      />
    );

    // The same element moved - it was not remounted, so it can animate.
    expect(pill()).toBe(element);
    expect(element.style.transform).toBe('translateX(200%)');
    expect(element.className).toContain('bg-accent-indigo');
    expect(element.className).not.toContain('bg-accent-blue');
  });

  it('animates the glide and the colour in full motion', () => {
    renderToggle();

    expect(pill().style.transition).toContain('transform');
    expect(pill().style.transition).toContain('background-color');
  });

  it.each(['reduced', 'off'])(
    'drops the glide but keeps the colour change in %s motion',
    (mode) => {
      setMotionMode(mode);
      renderToggle();

      expect(pill().style.transition).not.toContain('transform');
      expect(pill().style.transition).toContain('background-color');
    }
  );

  it('reports the chosen segment id', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle();

    await user.click(screen.getByRole('button', { name: 'Online' }));

    expect(onChange).toHaveBeenCalledWith('online');
  });

  it('does not fire for a disabled segment', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({
      options: [OPTIONS[0], { ...OPTIONS[1], disabled: true }],
    });

    const online = screen.getByRole('button', { name: 'Online' });
    expect(online).toBeDisabled();
    await user.click(online);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to the first segment for an unknown value', () => {
    renderToggle({ value: 'nope' });

    expect(pill().style.transform).toBe('translateX(0%)');
    expect(screen.getByRole('button', { name: 'Local' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('renders an icon without adding to the accessible name', () => {
    const Icon = (props) => <svg data-testid="icon" {...props} />;
    renderToggle({
      options: [
        { id: 'local', label: 'Local', icon: Icon },
        { id: 'online', label: 'Online' },
      ],
    });

    expect(screen.getByTestId('icon')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Local' })).toBeInTheDocument();
  });
});
