import React from 'react';
import { PenLine, Armchair, Users, Hammer, Settings } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../common/ModalShell';
import {
  ACTIVITY_PRESET_OPTIONS,
  DEFAULT_ACTIVITY_MULTIPLIERS,
} from '../../../constants/activityPresets';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

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

const getActivityIcon = (key) => {
  switch (key) {
    case 'light':
      return <Armchair size={28} className="flex-shrink-0" />;
    case 'default':
      return <Users size={28} className="flex-shrink-0" />;
    case 'active':
    case 'intense':
      return <Hammer size={28} className="flex-shrink-0" />;
    default:
      return null;
  }
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
  const { userPresets, userMultipliers } = useEnergyMapStore(
    (state) => ({
      userPresets: state.userData?.activityPresets,
      userMultipliers: state.userData?.activityMultipliers,
    }),
    shallow
  );
  if (!isOpen || !dayType) {
    return null;
  }

  const options = ACTIVITY_PRESET_OPTIONS[dayType] ?? [];
  const resolvedPreset = currentPreset ?? userPresets?.[dayType];
  const resolvedMultiplier = currentMultiplier ?? userMultipliers?.[dayType];
  const activePreset = resolvedPreset ?? 'default';
  const multiplier =
    resolvedMultiplier ?? DEFAULT_ACTIVITY_MULTIPLIERS[dayType];
  const customSelected = activePreset === 'custom';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[70]"
      contentClassName="p-4 md:p-6 w-full md:max-w-xl"
    >
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-foreground font-bold text-xl md:text-2xl">
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
              className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4 active:scale-[0.98] focus-ring ${
                isActive
                  ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                  : 'bg-surface-highlight border-border text-foreground md:hover:border-blue-400'
              }`}
            >
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-full bg-white/15 flex-shrink-0 ${isActive ? 'text-white' : 'text-foreground/80'}`}
              >
                {getActivityIcon(option.key)}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">{option.label}</p>
                <p className="text-sm opacity-90 mt-1">{option.description}</p>
                <p className="text-xs opacity-75 mt-3">
                  NEAT offset: {formatMultiplier(option.value)}
                </p>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onSelectCustom(dayType, customSelected)}
          className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4 active:scale-[0.98] ${
            customSelected
              ? 'bg-blue-600 border-blue-400 text-white shadow-lg focus-ring'
              : 'bg-surface-highlight border-border text-foreground md:hover:border-blue-400 focus-ring'
          }`}
        >
          <div
            className={`flex items-center justify-center w-12 h-12 rounded-full bg-white/15 flex-shrink-0 ${customSelected ? 'text-white' : 'text-foreground/80'}`}
          >
            <Settings size={28} className="flex-shrink-0" />
          </div>
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
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full mt-5 bg-surface-highlight md:hover:bg-surface text-foreground py-3 rounded-lg transition-all press-feedback focus-ring"
      >
        Done
      </button>
    </ModalShell>
  );
};
