import React from 'react';
import {
  RING_COPY_OFFSETS,
  SCREEN_DRAG_DURATION_VAR,
  SCREEN_DRAG_PROGRESS_VAR,
} from '../../../utils/visuals/carouselLoop';

const CIRCLE_SIZE_PX = 44; // in the 54px bar
const BAR_HEIGHT_PX = 54;

/**
 * Fixed bottom floating glass tab bar (blur/glassmorphic pill).
 *
 * - Floats with generous margins on all sides (never edge-to-edge).
 * - Fully rounded pill with a very translucent fill + heavy backdrop blur.
 * - Icon-only tabs; the active tab is a filled accent circle behind the icon.
 * - The circle is a **ring**: `RING_COPY_OFFSETS` copies all read the live
 *   `--screen-drag-progress` position (published by useSwipeableScreens on every
 *   transform commit) and add their own static `copy * tabs.length` offset, so
 *   the copies sit exactly one track apart. A loop-seam crossing therefore glides
 *   one copy out of one end of the track while the next re-enters the other end
 *   (both clipped by the tracker) — the indicator "continues and re-appears"
 *   instead of jumping backwards across every tab. At rest the copy owning the
 *   active tab is on-screen and the wrapped ones are clipped off; normalizing a
 *   wrap leaves the rendered set byte-identical.
 * - Motion is a composited `transform`: the tracker's own width is the bar
 *   width, so `100% / tabs.length` resolves to exactly one tab pitch with no
 *   measurement. Animating `left` (a layout property) instead would run the pill
 *   on the main thread and look janky on high-refresh screens.
 * - `--screen-drag-duration` is owned by the hook: `0s` while the finger is down
 *   or when a wrap normalizes, and the settle duration so the circle glides in
 *   lockstep with the slides.
 * - The icon colours flip the moment a settle's target is committed
 *   (`activeScreen` — the optimistic display screen, not the committed one) and
 *   crossfade on the shell's own duration, so the active colour lands exactly
 *   when the circle arrives.
 * - Sized in px (inline) so geometry stays exact regardless of the app's
 *   rem-based root font size.
 * - Sits below the ModalShell z-lanes (z-[900] < 1000) so modals always cover
 *   it, and respects the safe-area insets on all sides.
 */
export const ScreenTabs = ({ tabs, activeScreen, onSelect }) => {
  const tabSharePercent = 100 / tabs.length;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[900]"
      style={{
        paddingBottom: `calc(1.5rem + var(--sab, 0px))`,
        paddingLeft: `calc(2rem + var(--sal, 0px))`,
        paddingRight: `calc(2rem + var(--sar, 0px))`,
        pointerEvents: 'none',
      }}
      aria-label="Screens"
    >
      <div className="mx-auto max-w-md" style={{ pointerEvents: 'auto' }}>
        <div
          className="relative flex items-stretch rounded-full border border-border/40 bg-surface/35 shadow-lg shadow-background/30 backdrop-blur-2xl"
          style={{ height: BAR_HEIGHT_PX }}
        >
          {/* Ring tracker: clipped (rounded) so a copy gliding off one end and
              the copy entering the other end are cut at the glass edge instead of
              spilling outside the bar. The clip lives on this layer rather than on
              the bar so `backdrop-blur-2xl` stays undisturbed. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
          >
            {RING_COPY_OFFSETS.map((copy) => (
              <div
                key={copy}
                className="absolute inset-0"
                style={{
                  transform: `translate3d(calc((var(${SCREEN_DRAG_PROGRESS_VAR}, ${activeScreen + 1}) - 1 + ${copy * tabs.length}) * ${tabSharePercent}%), 0, 0)`,
                  transition: `transform var(${SCREEN_DRAG_DURATION_VAR}, 0.35s) cubic-bezier(0.32, 0.72, 0, 1)`,
                  willChange: 'transform',
                }}
              >
                <div
                  className="absolute rounded-full bg-primary shadow-lg shadow-primary/30"
                  style={{
                    width: CIRCLE_SIZE_PX,
                    height: CIRCLE_SIZE_PX,
                    top: `calc(50% - ${CIRCLE_SIZE_PX / 2}px)`,
                    left: `calc(${tabSharePercent / 2}% - ${CIRCLE_SIZE_PX / 2}px)`,
                  }}
                />
              </div>
            ))}
          </div>
          {tabs.map(({ key, label, icon: Icon }, index) => {
            const isActive = activeScreen === index;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(index)}
                aria-pressed={isActive}
                aria-label={label}
                className={`relative z-10 flex flex-1 items-center justify-center rounded-full pressable-inline focus-ring ${
                  isActive
                    ? 'text-primary-foreground'
                    : 'text-muted md:hover:text-foreground'
                }`}
                style={{
                  // Owned by the shell so the colour crossfades on the same clock
                  // as the circle (350ms on a settle, instant on a wrap swap).
                  transition: `color var(${SCREEN_DRAG_DURATION_VAR}, 0.35s) cubic-bezier(0.22, 1, 0.36, 1)`,
                }}
              >
                <Icon size={20} className="shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

ScreenTabs.displayName = 'ScreenTabs';
