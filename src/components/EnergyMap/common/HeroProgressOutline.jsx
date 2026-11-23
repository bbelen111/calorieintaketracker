import React from 'react';

// The progress rim shared by Home's hero readouts (the pill and the tiles).
//
// It is drawn in a *reference* viewBox and stretched to whatever the host
// measures (`preserveAspectRatio="none"`), so the rim can never drift from the
// host's own rounded shape at any width; `non-scaling-stroke` keeps the stroke
// exactly `OUTLINE_STROKE_PX`. Each host passes a reference box and radius close
// to its real size and corner (pill: 132x36 / 8 = `rounded-lg`; tile: 150x80 /
// 12 = `rounded-xl`), which keeps the stretch - and so the corner distortion -
// negligible.
//
// Deliberately no track: a rim reads as a dark border and made the pill look like
// a different blue than its sibling hero buttons, so at rest (0 %) the host stays
// flat and the outline only appears once there is progress.
const OUTLINE_INSET_PX = 1.5;
const OUTLINE_STROKE_PX = 2;
const PROGRESS_STROKE = 'rgb(var(--accent-green) / 1)';
// Half the strength of `StepTrackerModal.getBarGlow`, which the tracker charts
// use for full-size bars rather than a small control.
const PROGRESS_GLOW = 'drop-shadow(0 0 2px rgb(var(--accent-green) / 0.35))';

/**
 * @param {object} props
 * @param {number|null} props.progress 0-100, or `null`/invalid for no outline
 * @param {number} props.refWidth reference viewBox width (px)
 * @param {number} props.refHeight reference viewBox height (px)
 * @param {number} props.radius corner radius in the reference box (px)
 */
export const HeroProgressOutline = ({
  progress,
  refWidth,
  refHeight,
  radius,
}) => {
  const numeric = Number(progress);
  // `pathLength="100"` gives the dash 100 units of resolution, so anything past
  // two decimals is meaningless (and would thrash the attribute on every gram).
  const dashValue = Number.isFinite(numeric)
    ? Math.round(Math.min(100, Math.max(0, numeric)) * 100) / 100
    : 0;
  const showProgress = dashValue > 0;

  // Decorative overlay. It is fully transparent until there is progress, so at
  // rest the host is flat and identical to its siblings (and there is no stray
  // round-cap dot at 0 %). `overflow: visible` keeps the stroke's glow from
  // being clipped.
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${refWidth} ${refHeight}`}
      preserveAspectRatio="none"
      pointerEvents="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ overflow: 'visible' }}
    >
      <rect
        x={OUTLINE_INSET_PX}
        y={OUTLINE_INSET_PX}
        width={refWidth - OUTLINE_INSET_PX * 2}
        height={refHeight - OUTLINE_INSET_PX * 2}
        rx={radius - OUTLINE_INSET_PX}
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
  );
};

HeroProgressOutline.displayName = 'HeroProgressOutline';
