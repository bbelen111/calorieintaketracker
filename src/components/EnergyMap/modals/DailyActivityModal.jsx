import React from 'react';
import { BedDouble, Dumbbell, ChevronRight } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import {
  DEFAULT_ACTIVITY_MULTIPLIERS,
  getActivityPresetByKey,
} from '../../../constants/activityPresets';

const dayConfig = {
  training: {
    label: 'Training Day',
    icon: Dumbbell,
    accent: 'bg-purple-600 border-purple-400',
  },
  rest: {
    label: 'Rest Day',
    icon: BedDouble,
    accent: 'bg-indigo-600 border-indigo-400',
  },
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

export const DailyActivityModal = ({
  isOpen,
  isClosing,
  activityPresets,
  activityMultipliers,
  onSelectDay,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  const presets = activityPresets ?? { training: 'default', rest: 'default' };
  const multipliers = activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[65]"
      contentClassName="p-4 md:p-6 w-full md:max-w-xl"
    >
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-white font-bold text-xl md:text-2xl">
          Daily Activity Presets
        </h3>
      </div>

      <p className="text-slate-300 text-sm mb-4">
        Configure the non-exercise (NEAT) calories that sit on top of your BMR.
        These presets cover incidental movement outside of intentional training,
        cardio, or tracked steps and are separated for training and rest days.
      </p>

      <div className="space-y-3 md:space-y-4">
        {['training', 'rest'].map((day) => {
          const config = dayConfig[day];
          const Icon = config.icon;
          const presetKey = presets[day] ?? 'default';
          const preset = getActivityPresetByKey(day, presetKey);
          const label = preset ? preset.label : 'Custom';
          const multiplier =
            multipliers[day] ?? DEFAULT_ACTIVITY_MULTIPLIERS[day];

          return (
            <button
              key={day}
              onClick={() => onSelectDay(day)}
              type="button"
              className={`w-full p-4 md:p-5 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${config.accent} text-white active:scale-[0.98]`}
            >
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-white/15">
                <Icon size={26} />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-lg">{config.label}</p>
                <p className="text-sm opacity-90 mt-1">{label}</p>
                <p className="text-xs opacity-75 mt-2">
                  NEAT offset: {formatMultiplier(multiplier)}
                </p>
              </div>
              <ChevronRight size={20} className="opacity-80" />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full mt-5 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg transition-all"
      >
        Close
      </button>
    </ModalShell>
  );
};
