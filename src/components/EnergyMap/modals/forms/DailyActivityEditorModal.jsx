import React from 'react';
import { PenLine, Armchair, Users, Hammer, Settings } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import {
  ACTIVITY_PRESET_OPTIONS,
  DEFAULT_ACTIVITY_MULTIPLIERS,
} from '../../../../constants/activity/activityPresets';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';

const DEFAULT_PRESET_KEY = 'default';

const titles = {
  training: 'Training Day NEAT',
  rest: 'Rest Day NEAT',
};

const ACTIVE_CARD_CLASS =
  'bg-primary border-primary/70 text-primary-foreground shadow-lg md:hover:brightness-110';
const INACTIVE_CARD_CLASS =
  'bg-surface-highlight border-border text-foreground md:hover:border-accent-blue/50';

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
      return Armchair;
    case 'default':
      return Users;
    case 'active':
    case 'intense':
      return Hammer;
    default:
      return Users;
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
  const activePreset = resolvedPreset ?? DEFAULT_PRESET_KEY;
  const multiplier =
    resolvedMultiplier ?? DEFAULT_ACTIVITY_MULTIPLIERS[dayType];
  const customSelected = activePreset === 'custom';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      overlayClassName="bg-surface/80 z-[70]"
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
            <ActivityOptionCard
              key={option.key}
              title={option.label}
              description={option.description}
              summary={`NEAT offset: ${formatMultiplier(option.value)}`}
              icon={getActivityIcon(option.key)}
              isActive={isActive}
              onClick={() => onSelectPreset(dayType, option.key, option.value)}
            />
          );
        })}

        <ActivityOptionCard
          title="Custom"
          description="Set your own NEAT offset when the presets do not match your routine."
          summary={`Current NEAT offset: ${formatMultiplier(multiplier)}`}
          icon={Settings}
          isActive={customSelected}
          onClick={() => onSelectCustom(dayType, customSelected)}
          footer={
            customSelected && (
              <p className="text-xs text-primary-foreground/90 mt-2 flex items-center gap-1">
                <PenLine size={14} />
                Tap again to edit the NEAT percentage
              </p>
            )
          }
        />
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

const ActivityOptionCard = ({
  title,
  description,
  summary,
  icon: Icon,
  isActive,
  onClick,
  footer,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4 focus-ring pressable-card ${
      isActive ? ACTIVE_CARD_CLASS : INACTIVE_CARD_CLASS
    }`}
  >
    <div className="flex-shrink-0 rounded-full p-2 bg-surface-highlight/20">
      <Icon size={28} className="flex-shrink-0" />
    </div>
    <div className="flex-1">
      <p className="font-semibold text-lg">{title}</p>
      <p className={`text-sm mt-1 ${isActive ? 'opacity-90' : 'text-muted'}`}>
        {description}
      </p>
      <p className={`text-xs mt-3 ${isActive ? 'opacity-80' : 'text-muted'}`}>
        {summary}
      </p>
      {footer}
    </div>
  </button>
);
