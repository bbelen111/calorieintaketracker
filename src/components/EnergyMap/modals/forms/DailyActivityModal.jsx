import React from 'react';
import { BedDouble, Dumbbell, ChevronRight } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import {
  DEFAULT_ACTIVITY_MULTIPLIERS,
  getActivityPresetByKey,
} from '../../../../constants/activityPresets';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';

const DEFAULT_PRESET_KEYS = { training: 'default', rest: 'default' };

const dayConfig = {
  training: {
    label: 'Training Day',
    icon: Dumbbell,
    accentClassName: 'border-accent-purple/60 bg-accent-purple/20',
    iconClassName: 'bg-accent-purple/25 text-accent-purple',
  },
  rest: {
    label: 'Rest Day',
    icon: BedDouble,
    accentClassName: 'border-accent-blue/60 bg-accent-blue/20',
    iconClassName: 'bg-accent-blue/25 text-accent-blue',
  },
};

const DAY_ORDER = ['training', 'rest'];

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
  const { userPresets, userMultipliers } = useEnergyMapStore(
    (state) => ({
      userPresets: state.userData?.activityPresets,
      userMultipliers: state.userData?.activityMultipliers,
    }),
    shallow
  );
  const resolvedPresets = activityPresets ?? userPresets;
  const resolvedMultipliers = activityMultipliers ?? userMultipliers;
  if (!isOpen) {
    return null;
  }

  const presets = resolvedPresets ?? DEFAULT_PRESET_KEYS;
  const multipliers = resolvedMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      overlayClassName="bg-black/80 z-[65]"
      contentClassName="p-4 md:p-6 w-full md:max-w-xl"
    >
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-foreground font-bold text-xl md:text-2xl">
          Daily Activity Presets
        </h3>
      </div>

      <p className="text-muted text-sm mb-4">
        Configure the non-exercise (NEAT) calories that sit on top of your BMR.
        These presets cover incidental movement outside of intentional training,
        cardio, or tracked steps and are separated for training and rest days.
      </p>

      <div className="space-y-3 md:space-y-4">
        {DAY_ORDER.map((day) => {
          const config = dayConfig[day];
          const Icon = config.icon;
          const presetKey = presets[day] ?? 'default';
          const preset = getActivityPresetByKey(day, presetKey);
          const label = preset ? preset.label : 'Custom';
          const multiplier =
            multipliers[day] ?? DEFAULT_ACTIVITY_MULTIPLIERS[day];

          return (
            <DayPresetCard
              key={day}
              label={config.label}
              icon={Icon}
              iconClassName={config.iconClassName}
              accentClassName={config.accentClassName}
              presetLabel={label}
              multiplier={multiplier}
              onClick={() => onSelectDay(day)}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full mt-5 bg-surface-highlight md:hover:bg-surface text-foreground py-3 rounded-lg transition-all press-feedback focus-ring"
      >
        Close
      </button>
    </ModalShell>
  );
};

const DayPresetCard = ({
  label,
  icon: Icon,
  iconClassName,
  accentClassName,
  presetLabel,
  multiplier,
  onClick,
}) => (
  <button
    onClick={onClick}
    type="button"
    className={`w-full p-4 md:p-5 rounded-xl border-2 transition-all text-left flex items-center gap-4 text-foreground md:hover:brightness-110 ${accentClassName} focus-ring pressable-card`}
  >
    <span
      className={`flex items-center justify-center w-12 h-12 rounded-full ${iconClassName}`}
    >
      <Icon size={26} />
    </span>
    <div className="flex-1">
      <p className="font-semibold text-lg">{label}</p>
      <p className="text-sm text-muted mt-1">{presetLabel}</p>
      <p className="text-xs text-muted mt-2">
        NEAT offset: {formatMultiplier(multiplier)}
      </p>
    </div>
    <ChevronRight size={20} className="text-muted" />
  </button>
);
