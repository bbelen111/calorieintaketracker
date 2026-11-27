import React from 'react';

// The progress rim shared by Home's hero readouts (the pill and the tiles) and
// the Tracker's week-strip dates: a faint full-length track - the outline of the
// bar - with the filled part and a soft glow on top.
//
// The SVG sits just inside its host and has no viewBox, so the rect is measured
// in real pixels at any host size. Do not go back to a stretched viewBox with
// `non-scaling-stroke`: Chromium sizes a `pathLength` dash from the unstretched
// box there, so a pill wider than its reference never closed at 100 %. Each host
// passes the px radius that runs concentric with its own corner.
const OUTLINE_STROKE_PX = 3;
const TRACK_ALPHA = 0.2;
// White reads far brighter than a hue at the same alpha, so keep this low.
const GLOW_ALPHA = 0.3;

/**
 * @param {object} props
 * @param {number|null} props.progress 0-100; `null`/invalid draws nothing (the
 *   metric has no goal), 0 draws the empty track
 * @param {number} props.radius corner radius of the rim (px)
 * @param {string} [props.colorVar] theme variable the rim is drawn in. It must
 *   contrast with the host's fill: the default text colour is white on the dark
 *   themes and ink on Light / Dawn, where white would vanish into a tile
 * @param {number} [props.strokeWidth] rim thickness (px); thinner on small hosts
 */
export const HeroProgressOutline = ({
  progress,
  radius,
  colorVar = '--foreground',
  strokeWidth = OUTLINE_STROKE_PX,
}) => {
  // Half a stroke in, so the rim's outer edge sits on the host's inner edge.
  const inset = strokeWidth / 2;
  const numeric = Number(progress);
  // `Number(null)` is 0, so "no goal" has to be told apart before coercing.
  const hasGoal = progress != null && Number.isFinite(numeric);
  // `pathLength="100"` gives the dash 100 units of resolution, so anything past
  // two decimals is meaningless (and would thrash the attribute on every gram).
  const dashValue = hasGoal
    ? Math.round(Math.min(100, Math.max(0, numeric)) * 100) / 100
    : 0;

  const rectProps = {
    width: '100%',
    height: '100%',
    rx: radius,
    fill: 'none',
    strokeWidth,
  };

  // Decorative overlay. `overflow: visible` keeps the outer half of the stroke
  // and its glow from being clipped.
  return (
    <svg
      aria-hidden="true"
      pointerEvents="none"
      className="pointer-events-none absolute"
      style={{
        top: inset,
        left: inset,
        width: `calc(100% - ${inset * 2}px)`,
        height: `calc(100% - ${inset * 2}px)`,
        overflow: 'visible',
      }}
    >
      <rect
        {...rectProps}
        data-part="track"
        stroke={`rgb(var(${colorVar}) / ${TRACK_ALPHA})`}
        strokeOpacity={hasGoal ? 1 : 0}
      />
      <rect
        {...rectProps}
        data-part="progress"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray={`${dashValue} 100`}
        stroke={`rgb(var(${colorVar}) / 1)`}
        // A round cap would leave a stray dot at 0 %.
        strokeOpacity={dashValue > 0 ? 1 : 0}
        style={{
          filter: `drop-shadow(0 0 2px rgb(var(${colorVar}) / ${GLOW_ALPHA}))`,
          transition: 'stroke-dasharray 0.4s ease, stroke-opacity 0.2s ease',
        }}
      />
    </svg>
  );
};

HeroProgressOutline.displayName = 'HeroProgressOutline';
