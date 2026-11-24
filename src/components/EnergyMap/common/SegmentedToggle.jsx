import React from 'react';
import { useReducedMotionPreference } from '../../../hooks/useMotionMode';

// The Food Search "Local | Online" toggle as a reusable control: ONE persistent
// pill that glides between segments with a composited `transform` (and eases its
// colour), never per-button conditional remounts - those have nothing to slide.
// Reduced / off motion drops the glide and keeps the short colour change.
const PILL_TRANSITION =
  'transform 0.2s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.2s ease-out';
const PILL_TRANSITION_REDUCED = 'background-color 0.2s ease-out';

/**
 * `options`: `[{ id, label, icon?, pillClassName?, disabled? }]`. The pill takes
 * the active option's `pillClassName` (a `bg-accent-*` token, default blue), so
 * a segment can carry its own colour the way Local (blue) and Online (emerald)
 * do in the search modal. The group is labelled for assistive tech; each
 * segment reports `aria-pressed`.
 */
export const SegmentedToggle = ({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}) => {
  const reduceMotion = useReducedMotionPreference();
  const foundIndex = options.findIndex((option) => option.id === value);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const activeOption = options[activeIndex];

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative flex items-center rounded-lg bg-surface-highlight p-1 ${className}`.trim()}
    >
      <div
        aria-hidden="true"
        data-testid="segmented-toggle-pill"
        className={`absolute inset-y-1 left-1 rounded-md shadow-md ${
          activeOption?.pillClassName ?? 'bg-accent-blue'
        }`}
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
          transition: reduceMotion ? PILL_TRANSITION_REDUCED : PILL_TRANSITION,
        }}
      />
      {options.map((option, index) => {
        const Icon = option.icon;
        const isActive = index === activeIndex;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            disabled={option.disabled}
            onClick={() => onChange?.(option.id)}
            className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-ring ${
              isActive
                ? 'text-primary-foreground'
                : option.disabled
                  ? 'cursor-not-allowed text-muted opacity-50'
                  : 'text-muted md:hover:text-foreground'
            }`}
          >
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};
