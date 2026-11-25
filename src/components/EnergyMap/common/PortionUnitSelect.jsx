import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Scale } from 'lucide-react';
import { useReducedMotionPreference } from '../../../hooks/useMotionMode';

const PILL_BASE =
  'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide';

/**
 * The unit chooser for the Food Portion modal (replaces the native <select>).
 * `options` = [{ id, label, detail? }]. With fewer than two options it renders
 * as a static pill so the row keeps the same look.
 *
 * The popup is an anchored, always-mounted panel toggled with CSS transitions
 * (opacity + a small scale/rise) - the same "anchored wrapper, animate only the
 * inner card" pattern as the calendar pickers. Escape closes just the popup:
 * the window-level capture listener runs before ModalShell's document-level one
 * and stops it, so Escape never closes the whole sheet while the list is open.
 */
export const PortionUnitSelect = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();
  const reducedMotion = useReducedMotionPreference();

  const selected = options.find((option) => option.id === value) ?? options[0];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  if (!selected) return null;

  if (options.length < 2) {
    return (
      <div className="flex justify-center">
        <span
          className={`${PILL_BASE} border-border/60 bg-surface-highlight/60 text-muted`}
        >
          <Scale size={13} aria-hidden="true" />
          {selected.label}
        </span>
      </div>
    );
  }

  const handleSelect = (id) => {
    close();
    triggerRef.current?.focus();
    if (id !== value) onChange?.(id);
  };

  const panelMotion = reducedMotion
    ? open
      ? 'opacity-100'
      : 'opacity-0'
    : open
      ? 'opacity-100 scale-100 translate-y-0'
      : 'opacity-0 scale-95 -translate-y-1';

  return (
    <div ref={containerRef} className="relative flex justify-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`${PILL_BASE} text-accent-blue transition-all duration-200 pressable-inline focus-ring ${
          open
            ? 'border-accent-blue/60 bg-accent-blue/15 shadow-lg shadow-accent-blue/30'
            : 'border-accent-blue/30 bg-accent-blue/10 shadow-md shadow-accent-blue/15 md:hover:bg-accent-blue/15'
        }`}
      >
        <Scale size={13} aria-hidden="true" />
        <span className="truncate">{selected.label}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div className="pointer-events-none absolute inset-x-0 top-full z-20 mt-2 flex justify-center">
        <div
          id={listId}
          role="listbox"
          aria-label="Portion unit"
          aria-hidden={!open}
          className={`max-h-60 w-64 max-w-full origin-top overflow-y-auto rounded-xl border border-border/60 bg-surface/95 p-1.5 shadow-2xl shadow-background/40 backdrop-blur-xl transition-[opacity,scale,translate,visibility] duration-200 ease-out ${
            open ? 'pointer-events-auto visible' : 'invisible'
          } ${panelMotion}`}
        >
          {options.map((option) => {
            const isSelected = option.id === selected.id;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={open ? 0 : -1}
                onClick={() => handleSelect(option.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors pressable-inline focus-ring ${
                  isSelected
                    ? 'bg-accent-blue/15 text-accent-blue'
                    : 'text-foreground md:hover:bg-surface-highlight/70'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {option.label}
                </span>
                {option.detail ? (
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      isSelected ? 'text-accent-blue/80' : 'text-muted'
                    }`}
                  >
                    {option.detail}
                  </span>
                ) : null}
                <Check
                  size={15}
                  aria-hidden="true"
                  className={`shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
