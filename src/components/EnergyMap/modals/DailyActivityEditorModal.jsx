import React from 'react';
import { Check, PenLine } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import {
  ACTIVITY_PRESET_OPTIONS,
  DEFAULT_ACTIVITY_MULTIPLIERS,
} from '../../../constants/activityPresets';

const titles = {
  training: 'Training Day NEAT',
  rest: 'Rest Day NEAT',
};

const formatMultiplier = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const percent = value * 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded)
    ? `${rounded.toFixed(0)}%`
    : `${rounded.toFixed(1)}%`;
};

export const DailyActivityEditorModal = ({
  isOpen,
  isClosing,
  dayType,
  currentPreset,
  currentMultiplier,
  onSelectPreset,
  onSelectCustom,
  onClose,
}) => {
  if (!isOpen || !dayType) {
    return null;
  }

  const options = ACTIVITY_PRESET_OPTIONS[dayType] ?? [];
  const activePreset = currentPreset ?? 'default';
  const multiplier = currentMultiplier ?? DEFAULT_ACTIVITY_MULTIPLIERS[dayType];
  const customSelected = activePreset === 'custom';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[70]"
      contentClassName="p-4 md:p-6 w-full md:max-w-xl"
    >
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-white font-bold text-xl md:text-2xl">
          {titles[dayType]}
        </h3>
      </div>

      <div className="space-y-3">
        {options.map((option) => {
          const isActive = activePreset === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelectPreset(dayType, option.key, option.value)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-3 active:scale-[0.98] ${
                isActive
                  ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <div className="flex-1">
                <p className="font-semibold text-lg">{option.label}</p>
                <p className="text-sm opacity-90 mt-1">{option.description}</p>
                <p className="text-xs opacity-75 mt-3">
                  NEAT offset: {formatMultiplier(option.value)}
                </p>
              </div>
              {isActive && (
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
                  <Check size={18} />
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onSelectCustom(dayType, customSelected)}
          className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-3 active:scale-[0.98] ${
            customSelected
              ? 'bg-amber-600 border-amber-400 text-white shadow-lg'
              : 'bg-slate-700 border-slate-600 text-slate-300'
          }`}
        >
          <div className="flex-1">
            <p className="font-semibold text-lg">Custom</p>
            <p className="text-sm opacity-90 mt-1">
              Set your own NEAT offset when the presets do not match your
              routine.
            </p>
            <p className="text-xs opacity-75 mt-3">
              Current NEAT offset: {formatMultiplier(multiplier)}
            </p>
            {customSelected && (
              <p className="text-xs opacity-75 mt-2 flex items-center gap-1">
                <PenLine size={14} />
                Tap again to edit the NEAT percentage
              </p>
            )}
          </div>
          {customSelected && (
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
              <Check size={18} />
            </span>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full mt-5 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg transition-all"
      >
        Done
      </button>
    </ModalShell>
  );
};
