/* eslint-disable prettier/prettier */
import React from 'react';
import { Info, X } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatWeight } from '../../../utils/weight';
import { formatBodyFat } from '../../../utils/bodyFat';
import { calculateFFMI, getFFMICategory } from '../../../utils/calculations';

export const FfmiInfoModal = ({ isOpen, isClosing, userData, onClose }) => {
  const weight = userData?.weight;
  const height = userData?.height;
  const gender = userData?.gender || 'male';

  const bodyFatEntries = Array.isArray(userData?.bodyFatEntries)
    ? userData.bodyFatEntries
    : [];
  const latestBodyFatEntry = bodyFatEntries.length
    ? [...bodyFatEntries].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    : null;
  const bodyFatPercent = latestBodyFatEntry?.bodyFat;

  const ffmiData = calculateFFMI(weight, height, bodyFatPercent);
  const category = getFFMICategory(ffmiData?.normalized, gender);

  const colorMap = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    emerald: 'text-emerald-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    slate: 'text-slate-400',
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
          <Info size={28} className="text-emerald-400" />
          <h3 className="text-white font-bold text-xl">What is FFMI?</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-slate-300">
        <p>
          <span className="font-bold text-white">
            FFMI (Fat-Free Mass Index)
          </span>{' '}
          is a measure of how much muscle you carry relative to your height.
          Unlike BMI, it accounts for body composition by only considering lean
          mass.
        </p>

        <div className="bg-slate-700/50 rounded-lg p-4">
          <p className="font-bold text-white mb-2">Formula:</p>
          <div className="p-3 bg-slate-900/50 rounded font-mono text-xs md:text-sm space-y-2">
            <p className="text-slate-400">
              Lean mass = weight × (1 − body fat %)
            </p>
            <p className="text-emerald-400">
              FFMI = lean mass (kg) ÷ height (m)²
            </p>
            <p className="text-purple-400">
              Normalized = FFMI + 6.1 × (1.8 − height in m)
            </p>
          </div>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-4">
          <p className="font-bold text-white mb-3">
            FFMI Categories ({isMale ? 'Male' : 'Female'}):
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-400">Below average</span>
              <span>&lt; {isMale ? '18' : '15.5'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Average</span>
              <span>{isMale ? '18 - 19.9' : '15.5 - 17.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-400">Above average</span>
              <span>{isMale ? '20 - 21.9' : '17.5 - 19.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-400">Excellent</span>
              <span>{isMale ? '22 - 22.9' : '19.5 - 20.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-400">Elite</span>
              <span>{isMale ? '23 - 24.9' : '20.5 - 22.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-400">Pro-level</span>
              <span>{isMale ? '25 - 26.9' : '22.5 - 24.4'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-400">Suspiciously high</span>
              <span>≥ {isMale ? '27' : '24.5'}</span>
            </div>
          </div>
        </div>

        <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4">
          <p className="font-bold text-emerald-300 mb-2">Your Current FFMI:</p>
          <div className="text-sm space-y-1">
            <p>
              Weight:{' '}
              <span className="text-white font-semibold">
                {formatWeight(weight)} kg
              </span>
            </p>
            <p>
              Height:{' '}
              <span className="text-white font-semibold">{height} cm</span>
            </p>
            <p>
              Body fat:{' '}
              <span className="text-white font-semibold">
                {bodyFatPercent != null
                  ? `${formatBodyFat(bodyFatPercent)}%`
                  : 'Not tracked'}
              </span>
            </p>
            {ffmiData && (
              <p>
                Lean mass:{' '}
                <span className="text-white font-semibold">
                  {ffmiData.leanMass.toFixed(1)} kg
                </span>
              </p>
            )}
            <div className="border-t border-emerald-700/50 mt-2 pt-2">
              <p className="text-lg">
                Your FFMI:{' '}
                <span className="text-white font-bold">
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
            <p className="text-amber-300 text-sm mt-2">
              Enable body fat tracking and add an entry to calculate your FFMI.
            </p>
          )}
        </div>

        <p className="text-sm italic text-slate-400">
          Note: An FFMI above 25 for natural athletes is extremely rare. Values
          above 27 are typically only achievable with performance-enhancing
          drugs.
        </p>
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          type="button"
          className="w-full bg-emerald-600 active:bg-emerald-700 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
        >
          Got it!
        </button>
      </div>
    </ModalShell>
  );
};
