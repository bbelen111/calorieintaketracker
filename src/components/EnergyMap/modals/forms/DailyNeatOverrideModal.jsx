import React, { useState } from 'react';
import {
  Armchair,
  Bed,
  Dumbbell,
  Hammer,
  RotateCcw,
  Users,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  ACTIVITY_PRESET_OPTIONS,
  DEFAULT_ACTIVITY_MULTIPLIERS,
} from '../../../../constants/activity/activityPresets';

const PRESET_ICON_BY_KEY = {
  light: Armchair,
  default: Users,
  active: Users,
  intense: Hammer,
};

const DAY_LABEL = {
  training: 'Training Day',
  rest: 'Rest Day',
};

const DAY_PILL_CLASS = {
  training: 'text-accent-blue border-accent-blue/20 bg-accent-blue/10',
  rest: 'text-accent-indigo border-accent-indigo/20 bg-accent-indigo/10',
};

const DAY_ICON_BY_KEY = {
  training: Dumbbell,
  rest: Bed,
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

export const DailyNeatOverrideModal = ({
  isOpen,
  isClosing,
  dayType,
  globalMultiplier,
  currentPresetKey,
  onApply,
  onClear,
  onClose,
}) => {
  const normalizedDayType = dayType === 'training' ? 'training' : 'rest';
  const options = ACTIVITY_PRESET_OPTIONS[normalizedDayType] ?? [];
  const resolvedGlobalMultiplier = Number.isFinite(Number(globalMultiplier))
    ? Number(globalMultiplier)
    : DEFAULT_ACTIVITY_MULTIPLIERS[normalizedDayType];
  const [selectedKey, setSelectedKey] = useState(() => {
    const isValidPreset = options.some(
      (option) => option.key === currentPresetKey
    );
    return isValidPreset ? currentPresetKey : null;
  });

  if (!isOpen) {
    return null;
  }

  const selectedOption = options.find((option) => option.key === selectedKey);
  const DayIcon = DAY_ICON_BY_KEY[normalizedDayType];

  const handleApply = () => {
    if (selectedOption) {
      onApply({
        multiplier: selectedOption.value,
        presetKey: selectedOption.key,
        label: selectedOption.label,
      });
    } else {
      onClear();
    }
  };
  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      overlayClassName="bg-surface/80 z-[65]"
      contentClassName="p-4 md:p-6 w-full md:max-w-xl"
    >
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-foreground font-bold text-xl md:text-2xl">
          Activity Level
        </h3>
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium border px-3 py-0.5 rounded-full ${
            DAY_PILL_CLASS[normalizedDayType]
          }`}
        >
          <DayIcon size={12} />
          {DAY_LABEL[normalizedDayType]}
        </span>
      </div>

      <p className="text-muted text-sm mb-4">
        Tune today&apos;s non-exercise (NEAT) burn without touching your global
        settings. This applies to today only.
      </p>

      <div className="space-y-3">
        {options.map((option) => {
          const isActive = selectedKey === option.key;
          const Icon = PRESET_ICON_BY_KEY[option.key] ?? Users;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setSelectedKey(isActive ? null : option.key)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4 focus-ring pressable-card ${
                isActive
                  ? 'bg-primary border-primary/70 text-primary-foreground shadow-lg md:hover:brightness-110'
                  : 'bg-surface-highlight border-border text-foreground md:hover:border-accent-blue/50'
              }`}
            >
              <div className="flex-shrink-0 rounded-full p-2 bg-surface-highlight/20">
                <Icon size={24} className="flex-shrink-0" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">{option.label}</p>
                <p
                  className={`text-sm mt-1 ${
                    isActive ? 'opacity-90' : 'text-muted'
                  }`}
                >
                  {option.description}
                </p>
                <p
                  className={`text-xs mt-3 ${
                    isActive ? 'opacity-80' : 'text-muted'
                  }`}
                >
                  NEAT offset: {formatMultiplier(option.value)}
                </p>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setSelectedKey(selectedKey === 'default' ? null : 'default')
          }
          className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4 focus-ring pressable-card ${
            selectedKey === 'default'
              ? 'bg-primary border-primary/70 text-primary-foreground shadow-lg md:hover:brightness-110'
              : 'bg-surface-highlight border-border text-foreground md:hover:border-accent-blue/50'
          }`}
        >
          <div className="flex-shrink-0 rounded-full p-2 bg-surface-highlight/20">
            <RotateCcw size={24} className="flex-shrink-0" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-lg">Use my settings (default)</p>
            <p className="text-sm mt-1 opacity-90">
              Clear today&apos;s override and fall back to{' '}
              {formatMultiplier(resolvedGlobalMultiplier)} NEAT.
            </p>
          </div>
        </button>
      </div>

      <div className="flex gap-2 md:gap-3 mt-4">
        <button
          onClick={onClose}
          type="button"
          className="flex-1 bg-surface-highlight text-foreground px-4 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback md:hover:bg-surface"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          type="button"
          className="flex-1 bg-primary active:brightness-110 text-primary-foreground px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          {selectedOption != null ? 'Apply to today' : 'Use default'}
        </button>
      </div>
    </ModalShell>
  );
};
