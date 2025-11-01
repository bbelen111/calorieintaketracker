import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
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
  const [expandedItem, setExpandedItem] = useState(null);

  if (!isOpen || !breakdown) {
    return null;
  }

  const goal = goals[selectedGoal];
  const formattedDifference =
    difference !== null && difference !== undefined ? difference : null;

  const toggleExpanded = (itemKey) => {
    setExpandedItem(expandedItem === itemKey ? null : itemKey);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-5 md:p-6 w-full md:max-w-2xl"
    >
      <div>
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
              className={`text-sm font-semibold mt-2 ${formattedDifference > 0 ? 'text-green-200' : 'text-red-200'
                }`}
            >
              {formattedDifference > 0 ? '+' : ''}
              {formattedDifference.toLocaleString()} cal from TDEE
            </p>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <BreakdownItem
            label="BMR"
            value={breakdown.bmr}
            total={breakdown.total}
            expanded={expandedItem === 'bmr'}
            onToggle={() => toggleExpanded('bmr')}
          >
            <p className="text-slate-400 text-xs">
              Calories burned at complete rest for vital functions.
            </p>
            <p className="text-slate-300 text-xs mt-2">
              <strong>Formula:</strong> Mifflin-St Jeor equation
              <br />
              (10 × weight) + (6.25 × height) - (5 × age) ±{' '}
              {breakdown.bmr > 2000 ? '5' : '161'}
            </p>
          </BreakdownItem>

          <BreakdownItem
            label={`Daily Activity NEAT (~${Math.round(breakdown.activityMultiplier * 100)}%)`}
            value={breakdown.baseActivity}
            total={breakdown.total}
            expanded={expandedItem === 'neat'}
            onToggle={() => toggleExpanded('neat')}
          >
            <p className="text-slate-400 text-xs">
              Non-exercise daily movements (walking, standing, fidgeting).
            </p>
            <p className="text-slate-300 text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              {breakdown.bmr.toLocaleString()} ×{' '}
              {breakdown.activityMultiplier.toFixed(2)} ={' '}
              {breakdown.baseActivity.toLocaleString()} cal
            </p>
          </BreakdownItem>

          <BreakdownItem
            label={`Steps (~${breakdown.estimatedSteps.toLocaleString()} steps)`}
            value={breakdown.stepCalories}
            total={breakdown.total}
            expanded={expandedItem === 'steps'}
            onToggle={() => toggleExpanded('steps')}
          >
            <p className="text-slate-400 text-xs">
              Calories from walking/running in your step range.
            </p>
            <p className="text-slate-300 text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              Stride length × weight × steps × efficiency factor
            </p>
          </BreakdownItem>

          <BreakdownItem
            label="Training"
            value={breakdown.trainingBurn}
            total={breakdown.total}
            expanded={expandedItem === 'training'}
            onToggle={() => toggleExpanded('training')}
          >
            <p className="text-slate-400 text-xs">
              Structured training session (resistance, weights, etc.).
            </p>
            <p className="text-slate-300 text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              Calories per hour × training duration
            </p>
          </BreakdownItem>

          <BreakdownItem
            label="Cardio"
            value={breakdown.cardioBurn}
            total={breakdown.total}
            expanded={expandedItem === 'cardio'}
            onToggle={() => toggleExpanded('cardio')}
          >
            <p className="text-slate-400 text-xs">
              Cardio sessions (running, cycling, swimming, etc.).
            </p>
            <p className="text-slate-300 text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              MET × weight × hours OR heart rate formula
            </p>
          </BreakdownItem>

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

const BreakdownItem = ({
  label,
  value,
  total,
  expanded,
  onToggle,
  children,
}) => {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-slate-700/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/60 transition-colors text-left active:scale-[0.99]"
      >
        <span className="text-slate-400 flex items-center gap-2">
          {label}
          <span
            className={`text-white transition-transform duration-300 ${expanded ? 'rotate-180' : 'rotate-0'
              }`}
          >
            <ChevronDown size={16} />
          </span>
        </span>
        <span className="text-white font-semibold flex items-center gap-3">
          <span className="text-slate-400 text-xs">{percentage}%</span>
          {value.toLocaleString()} cal
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
      >
        <div className="px-4 pb-3 pt-1 border-t border-slate-600/50 space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
};
