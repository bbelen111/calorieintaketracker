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
} from '../../../../utils/scroll';

const MIN_BPM = 60;
const MAX_BPM = 220;
const STEP = 1;

const clampBpm = (value) => {
  if (!Number.isFinite(value)) {
    return MIN_BPM;
  }

  return Math.min(Math.max(Math.round(value), MIN_BPM), MAX_BPM);
};

const BPM_VALUES = Array.from(
  { length: MAX_BPM - MIN_BPM + 1 },
  (_, index) => MIN_BPM + index * STEP
);

export const HeartRatePickerModal = ({
  isOpen,
  isClosing,
  title = 'Average Heart Rate',
  value,
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);

  const normalizedValue = useMemo(() => {
    const numeric = Number(value);
    return clampBpm(Number.isNaN(numeric) ? 120 : numeric);
  }, [value]);

  const [selectedValue, setSelectedValue] = useState(normalizedValue);

  const handleValueChange = useCallback((nextValue) => {
    const clamped = clampBpm(nextValue);
    setSelectedValue(clamped);
  }, []);

  const [handleScroll, setHandleScroll] = useState(() => () => {});

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    setHandleScroll(() =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (val) => parseInt(val, 10),
        handleValueChange
      )
    );
  }, [handleValueChange]);

  useEffect(() => {
    if (!isOpen) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const frame = requestAnimationFrame(() => {
      setSelectedValue(normalizedValue);
      if (scrollRef.current) {
        alignScrollContainerToValue(
          scrollRef.current,
          normalizedValue.toString(),
          behavior
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, normalizedValue]);

  const handleItemClick = useCallback((bpm) => {
    const clamped = clampBpm(bpm);
    setSelectedValue(clamped);
    if (scrollRef.current) {
      alignScrollContainerToValue(
        scrollRef.current,
        clamped.toString(),
        'smooth'
      );
    }
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(selectedValue);
  }, [onSave, selectedValue]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[85]"
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        {title}
      </h3>
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        BPM
      </p>

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
          {BPM_VALUES.map((bpm) => {
            const isSelected = selectedValue === bpm;
            return (
              <div
                key={bpm}
                data-value={bpm.toString()}
                onClick={() => handleItemClick(bpm)}
                className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                  isSelected ? 'text-foreground scale-110' : 'text-muted'
                }`}
              >
                {bpm}
              </div>
            );
          })}
          <div className="h-16" />
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
          className="flex-1 bg-accent-blue active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
