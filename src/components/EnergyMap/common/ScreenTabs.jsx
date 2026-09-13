import React from 'react';
import {
  RING_COPY_OFFSETS,
  SCREEN_DRAG_DURATION_VAR,
  SCREEN_DRAG_PROGRESS_VAR,
} from '../../../utils/visuals/carouselLoop';

const CIRCLE_SIZE_PX = 44; // in the 54px bar
const BAR_HEIGHT_PX = 54;
// Outer geometry is px-only on purpose: the app root font is rem-based (13.5px
// mobile / 17px desktop), so rem paddings silently changed the bar's gaps and
// width between phone and desktop.
const BAR_SIDE_GAP_PX = 40; // narrower pill than the screen edges
const BAR_BOTTOM_GAP_PX = 36; // lift the bar clear of the home indicator
const BAR_MAX_WIDTH_PX = 384; // large viewports get a narrower pill, not a wider one

/*
  Content clearance for the floating bar. Exported (and derived from the geometry
  above) so the orchestrator's bottom padding and the native-back exit hint can
  never drift out of sync with the bar.
*/
export const SCREEN_TABS_BOTTOM_CLEARANCE_PX =
  BAR_BOTTOM_GAP_PX + BAR_HEIGHT_PX + 12; // 12px of slack above the bar

/**
 * Fixed bottom floating glass tab bar (blur/glassmorphic pill).
 *
 * - Floats with generous margins on all sides (never edge-to-edge): 40px side
 *   insets and a 36px bottom lift, both in px so the gaps cannot drift with the
 *   rem-based root font, and capped at 384px wide so large viewports get a
 *   narrower pill rather than a wider one.
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
        paddingBottom: `calc(${BAR_BOTTOM_GAP_PX}px + var(--sab, 0px))`,
        paddingLeft: `calc(${BAR_SIDE_GAP_PX}px + var(--sal, 0px))`,
        paddingRight: `calc(${BAR_SIDE_GAP_PX}px + var(--sar, 0px))`,
        pointerEvents: 'none',
      }}
      aria-label="Screens"
    >
      <div
        className="mx-auto"
        style={{ pointerEvents: 'auto', maxWidth: BAR_MAX_WIDTH_PX }}
      >
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
