import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../utils/scroll';

const MIN_GOAL = 1000;
const MAX_GOAL = 50000;
const STEP_INCREMENT = 500;

// Generate values from 1000 to 50000 in increments of 500
const GOAL_VALUES = Array.from(
  { length: Math.floor((MAX_GOAL - MIN_GOAL) / STEP_INCREMENT) + 1 },
  (_, index) => MIN_GOAL + index * STEP_INCREMENT
);

const clampGoal = (value) => {
  if (!Number.isFinite(value)) {
    return 10000;
  }
  // Round to nearest 500
  const rounded = Math.round(value / STEP_INCREMENT) * STEP_INCREMENT;
  return Math.min(Math.max(rounded, MIN_GOAL), MAX_GOAL);
};

export const StepGoalPickerModal = ({
  isOpen,
  isClosing,
  value,
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);
  const selectionRef = useRef(10000);

  const [selectedGoal, setSelectedGoal] = useState(10000);
  const [handleScroll, setHandleScroll] = useState(() => () => {});

  const applySelection = useCallback((goal, behavior = 'instant') => {
    const clampedGoal = clampGoal(goal);
    selectionRef.current = clampedGoal;
    setSelectedGoal(clampedGoal);

    requestAnimationFrame(() => {
      if (scrollRef.current) {
        alignScrollContainerToValue(
          scrollRef.current,
          clampedGoal.toString(),
          behavior
        );
      }
    });
  }, []);

  // Initialize from prop value when modal opens
  useEffect(() => {
    if (!isOpen) {
      hasAlignedRef.current = false;
      return;
    }

    if (hasAlignedRef.current) {
      return;
    }
    hasAlignedRef.current = true;

    const initialValue = clampGoal(value ?? 10000);
    selectionRef.current = initialValue;

    const frame = requestAnimationFrame(() => {
      setSelectedGoal(initialValue);
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

  const handleGoalChange = useCallback((nextGoal) => {
    const clampedGoal = clampGoal(nextGoal);
    selectionRef.current = clampedGoal;
    setSelectedGoal(clampedGoal);
  }, []);

  useEffect(() => {
    setHandleScroll(() =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (val) => parseInt(val, 10),
        handleGoalChange
      )
    );
  }, [handleGoalChange]);

  const handleSave = useCallback(() => {
    onSave?.(selectedGoal);
  }, [onSave, selectedGoal]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-white font-bold text-xl mb-4 text-center">
        Set Step Goal
      </h3>
      <p className="text-slate-400 text-xs text-center mb-2 uppercase tracking-wide">
        Daily Target
      </p>

      <div className="flex justify-center">
        <div className="w-full max-w-[200px]">
          <div className="relative h-48 overflow-hidden rounded-xl bg-slate-800/80">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
            </div>
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

            <div
              ref={scrollRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleScroll}
            >
              <div className="h-16" />
              {GOAL_VALUES.map((goal) => (
                <div
                  key={goal}
                  data-value={goal}
                  onClick={() => applySelection(goal, 'smooth')}
                  className={`h-16 flex items-center justify-center text-2xl font-bold snap-center cursor-pointer transition-all ${
                    selectedGoal === goal
                      ? 'text-white scale-110'
                      : 'text-slate-500'
                  }`}
                >
                  {goal.toLocaleString()}
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
          className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          type="button"
          className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
