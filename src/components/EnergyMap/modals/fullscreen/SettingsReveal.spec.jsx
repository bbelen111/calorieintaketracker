import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SettingsReveal } from './SettingsReveal';
import {
  resetMotionMode,
  setMotionMode,
} from '../../../../utils/visuals/motionPreference';

describe('SettingsReveal', () => {
  afterEach(() => {
    resetMotionMode();
  });

  it('mounts the option only while open', () => {
    const { rerender } = render(
      <SettingsReveal open={false}>
        <p>Carryover window</p>
      </SettingsReveal>
    );
    expect(screen.queryByText('Carryover window')).toBeNull();

    rerender(
      <SettingsReveal open>
        <p>Carryover window</p>
      </SettingsReveal>
    );
    expect(screen.getByText('Carryover window')).toBeInTheDocument();
  });

  it('swaps instantly under reduced motion instead of animating height', () => {
    setMotionMode('reduced');

    const { rerender } = render(
      <SettingsReveal open>
        <p>Carryover window</p>
      </SettingsReveal>
    );
    expect(screen.getByText('Carryover window')).toBeInTheDocument();

    rerender(
      <SettingsReveal open={false}>
        <p>Carryover window</p>
      </SettingsReveal>
    );
    expect(screen.queryByText('Carryover window')).toBeNull();
  });
});
