import React from 'react';
import { X } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const CalorieBreakdownModal = ({
  isOpen,
  isClosing,
  stepRange,
  selectedDay,
  selectedGoal,
  goals,
  breakdown,
  targetCalories,
  difference,
  onClose,
}) => {
  if (!isOpen || !breakdown) {
    return null;
  }

  const goal = goals[selectedGoal];
  const formattedDifference =
    difference !== null && difference !== undefined ? difference : null;

  return (
    <ModalShell isOpen={isOpen} isClosing={isClosing}>
      <div className="p-5 md:p-6 w-full max-w-xlg">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-white font-bold text-xl">Calorie Breakdown</h3>
            <p className="text-slate-400 text-sm mt-1">
              {stepRange} steps •{' '}
              {selectedDay === 'training' ? 'Training' : 'Rest'} day •{' '}
              {goal.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className={`${goal.color} rounded-xl p-4 text-center mb-4`}>
          <p className="text-white text-sm uppercase tracking-wide">
            Goal Target
          </p>
          <p className="text-white text-3xl font-extrabold mt-1">
            {targetCalories?.toLocaleString() ?? '—'}
          </p>
          {formattedDifference !== null && formattedDifference !== 0 && (
            <p
              className={`text-sm font-semibold mt-2 ${
                formattedDifference > 0 ? 'text-green-200' : 'text-red-200'
              }`}
            >
              {formattedDifference > 0 ? '+' : ''}
              {formattedDifference.toLocaleString()} cal from TDEE
            </p>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between bg-slate-700/40 rounded-lg px-4 py-3">
            <span className="text-slate-400">BMR</span>
            <span className="text-white font-semibold">
              {breakdown.bmr.toLocaleString()} cal
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-700/40 rounded-lg px-4 py-3">
            <span className="text-slate-400">
              Daily Activity NEAT (~
              {Math.round(breakdown.activityMultiplier * 100)}%)
            </span>
            <span className="text-white font-semibold">
              {breakdown.baseActivity.toLocaleString()} cal
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-700/40 rounded-lg px-4 py-3">
            <span className="text-slate-400">
              Steps (~{breakdown.estimatedSteps.toLocaleString()} steps)
            </span>
            <span className="text-white font-semibold">
              {breakdown.stepCalories.toLocaleString()} cal
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-700/40 rounded-lg px-4 py-3">
            <span className="text-slate-400">Training</span>
            <span className="text-white font-semibold">
              {breakdown.trainingBurn.toLocaleString()} cal
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-700/40 rounded-lg px-4 py-3">
            <span className="text-slate-400">Cardio</span>
            <span className="text-white font-semibold">
              {breakdown.cardioBurn.toLocaleString()} cal
            </span>
          </div>
          <div className="border border-slate-600 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-slate-300 font-semibold">Total TDEE</span>
            <span className="text-white font-bold text-lg">
              {breakdown.total.toLocaleString()} cal
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg transition-all"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
};
