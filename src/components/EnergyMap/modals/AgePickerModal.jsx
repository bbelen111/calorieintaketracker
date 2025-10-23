import React, { useEffect, useMemo, useRef } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { alignScrollContainerToValue, createPickerScrollHandler } from '../../../utils/scroll';

const AGE_VALUES = Array.from({ length: 83 }, (_, i) => i + 15);

export const AgePickerModal = ({ isOpen, isClosing, value, onChange, onCancel, onSave }) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    if (!isOpen || !scrollRef.current) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const frame = requestAnimationFrame(() => {
      alignScrollContainerToValue(scrollRef.current, value, behavior);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, value]);

  const handleScroll = useMemo(
    () => createPickerScrollHandler(scrollRef, timeoutRef, (v) => parseInt(v, 10), onChange),
    [onChange]
  );

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[70]"
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-white font-bold text-xl mb-4 text-center">Select Age</h3>

      <div className="relative h-48 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
          <div className="h-16 bg-transparent" />
          <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
        </div>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10" />

        <div
          ref={scrollRef}
          className="h-full overflow-y-auto scrollbar-hide"
          onScroll={handleScroll}
        >
          <div className="h-16" />
          {AGE_VALUES.map((age) => (
            <div
              key={age}
              data-value={age}
              onClick={() => {
                onChange(age);
                if (scrollRef.current) {
                  alignScrollContainerToValue(scrollRef.current, age, 'smooth');
                }
              }}
              className={`py-3 px-6 text-2xl font-semibold transition-all snap-center cursor-pointer text-center ${
                value === age ? 'text-white scale-110' : 'text-slate-500'
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
          className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          type="button"
          className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
