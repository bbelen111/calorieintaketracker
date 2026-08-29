import React from 'react';

const CIRCLE_SIZE_PX = 44; // in the 54px bar
const BAR_HEIGHT_PX = 54;

/**
 * Fixed bottom floating glass tab bar (blur/glassmorphic pill).
 *
 * - Floats with generous margins on all sides (never edge-to-edge).
 * - Fully rounded pill with a very translucent fill + heavy backdrop blur.
 * - Icon-only tabs; the active tab is a filled accent circle behind the icon.
 * - The circle is a single persistent element whose `left` tracks the live
 *   carousel position via the `--screen-drag-progress` custom property
 *   (published by useSwipeableScreens on every transform commit), so it slides
 *   in real time while the user drags between screens.
 * - Sized in px (inline) so geometry stays exact regardless of the app's
 *   rem-based root font size.
 * - Sits below the ModalShell z-lanes (z-[900] < 1000) so modals always cover
 *   it, and respects the safe-area insets on all sides.
 */
export const ScreenTabs = ({
  tabs,
  currentScreen,
  onSelect,
  isSwiping = false,
}) => {
  const tabPercent = 100 / tabs.length;

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
          {/* Persistent sliding active circle — tracks drag progress live */}
          <div
            aria-hidden="true"
            className="absolute rounded-full bg-primary shadow-lg shadow-primary/30"
            style={{
              width: CIRCLE_SIZE_PX,
              height: CIRCLE_SIZE_PX,
              top: `calc(50% - ${CIRCLE_SIZE_PX / 2}px)`,
              left: `calc(var(--screen-drag-progress, ${currentScreen}) * ${tabPercent}% + ${tabPercent / 2}% - ${CIRCLE_SIZE_PX / 2}px)`,
              transition: isSwiping
                ? 'none'
                : 'left 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          />
          {tabs.map(({ key, label, icon: Icon }, index) => {
            const isActive = currentScreen === index;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(index)}
                aria-pressed={isActive}
                aria-label={label}
                className={`relative z-10 flex flex-1 items-center justify-center rounded-full pressable-inline focus-ring transition-colors ${
                  isActive
                    ? 'text-primary-foreground'
                    : 'text-muted md:hover:text-foreground'
                }`}
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
