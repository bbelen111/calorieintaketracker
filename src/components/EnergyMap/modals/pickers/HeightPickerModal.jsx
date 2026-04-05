import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';

import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../../utils/visuals/scroll';
import {
  HEIGHT_MAX,
  HEIGHT_MIN,
  sanitizeHeight,
} from '../../../../utils/measurements/profile';

const HEIGHT_VALUES = Array.from(
  { length: HEIGHT_MAX - HEIGHT_MIN + 1 },
  (_, index) => HEIGHT_MIN + index
);

export const HeightPickerModal = ({
  isOpen,
  isClosing,
  value,
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);
  const [selectedHeight, setSelectedHeight] = useState(() =>
    sanitizeHeight(value)
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
      const nextHeight = sanitizeHeight(value, selectedHeight);
      setSelectedHeight(nextHeight);
      alignScrollContainerToValue(scrollRef.current, nextHeight, behavior);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, value]);

  const handleHeightChange = useCallback((nextHeight) => {
    setSelectedHeight(sanitizeHeight(nextHeight));
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

  const handleItemClick = useCallback(
    (height) => {
      const clamped = sanitizeHeight(height, selectedHeight);
      setSelectedHeight(clamped);
      if (scrollRef.current) {
        alignScrollContainerToValue(scrollRef.current, clamped, 'smooth');
      }
    },
    [selectedHeight]
  );

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
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        Select Height
      </h3>
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        Centimeters
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
          {HEIGHT_VALUES.map((height) => (
            <div
              key={height}
              data-value={height}
              onClick={() => handleItemClick(height)}
              className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                selectedHeight === height
                  ? 'text-foreground scale-110'
                  : 'text-muted'
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
