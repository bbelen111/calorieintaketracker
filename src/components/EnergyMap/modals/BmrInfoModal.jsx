import React from 'react';
import { Info, X } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatDateLabel, formatWeight } from '../../../utils/weight';
import { formatBodyFat } from '../../../utils/bodyFat';

export const BmrInfoModal = ({ isOpen, isClosing, userData, bmr, onClose }) => {
  const bodyFatEntries = Array.isArray(userData?.bodyFatEntries)
    ? userData.bodyFatEntries
    : [];
  const latestBodyFatEntry = bodyFatEntries.length
    ? [...bodyFatEntries].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    : null;
  const latestBodyFatLabel = latestBodyFatEntry
    ? `${formatBodyFat(latestBodyFatEntry.bodyFat)}% • ${formatDateLabel(
        latestBodyFatEntry.date,
        {
          month: 'short',
          day: 'numeric',
        }
      )}`
    : 'No entries yet';
  const weightEntries = Array.isArray(userData?.weightEntries)
    ? userData.weightEntries
    : [];
  const latestWeightEntry = weightEntries.length
    ? [...weightEntries].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    : null;
  const latestWeightLabel = latestWeightEntry
    ? `${formatWeight(latestWeightEntry.weight) ?? latestWeightEntry.weight} kg • ${formatDateLabel(
        latestWeightEntry.date,
        {
          month: 'short',
          day: 'numeric',
        }
      )}`
    : 'No entries yet';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="text-blue-400" />
          <h3 className="text-white font-bold text-xl">What is BMR?</h3>
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
            BMR (Basal Metabolic Rate)
          </span>{' '}
          is the number of calories your body burns at complete rest to maintain
          basic life functions like breathing, circulation, and cell production.
        </p>

        <div className="bg-slate-700/50 rounded-lg p-4">
          <p className="font-bold text-white mb-2">
            How We Calculate Your BMR:
          </p>
          <p className="text-sm">
            If body fat tracking is enabled with a recent entry, we use the{' '}
            <span className="text-emerald-300 font-semibold">
              Katch-McArdle
            </span>{' '}
            formula based on lean mass. Otherwise, we fall back to the{' '}
            <span className="text-blue-400 font-semibold">
              Mifflin-St Jeor Equation
            </span>
            .
          </p>
          <div className="mt-3 p-3 bg-slate-900/50 rounded font-mono text-xs md:text-sm overflow-x-auto space-y-3">
            <div>
              <p className="text-emerald-300">Katch-McArdle (with body fat):</p>
              <p className="mt-1">BMR = 370 + 21.6 × lean mass</p>
              <p className="text-slate-400 mt-1">
                Lean mass = weight × (1 − body fat %)
              </p>
            </div>
            {userData.gender === 'male' ? (
              <div>
                <p className="text-green-400">Mifflin-St Jeor (Men):</p>
                <p className="mt-1">
                  BMR = (10 × weight) + (6.25 × height) - (5 × age) + 5
                </p>
              </div>
            ) : (
              <div>
                <p className="text-pink-400">Mifflin-St Jeor (Women):</p>
                <p className="mt-1">
                  BMR = (10 × weight) + (6.25 × height) - (5 × age) - 161
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
          <p className="font-bold text-blue-300 mb-2">
            Your Current Calculation:
          </p>
          <div className="text-sm space-y-1">
            <p>
              Weight:{' '}
              <span className="text-white font-semibold">
                {latestWeightLabel}
              </span>
            </p>
            {userData.bodyFatTrackingEnabled && (
              <p>
                Body fat:{' '}
                <span className="text-white font-semibold">
                  {latestBodyFatLabel}
                </span>
              </p>
            )}
            <p>
              Height:{' '}
              <span className="text-white font-semibold">
                {userData.height} cm
              </span>
            </p>
            <p>
              Age:{' '}
              <span className="text-white font-semibold">
                {userData.age} years
              </span>
            </p>
            <p>
              Gender:{' '}
              <span className="text-white font-semibold capitalize">
                {userData.gender}
              </span>
            </p>
            <div className="border-t border-blue-700/50 mt-2 pt-2">
              <p className="text-lg">
                Your BMR:{' '}
                <span className="text-white font-bold">{bmr} calories/day</span>
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm italic text-slate-400">
          Note: Your actual daily calorie needs (TDEE) are higher because they
          include daily activity (NEAT), training, and movement (step count)
          throughout the day.
        </p>
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          type="button"
          className="w-full bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
        >
          Got it!
        </button>
      </div>
    </ModalShell>
  );
};
