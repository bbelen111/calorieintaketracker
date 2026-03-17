import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  clampCustomActivityPercent,
  MIN_CUSTOM_ACTIVITY_PERCENT,
} from '../../../../constants/activityPresets';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../../utils/scroll';

// 10.0, 10.5, 11.0, … 100.0
const NEAT_VALUES = Array.from(
  { length: Math.round((100 - MIN_CUSTOM_ACTIVITY_PERCENT) * 2) + 1 },
  (_, i) => Math.round((MIN_CUSTOM_ACTIVITY_PERCENT + i * 0.5) * 10) / 10
);

const clampNeat = (v) => {
  const clampedPercent = clampCustomActivityPercent(v);
  return Math.round(clampedPercent * 2) / 2;
};

const titles = {
  training: 'Custom Training Day NEAT',
  rest: 'Custom Rest Day NEAT',
};

export const DailyActivityCustomModal = ({
  isOpen,
  isClosing,
  dayType,
  value,
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);
  const [selectedValue, setSelectedValue] = useState(() =>
    clampNeat(value ?? 0)
  );
  const [handleScroll, setHandleScroll] = useState(() => () => {});

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    if (!isOpen || !scrollRef.current) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const initial = clampNeat(value ?? 0);

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const frame = requestAnimationFrame(() => {
      alignScrollContainerToValue(scrollRef.current, initial, behavior);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, value]);

  const handleValueChange = useCallback((next) => {
    setSelectedValue(next);
  }, []);

  useEffect(() => {
    setHandleScroll(() =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (v) => parseFloat(v),
        handleValueChange
      )
    );
  }, [handleValueChange]);

  const handleItemClick = useCallback((val) => {
    setSelectedValue(val);
    if (scrollRef.current) {
      alignScrollContainerToValue(scrollRef.current, val, 'smooth');
    }
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(selectedValue);
  }, [onSave, selectedValue]);

  if (!isOpen || !dayType) {
    return null;
  }

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[75]"
      contentClassName="p-4 md:p-6 w-full max-w-md"
    >
      <h3 className="text-foreground font-bold text-xl md:text-2xl text-center mb-1">
        {titles[dayType]}
      </h3>
      <p className="text-muted text-sm text-center mb-4">
        Non-exercise movement as a percentage of BMR.
      </p>

      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        % of BMR
      </p>

      <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
          <div className="h-16 bg-transparent" />
          <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
        </div>
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

        <div
          ref={scrollRef}
          className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
          onScroll={handleScroll}
        >
          <div className="h-16" />
          {NEAT_VALUES.map((val) => (
            <div
              key={val}
              data-value={val}
              onClick={() => handleItemClick(val)}
              className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                selectedValue === val
                  ? 'text-foreground scale-110'
                  : 'text-muted'
              }`}
            >
              {val.toFixed(1)}%
            </div>
          ))}
          <div className="h-16" />
        </div>
      </div>

      <p className="text-muted text-xs text-center mt-3">
        Recommended: 20% – 45% for most lifestyles · Minimum 10%
      </p>

      <div className="flex gap-2 md:gap-3 mt-4">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight text-foreground px-4 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback md:hover:bg-surface"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          type="button"
          className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
