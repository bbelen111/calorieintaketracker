import React from 'react';
import { ChevronRight, X } from 'lucide-react';

/**
 * Inline `label value` metric pair used inside the selection card.
 *
 * Deliberately not a tile: the card overlays the top of the plot, so its
 * height is the budget. This is the same "7d 74.5 kg" inline grammar the
 * tracker stat strips already use.
 */
export const TrackerCardMetric = ({
  label,
  value,
  valueClass = 'text-foreground',
}) => (
  <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-[11px]">
    <span className="text-muted">{label}</span>
    <span className={`font-semibold ${valueClass}`}>{value}</span>
  </span>
);

/**
 * Shared selection card for the tracker modals (Weight / Body Fat / Step /
 * Rolling Energy Balance).
 *
 * Replaces the old per-modal floating tooltip. Instead of being measured onto
 * the tapped point (`getBoundingClientRect()` + `scrollLeft` + a resize
 * listener + an outside-click document listener), the card lives in ONE fixed
 * slot: absolutely positioned, horizontally centred over the chart plot and
 * pinned to the top of the graph container. The selected slot is tied to the
 * card by a vertical guide line drawn inside the chart SVG, so nothing about
 * the card depends on scroll offset, viewport size, or which slot was tapped.
 *
 * Contract (mirrors the CalendarPicker / Daily Ledger panel conventions):
 * - Always mounted; visibility is a pure crossfade (`opacity` + a 4px
 *   `translate-y`), so there is no mount churn and never an animated height.
 * - The wrapper is `pointer-events-none` and only the card captures pointer
 *   events, so the chart stays tappable everywhere except behind the card.
 * - The hidden state is `aria-hidden` and removed from the tab order.
 * - `onAction` + `actionLabel` turn the card body into a button (the
 *   "tap to edit / tap to add" affordance); without them the card renders
 *   read-only as a polite live region with no footer action.
 * - `onDismiss` renders the explicit X. It is a SIBLING of the body (never a
 *   nested button) and never triggers `onAction`.
 * - Read `children` only compose content — placement/animation stay here, so
 *   the four tracker modals cannot drift apart.
 */
export const TrackerSelectionCard = ({
  isOpen = false,
  onDismiss,
  actionLabel = null,
  onAction,
  ariaLabel,
  className = '',
  children,
}) => {
  const isActionable = typeof onAction === 'function' && Boolean(actionLabel);

  const bodyClassName = `block w-full text-left ${
    isActionable ? 'pressable-card focus-ring' : ''
  }`;

  const content = (
    <>
      <div className={`px-2.5 py-2 ${onDismiss ? 'pr-8' : ''}`}>{children}</div>
      {isActionable && (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2.5 py-1">
          <span className="text-muted text-[10px] uppercase tracking-wide">
            {actionLabel}
          </span>
          <ChevronRight size={13} className="text-muted flex-shrink-0" />
        </div>
      )}
    </>
  );

  return (
    <div
      aria-hidden={!isOpen}
      className={`absolute ${
        className || 'inset-x-0'
      } top-2 z-20 flex justify-center pointer-events-none transition-[opacity,transform] duration-150 ease-out ${
        isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
      }`}
    >
      <div
        className={`pointer-events-auto relative w-full max-w-[280px] rounded-xl border border-border bg-surface/95 backdrop-blur-md shadow-2xl overflow-hidden ${
          isOpen ? '' : 'pointer-events-none'
        }`}
      >
        {isActionable ? (
          <button
            type="button"
            onClick={onAction}
            aria-label={ariaLabel}
            tabIndex={isOpen ? 0 : -1}
            className={bodyClassName}
          >
            {content}
          </button>
        ) : (
          <div
            role="status"
            aria-live="polite"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={bodyClassName}
          >
            {content}
          </div>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss selection"
            tabIndex={isOpen ? 0 : -1}
            className="absolute right-1 top-1 rounded-md p-1 text-muted md:hover:text-foreground md:hover:bg-surface-highlight/60 pressable-inline focus-ring"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
};
