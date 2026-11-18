// Text size and density: the two user-facing display-scale settings.
//
// Both are applied as CSS custom properties on <html> and consumed by index.css,
// never as per-component styling:
//
//  - `--font-scale` multiplies the `--text-*` tokens (and the fixed-px text
//    sizes), so it scales TEXT ONLY - layout does not grow with it.
//  - `--density` multiplies Tailwind v4's single `--spacing` unit, which every
//    numeric spacing/size utility (`p-4`, `gap-2`, `h-10`, `w-11`...) derives from,
//    so it tightens or loosens the whole layout in one move without touching text.
//
// The persisted value is the option KEY, not the number: a key can be validated
// and remapped later, a stored multiplier cannot.

export const FONT_SCALE_OPTIONS = [
  { key: 'small', label: 'Small', scale: 0.9 },
  { key: 'default', label: 'Default', scale: 1 },
  { key: 'large', label: 'Large', scale: 1.12 },
  { key: 'xlarge', label: 'Largest', scale: 1.25 },
];

export const DENSITY_OPTIONS = [
  { key: 'compact', label: 'Compact', scale: 0.88 },
  { key: 'default', label: 'Default', scale: 1 },
  { key: 'comfortable', label: 'Comfortable', scale: 1.12 },
];

export const DEFAULT_FONT_SCALE_KEY = 'default';
export const DEFAULT_UI_DENSITY_KEY = 'default';

export const FONT_SCALE_CSS_VAR = '--font-scale';
export const UI_DENSITY_CSS_VAR = '--density';

const normalizeKey = (value, options, fallback) => {
  const key = String(value ?? '')
    .trim()
    .toLowerCase();
  return options.some((option) => option.key === key) ? key : fallback;
};

export const normalizeFontScaleKey = (value) =>
  normalizeKey(value, FONT_SCALE_OPTIONS, DEFAULT_FONT_SCALE_KEY);

export const normalizeUiDensityKey = (value) =>
  normalizeKey(value, DENSITY_OPTIONS, DEFAULT_UI_DENSITY_KEY);

const resolveScale = (key, options, fallbackKey) => {
  const option =
    options.find((candidate) => candidate.key === key) ??
    options.find((candidate) => candidate.key === fallbackKey);
  return option.scale;
};

/** The multiplier for a (possibly invalid) font-scale key; never throws. */
export const resolveFontScale = (key) =>
  resolveScale(
    normalizeFontScaleKey(key),
    FONT_SCALE_OPTIONS,
    DEFAULT_FONT_SCALE_KEY
  );

/** The multiplier for a (possibly invalid) density key; never throws. */
export const resolveUiDensity = (key) =>
  resolveScale(
    normalizeUiDensityKey(key),
    DENSITY_OPTIONS,
    DEFAULT_UI_DENSITY_KEY
  );

/** Publish both scales on the root element (see index.css for the consumers). */
export const applyUiScale = ({ fontScale, uiDensity }, root) => {
  if (!root?.style) {
    return;
  }
  root.style.setProperty(
    FONT_SCALE_CSS_VAR,
    String(resolveFontScale(fontScale))
  );
  root.style.setProperty(
    UI_DENSITY_CSS_VAR,
    String(resolveUiDensity(uiDensity))
  );
};
