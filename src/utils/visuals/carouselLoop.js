/**
 * Pure carousel-loop math for the five-screen swipe shell.
 *
 * The shell renders every screen exactly once (no clones) and positions each
 * slide with its own wrapped transform:
 *
 *   offset_i(position) = wrapIntoHalf(i + 1 - position)   // slide units
 *   transform_i        = translateX(calc((offset_i - i) * 100% + PEEK px))
 *
 * The flex layout already places slide `i` at `i * slideWidth`, so subtracting
 * `i` (in slide widths) and adding the 16px peek put the slide's left edge at
 * `16 + offset_i * slideWidth` — the same peek geometry the old single-track
 * transform produced, but valid for any (unbounded) `position`.
 *
 * `offset_i` is periodic in `position` with period `screenCount`, so
 * normalizing a wrapped position (6 -> 1, 0 -> 5) writes byte-identical
 * transforms: wrapping is free — no cloned slides, no timers, no visual jump.
 * A slide "teleports" by ±screenCount exactly when it crosses ±N/2 slide units,
 * i.e. ~2 slides off-screen behind the clipped viewport, so the teleport can
 * never be seen (and there is no CSS transition to animate it).
 *
 * No React imports here on purpose: these helpers are unit-tested directly with
 * the Node test runner (tests/utils/carouselLoop.test.js).
 */

// Each slide is inset by this many px per side (see `.carousel-slide` in
// index.css) so neighbouring screens peek flush against the screen edge and get
// alpha-faded via the .slide-fade-* masks. Hard sync point with index.css.
export const SCREEN_EDGE_PEEK_PX = 16;

// Total horizontal inset of a slide box (left + right) — the slide stride is
// `viewportWidth - SLIDE_HORIZONTAL_INSET_PX`.
export const SLIDE_HORIZONTAL_INSET_PX = SCREEN_EDGE_PEEK_PX * 2;

// JavaScript settle duration. The swipe shell animates the carousel with rAF
// (never with a CSS transition) so that no stranded inline `transition: none`
// can ever make a programmatic navigation snap.
export const CAROUSEL_SETTLE_MS = 350;

// Same curve the shell used to hand to CSS (`cubic-bezier(0.22, 1, 0.36, 1)`).
const SETTLE_CURVE = { x1: 0.22, y1: 1, x2: 0.36, y2: 1 };

const mod = (value, modulus) => ((value % modulus) + modulus) % modulus;

const toScreenCount = (totalScreens) => {
  const count = Math.floor(Number(totalScreens));
  return Number.isFinite(count) && count > 0 ? count : 1;
};

const toFinite = (value, fallback) =>
  Number.isFinite(value) ? value : fallback;

// Normalizes -0 to 0 so a transform string can never read "-0" and strict
// equality checks on geometry stay meaningful.
const toPrecision = (value, digits = 4) => {
  const rounded = Number(value.toFixed(digits));
  return rounded === 0 ? 0 : rounded;
};

const bezierComponent = (t, p1, p2) => {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t;
};

const solveBezierT = (x, x1, x2) => {
  let t = x;

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const delta = bezierComponent(t, x1, x2) - x;
    if (Math.abs(delta) < 1e-6) {
      return t;
    }

    const derivative =
      3 * (1 - t) * (1 - t) * x1 +
      6 * (1 - t) * t * (x2 - x1) +
      3 * t * t * (1 - x2);

    if (Math.abs(derivative) < 1e-6) {
      break;
    }

    t -= delta / derivative;
  }

  let lower = 0;
  let upper = 1;
  t = x;

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const current = bezierComponent(t, x1, x2);
    if (Math.abs(current - x) < 1e-6) {
      break;
    }

    if (current < x) {
      lower = t;
    } else {
      upper = t;
    }

    t = (lower + upper) / 2;
  }

  return t;
};

/**
 * Wrap a slide offset into (-N/2, N/2] so it is always the representative the
 * viewport would actually draw. N=5: 3 -> -2, -3 -> 2, 2.5 -> 2.5.
 */
export const wrapSlideOffset = (offset, totalScreens) => {
  const count = toScreenCount(totalScreens);
  if (count <= 1) {
    return 0;
  }

  const half = count / 2;
  return half - mod(half - toFinite(offset, 0), count);
};

/**
 * Per-slide wrapped offsets for a continuous carousel position. At rest for
 * screen `s` the position is `s + 1`, which puts offset 0 on slide `s`.
 */
export const resolveSlideOffsets = (position, totalScreens) => {
  const count = toScreenCount(totalScreens);
  const safePosition = toFinite(position, 1);

  return Array.from({ length: count }, (_, index) =>
    wrapSlideOffset(index + 1 - safePosition, count)
  );
};

/**
 * Unitless multiplier for `translateX(calc(factor * 100% + 16px))`. The 100%
 * resolves against the slide's own box width (viewport - 32px), which keeps the
 * geometry exact across resizes without any px measurement.
 */
export const slideTransformFactor = (offset, slideIndex) =>
  toPrecision(toFinite(offset, 0) - toFinite(slideIndex, 0));

export const buildSlideTransform = (offset, slideIndex) =>
  `translateX(calc(${slideTransformFactor(offset, slideIndex)} * 100% + ${SCREEN_EDGE_PEEK_PX}px))`;

/** Slide stride in px (slide box width) for converting drag px into slide units. */
export const resolveCarouselStride = (viewportWidth) => {
  const width = Number(viewportWidth);
  return Number.isFinite(width) && width > SLIDE_HORIZONTAL_INSET_PX
    ? width - SLIDE_HORIZONTAL_INSET_PX
    : 1;
};

/**
 * Collapse a wrapped carousel position (e.g. 6 or 0) onto the canonical
 * `screen + 1` position. Transform values are periodic, so callers may rewrite
 * the transforms from the normalized value with zero visual change.
 */
export const normalizePosition = (position, totalScreens) => {
  const count = toScreenCount(totalScreens);
  const rounded = Math.round(toFinite(position, 1));
  const screenIndex = mod(rounded - 1, count);

  return { position: screenIndex + 1, screenIndex };
};

/**
 * Express `position` in the period nearest to `reference`. A live position can
 * sit outside [1, N] (mid-wrap, e.g. 6.2); its nearest rest position must be
 * brought into the same period (6) so a settle animates the short way.
 */
export const alignPositionToReference = (position, reference, totalScreens) => {
  const count = toScreenCount(totalScreens);
  const safeReference = toFinite(reference, 1);
  // Rounded to kill float noise: aligning an integer position always lands on an
  // integer (position shifted by whole periods), so `6.000000000000001` must not
  // leak into a transform string.
  return toPrecision(
    safeReference + wrapSlideOffset(position - safeReference, count)
  );
};

/**
 * Decide where a released drag should settle.
 *
 * - below the threshold   -> snap back to the drag's rest screen
 * - past the threshold    -> exactly one screen in the drag direction
 * - a full slide or more  -> `Math.round(position)` (multi-screen drags land
 *   where the finger left them; the loop has no ends to clamp against)
 *
 * `targetPosition` stays in the caller's period (no clamping, no wrapping) so
 * the settle animation is always the short way; `screenIndex` is the normalized
 * screen the target maps onto.
 */
export const resolveSettleTarget = ({
  position,
  restPosition,
  thresholdSlides = 0.5,
  totalScreens,
}) => {
  const count = toScreenCount(totalScreens);
  const rest = toFinite(restPosition, 1);
  const live = toFinite(position, rest);
  const dragSlides = live - rest;
  const absSlides = Math.abs(dragSlides);
  const safeThreshold = Math.max(toFinite(thresholdSlides, 0.5), 0);

  let targetPosition = Math.round(live);

  if (absSlides < 1) {
    targetPosition =
      absSlides >= safeThreshold ? rest + (dragSlides >= 0 ? 1 : -1) : rest;
  }

  return {
    targetPosition,
    screenIndex: normalizePosition(targetPosition, count).screenIndex,
  };
};

/**
 * Shortest signed screen delta (in screens) between two tabs, so a tab tap
 * always travels the wrapped way around (4 -> 0 goes forward one screen, not
 * backward four).
 */
export const resolveShortestScreenDelta = (
  currentScreen,
  targetScreen,
  totalScreens
) => {
  const count = toScreenCount(totalScreens);
  if (count <= 1) {
    return 0;
  }

  const from = mod(Math.round(toFinite(currentScreen, 0)), count);
  const to = mod(Math.round(toFinite(targetScreen, 0)), count);
  const half = count / 2;

  return half - mod(half - (to - from), count);
};

/**
 * Edge alpha-fade side for a slide: the wrapped next screen peeks in from the
 * right (fade its LEFT edge), the wrapped previous screen peeks in from the
 * left (fade its RIGHT edge).
 */
export const getLoopSlideFadeSide = (index, currentScreen, totalScreens) => {
  const count = toScreenCount(totalScreens);
  if (count <= 1) {
    return '';
  }

  const slideIndex = mod(Math.round(toFinite(index, 0)), count);
  const activeIndex = mod(Math.round(toFinite(currentScreen, 0)), count);

  if (slideIndex === mod(activeIndex + 1, count)) {
    return 'left';
  }

  if (slideIndex === mod(activeIndex - 1, count)) {
    return 'right';
  }

  return '';
};

/** cubic-bezier(0.22, 1, 0.36, 1) evaluated in JS. */
export const carouselEase = (progress) => {
  const clamped = Math.min(Math.max(toFinite(progress, 1), 0), 1);
  if (clamped === 0 || clamped === 1) {
    return clamped;
  }

  const t = solveBezierT(clamped, SETTLE_CURVE.x1, SETTLE_CURVE.x2);
  return bezierComponent(t, SETTLE_CURVE.y1, SETTLE_CURVE.y2);
};
