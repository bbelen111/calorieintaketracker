// Animation preference (Settings -> Appearance -> Animations).
//
// The user picks a PREFERENCE; the app runs on a resolved MODE:
//
//   preference  system | full | reduced | off      (persisted as `motionPreference`)
//   mode        full | reduced | off                (what CSS and JS actually act on)
//
//  - full     every animation plays.
//  - reduced  movement goes (slides, scales, staggers, the card flight, the keyboard
//             glide, carousel travel); crossfades and short colour transitions stay.
//             This is what the device's "Reduce motion" setting has always meant here.
//  - off      nothing animates: durations collapse to ~0, fades and transitions too.
//
// `system` (the default) resolves from the device's Reduce Motion setting, so a user
// who never opens Settings gets exactly the behaviour the app had before this
// preference existed. `full` deliberately overrides the device setting - it is an
// explicit choice, not a default.

export const MOTION_MODES = {
  FULL: 'full',
  REDUCED: 'reduced',
  OFF: 'off',
};

export const MOTION_PREFERENCE_OPTIONS = [
  { key: 'system', label: 'Auto' },
  { key: 'full', label: 'Full' },
  { key: 'reduced', label: 'Reduced' },
  { key: 'off', label: 'Off' },
];

export const DEFAULT_MOTION_PREFERENCE_KEY = 'system';

/** The attribute on <html> that index.css keys its reduced/off rules on. */
export const MOTION_ATTRIBUTE = 'data-motion';

const VALID_MODES = new Set(Object.values(MOTION_MODES));

export const isMotionMode = (value) => VALID_MODES.has(value);

export const normalizeMotionPreferenceKey = (value) => {
  const key = String(value ?? '')
    .trim()
    .toLowerCase();
  return MOTION_PREFERENCE_OPTIONS.some((option) => option.key === key)
    ? key
    : DEFAULT_MOTION_PREFERENCE_KEY;
};

/**
 * Preference + the device's Reduce Motion flag -> the mode the app runs on.
 * Anything unrecognised is treated as `system`.
 */
export const resolveMotionMode = (
  preferenceKey,
  deviceRequestsReducedMotion = false
) => {
  const key = normalizeMotionPreferenceKey(preferenceKey);
  if (key === 'system') {
    return deviceRequestsReducedMotion
      ? MOTION_MODES.REDUCED
      : MOTION_MODES.FULL;
  }
  return key;
};
