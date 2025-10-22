import React, { useEffect, useMemo, useRef } from 'react';
import { Save, Edit3 } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { alignScrollContainerToValue, createPickerScrollHandler } from '../../../utils/scroll';

const DURATION_VALUES = Array.from({ length: 60 }, (_, index) => (index + 1) * 0.5);

export const QuickTrainingModal = ({
  isOpen,
  isClosing,
  trainingTypes,
  userData,
  tempTrainingType,
  tempTrainingDuration,
  onTrainingTypeSelect,
  onEditCustom,
  onDurationChange,
  onCancel,
  onSave
}) => {
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
      alignScrollContainerToValue(scrollRef.current, tempTrainingDuration.toFixed(1), behavior);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, tempTrainingDuration]);

  const handleScroll = useMemo(
    () =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (value) => parseFloat(value),
        onDurationChange
      ),
    [onDurationChange]
  );

  const caloriesPerHour =
    tempTrainingType === 'custom'
      ? userData.customTrainingCalories
      : trainingTypes[tempTrainingType].caloriesPerHour;

  const estimatedBurn = Math.round(caloriesPerHour * tempTrainingDuration);

  return (
    <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="p-6 w-full max-w-md">
      <h3 className="text-white font-bold text-xl mb-4 text-center">Training Settings</h3>

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-slate-300 text-sm">Training Type</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(trainingTypes).map(([key, type]) => {
              const isCustom = key === 'custom';
              const label = isCustom ? userData.customTrainingName : type.label;
              const calories = isCustom ? userData.customTrainingCalories : type.caloriesPerHour;
              const isActive = tempTrainingType === key;

              return (
                <button
                  key={key}
                  onClick={() => {
                    if (isCustom && isActive) {
                      onEditCustom();
                    } else {
                      onTrainingTypeSelect(key);
                    }
                  }}
                  type="button"
                  className={`p-3 rounded-lg border-2 transition-all text-sm relative ${
                    isActive ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 active:bg-slate-600'
                  }`}
                >
                  {isCustom && <Edit3 size={12} className="absolute top-2 right-2 opacity-75" />}
                  <div className="font-bold">{label}</div>
                  <div className="text-xs opacity-75">{calories} cal/hr</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-slate-300 text-sm block mb-2">Training Duration (hours)</label>
          <div className="relative h-48 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
            </div>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10" />

            <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-hide" onScroll={handleScroll}>
              <div className="h-16" />
              {DURATION_VALUES.map((duration) => (
                <div
                  key={duration}
                  data-value={duration.toFixed(1)}
                  className={`h-16 flex items-center justify-center text-2xl font-bold snap-center transition-all text-center ${
                    Math.abs(tempTrainingDuration - duration) < 0.01
                      ? 'text-white scale-110'
                      : 'text-slate-500'
                  }`}
                  onClick={() => {
                    onDurationChange(duration);
                    if (scrollRef.current) {
                      alignScrollContainerToValue(scrollRef.current, duration.toFixed(1), 'smooth');
                    }
                  }}
                >
                  {duration.toFixed(1)}
                </div>
              ))}
              <div className="h-16" />
            </div>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3 mt-3">
            <p className="text-slate-400 text-xs text-center mb-1">Estimated Burn:</p>
            <p className="text-white font-bold text-xl text-center">~{estimatedBurn} calories</p>
          </div>
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
          className="flex-1 bg-green-600 active:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
