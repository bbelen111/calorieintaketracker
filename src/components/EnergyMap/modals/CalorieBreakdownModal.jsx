import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { goals as baseGoals } from '../../../constants/goals';
import { ACTIVITY_TIERS } from '../../../constants/activityPresets';

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
  const resolvedGoals = goals ?? baseGoals;

  if (!isOpen || !breakdown) {
    return null;
  }

  const goal = resolvedGoals[selectedGoal];
  const formattedDifference =
    difference !== null && difference !== undefined ? difference : null;
  const bmrDetails = breakdown.bmrDetails ?? {};
  const usesBodyFat = bmrDetails.method === 'katch-mcardle';
  const formatNumber = (value, digits = 1) =>
    Number.isFinite(value) ? value.toFixed(digits) : '—';
  const formatWhole = (value) =>
    Number.isFinite(value) ? Math.round(value).toLocaleString() : '—';
  const stepDetails = breakdown.stepDetails ?? {};
  const trainingDuration = breakdown.trainingDuration ?? 0;
  const trainingCaloriesPerHour = breakdown.trainingCaloriesPerHour ?? 0;
  const showTrainingFormula =
    selectedDay === 'training' &&
    trainingDuration > 0 &&
    breakdown.trainingBurn > 0;
  const cardioDetails = Array.isArray(breakdown.cardioDetails)
    ? breakdown.cardioDetails
    : [];

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
            <h3 className="text-foreground font-bold text-xl">
              Calorie Breakdown
            </h3>
            <p className="text-muted text-sm mt-1">
              {typeof stepRange === 'number'
                ? stepRange.toLocaleString()
                : stepRange}{' '}
              steps • {selectedDay === 'training' ? 'Training' : 'Rest'} day •{' '}
              {goal.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted md:hover:text-foreground transition-colors focus-ring"
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-blue-600 rounded-xl p-4 text-center mb-4">
          <p className="text-white text-sm uppercase tracking-wide">
            Goal Target
          </p>
          <p className="text-white text-3xl font-extrabold mt-1">
            {targetCalories?.toLocaleString() ?? '—'}
          </p>
          {formattedDifference !== null && formattedDifference !== 0 && (
            <p className={`text-sm font-semibold mt-2 text-white/80`}>
              {formattedDifference > 0 ? '+' : ''}
              {formattedDifference.toLocaleString()} kcal from TDEE
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
            <p className="text-muted text-xs">
              Calories burned at complete rest for vital functions.
            </p>
            {usesBodyFat ? (
              <p className="text-muted text-xs mt-2">
                <strong>Formula:</strong>
                <br />
                Lean mass = {formatNumber(bmrDetails.weight, 1)} × (1 −{' '}
                {formatNumber(bmrDetails.bodyFat, 1)}%) ={' '}
                {formatNumber(bmrDetails.leanMass, 1)} kg
                <br />
                BMR = 370 + 21.6 × {formatNumber(bmrDetails.leanMass, 1)} ={' '}
                {breakdown.bmr.toLocaleString()} kcal
              </p>
            ) : (
              <p className="text-muted text-xs mt-2">
                <strong>Formula:</strong> Mifflin-St Jeor equation
                <br />
                (10 × {formatWhole(bmrDetails.weight)}) + (6.25 ×{' '}
                {formatWhole(bmrDetails.height)}) - (5 ×{' '}
                {formatWhole(bmrDetails.age)}){' '}
                {bmrDetails.gender === 'male' ? '+ 5' : '- 161'} ={' '}
                {breakdown.bmr.toLocaleString()} kcal
              </p>
            )}
          </BreakdownItem>

          <BreakdownItem
            label={`Daily Activity NEAT (~${Math.round(breakdown.activityMultiplier * 100)}%)`}
            value={breakdown.baseActivity}
            total={breakdown.total}
            expanded={expandedItem === 'neat'}
            onToggle={() => toggleExpanded('neat')}
          >
            <p className="text-muted text-xs">
              Non-exercise daily movements (walking, standing, fidgeting).
            </p>
            {breakdown.activityTier &&
              ACTIVITY_TIERS[breakdown.activityTier] && (
                <p className="text-muted text-xs mt-2">
                  <strong>Activity Level:</strong>{' '}
                  {ACTIVITY_TIERS[breakdown.activityTier].label}
                </p>
              )}
            <p className="text-muted text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              {breakdown.bmr.toLocaleString()} (BMR) ×{' '}
              {breakdown.activityMultiplier.toFixed(2)} ={' '}
              {breakdown.baseActivity.toLocaleString()} kcal
            </p>
          </BreakdownItem>

          <BreakdownItem
            label={`Steps (~${breakdown.estimatedSteps.toLocaleString()} steps)`}
            value={breakdown.stepCalories}
            total={breakdown.total}
            expanded={expandedItem === 'steps'}
            onToggle={() => toggleExpanded('steps')}
          >
            <p className="text-muted text-xs">
              Calories from walking/running in your step range.
            </p>
            <p className="text-muted text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              {breakdown.estimatedSteps.toLocaleString()} steps ÷{' '}
              {formatWhole(stepDetails.stepsPerMile)} steps/mi ={' '}
              {formatNumber(stepDetails.distanceMiles, 2)} mi
              <br />
              {formatNumber(stepDetails.distanceMiles, 2)} mi ×{' '}
              {formatNumber(stepDetails.caloriesPerMile, 1)} kcal/mi ={' '}
              {breakdown.stepCalories.toLocaleString()} kcal
            </p>
            <p className="text-muted text-xs mt-2">
              Stride length: {formatNumber(stepDetails.strideLengthMeters, 2)} m
              • Weight used: {formatNumber(stepDetails.weightKg, 1)} kg
            </p>
          </BreakdownItem>

          <BreakdownItem
            label="Training"
            value={breakdown.trainingBurn}
            total={breakdown.total}
            expanded={expandedItem === 'training'}
            onToggle={() => toggleExpanded('training')}
          >
            <p className="text-muted text-xs">
              Structured training session (resistance, weights, etc.).
            </p>
            {showTrainingFormula ? (
              <p className="text-muted text-xs mt-2">
                <strong>Calculation:</strong>
                <br />
                {formatWhole(trainingCaloriesPerHour)} kcal/hr ×{' '}
                {formatNumber(trainingDuration, 0)} min ÷ 60 ={' '}
                {breakdown.trainingBurn.toLocaleString()} kcal
              </p>
            ) : (
              <p className="text-muted text-xs mt-2">
                Rest day — no training calories.
              </p>
            )}
          </BreakdownItem>

          <BreakdownItem
            label="Cardio"
            value={breakdown.cardioBurn}
            total={breakdown.total}
            expanded={expandedItem === 'cardio'}
            onToggle={() => toggleExpanded('cardio')}
          >
            <p className="text-muted text-xs">
              Cardio sessions (running, cycling, swimming, etc.).
            </p>
            {cardioDetails.length ? (
              <div className="text-muted text-xs mt-2 space-y-2">
                <p className="font-semibold text-foreground">Calculation:</p>
                {cardioDetails.map((detail, index) =>
                  detail.effortType === 'heartRate' ? (
                    <p key={`${detail.typeKey}-${index}`}>
                      <strong>{detail.typeLabel}</strong>:{' '}
                      {formatNumber(detail.caloriesPerMinute, 2)} kcal/min ×{' '}
                      {formatWhole(detail.durationMinutes)} min ={' '}
                      {detail.calories.toLocaleString()} kcal (avg HR{' '}
                      {formatWhole(detail.averageHeartRate)} bpm)
                    </p>
                  ) : (
                    <p key={`${detail.typeKey}-${index}`}>
                      <strong>{detail.typeLabel}</strong> ({detail.intensityKey}
                      ) MET {formatNumber(detail.met, 1)} ×{' '}
                      {formatNumber(detail.weightKg, 1)} kg ×{' '}
                      {formatNumber(detail.hours, 2)} hr ={' '}
                      {detail.calories.toLocaleString()} kcal
                    </p>
                  )
                )}
              </div>
            ) : (
              <p className="text-muted text-xs mt-2">
                No cardio sessions logged.
              </p>
            )}
          </BreakdownItem>

          <div className="border border-border rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-muted font-semibold">Total TDEE</span>
            <span className="text-foreground font-bold text-lg">
              {breakdown.total.toLocaleString()} kcal
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 bg-surface-highlight md:hover:bg-surface-highlight/80 text-foreground py-3 rounded-lg transition-all"
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
    <div className="bg-surface-highlight/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 md:hover:bg-surface-highlight/60 transition-colors text-left active:scale-[0.99]"
      >
        <span className="text-muted flex items-center gap-2">
          {label}
          <span
            className={`text-foreground transition-transform duration-300 ${
              expanded ? 'rotate-180' : 'rotate-0'
            }`}
          >
            <ChevronDown size={16} />
          </span>
        </span>
        <span className="text-foreground font-semibold flex items-center gap-3">
          <span className="text-muted text-xs">{percentage}%</span>
          {value.toLocaleString()} kcal
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
};
