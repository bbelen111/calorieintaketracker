import { describe, expect, it } from 'vitest';

import { resolveInitialHeartRate } from './HeartRatePickerModal';
import { DEFAULT_SESSION_HEART_RATE_BPM } from '../../../../constants/health/heartRate';

describe('HeartRatePickerModal resolveInitialHeartRate', () => {
  it('opens an unset value at the default, not the 60 bpm floor', () => {
    // The forms pass '' for a fresh heart-rate session; Number('') === 0 used
    // to clamp the wheel to 60 bpm.
    expect(resolveInitialHeartRate('')).toBe(DEFAULT_SESSION_HEART_RATE_BPM);
    expect(resolveInitialHeartRate(null)).toBe(DEFAULT_SESSION_HEART_RATE_BPM);
    expect(resolveInitialHeartRate(undefined)).toBe(
      DEFAULT_SESSION_HEART_RATE_BPM
    );
    expect(resolveInitialHeartRate(0)).toBe(DEFAULT_SESSION_HEART_RATE_BPM);
    expect(resolveInitialHeartRate('abc')).toBe(DEFAULT_SESSION_HEART_RATE_BPM);
  });

  it('keeps an entered value (the wheel clamps it to the session range)', () => {
    expect(resolveInitialHeartRate(152)).toBe(152);
    expect(resolveInitialHeartRate('148')).toBe(148);
  });

  it('honours a per-use default (resting / max HR pickers)', () => {
    expect(resolveInitialHeartRate('', 60)).toBe(60);
    expect(resolveInitialHeartRate(52, 60)).toBe(52);
  });
});
