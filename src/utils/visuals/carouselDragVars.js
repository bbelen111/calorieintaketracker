import {
  SCREEN_DRAG_DURATION_VAR,
  SCREEN_DRAG_PROGRESS_VAR,
} from './carouselLoop.js';

/**
 * Registry of the drag-linked chrome elements — the floating tab bar's ring and
 * the header's swipe dots — that read the live carousel position.
 *
 * The swipe shell used to publish the live position as a `--screen-drag-progress`
 * custom property on `:root`. Custom properties are inherited, so writing one on
 * `:root` invalidates style for the WHOLE document on every write — and the shell
 * writes it on every drag frame. That is an O(all mounted DOM) style recalc per
 * frame, which is what made swiping choppy once the app had logged enough data to
 * mount a heavier tree.
 *
 * Instead the chrome elements register themselves as sinks and the shell writes
 * the two variables onto just those few small elements. The variables still
 * cascade into their own descendants (so the declarative `calc(var(...))` in
 * ScreenTabs/AppHeader is unchanged), but the invalidation is now scoped to the
 * chrome's own subtree and never touches the screens.
 *
 * Values are cached so re-publishing an identical (position, duration) is a
 * no-op, and a sink that mounts late (or remounts) is seeded with the last value.
 */

const sinks = new Set();
let lastProgress = null;
let lastDuration = null;

export const registerCarouselDragVarSink = (element) => {
  if (!element) {
    return () => {};
  }

  sinks.add(element);
  if (lastProgress != null) {
    element.style.setProperty(SCREEN_DRAG_PROGRESS_VAR, lastProgress);
    element.style.setProperty(SCREEN_DRAG_DURATION_VAR, lastDuration);
  }

  return () => {
    sinks.delete(element);
  };
};

export const publishCarouselDragVars = (progress, duration) => {
  const nextProgress = Number.isFinite(progress) ? progress.toFixed(4) : '1';
  const nextDuration = typeof duration === 'string' ? duration : '0s';

  if (lastProgress === nextProgress && lastDuration === nextDuration) {
    return;
  }

  lastProgress = nextProgress;
  lastDuration = nextDuration;

  sinks.forEach((element) => {
    element.style.setProperty(SCREEN_DRAG_PROGRESS_VAR, nextProgress);
    element.style.setProperty(SCREEN_DRAG_DURATION_VAR, nextDuration);
  });
};

/** Test-only: clear the registry (and its cached values) between cases. */
export const resetCarouselDragVars = () => {
  sinks.clear();
  lastProgress = null;
  lastDuration = null;
};
