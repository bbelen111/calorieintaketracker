import React from 'react';
import { Utensils } from 'lucide-react';

// The pill is one of the hero buttons (`bg-primary`, `rounded-lg`, `px-4 py-2`,
// semibold, a 20px icon) with a progress outline on top, so it hugs its content
// and occupies exactly their box. That box must be *derived* the way theirs is,
// never a fixed rem height: the root font is 13.5px mobile / 17px desktop, and
// the siblings measure 33.5px / 42.5px because their height is `py-2` +
// max(icon 20px, label line box) — `h-9` (2.25rem) came out 3.4px short and
// `h-10` (2.5rem) 0.25px over. `leading-none md:leading-normal` keeps this
// pill's line box under the icon on phones (where the siblings hide their label,
// so their content is icon-driven) and equal to it on desktop, which lands on
// 33.5px / 42.5px — measured identical to them at both breakpoints.
//
// The outline is drawn in a *reference* viewBox and stretched to whatever the
// button measures (`preserveAspectRatio="none"`), so the rim can never drift from
// the fill's shape at any width; `non-scaling-stroke` keeps the stroke exactly
// `OUTLINE_STROKE_PX`.
const OUTLINE_REF_WIDTH_PX = 132;
const OUTLINE_HEIGHT_PX = 36;
const OUTLINE_RADIUS_PX = 8; // matches `rounded-lg`, i.e. the hero buttons
const OUTLINE_INSET_PX = 1.5;
const OUTLINE_STROKE_PX = 2;
// Deliberately no track: a rim reads as a dark border and made the fill look
// like a different blue than the sibling hero buttons, so at rest (0 %) the
// button stays flat and the outline only appears once there is progress.
const PROGRESS_STROKE = 'rgb(var(--accent-green) / 1)';
// Half the strength of `StepTrackerModal.getBarGlow`, which the tracker charts
// use for full-size bars rather than a 36px control.
const PROGRESS_GLOW = 'drop-shadow(0 0 2px rgb(var(--accent-green) / 0.35))';

/**
 * Share of the day's calorie goal already logged, clamped to 0–100.
 *
 * Over-goal and goal-reached states are intentionally not designed yet: today
 * anything past the goal just clamps to a full outline. Their branch point
 * belongs here (shaped like `StepTrackerModal`'s `getBarColor`), so this stays
 * a presentational component. A missing/invalid goal means "no progress", never
 * a division artifact.
 */
export const getCalorieProgressPercent = (consumed, goal) => {
  const goalValue = Number(goal);
  const consumedValue = Number(consumed);

  if (!Number.isFinite(goalValue) || goalValue <= 0) {
    return 0;
  }

  if (!Number.isFinite(consumedValue) || consumedValue <= 0) {
    return 0;
  }

  return Math.min(100, (consumedValue / goalValue) * 100);
};

/**
 * Today's calorie intake as one tappable control: the `consumed / goal kcal`
 * readout and the add-meal action in a single tap target.
 *
 * It is a *sibling* of the other screens' hero buttons, not a lookalike: same
 * `bg-primary` fill, `rounded-lg`, 36px height, semibold label, flat (no shadow,
 * no rim) and the same press/hover behaviour — it just carries a number and a
 * progress outline. It hugs its content, so a long number widens it instead of
 * clipping. `shrink-0` matters: the hero title row must wrap the pill rather
 * than squeeze it, because a squeezed box used to letterbox the fixed-viewBox
 * outline inside the fill (that was the "the rim doesn't match the button on
 * small screens" bug).
 *
 * The outline is an SVG overlay (a partial *rounded* border cannot be drawn with
 * CSS) drawn in a reference viewBox and stretched to the button's box via
 * `preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"`, so the rim
 * tracks the fill at any width while the stroke stays exactly 2px. Its palette
 * mirrors the tracker charts (`StepTrackerModal.getBarColor` / `getBarGlow`
 * shapes). It is fully transparent until there is progress, so at rest the
 * button is indistinguishable from its siblings.
 */
export const CalorieProgressPill = ({ consumed = 0, goal = null, onPress }) => {
  const consumedCalories = Math.max(0, Math.round(Number(consumed) || 0));
  const hasGoal = Number.isFinite(Number(goal)) && Number(goal) > 0;
  const goalCalories = hasGoal ? Math.round(Number(goal)) : null;
  const progressPercent = getCalorieProgressPercent(
    consumedCalories,
    goalCalories
  );
  // `pathLength="100"` gives the dash 100 units of resolution, so anything past
  // two decimals is meaningless (and would thrash the attribute on every gram).
  const dashValue = Math.round(progressPercent * 100) / 100;
  const goalLabel = goalCalories != null ? goalCalories.toLocaleString() : '—';
  const showProgress = dashValue > 0;

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={
        goalCalories != null
          ? `Add meal, ${consumedCalories} of ${goalCalories} kcal`
          : 'Add meal'
      }
      className="relative inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-all press-feedback focus-ring md:hover:brightness-110"
    >
      {/* Decorative overlay. It is fully transparent until there is progress, so
          at rest this button is flat and identical to its sibling hero buttons
          (and there is no stray round-cap dot at 0 %). It stretches to this
          button's own box so the rim always matches the fill, and
          `overflow: visible` keeps the stroke's glow from being clipped. */}
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${OUTLINE_REF_WIDTH_PX} ${OUTLINE_HEIGHT_PX}`}
        preserveAspectRatio="none"
        pointerEvents="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ overflow: 'visible' }}
      >
        <rect
          x={OUTLINE_INSET_PX}
          y={OUTLINE_INSET_PX}
          width={OUTLINE_REF_WIDTH_PX - OUTLINE_INSET_PX * 2}
          height={OUTLINE_HEIGHT_PX - OUTLINE_INSET_PX * 2}
          rx={OUTLINE_RADIUS_PX - OUTLINE_INSET_PX}
          fill="none"
          strokeWidth={OUTLINE_STROKE_PX}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${dashValue} 100`}
          stroke={PROGRESS_STROKE}
          strokeOpacity={showProgress ? 1 : 0}
          style={{
            filter: PROGRESS_GLOW,
            transition: 'stroke-dasharray 0.4s ease, stroke-opacity 0.2s ease',
          }}
        />
      </svg>
      <Utensils size={20} className="shrink-0" />
      <span className="tabular-nums leading-none md:leading-normal">
        {consumedCalories.toLocaleString()} / {goalLabel}{' '}
        <span className="text-[0.9em] opacity-85">kcal</span>
      </span>
    </button>
  );
};

CalorieProgressPill.displayName = 'CalorieProgressPill';
