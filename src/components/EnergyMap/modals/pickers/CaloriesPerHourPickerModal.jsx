import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../../utils/scroll';

const MIN_CALORIES_PER_HOUR = 0;
const MAX_CALORIES_PER_HOUR = 2000;
const CALORIES_STEP = 5;

const CALORIES_VALUES = Array.from(
  {
    length:
      Math.floor(
        (MAX_CALORIES_PER_HOUR - MIN_CALORIES_PER_HOUR) / CALORIES_STEP
      ) + 1,
  },
  (_, index) => MIN_CALORIES_PER_HOUR + index * CALORIES_STEP
);

const clampCaloriesPerHour = (value) => {
  if (!Number.isFinite(value)) {
    return 220;
  }

  const rounded = Math.round(value / CALORIES_STEP) * CALORIES_STEP;
  return Math.min(
    Math.max(rounded, MIN_CALORIES_PER_HOUR),
    MAX_CALORIES_PER_HOUR
  );
};

export const CaloriesPerHourPickerModal = ({
  isOpen,
  isClosing,
  value,
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);
  const selectionRef = useRef(220);

  const [selectedCalories, setSelectedCalories] = useState(220);
  const [handleScroll, setHandleScroll] = useState(() => () => {});

  const applySelection = useCallback(
    (caloriesPerHour, behavior = 'instant') => {
      const clamped = clampCaloriesPerHour(caloriesPerHour);
      selectionRef.current = clamped;
      setSelectedCalories(clamped);

      requestAnimationFrame(() => {
        if (scrollRef.current) {
          alignScrollContainerToValue(
            scrollRef.current,
            clamped.toString(),
            behavior
          );
        }
      });
    },
    []
  );

  useEffect(() => {
    if (!isOpen) {
      hasAlignedRef.current = false;
      return;
    }

    if (hasAlignedRef.current) {
      return;
    }
    hasAlignedRef.current = true;

    const initialValue = clampCaloriesPerHour(value ?? 220);
    selectionRef.current = initialValue;

    const frame = requestAnimationFrame(() => {
      setSelectedCalories(initialValue);
      if (scrollRef.current) {
        alignScrollContainerToValue(
          scrollRef.current,
          initialValue.toString(),
          'instant'
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, value]);

  const handleCaloriesChange = useCallback((nextValue) => {
    const clamped = clampCaloriesPerHour(nextValue);
    selectionRef.current = clamped;
    setSelectedCalories(clamped);
  }, []);

  useEffect(() => {
    setHandleScroll(() =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (val) => parseInt(val, 10),
        handleCaloriesChange
      )
    );
  }, [handleCaloriesChange]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleSave = useCallback(() => {
    onSave?.(selectedCalories);
  }, [onSave, selectedCalories]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[85]"
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        Calories Per Hour
      </h3>
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        kcal / hr
      </p>

      <div className="flex justify-center">
        <div className="w-full max-w-[220px]">
          <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
            </div>
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

            <div
              ref={scrollRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleScroll}
            >
              <div className="h-16" />
              {CALORIES_VALUES.map((caloriesPerHour) => (
                <div
                  key={caloriesPerHour}
                  data-value={caloriesPerHour}
                  onClick={() => applySelection(caloriesPerHour, 'smooth')}
                  className={`h-16 flex items-center justify-center text-2xl font-bold snap-center cursor-pointer transition-all ${
                    selectedCalories === caloriesPerHour
                      ? 'text-foreground scale-110'
                      : 'text-muted'
                  }`}
                >
                  {caloriesPerHour.toLocaleString()}
                </div>
              ))}
              <div className="h-16" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          type="button"
          className="flex-1 bg-primary active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
