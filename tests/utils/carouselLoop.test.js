import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAROUSEL_SETTLE_MS,
  RING_COPY_OFFSETS,
  SCREEN_DRAG_DURATION_ANIMATED,
  SCREEN_DRAG_DURATION_INSTANT,
  SCREEN_DRAG_DURATION_VAR,
  SCREEN_DRAG_PROGRESS_VAR,
  SCREEN_EDGE_PEEK_PX,
  SLIDE_FADE_LEFT_VAR,
  SLIDE_FADE_RIGHT_VAR,
  SLIDE_FADE_WINDOW_PX,
  SLIDE_HORIZONTAL_INSET_PX,
  SLIDE_SETTLE_EASING,
  SLIDE_SETTLE_TRANSITION,
  SLIDE_SETTLE_TRANSITION_SET,
  alignPositionToReference,
  buildSlideTransform,
  carouselEase,
  isSlideTeleport,
  normalizePosition,
  resolveCarouselStride,
  resolveSettlePositionAt,
  resolveSettleTarget,
  resolveShortestScreenDelta,
  resolveSlideFadeStrengths,
  resolveSlideOffsets,
  slideTransformFactor,
  wrapSlideOffset,
} from '../../src/utils/visuals/carouselLoop.js';

const SCREEN_COUNT = 5;
const VIEWPORT_WIDTH = 390;
const STRIDE = resolveCarouselStride(VIEWPORT_WIDTH);

test('wrapSlideOffset wraps into (-N/2, N/2]', () => {
  assert.equal(wrapSlideOffset(0, SCREEN_COUNT), 0);
  assert.equal(wrapSlideOffset(2, SCREEN_COUNT), 2);
  assert.equal(wrapSlideOffset(2.5, SCREEN_COUNT), 2.5);
  assert.equal(wrapSlideOffset(3, SCREEN_COUNT), -2);
  assert.equal(wrapSlideOffset(-3, SCREEN_COUNT), 2);
  assert.equal(wrapSlideOffset(-2.5, SCREEN_COUNT), 2.5);
  assert.equal(wrapSlideOffset(-1, SCREEN_COUNT), -1);
});

test('wrapSlideOffset tolerates invalid input and single-screen shells', () => {
  assert.equal(wrapSlideOffset(Number.NaN, SCREEN_COUNT), 0);
  assert.equal(wrapSlideOffset(3, 1), 0);
  assert.equal(wrapSlideOffset(3, 0), 0);
});

test('resolveSlideOffsets centers the screen owning position s + 1', () => {
  for (let screen = 0; screen < SCREEN_COUNT; screen += 1) {
    const offsets = resolveSlideOffsets(screen + 1, SCREEN_COUNT);

    assert.equal(offsets.length, SCREEN_COUNT);
    assert.equal(offsets[screen], 0, `screen ${screen} must be centered`);
    assert.equal(
      offsets[(screen + 1) % SCREEN_COUNT],
      1,
      `screen ${screen} next neighbour peeks from the right`
    );
    assert.equal(
      offsets[(screen - 1 + SCREEN_COUNT) % SCREEN_COUNT],
      -1,
      `screen ${screen} previous neighbour peeks from the left`
    );
  }
});

test('resolveSlideOffsets is periodic: p and p +/- N are pixel-identical', () => {
  const base = resolveSlideOffsets(1, SCREEN_COUNT);

  assert.deepEqual(resolveSlideOffsets(1 + SCREEN_COUNT, SCREEN_COUNT), base);
  assert.deepEqual(resolveSlideOffsets(1 - SCREEN_COUNT, SCREEN_COUNT), base);
  // Wrap positions normalize onto the same visual state.
  assert.deepEqual(
    resolveSlideOffsets(SCREEN_COUNT + 1, SCREEN_COUNT),
    resolveSlideOffsets(1, SCREEN_COUNT)
  );
  assert.deepEqual(
    resolveSlideOffsets(0, SCREEN_COUNT),
    resolveSlideOffsets(SCREEN_COUNT, SCREEN_COUNT)
  );
});

test('dragging reveals the wrapped neighbour from the correct side', () => {
  // On screen 0 dragging right (position 1 -> 0.6) reveals the last screen.
  const backwardDrag = resolveSlideOffsets(0.6, SCREEN_COUNT);
  assert.ok(
    backwardDrag[SCREEN_COUNT - 1] < 0 && backwardDrag[SCREEN_COUNT - 1] > -1,
    'previous screen slides in from the left'
  );
  assert.ok(
    backwardDrag[0] > 0 && backwardDrag[0] < 1,
    'current screen is pushed to the right'
  );

  // On the last screen dragging left (position 5 -> 5.4) reveals screen 0.
  const forwardDrag = resolveSlideOffsets(SCREEN_COUNT + 0.4, SCREEN_COUNT);
  assert.ok(
    forwardDrag[0] > 0 && forwardDrag[0] < 1,
    'wrapped next screen slides in from the right'
  );
  assert.ok(
    forwardDrag[SCREEN_COUNT - 1] < 0 && forwardDrag[SCREEN_COUNT - 1] > -1,
    'current screen is pushed to the left'
  );
});

test('slide transforms cancel the flex layout offset and add the peek inset', () => {
  const offsets = resolveSlideOffsets(3, SCREEN_COUNT);

  for (let index = 0; index < SCREEN_COUNT; index += 1) {
    const factor = slideTransformFactor(offsets[index], index);
    const onScreenLeftEdge =
      index * STRIDE + factor * STRIDE + SCREEN_EDGE_PEEK_PX;

    assert.equal(
      factor,
      offsets[index] - index,
      `slide ${index} unitless factor`
    );
    assert.equal(
      onScreenLeftEdge,
      SCREEN_EDGE_PEEK_PX + offsets[index] * STRIDE,
      `slide ${index} left edge geometry`
    );
  }

  // The write is percentage-based: the browser resolves `100%` against the slide
  // box (which IS the stride), so no viewport measurement is involved and a
  // stale/absent width can never mis-position a slide.
  assert.equal(
    buildSlideTransform(offsets[2], 2),
    `translateX(calc(-2 * 100% + ${SCREEN_EDGE_PEEK_PX}px))`
  );
  assert.equal(
    buildSlideTransform(0, 0),
    `translateX(calc(0 * 100% + ${SCREEN_EDGE_PEEK_PX}px))`
  );
  assert.equal(
    buildSlideTransform(1, 0),
    `translateX(calc(1 * 100% + ${SCREEN_EDGE_PEEK_PX}px))`
  );
});

test('slide transforms are stride-agnostic at every viewport size', () => {
  const offsets = resolveSlideOffsets(2, SCREEN_COUNT);

  for (const viewportWidth of [320, 390, 768, 1440]) {
    const stride = resolveCarouselStride(viewportWidth);

    for (let index = 0; index < SCREEN_COUNT; index += 1) {
      assert.equal(
        index * stride +
          slideTransformFactor(offsets[index], index) * stride +
          SCREEN_EDGE_PEEK_PX,
        SCREEN_EDGE_PEEK_PX + offsets[index] * stride,
        `slide ${index} left edge geometry at ${viewportWidth}px`
      );
    }
  }

  // No px in the lateral term: the stride lives in the `100%`, not in the string.
  assert.ok(buildSlideTransform(1, 0).startsWith('translateX(calc('));
  assert.ok(buildSlideTransform(1, 0).includes('* 100%'));
});

test('isSlideTeleport only flags the off-screen ring jump', () => {
  // Crossing the ring seam swaps a slide's representative by ~one loop (5
  // units): 2.5 -> -2.5. Any change past N/2 can only come from that wrap.
  assert.equal(isSlideTeleport(2.5, -2.5, SCREEN_COUNT), true);
  assert.equal(isSlideTeleport(-2.5, 2.5, SCREEN_COUNT), true);
  assert.equal(isSlideTeleport(2, -2, SCREEN_COUNT), true);
  // Continuous motion never teleports, including multi-screen drags.
  assert.equal(isSlideTeleport(1.2, -1.2, SCREEN_COUNT), false);
  assert.equal(isSlideTeleport(1, -1, SCREEN_COUNT), false);
  assert.equal(isSlideTeleport(0, 1, SCREEN_COUNT), false);
  assert.equal(isSlideTeleport(0.2, 0.9, SCREEN_COUNT), false);
  assert.equal(isSlideTeleport(-2, 0, SCREEN_COUNT), false);
  // Unknown / initial offsets and degenerate shells never teleport.
  assert.equal(isSlideTeleport(undefined, 1, SCREEN_COUNT), false);
  assert.equal(isSlideTeleport(Number.NaN, 1, SCREEN_COUNT), false);
  assert.equal(isSlideTeleport(0, 1, 1), false);
});

test('resolveSettlePositionAt reproduces the CSS transition clock', () => {
  const settle = {
    fromPosition: 3,
    toPosition: 4,
    startedAt: 1_000,
  };

  assert.equal(
    resolveSettlePositionAt({ ...settle, now: 1_000 }),
    3,
    'starts exactly at the frozen position'
  );
  assert.equal(
    resolveSettlePositionAt({ ...settle, now: 1_000 + CAROUSEL_SETTLE_MS }),
    4,
    'ends exactly on the target'
  );
  assert.equal(
    resolveSettlePositionAt({
      ...settle,
      now: 1_000 + CAROUSEL_SETTLE_MS * 4,
    }),
    4,
    'clamps after the duration'
  );
  assert.equal(
    resolveSettlePositionAt({ ...settle, now: 500 }),
    3,
    'clamps before the start'
  );

  // Monotonic, and easing-consistent with the shared curve.
  let previous = 2;
  for (let step = 0; step <= 20; step += 1) {
    const value = resolveSettlePositionAt({
      ...settle,
      now: 1_000 + (CAROUSEL_SETTLE_MS * step) / 20,
    });
    assert.ok(value >= previous, 'interrupted position must be monotonic');
    previous = value;
  }
  assert.equal(
    resolveSettlePositionAt({ ...settle, now: 1_000 + CAROUSEL_SETTLE_MS / 2 }),
    3 + carouselEase(0.5),
    'same curve as the slides'
  );

  // Wrap settles interpolate in the live period (never the long way round).
  const wrapSettle = { fromPosition: 5.5, toPosition: 6, startedAt: 0 };
  assert.equal(
    resolveSettlePositionAt({ ...wrapSettle, now: CAROUSEL_SETTLE_MS }),
    6
  );

  // Degenerate input stays finite.
  assert.ok(
    Number.isFinite(resolveSettlePositionAt({ now: Number.NaN })),
    'invalid input must not produce NaN'
  );
});

test('the affordance contract is a single settle transition', () => {
  assert.equal(
    SLIDE_SETTLE_TRANSITION,
    `transform ${CAROUSEL_SETTLE_MS}ms ${SLIDE_SETTLE_EASING}`
  );
  // The edge-fade ramp rides the same duration + curve as the transform, so the
  // fade and the slide interpolate on one clock without per-frame JS.
  assert.equal(
    SLIDE_SETTLE_TRANSITION_SET,
    `${SLIDE_SETTLE_TRANSITION}, mask-position ${CAROUSEL_SETTLE_MS}ms ${SLIDE_SETTLE_EASING}`
  );
  assert.equal(SCREEN_DRAG_DURATION_ANIMATED, `${CAROUSEL_SETTLE_MS}ms`);
  // Instant is a 0-duration transition (valid in the shorthand) so a loop-seam
  // swap cannot animate backwards across the tab bar / dot row.
  assert.equal(SCREEN_DRAG_DURATION_INSTANT, '0s');
  assert.equal(SCREEN_DRAG_PROGRESS_VAR, '--screen-drag-progress');
  assert.equal(SCREEN_DRAG_DURATION_VAR, '--screen-drag-duration');
});

test('resolveCarouselStride subtracts the shared 32px slide inset', () => {
  assert.equal(SLIDE_HORIZONTAL_INSET_PX, 32);
  assert.equal(resolveCarouselStride(VIEWPORT_WIDTH), VIEWPORT_WIDTH - 32);
  assert.equal(resolveCarouselStride(0), 1);
  assert.equal(resolveCarouselStride(Number.NaN), 1);
});

test('normalizePosition folds wrapped positions onto screen + 1', () => {
  assert.deepEqual(normalizePosition(3, SCREEN_COUNT), {
    position: 3,
    screenIndex: 2,
  });
  assert.deepEqual(normalizePosition(SCREEN_COUNT + 1, SCREEN_COUNT), {
    position: 1,
    screenIndex: 0,
  });
  assert.deepEqual(normalizePosition(0, SCREEN_COUNT), {
    position: SCREEN_COUNT,
    screenIndex: SCREEN_COUNT - 1,
  });
  assert.deepEqual(normalizePosition(-1, SCREEN_COUNT), {
    position: SCREEN_COUNT - 1,
    screenIndex: SCREEN_COUNT - 2,
  });
});

test('resolveSettleTarget snaps back below the threshold', () => {
  const below = resolveSettleTarget({
    position: 3.2,
    restPosition: 3,
    thresholdSlides: 0.27,
    totalScreens: SCREEN_COUNT,
  });
  const atThreshold = resolveSettleTarget({
    position: 3.27,
    restPosition: 3,
    thresholdSlides: 0.27,
    totalScreens: SCREEN_COUNT,
  });

  assert.deepEqual(below, { targetPosition: 3, screenIndex: 2 });
  assert.deepEqual(atThreshold, { targetPosition: 4, screenIndex: 3 });
});

test('resolveSettleTarget moves one screen in the drag direction', () => {
  assert.deepEqual(
    resolveSettleTarget({
      position: 3.5,
      restPosition: 3,
      thresholdSlides: 0.27,
      totalScreens: SCREEN_COUNT,
    }),
    { targetPosition: 4, screenIndex: 3 }
  );
  assert.deepEqual(
    resolveSettleTarget({
      position: 2.6,
      restPosition: 3,
      thresholdSlides: 0.27,
      totalScreens: SCREEN_COUNT,
    }),
    { targetPosition: 2, screenIndex: 1 }
  );
});

test('resolveSettleTarget wraps at the loop seam instead of clamping', () => {
  assert.deepEqual(
    resolveSettleTarget({
      position: 0.3,
      restPosition: 1,
      thresholdSlides: 0.27,
      totalScreens: SCREEN_COUNT,
    }),
    { targetPosition: 0, screenIndex: SCREEN_COUNT - 1 }
  );
  assert.deepEqual(
    resolveSettleTarget({
      position: 5.6,
      restPosition: 5,
      thresholdSlides: 0.27,
      totalScreens: SCREEN_COUNT,
    }),
    { targetPosition: SCREEN_COUNT + 1, screenIndex: 0 }
  );
});

test('resolveSettleTarget rounds multi-slide drags to the nearest screen', () => {
  assert.deepEqual(
    resolveSettleTarget({
      position: 5.4,
      restPosition: 3,
      thresholdSlides: 0.27,
      totalScreens: SCREEN_COUNT,
    }),
    { targetPosition: 5, screenIndex: 4 }
  );
  assert.deepEqual(
    resolveSettleTarget({
      position: 7.8,
      restPosition: 3,
      thresholdSlides: 0.27,
      totalScreens: SCREEN_COUNT,
    }),
    { targetPosition: 8, screenIndex: 2 }
  );
});

test('resolveSettleTarget never walks the long way around the loop', () => {
  // Wrap settle interrupted mid-flight: live 6.2 (screen 0, one period over).
  const rest = alignPositionToReference(
    normalizePosition(6.2, SCREEN_COUNT).position,
    6.2,
    SCREEN_COUNT
  );
  const { targetPosition, screenIndex } = resolveSettleTarget({
    position: 6.9,
    restPosition: rest,
    thresholdSlides: 0.27,
    totalScreens: SCREEN_COUNT,
  });

  assert.equal(rest, 6);
  assert.equal(targetPosition, 7);
  assert.equal(screenIndex, 1);
  assert.ok(
    Math.abs(targetPosition - 6.2) <= 1,
    'settle must be the short way'
  );
});

test('alignPositionToReference keeps rests in the live position period', () => {
  assert.equal(alignPositionToReference(1, 6.2, SCREEN_COUNT), 6);
  assert.equal(alignPositionToReference(SCREEN_COUNT, 0.4, SCREEN_COUNT), 0);
  assert.equal(alignPositionToReference(3, 3.2, SCREEN_COUNT), 3);
  assert.equal(alignPositionToReference(1, 1, SCREEN_COUNT), 1);
  // 5 and 0 are the same screen; the helper picks the period nearer to the live
  // position (0 - one slide from 1) instead of walking the long way.
  assert.equal(alignPositionToReference(SCREEN_COUNT, 1, SCREEN_COUNT), 0);
  assert.equal(alignPositionToReference(6, 1, SCREEN_COUNT), 1);
});

test('resolveShortestScreenDelta takes the wrapped direction', () => {
  assert.equal(resolveShortestScreenDelta(4, 0, SCREEN_COUNT), 1);
  assert.equal(resolveShortestScreenDelta(0, 4, SCREEN_COUNT), -1);
  assert.equal(resolveShortestScreenDelta(0, 3, SCREEN_COUNT), -2);
  assert.equal(resolveShortestScreenDelta(3, 0, SCREEN_COUNT), 2);
  assert.equal(resolveShortestScreenDelta(1, 2, SCREEN_COUNT), 1);
  assert.equal(resolveShortestScreenDelta(2, 1, SCREEN_COUNT), -1);
  assert.equal(resolveShortestScreenDelta(2, 2, SCREEN_COUNT), 0);
  assert.equal(resolveShortestScreenDelta(3, 1, 1), 0);
});

test('resolveSlideFadeStrengths ramps the leading edge and never pops', () => {
  // Centred: no fade at all.
  assert.deepEqual(resolveSlideFadeStrengths(0), { left: 0, right: 0 });

  // A full neighbour keeps the resting peek look (ramp on the peek edge only).
  assert.deepEqual(resolveSlideFadeStrengths(1), { left: 1, right: 0 });
  assert.deepEqual(resolveSlideFadeStrengths(-1), { left: 0, right: 1 });

  // In between the ramp is partial — this continuity is what replaced the
  // class toggle that made the peeks pop.
  assert.deepEqual(resolveSlideFadeStrengths(0.5), { left: 0.5, right: 0 });
  assert.deepEqual(resolveSlideFadeStrengths(-0.25), { left: 0, right: 0.25 });

  // Off-screen slides clamp to a full ramp (harmless: they are clipped).
  assert.deepEqual(resolveSlideFadeStrengths(2), { left: 1, right: 0 });
  assert.deepEqual(resolveSlideFadeStrengths(-2.5), { left: 0, right: 1 });

  // Defensive input.
  assert.deepEqual(resolveSlideFadeStrengths(Number.NaN), {
    left: 0,
    right: 0,
  });
  assert.deepEqual(resolveSlideFadeStrengths('0.5'), { left: 0, right: 0 });
});

test('the fade ramp geometry is shared between CSS and the loop math', () => {
  assert.equal(SLIDE_FADE_WINDOW_PX, 20);
  assert.equal(SLIDE_FADE_LEFT_VAR, '--slide-fade-left');
  assert.equal(SLIDE_FADE_RIGHT_VAR, '--slide-fade-right');
});

test('ring affordances never leave the track empty across a wrap', () => {
  // Real mobile geometry: a 390px viewport, the bar's 2rem side paddings, the
  // 44px circle. The header dot ring uses the same factors on a smaller pitch.
  const BAR_WIDTH_PX = 336;
  const PILL_SIZE_PX = 44;
  const PITCH_PX = BAR_WIDTH_PX / SCREEN_COUNT;
  // The circle's resting `left` is `pitch / 2 - size / 2` (see ScreenTabs).
  const INSET_PX = PITCH_PX / 2 - PILL_SIZE_PX / 2;

  const factorToLeftPx = (factor) => INSET_PX + factor * PITCH_PX;
  const isCopyVisible = (factor) => {
    const left = factorToLeftPx(factor);
    return left + PILL_SIZE_PX > 0 && left < BAR_WIDTH_PX;
  };
  const copyFactors = (position) =>
    RING_COPY_OFFSETS.map((copy) => position - 1 + copy * SCREEN_COUNT);
  const visibleFactors = (position) =>
    copyFactors(position).filter(isCopyVisible);

  // Three copies, one full loop apart, all driven by the same position.
  assert.deepEqual(RING_COPY_OFFSETS, [-1, 0, 1]);

  // A drag can only reach ~±1.1 screens past the ends, and a settle at most two;
  // cover well beyond that.
  for (let position = -2; position <= 7.0001; position += 0.05) {
    assert.ok(
      visibleFactors(position).length > 0,
      `position ${position.toFixed(2)} leaves the bar without an indicator`
    );
  }
});

test('normalizing a wrap never moves the visible ring copy', () => {
  const BAR_WIDTH_PX = 336;
  const PILL_SIZE_PX = 44;
  const PITCH_PX = BAR_WIDTH_PX / SCREEN_COUNT;
  const INSET_PX = PITCH_PX / 2 - PILL_SIZE_PX / 2;

  const visibleFactors = (position) =>
    RING_COPY_OFFSETS.map((copy) => position - 1 + copy * SCREEN_COUNT).filter(
      (factor) => {
        const left = INSET_PX + factor * PITCH_PX;
        return left + PILL_SIZE_PX > 0 && left < BAR_WIDTH_PX;
      }
    );

  // A forward wrap settles to N+1 (e.g. 6) and normalizes to 1; a backward wrap
  // settles to 0 and normalizes to N. In both cases the copy that is *on the
  // track* keeps its exact factor — which is why landing the settle with an
  // instant write is invisible, while the copies that jump a whole loop are
  // clipped off-track. Only settled (integer) positions are compared: mid-settle
  // fractional positions are never normalized.
  for (const wrapped of [0, SCREEN_COUNT + 1, 1, SCREEN_COUNT, 2, -1]) {
    assert.deepEqual(
      visibleFactors(wrapped),
      visibleFactors(normalizePosition(wrapped, SCREEN_COUNT).position),
      `wrap at ${wrapped} moved the visible indicator`
    );
  }
});

test('wrap swipe releases loop in both directions and normalize invisibly', () => {
  const release = (restScreen, dragSlides) => {
    const restPosition = restScreen + 1;
    const position = restPosition + dragSlides;
    const { targetPosition, screenIndex } = resolveSettleTarget({
      position,
      restPosition,
      thresholdSlides: 0.27,
      totalScreens: SCREEN_COUNT,
    });

    return {
      position,
      targetPosition,
      screenIndex,
      normalized: normalizePosition(targetPosition, SCREEN_COUNT),
    };
  };

  // Swipe left off the last screen -> wraps forward onto screen 0.
  const forward = release(SCREEN_COUNT - 1, 0.4);
  assert.equal(forward.targetPosition, SCREEN_COUNT + 1);
  assert.equal(forward.screenIndex, 0);
  assert.deepEqual(forward.normalized, { position: 1, screenIndex: 0 });
  assert.ok(Math.abs(forward.targetPosition - forward.position) <= 1);
  assert.deepEqual(
    resolveSlideOffsets(forward.targetPosition, SCREEN_COUNT),
    resolveSlideOffsets(forward.normalized.position, SCREEN_COUNT)
  );

  // Swipe right off the first screen -> wraps backward onto the last screen.
  const backward = release(0, -0.4);
  assert.equal(backward.targetPosition, 0);
  assert.equal(backward.screenIndex, SCREEN_COUNT - 1);
  assert.deepEqual(backward.normalized, {
    position: SCREEN_COUNT,
    screenIndex: SCREEN_COUNT - 1,
  });
  assert.deepEqual(
    resolveSlideOffsets(backward.targetPosition, SCREEN_COUNT),
    resolveSlideOffsets(backward.normalized.position, SCREEN_COUNT)
  );

  // Rejected swipe glides back to the same screen (still pixel-identical).
  const rejected = release(0, -0.2);
  assert.equal(rejected.targetPosition, 1);
  assert.equal(rejected.screenIndex, 0);
});

test('tab navigation plans a short step from the live position', () => {
  const plan = (targetScreen, livePosition) => {
    const rest = normalizePosition(livePosition, SCREEN_COUNT);
    const delta = resolveShortestScreenDelta(
      rest.screenIndex,
      targetScreen,
      SCREEN_COUNT
    );

    return (
      alignPositionToReference(rest.position, livePosition, SCREEN_COUNT) +
      delta
    );
  };

  assert.equal(plan(0, SCREEN_COUNT), SCREEN_COUNT + 1); // 4 -> 0: forward one
  assert.equal(plan(SCREEN_COUNT - 1, 1), 0); // 0 -> 4: backward one
  assert.equal(plan(3, 1), -1); // 0 -> 3: two slides backward
  assert.equal(plan(3, 3), 4); // 2 -> 3: plain forward one
  assert.equal(plan(0, 6.2), 6); // mid-wrap tick completes at the same screen
  assert.equal(plan(1, 6.2), 7); // mid-wrap tick steps forward the short way
});

test('carouselEase is a monotonic cubic-bezier(0.22, 1, 0.36, 1)', () => {
  assert.equal(carouselEase(0), 0);
  assert.equal(carouselEase(1), 1);
  assert.equal(carouselEase(-1), 0);
  assert.equal(carouselEase(2), 1);

  let previous = -1;
  for (let step = 0; step <= 40; step += 1) {
    const value = carouselEase(step / 40);
    assert.ok(Number.isFinite(value), 'ease output must be finite');
    assert.ok(value >= previous, 'ease must be monotonic');
    assert.ok(value >= 0 && value <= 1, 'ease must stay in range');
    previous = value;
  }

  // Strong ease-out: most of the distance is covered early in the duration.
  assert.ok(carouselEase(0.5) > 0.75);
  assert.ok(CAROUSEL_SETTLE_MS > 0);
});
