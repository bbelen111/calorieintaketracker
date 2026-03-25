import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { goals as baseGoals } from '../../../../constants/goals';

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
  onOpenBmrInfo,
  onOpenTefInfo,
  onOpenAdaptiveThermogenesisInfo,
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
  const formatPercent = (value) => {
    if (!Number.isFinite(value)) {
      return '—';
    }

    const percent = value * 100;
    return Number.isInteger(percent)
      ? `${percent.toFixed(0)}%`
      : `${percent.toFixed(1)}%`;
  };
  const stepDetails = breakdown.stepDetails ?? {};
  const originalEstimatedSteps =
    breakdown.originalEstimatedSteps ?? stepDetails.originalEstimatedSteps;
  const deductedSteps = breakdown.deductedSteps ?? stepDetails.deductedSteps;
  const remainingEstimatedSteps =
    breakdown.remainingEstimatedSteps ?? stepDetails.remainingEstimatedSteps;
  const hasStepOverlapDeduction =
    Number.isFinite(deductedSteps) && deductedSteps > 0;
  const trainingDuration = breakdown.trainingDuration ?? 0;
  const trainingCaloriesPerHour = breakdown.trainingCaloriesPerHour ?? 0;
  const rawActivityMultiplier =
    breakdown.rawActivityMultiplier ?? breakdown.activityMultiplier ?? 0;
  const effectiveActivityMultiplier =
    breakdown.effectiveActivityMultiplier ?? breakdown.activityMultiplier ?? 0;
  const tefOffsetApplied = breakdown.tefOffsetApplied ?? 0;
  const smartTefCalories = breakdown.smartTefCalories ?? 0;
  const smartTefDetails = breakdown.smartTefDetails ?? null;
  const smartTefMode = breakdown.tefMode ?? 'off';
  const epocEnabled = breakdown.epocEnabled ?? false;
  const epocCalories = breakdown.epocCalories ?? 0;
  const trainingEpoc = breakdown.trainingEpoc ?? 0;
  const cardioEpoc = breakdown.cardioEpoc ?? 0;
  const epocFromTodaySessions = breakdown.epocFromTodaySessions ?? 0;
  const epocCarryInCalories = breakdown.epocCarryInCalories ?? 0;
  const resolvedAdaptiveMode = breakdown.adaptiveThermogenesisMode ?? 'off';
  const adaptiveThermogenesisCorrection =
    breakdown.adaptiveThermogenesisCorrection ?? 0;
  const adaptiveThermogenesis = breakdown.adaptiveThermogenesis ?? null;
  const baselineTdee = breakdown.baselineTotal ?? breakdown.total;
  const showAdaptiveThermogenesisItem =
    resolvedAdaptiveMode !== 'off' ||
    Math.abs(adaptiveThermogenesisCorrection) > 0;
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
            {typeof onOpenBmrInfo === 'function' && (
              <LearnMoreButton onClick={onOpenBmrInfo} />
            )}
          </BreakdownItem>

          <BreakdownItem
            label={`Daily Activity NEAT (~${Math.round(effectiveActivityMultiplier * 100)}%)`}
            value={breakdown.baseActivity}
            total={breakdown.total}
            expanded={expandedItem === 'neat'}
            onToggle={() => toggleExpanded('neat')}
          >
            <p className="text-muted text-xs">
              Non-exercise daily movements (walking, standing, fidgeting).
            </p>
            <p className="text-muted text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              {breakdown.bmr.toLocaleString()} (BMR) ×{' '}
              {effectiveActivityMultiplier.toFixed(2)} ={' '}
              {breakdown.baseActivity.toLocaleString()} kcal
            </p>
            {tefOffsetApplied > 0 && (
              <p className="text-muted text-xs mt-2">
                Selected NEAT: {formatPercent(rawActivityMultiplier)} • TEF
                offset: -{formatPercent(tefOffsetApplied)} • Effective:{' '}
                {formatPercent(effectiveActivityMultiplier)}
              </p>
            )}
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
            {hasStepOverlapDeduction && (
              <p className="text-muted text-xs mt-2">
                Overlap adjustment: {formatWhole(originalEstimatedSteps)}{' '}
                original steps − {formatWhole(deductedSteps)} deducted from
                cardio = {formatWhole(remainingEstimatedSteps)} remaining steps.
              </p>
            )}
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

          {epocEnabled && epocCalories > 0 && (
            <BreakdownItem
              label="EPOC (Post-Exercise Burn)"
              value={epocCalories}
              total={breakdown.total}
              expanded={expandedItem === 'epoc'}
              onToggle={() => toggleExpanded('epoc')}
            >
              <p className="text-muted text-xs">
                Additional calories burned after sessions from elevated oxygen
                demand and recovery processes.
              </p>
              <p className="text-muted text-xs mt-2">
                Training contribution: {formatWhole(trainingEpoc)} kcal
                <br />
                Cardio contribution: {formatWhole(cardioEpoc)} kcal
                <br />
                From today&apos;s sessions: {formatWhole(epocFromTodaySessions)}{' '}
                kcal
                <br />
                Carry-in from previous day: {formatWhole(epocCarryInCalories)}{' '}
                kcal
              </p>
            </BreakdownItem>
          )}

          {smartTefMode !== 'off' && (
            <BreakdownItem
              label={
                smartTefMode === 'dynamic'
                  ? 'Smart TEF (Dynamic)'
                  : smartTefMode === 'target'
                    ? 'Smart TEF (Target)'
                    : 'Smart TEF'
              }
              value={smartTefCalories}
              total={breakdown.total}
              expanded={expandedItem === 'smart-tef'}
              onToggle={() => toggleExpanded('smart-tef')}
            >
              <p className="text-muted text-xs">
                Thermic effect of food estimated from your macro mix.
              </p>
              {smartTefDetails ? (
                <div className="text-muted text-xs mt-2 space-y-2">
                  <p>
                    <strong>
                      {smartTefMode === 'dynamic'
                        ? 'Dynamic mode:'
                        : 'Target mode:'}
                    </strong>{' '}
                    {smartTefMode === 'dynamic'
                      ? 'Uses the macros you have logged so far.'
                      : 'Uses your weight-based macro targets and carbs from remaining calories.'}
                  </p>
                  <div className="space-y-1">
                    <p>
                      Protein:{' '}
                      {formatNumber(smartTefDetails.proteinCalories, 1)} kcal ×
                      25% ={' '}
                      {formatNumber(smartTefDetails.proteinTefCalories, 1)} kcal
                    </p>
                    <p>
                      Carbs: {formatNumber(smartTefDetails.carbCalories, 1)}{' '}
                      kcal × 8% ={' '}
                      {formatNumber(smartTefDetails.carbTefCalories, 1)} kcal
                    </p>
                    <p>
                      Fat: {formatNumber(smartTefDetails.fatCalories, 1)} kcal ×{' '}
                      2% = {formatNumber(smartTefDetails.fatTefCalories, 1)}{' '}
                      kcal
                    </p>
                  </div>
                  {smartTefMode === 'target' && (
                    <p>
                      Target intake used:{' '}
                      {formatWhole(smartTefDetails.targetCalories)} kcal • P{' '}
                      {formatNumber(smartTefDetails.proteinGrams, 1)}g • C{' '}
                      {formatNumber(smartTefDetails.carbsGrams, 1)}g • F{' '}
                      {formatNumber(smartTefDetails.fatsGrams, 1)}g
                    </p>
                  )}
                  {smartTefMode === 'dynamic' && (
                    <p>
                      Logged macros used: P{' '}
                      {formatNumber(smartTefDetails.proteinGrams, 1)}g • C{' '}
                      {formatNumber(smartTefDetails.carbsGrams, 1)}g • F{' '}
                      {formatNumber(smartTefDetails.fatsGrams, 1)}g
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted text-xs mt-2">
                  No macro context available for this Smart TEF view.
                </p>
              )}
              {typeof onOpenTefInfo === 'function' && (
                <LearnMoreButton onClick={onOpenTefInfo} />
              )}
            </BreakdownItem>
          )}

          {showAdaptiveThermogenesisItem && (
            <BreakdownItem
              label={`Adaptive Thermogenesis (${resolvedAdaptiveMode === 'smart' ? 'Smart' : resolvedAdaptiveMode === 'crude' ? 'Crude' : 'Off'})`}
              value={adaptiveThermogenesisCorrection}
              total={breakdown.total}
              expanded={expandedItem === 'adaptive-thermogenesis'}
              onToggle={() => toggleExpanded('adaptive-thermogenesis')}
            >
              <p className="text-muted text-xs">
                Post-formula correction applied to baseline TDEE to account for
                metabolic adaptation.
              </p>
              <p className="text-muted text-xs mt-2">
                Baseline TDEE: {Math.round(baselineTdee).toLocaleString()} kcal
                <br />
                Correction: {adaptiveThermogenesisCorrection > 0 ? '+' : ''}
                {Math.round(
                  adaptiveThermogenesisCorrection
                ).toLocaleString()}{' '}
                kcal
                <br />
                Adjusted TDEE: {Math.round(
                  breakdown.total
                ).toLocaleString()}{' '}
                kcal
              </p>
              {adaptiveThermogenesis?.details && (
                <p className="text-muted text-xs mt-2">
                  {adaptiveThermogenesis.mode === 'smart'
                    ? `Confidence: ${Math.round((adaptiveThermogenesis.confidence ?? 0) * 100)}%`
                    : `Goal duration: ${adaptiveThermogenesis.details.goalDurationDays ?? 0} days`}
                </p>
              )}
              {adaptiveThermogenesis?.insufficientData && (
                <p className="text-muted text-xs mt-2">
                  Smart mode needs more weight/intake history before applying a
                  correction.
                </p>
              )}
              {typeof onOpenAdaptiveThermogenesisInfo === 'function' && (
                <LearnMoreButton onClick={onOpenAdaptiveThermogenesisInfo} />
              )}
            </BreakdownItem>
          )}

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

const LearnMoreButton = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-xs text-accent-blue md:hover:text-accent-blue/80 transition-colors focus-ring rounded pressable-inline"
  >
    Learn more
  </button>
);

const BreakdownItem = ({
  label,
  value,
  total,
  expanded,
  onToggle,
  children,
}) => {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  const displayValue = value.toLocaleString();

  return (
    <div className="bg-surface-highlight/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 md:hover:bg-surface-highlight/60 transition-colors text-left active:scale-[0.99] focus-ring"
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
          {displayValue} kcal
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
