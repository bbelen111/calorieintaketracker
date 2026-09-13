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
 * transform produced, but valid for any (unbounded) `position`. The percentage
 * resolves against the slide's own box width, which IS the stride, so the
 * geometry needs no measurement and self-corrects on every resize.
 *
 * `offset_i` is periodic in `position` with period `screenCount`, so
 * normalizing a wrapped position (6 -> 1, 0 -> 5) writes byte-identical
 * transforms: wrapping is free — no cloned slides, no timers, no visual jump.
 * A slide "teleports" by ±screenCount exactly when it crosses ±N/2 slide units,
 * i.e. ~2 slides off-screen behind the clipped viewport; `isSlideTeleport` tells
 * the writer to drop that slide's transition so the jump stays invisible.
 *
 * No React imports here on purpose: these helpers are unit-tested directly with
 * the Node test runner (tests/utils/carouselLoop.test.js).
 */

// Each slide is inset by this many px per side (see `.carousel-slide` in
// index.css) so neighbouring screens peek flush against the screen edge, where
// their leading edge alpha ramp (`--slide-fade-left/right`) fades them out.
// Hard sync point with index.css.
export const SCREEN_EDGE_PEEK_PX = 16;

// Total horizontal inset of a slide box (left + right) — the slide stride is
// `viewportWidth - SLIDE_HORIZONTAL_INSET_PX`.
export const SLIDE_HORIZONTAL_INSET_PX = SCREEN_EDGE_PEEK_PX * 2;

// Width of a slide's leading/trailing alpha ramp. The ramp is *permanent* in
// CSS and its position is driven by a per-slide strength (0 = parked fully
// outside the slide, 1 = sitting on the edge = the resting peek look), because a
// mask cannot be transitioned as a class — toggling `.slide-fade-*` mid-flight
// is what made the peek fades pop. Hard sync point with `.carousel-slide` in
// index.css.
export const SLIDE_FADE_WINDOW_PX = 20;

// Ring copies rendered per drag-linked affordance (tab-bar pill, header dot).
// Every copy reads the SAME live position variable and adds its own static
// `copy * screenCount` offset, so a loop-seam crossing glides one copy out of
// one end of the track (clipped) while the next enters the other end: the
// indicator continues and re-appears instead of jumping back across the track.
// Three copies cover a ~±5 screen window — far more than any drag can reach —
// and the wrapped copies are always the same distance apart as the track, so
// normalizing a wrap leaves the rendered *set* byte-identical.
export const RING_COPY_OFFSETS = [-1, 0, 1];

// Settle duration. The shell hands settles to CSS (`SLIDE_SETTLE_TRANSITION`)
// so the animation runs on the compositor thread instead of a main-thread rAF
// loop — on a 120Hz panel a JS-driven settle is exposed to every React render,
// style recalc and paint. The duration/curve are also used arithmetically to
// predict an interrupted settle's live position (resolveSettlePositionAt).
export const CAROUSEL_SETTLE_MS = 350;

// The exact CSS transition handed to the slides on animated (settle) writes. It
// is always written together with the transform, so no code path can strand a
// `transition: none` (which used to make the next tab tap snap).
export const SLIDE_SETTLE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const SLIDE_SETTLE_TRANSITION = `transform ${CAROUSEL_SETTLE_MS}ms ${SLIDE_SETTLE_EASING}`;

// Animated write set: the edge-fade ramp rides the *same* duration and curve as
// the transform, so the two interpolate on one clock (lockstep by construction,
// with no per-frame JS keeping them in sync). Instant writes use `none`.
export const SLIDE_SETTLE_TRANSITION_SET = `${SLIDE_SETTLE_TRANSITION}, mask-position ${CAROUSEL_SETTLE_MS}ms ${SLIDE_SETTLE_EASING}`;

// Per-slide edge-fade strengths, written imperatively by the shell as unitless
// numbers and consumed by `.carousel-slide`'s mask geometry in index.css.
export const SLIDE_FADE_LEFT_VAR = '--slide-fade-left';
export const SLIDE_FADE_RIGHT_VAR = '--slide-fade-right';

// Drag-linked affordances (tab-bar circle, header dots) read the live carousel
// position from these root variables. The shell also owns their *duration* so it
// can let them follow the finger with no transition, glide them in lockstep with
// the slides on a settle, and swap them instantly when a settle crosses the loop
// seam (animating that jump would sweep the pill backwards across every tab).
export const SCREEN_DRAG_PROGRESS_VAR = '--screen-drag-progress';
export const SCREEN_DRAG_DURATION_VAR = '--screen-drag-duration';
export const SCREEN_DRAG_DURATION_ANIMATED = `${CAROUSEL_SETTLE_MS}ms`;
export const SCREEN_DRAG_DURATION_INSTANT = '0s';

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
 * Unitless multiplier for the wrapped transform: the slide's offset from its own
 * flex slot, in slide widths (negative = shifted left).
 */
export const slideTransformFactor = (offset, slideIndex) =>
  toPrecision(toFinite(offset, 0) - toFinite(slideIndex, 0));

/**
 * `translateX` write for a slide. The percentage resolves against the slide's
 * own box width (viewport − 32px), which IS the carousel stride, so the geometry
 * is exact at every viewport size with **no measurement at all**: a resize
 * self-corrects and a stale/absent viewport width can never mis-position a
 * slide. The px term is the peek inset (hard sync point with index.css).
 */
export const buildSlideTransform = (offset, slideIndex) =>
  `translateX(calc(${slideTransformFactor(offset, slideIndex)} * 100% + ${SCREEN_EDGE_PEEK_PX}px))`;

/**
 * True when a slide's offset jumped by more than half the loop: it teleported to
 * the opposite side of the ring (~2+ screens off-screen behind the clipped
 * viewport). Animated writes must drop that slide's transition, or the teleport
 * would sweep across the visible area. Unknown/initial offsets never teleport.
 */
export const isSlideTeleport = (previousOffset, nextOffset, totalScreens) => {
  const count = toScreenCount(totalScreens);
  if (count <= 1) {
    return false;
  }

  const previous = toFinite(previousOffset, Number.NaN);
  const next = toFinite(nextOffset, Number.NaN);
  if (!Number.isFinite(previous) || !Number.isFinite(next)) {
    return false;
  }

  return Math.abs(next - previous) > count / 2;
};

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
 * Alpha-ramp strengths for a slide's two edges, from its wrapped offset.
 *
 * A slide is "arriving" from the right when its offset is positive: its leading
 * (left) edge is the peek edge and gets the ramp. Negative offsets mirror that on
 * the trailing (right) edge. The `|offset|` ramp is what makes the fade
 * continuous: it is 1 at a full neighbour (the resting peek look), 0 once the
 * slide owns the screen, and everything in between while it glides — so the ramp
 * retracts smoothly instead of being toggled as a class and popping.
 */
export const resolveSlideFadeStrengths = (offset) => {
  const safeOffset = toFinite(offset, 0);

  return {
    left: toPrecision(Math.min(Math.max(safeOffset, 0), 1)),
    right: toPrecision(Math.min(Math.max(-safeOffset, 0), 1)),
  };
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

/**
 * Live carousel position part-way through a settle.
 *
 * The settle runs as a CSS transition, so the shell cannot observe its frames.
 * Because that transition uses the exact same duration and curve as this helper,
 * an interrupted settle (a finger grabbing the carousel, a tab tap mid-flight)
 * can be picked up from the position actually on screen — no `getComputedStyle`,
 * no layout read, no per-frame rAF loop.
 */
export const resolveSettlePositionAt = ({
  fromPosition,
  toPosition,
  startedAt,
  now,
  durationMs = CAROUSEL_SETTLE_MS,
}) => {
  const from = toFinite(fromPosition, 1);
  const to = toFinite(toPosition, from);
  const duration = toFinite(durationMs, CAROUSEL_SETTLE_MS);
  const elapsed = toFinite(now, 0) - toFinite(startedAt, 0);
  const progress =
    duration > 0 ? Math.min(Math.max(elapsed / duration, 0), 1) : 1;

  return from + (to - from) * carouselEase(progress);
};
