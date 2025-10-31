import React, { useEffect, useRef } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

import {
  alignScrollContainerToValue,
  SCROLL_SETTLE_DELAY,
  findClosestScrollItem,
  alignScrollContainerToElement,
} from '../../../utils/scroll';

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 220;
const HEIGHT_VALUES = Array.from(
  { length: MAX_HEIGHT - MIN_HEIGHT + 1 },
  (_, index) => MIN_HEIGHT + index
);

const clampHeight = (value) => {
  if (!Number.isFinite(value)) {
    return MIN_HEIGHT;
  }
  return Math.min(Math.max(Math.round(value), MIN_HEIGHT), MAX_HEIGHT);
};

export const HeightPickerModal = ({
  isOpen,
  isClosing,
  value,
  onChange,
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);

  useEffect(() => {
    let timeout = timeoutRef.current;
    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !scrollRef.current) {
      hasAlignedRef.current = false;
      return undefined;
    }
    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;
    const sanitizedValue = clampHeight(value);
    const frame = requestAnimationFrame(() => {
      alignScrollContainerToValue(scrollRef.current, sanitizedValue, behavior);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, value]);

  // Inline scroll handler for full lint compliance
  const handleScroll = (event) => {
    const container = event.currentTarget;
    const closestItem = findClosestScrollItem(container);
    if (closestItem) {
      const parsedValue = clampHeight(parseInt(closestItem.dataset.value, 10));
      if (!Number.isNaN(parsedValue)) {
        if (onChange) {
          onChange(parsedValue);
        }
      }
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      const containerEl = scrollRef.current || container;
      if (!containerEl) return;
      const target = findClosestScrollItem(containerEl);
      if (target) {
        alignScrollContainerToElement(containerEl, target, 'smooth');
      }
    }, SCROLL_SETTLE_DELAY);
  };

  const sanitizedValue = clampHeight(value);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[70]"
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-white font-bold text-xl mb-4 text-center">
        Select Height
      </h3>
      <p className="text-slate-400 text-xs text-center mb-2 uppercase tracking-wide">
        Centimeters
      </p>

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
          {HEIGHT_VALUES.map((height) => (
            <div
              key={height}
              data-value={height}
              onClick={() => {
                if (!scrollRef.current) return;
                alignScrollContainerToValue(
                  scrollRef.current,
                  height,
                  'smooth'
                );
                if (onChange) {
                  onChange(height);
                }
              }}
              className={`py-3 px-6 text-2xl font-semibold transition-all snap-center cursor-pointer text-center ${
                sanitizedValue === height
                  ? 'text-white scale-110'
                  : 'text-slate-500'
              }`}
            >
              {height}
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
          onClick={() => onSave?.()}
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
