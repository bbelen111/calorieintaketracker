import React from 'react';
import { Info, X } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { formatWeight } from '../../../../utils/weight';
import { formatBodyFat } from '../../../../utils/bodyFat';
import { calculateFFMI, getFFMICategory } from '../../../../utils/calculations';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';

export const FfmiInfoModal = ({ isOpen, isClosing, userData, onClose }) => {
  const { storeUserData } = useEnergyMapStore(
    (state) => ({ storeUserData: state.userData }),
    shallow
  );
  const resolvedUserData = userData ?? storeUserData;
  const weight = resolvedUserData?.weight;
  const height = resolvedUserData?.height;
  const gender = resolvedUserData?.gender || 'male';

  const bodyFatEntries = Array.isArray(resolvedUserData?.bodyFatEntries)
    ? resolvedUserData.bodyFatEntries
    : [];
  const latestBodyFatEntry = bodyFatEntries.length
    ? [...bodyFatEntries].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    : null;
  const bodyFatPercent = latestBodyFatEntry?.bodyFat;

  const ffmiData = calculateFFMI(weight, height, bodyFatPercent);
  const category = getFFMICategory(ffmiData?.normalized, gender);

  const colorMap = {
    blue: 'text-accent-blue',
    green: 'text-accent-green',
    emerald: 'text-accent-emerald',
    purple: 'text-accent-purple',
    amber: 'text-accent-amber',
    red: 'text-accent-red',
    slate: 'text-accent-slate',
  };

  const isMale = gender === 'male';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="text-accent-blue" />
          <h3 className="text-foreground font-bold text-xl">What is FFMI?</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-muted">
        <p>
          <span className="font-bold text-foreground">
            FFMI (Fat-Free Mass Index)
          </span>{' '}
          is a measure of how much muscle you carry relative to your height.
          Unlike BMI, it accounts for body composition by only considering lean
          mass.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4">
          <p className="font-bold text-foreground mb-2">Formula:</p>
          <div className="p-3 bg-background/50 rounded font-mono text-xs md:text-sm space-y-2">
            <p className="text-muted">Lean mass = weight × (1 − body fat %)</p>
            <p className="text-accent-blue">
              FFMI = lean mass (kg) ÷ height (m)²
            </p>
            <p className="text-accent-purple">
              Normalized = FFMI + 6.1 × (1.8 − height in m)
            </p>
          </div>
        </div>

        <div className="bg-surface-highlight/50 rounded-lg p-4">
          <p className="font-bold text-foreground mb-3">
            FFMI Categories ({isMale ? 'Male' : 'Female'}):
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-accent-blue">Below average</span>
              <span>&lt; {isMale ? '18' : '15.5'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Average</span>
              <span>{isMale ? '18 - 19.9' : '15.5 - 17.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-accent-green">Above average</span>
              <span>{isMale ? '20 - 21.9' : '17.5 - 19.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-accent-emerald">Excellent</span>
              <span>{isMale ? '22 - 22.9' : '19.5 - 20.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-accent-purple">Elite</span>
              <span>{isMale ? '23 - 24.9' : '20.5 - 22.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-accent-amber">Pro-level</span>
              <span>{isMale ? '25 - 26.9' : '22.5 - 24.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-accent-red">Suspiciously high</span>
              <span>≥ {isMale ? '27' : '24.5'}</span>
            </div>
          </div>
        </div>

        <div className="bg-accent-blue/15 border border-accent-blue/50 rounded-lg p-4">
          <p className="font-bold text-accent-blue mb-2">Your Current FFMI:</p>
          <div className="text-sm space-y-1">
            <p>
              Weight:{' '}
              <span className="text-foreground font-semibold">
                {formatWeight(weight)} kg
              </span>
            </p>
            <p>
              Height:{' '}
              <span className="text-foreground font-semibold">{height} cm</span>
            </p>
            <p>
              Body fat:{' '}
              <span className="text-foreground font-semibold">
                {bodyFatPercent != null
                  ? `${formatBodyFat(bodyFatPercent)}%`
                  : 'Not tracked'}
              </span>
            </p>
            {ffmiData && (
              <p>
                Lean mass:{' '}
                <span className="text-foreground font-semibold">
                  {ffmiData.leanMass.toFixed(1)} kg
                </span>
              </p>
            )}
            <div className="border-t border-accent-blue/50 mt-2 pt-2">
              <p className="text-lg">
                Your FFMI:{' '}
                <span className="text-foreground font-bold">
                  {ffmiData ? ffmiData.normalized.toFixed(1) : '—'}
                </span>
                {ffmiData && category.label !== 'Unknown' && (
                  <span className={`ml-2 ${colorMap[category.color]}`}>
                    ({category.label})
                  </span>
                )}
              </p>
            </div>
          </div>
          {!ffmiData && (
            <p className="text-accent-amber text-sm mt-2">
              Enable body fat tracking and add an entry to calculate your FFMI.
            </p>
          )}
        </div>

        <p className="text-sm italic text-muted">
          Note: An FFMI above 25 for natural athletes is extremely rare. Values
          above 27 are typically only achievable with performance-enhancing
          drugs.
        </p>
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          type="button"
          className="w-full bg-accent-blue active:bg-accent-blue/80 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
        >
          Got it!
        </button>
      </div>
    </ModalShell>
  );
};
