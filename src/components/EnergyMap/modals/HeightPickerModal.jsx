import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
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
  const [selectedHeight, setSelectedHeight] = useState(() =>
    clampHeight(value)
  );

  const [handleScroll, setHandleScroll] = useState(() => () => {});

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
    const frame = requestAnimationFrame(() => {
      alignScrollContainerToValue(
        scrollRef.current,
        clampHeight(value),
        behavior
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, value]);

  const handleHeightChange = useCallback((nextHeight) => {
    const clamped = clampHeight(nextHeight);
    setSelectedHeight(clamped);
  }, []);

  useEffect(() => {
    setHandleScroll(() =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (val) => parseInt(val, 10),
        handleHeightChange
      )
    );
  }, [handleHeightChange]);

  const handleItemClick = useCallback((height) => {
    const clamped = clampHeight(height);
    setSelectedHeight(clamped);
    if (scrollRef.current) {
      alignScrollContainerToValue(scrollRef.current, clamped, 'smooth');
    }
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(selectedHeight);
  }, [onSave, selectedHeight]);

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
          {HEIGHT_VALUES.map((height) => (
            <div
              key={height}
              data-value={height}
              onClick={() => handleItemClick(height)}
              className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                selectedHeight === height
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
