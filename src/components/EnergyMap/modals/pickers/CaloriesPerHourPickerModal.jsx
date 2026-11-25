import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../../utils/visuals/scroll';
import { useUnits } from '../../../../hooks/useUnits';

const DEFAULT_KCAL_PER_HOUR = 220;
const MAX_KCAL_PER_HOUR = 2000;
// Wheel steps per energy unit (about the same 5 kcal of resolution).
const STEP_BY_UNIT = { kcal: 5, kJ: 20 };

/** The wheel for the user's energy unit; picks and `value` are kcal outside. */
const buildWheel = (energy) => {
  const step = STEP_BY_UNIT[energy.unit];
  const max = Math.floor(energy.toNumber(MAX_KCAL_PER_HOUR) / step) * step;
  const values = Array.from(
    { length: max / step + 1 },
    (_, index) => index * step
  );
  const snap = (picked) => {
    const numeric = Number.isFinite(picked)
      ? picked
      : energy.toNumber(DEFAULT_KCAL_PER_HOUR);
    return Math.min(Math.max(Math.round(numeric / step) * step, 0), max);
  };
  const fromKcal = (kcal) =>
    snap(Number.isFinite(kcal) ? energy.toNumber(kcal) : Number.NaN);

  return { values, snap, fromKcal };
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
  const { energy } = useUnits();
  const wheel = useMemo(() => buildWheel(energy), [energy]);
  const selectionRef = useRef(wheel.fromKcal(DEFAULT_KCAL_PER_HOUR));

  const [selectedCalories, setSelectedCalories] = useState(() =>
    wheel.fromKcal(value ?? DEFAULT_KCAL_PER_HOUR)
  );
  const [handleScroll, setHandleScroll] = useState(() => () => {});

  const applySelection = useCallback(
    (caloriesPerHour, behavior = 'instant') => {
      const clamped = wheel.snap(caloriesPerHour);
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
    [wheel]
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

    const initialValue = wheel.fromKcal(value ?? DEFAULT_KCAL_PER_HOUR);
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
  }, [isOpen, value, wheel]);

  const handleCaloriesChange = useCallback(
    (nextValue) => {
      const clamped = wheel.snap(nextValue);
      selectionRef.current = clamped;
      setSelectedCalories(clamped);
    },
    [wheel]
  );

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
    // An untouched value is kept as it was, not re-derived from the wheel step.
    const isUntouched =
      Number.isFinite(value) && wheel.fromKcal(value) === selectedCalories;
    onSave?.(isUntouched ? value : energy.fromPicker(selectedCalories));
  }, [energy, onSave, selectedCalories, value, wheel]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-85"
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        {energy.noun} Per Hour
      </h3>
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        <span className={energy.isKj ? 'normal-case' : undefined}>
          {energy.unit}
        </span>{' '}
        / hr
      </p>

      <div className="flex justify-center">
        <div className="w-full max-w-[220px]">
          <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-linear-to-b from-surface to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-linear-to-t from-surface to-transparent" />
            </div>
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

            <div
              ref={scrollRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleScroll}
            >
              <div className="h-16" />
              {wheel.values.map((caloriesPerHour) => (
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
