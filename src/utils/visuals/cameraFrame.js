/**
 * Pure frame geometry for the inline camera viewfinder: which part of the video
 * the user can actually see, and how large the saved photo should be.
 */

const isPositive = (value) => Number.isFinite(value) && value > 0;

/**
 * The region of a source frame that `object-fit: cover` shows inside a viewport
 * (centred; one axis is trimmed). Capturing exactly this region keeps the photo
 * what-you-see-is-what-you-get.
 *
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 *   `null` while the source has no dimensions; the whole frame when the viewport
 *   has none (nothing to match).
 */
export const computeCoverCrop = (
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight
) => {
  if (!isPositive(sourceWidth) || !isPositive(sourceHeight)) return null;

  const fullFrame = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  if (!isPositive(viewportWidth) || !isPositive(viewportHeight)) {
    return fullFrame;
  }

  const viewportAspect = viewportWidth / viewportHeight;

  if (sourceWidth / sourceHeight > viewportAspect) {
    const width = sourceHeight * viewportAspect;
    return { ...fullFrame, x: (sourceWidth - width) / 2, width };
  }

  const height = sourceWidth / viewportAspect;
  return { ...fullFrame, y: (sourceHeight - height) / 2, height };
};

/**
 * Scales a size down (never up) so its longest edge is at most `maxEdge`.
 */
export const fitWithinMaxEdge = (width, height, maxEdge) => {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};
