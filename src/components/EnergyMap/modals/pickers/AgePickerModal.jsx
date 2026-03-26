import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../../utils/scroll';
import { AGE_MAX, AGE_MIN, sanitizeAge } from '../../../../utils/profile';

const AGE_VALUES = Array.from(
  { length: AGE_MAX - AGE_MIN + 1 },
  (_, i) => AGE_MIN + i
);

export const AgePickerModal = ({
  isOpen,
  isClosing,
  value,
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);
  const [selectedAge, setSelectedAge] = useState(() => sanitizeAge(value));

  const [handleScroll, setHandleScroll] = useState(() => () => {});

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    if (!isOpen || !scrollRef.current) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const frame = requestAnimationFrame(() => {
      const nextAge = sanitizeAge(value, selectedAge);
      setSelectedAge(nextAge);
      alignScrollContainerToValue(scrollRef.current, nextAge, behavior);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, value]);

  const handleAgeChange = useCallback((nextAge) => {
    setSelectedAge(sanitizeAge(nextAge));
  }, []);

  useEffect(() => {
    setHandleScroll(() =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (val) => parseInt(val, 10),
        handleAgeChange
      )
    );
  }, [handleAgeChange]);

  const handleItemClick = useCallback(
    (age) => {
      const nextAge = sanitizeAge(age, selectedAge);
      setSelectedAge(nextAge);
      if (scrollRef.current) {
        alignScrollContainerToValue(scrollRef.current, nextAge, 'smooth');
      }
    },
    [selectedAge]
  );

  const handleSave = useCallback(() => {
    onSave?.(selectedAge);
  }, [onSave, selectedAge]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[70]"
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        Select Age
      </h3>
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        Years
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
          {AGE_VALUES.map((age) => (
            <div
              key={age}
              data-value={age}
              onClick={() => handleItemClick(age)}
              className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                selectedAge === age ? 'text-foreground scale-110' : 'text-muted'
              }`}
            >
              {age}
            </div>
          ))}
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
          className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
