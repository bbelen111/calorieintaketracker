import React from 'react';
import { ChevronRight } from 'lucide-react';

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
 * - The card stops click propagation, so a tap on it can never fall through to
 *   the modal's "tap the graph to dismiss" handler (a tap on a read-only card
 *   means "let me read this", not "close").
 * - The hidden state is `aria-hidden` and removed from the tab order.
 * - `topPx` is the plot's top edge (default 8, which is where every chart layer
 *   starts). It is a CONSTANT handed down by the modal, never a measurement —
 *   `StepTrackerModal` passes `weekBracketAreaHeight + 8` in 7d so the card
 *   clears the weekly-average bracket band instead of covering it, exactly like
 *   that modal's chart layer and y-axis column do. No `left` is ever written.
 * - `onAction` + `actionLabel` turn the card body into a button (the
 *   "tap to edit / tap to add" affordance); without them the card renders
 *   read-only as a polite live region with no footer action.
 * - Dismissal is the modal's job (`onClick` on the graph container), so there is
 *   deliberately no close button: the old X was a 21px tap target in the corner,
 *   which is unusable on a phone.
 * - Read `children` only compose content — placement/animation/glass stay here,
 *   so the four tracker modals cannot drift apart.
 */
export const TrackerSelectionCard = ({
  isOpen = false,
  topPx = 8,
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
      <div className="px-3 py-2.5">{children}</div>
      {isActionable && (
        <div className="flex items-center justify-between gap-2 border-t border-border/30 px-3 py-1.5">
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
      } z-20 flex justify-center pointer-events-none transition-[opacity,transform] duration-150 ease-out ${
        isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
      }`}
      style={{ top: topPx }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`pointer-events-auto relative w-auto max-w-[calc(100%-1rem)] rounded-xl border border-border/40 bg-surface/85 supports-[backdrop-filter]:bg-surface/55 backdrop-blur-2xl backdrop-saturate-150 shadow-2xl shadow-background/40 overflow-hidden ${
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
      </div>
    </div>
  );
};
