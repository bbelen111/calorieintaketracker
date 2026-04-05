/**
 * Bezier curve path generation utilities for SVG charts and sparklines.
 *
 * Provides smooth cubic Bézier curve interpolation between data points,
 * producing both a stroke path and a filled area path.
 */

/** Default tension for control-point spacing (0–0.5). */
const DEFAULT_TENSION = 0.4;

/**
 * Build a cubic Bézier control-point pair for segment `current → next`.
 *
 * @param {{ x: number, y: number }} current
 * @param {{ x: number, y: number }} next
 * @param {number} [tension=DEFAULT_TENSION] - Horizontal control-point offset as a fraction of dx.
 * @returns {{ cp1x: number, cp1y: number, cp2x: number, cp2y: number }}
 */
export const bezierControlPoints = (
  current,
  next,
  tension = DEFAULT_TENSION
) => {
  const dx = next.x - current.x;
  return {
    cp1x: current.x + dx * tension,
    cp1y: current.y,
    cp2x: next.x - dx * tension,
    cp2y: next.y,
  };
};

/**
 * Generate a smooth SVG `<path>` d-attribute from an array of {x,y} points
 * using cubic Bézier curves.
 *
 * Options control edge-extension behaviour used by the full-size tracker charts:
 *  - `extendToEdges: true` draws a horizontal leader from x=0 to the first
 *    point and a trailer from the last point to `chartWidth`.
 *  - `singlePointStretch: true` draws a flat horizontal line across the full
 *    width when there is exactly one point.
 *
 * @param {{ x: number, y: number }[]} points
 * @param {object} [options]
 * @param {number}  [options.chartWidth]           - Total chart width (required when extending to edges).
 * @param {number}  [options.chartHeight]          - Total chart height (required for area baseline).
 * @param {boolean} [options.extendToEdges=false]  - Extend line to left/right edges.
 * @param {boolean} [options.singlePointStretch=false] - Stretch a single point across the viewport.
 * @param {number}  [options.tension=0.4]          - Bézier control-point tension.
 * @returns {{ pathData: string, areaData: string }}
 */
export const buildBezierPaths = (points, options = {}) => {
  const {
    chartWidth = 0,
    chartHeight = 0,
    extendToEdges = false,
    singlePointStretch = false,
    tension = DEFAULT_TENSION,
  } = options;

  if (!points || points.length === 0) {
    return { pathData: '', areaData: '' };
  }

  // --- Single-point stretch (tracker charts with viewport-wide stretch) ---
  if (points.length === 1 && singlePointStretch) {
    const { y } = points[0];
    const startX = 0;
    const endX = chartWidth;
    return {
      pathData: `M ${startX} ${y} L ${endX} ${y}`,
      areaData: `M ${startX} ${chartHeight} L ${startX} ${y} L ${endX} ${y} L ${endX} ${chartHeight} Z`,
    };
  }

  // --- Multiple points ---
  if (points.length > 1) {
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    // Optionally lead from x=0 to first point
    let pathData = extendToEdges
      ? `M 0 ${firstPoint.y} L ${firstPoint.x} ${firstPoint.y}`
      : `M ${firstPoint.x} ${firstPoint.y}`;

    let areaData = extendToEdges
      ? `M 0 ${chartHeight} L 0 ${firstPoint.y} L ${firstPoint.x} ${firstPoint.y}`
      : `M ${firstPoint.x} ${chartHeight} L ${firstPoint.x} ${firstPoint.y}`;

    // Cubic Bézier through each pair of consecutive points
    for (let i = 0; i < points.length - 1; i++) {
      const { cp1x, cp1y, cp2x, cp2y } = bezierControlPoints(
        points[i],
        points[i + 1],
        tension
      );
      const seg = ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${points[i + 1].x} ${points[i + 1].y}`;
      pathData += seg;
      areaData += seg;
    }

    // Optionally trail from last point to chartWidth
    if (extendToEdges) {
      pathData += ` L ${chartWidth} ${lastPoint.y}`;
      areaData += ` L ${chartWidth} ${lastPoint.y} L ${chartWidth} ${chartHeight} Z`;
    } else {
      areaData += ` L ${lastPoint.x} ${chartHeight} Z`;
    }

    return { pathData, areaData };
  }

  // --- Single point without stretch (sparklines) ---
  // Nothing meaningful to draw
  return { pathData: '', areaData: '' };
};

/**
 * Build multiple bezier path segments from an array that may contain null gaps.
 * Splits continuous non-null runs, builds paths for each, returns arrays of SVG path strings.
 *
 * @param {(({x: number, y: number})|null)[]} slots - Array where null = gap (missing data day)
 * @param {object} options - Same options as buildBezierPaths
 * @returns {{ pathSegments: string[], areaSegments: string[] }}
 */
export const buildSegmentedBezierPaths = (slots, options = {}) => {
  const pathSegments = [];
  const areaSegments = [];

  if (!slots || slots.length === 0) {
    return { pathSegments, areaSegments };
  }

  // Split into contiguous non-null runs
  let currentRun = [];
  const runs = [];

  for (let i = 0; i < slots.length; i++) {
    if (slots[i] !== null) {
      currentRun.push(slots[i]);
    } else {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    }
  }
  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  // Build bezier paths for each run (no edge extension — segments are interior)
  for (const run of runs) {
    if (run.length < 2) {
      // Single point — just record position for dot rendering, no line
      pathSegments.push('');
      areaSegments.push('');
      continue;
    }
    const { pathData, areaData } = buildBezierPaths(run, {
      ...options,
      extendToEdges: false,
      singlePointStretch: false,
    });
    pathSegments.push(pathData);
    areaSegments.push(areaData);
  }

  return { pathSegments, areaSegments };
};
