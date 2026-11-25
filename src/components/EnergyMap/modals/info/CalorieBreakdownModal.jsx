import React, { useState } from 'react';
import { X, ChevronDown, CalendarDays } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { goals as baseGoals } from '../../../../constants/goals/goals';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import { formatDateLabel } from '../../../../utils/measurements/weight';
import { useUnits } from '../../../../hooks/useUnits';
import { KM_PER_MILE } from '../../../../utils/units/unitFormatter';

const FEET_PER_METRE = 3.28084;

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
  dateKey,
  onOpenBmrInfo,
  onOpenTefInfo,
  onOpenAdaptiveThermogenesisInfo,
  onOpenEpocInfo,
  onClose,
}) => {
  const [expandedItem, setExpandedItem] = useState(null);
  const units = useUnits();
  const resolvedGoals = goals ?? baseGoals;
  const showDateChip = Boolean(dateKey) && dateKey !== getTodayDateKey();
  const dateLabel = showDateChip
    ? formatDateLabel(dateKey, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

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
  // Step math is linear, so it converts whole into the chosen distance unit.
  const { distance, bodyWeight } = units;
  const milesToUnit = KM_PER_MILE / distance.kmPerUnit;
  const stepDistance = stepDetails.distanceMiles * milesToUnit;
  const stepsPerUnit = stepDetails.stepsPerMile / milesToUnit;
  const caloriesPerUnit = stepDetails.caloriesPerMile / milesToUnit;
  const { energy } = units;
  const kcalText = (value) => `${energy.value(value)} ${energy.unit}`;
  const roundedText = (value) =>
    Number.isFinite(value) ? kcalText(value) : '—';
  const detailText = (value, digits = 1) =>
    Number.isFinite(value) ? energy.decimal(value, digits) : '—';
  // Equations defined in kcal print in kcal and append the converted result.
  const equationResult = (value) =>
    energy.isKj
      ? `${value.toLocaleString()} kcal (${energy.format(value)})`
      : `${value.toLocaleString()} kcal`;
  const strideText =
    distance.unit === 'mi'
      ? `${formatNumber(stepDetails.strideLengthMeters * FEET_PER_METRE, 2)} ft`
      : `${formatNumber(stepDetails.strideLengthMeters, 2)} m`;
  // The BMR and MET equations are defined in kg and cm; say what those are in
  // the user's units when they differ.
  const convertedWeight = (kg) =>
    bodyWeight.unit === 'kg' ? null : bodyWeight.format(kg, { fixed: 1 });
  const convertedBmrInputs = [
    convertedWeight(bmrDetails.weight),
    !usesBodyFat && units.height.isFeet
      ? units.height.format(bmrDetails.height)
      : null,
  ].filter(Boolean);
  const originalEstimatedSteps =
    breakdown.originalEstimatedSteps ?? stepDetails.originalEstimatedSteps;
  const deductedSteps = breakdown.deductedSteps ?? stepDetails.deductedSteps;
  const remainingEstimatedSteps =
    breakdown.remainingEstimatedSteps ?? stepDetails.remainingEstimatedSteps;
  const hasStepOverlapDeduction =
    Number.isFinite(deductedSteps) && deductedSteps > 0;
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
  // Per-session lines priced by the canonical formula (heart-rate sessions use
  // Keytel, not kcal/hr), so the explanation always sums to trainingBurn.
  const trainingDetails = Array.isArray(breakdown.trainingDetails)
    ? breakdown.trainingDetails
    : [];
  const cardioDetails = Array.isArray(breakdown.cardioDetails)
    ? breakdown.cardioDetails
    : [];
  const hasHeartRateSessions = [...trainingDetails, ...cardioDetails].some(
    (detail) => detail.effortType === 'heartRate'
  );
  const breakdownRows = [
    { key: 'bmr', value: breakdown.bmr, colorClass: 'bg-accent-slate' },
    {
      key: 'neat',
      value: breakdown.baseActivity,
      colorClass: 'bg-accent-purple',
    },
    {
      key: 'steps',
      value: breakdown.stepCalories,
      colorClass: 'bg-accent-green',
    },
    {
      key: 'training',
      value: breakdown.trainingBurn,
      colorClass: 'bg-accent-blue',
    },
    {
      key: 'cardio',
      value: breakdown.cardioBurn,
      colorClass: 'bg-accent-red',
    },
    ...(epocEnabled && epocCalories > 0
      ? [{ key: 'epoc', value: epocCalories, colorClass: 'bg-accent-teal' }]
      : []),
    ...(smartTefMode !== 'off'
      ? [
          {
            key: 'smart-tef',
            value: smartTefCalories,
            colorClass: 'bg-accent-pink',
          },
        ]
      : []),
    ...(showAdaptiveThermogenesisItem
      ? [
          {
            key: 'adaptive-thermogenesis',
            value: adaptiveThermogenesisCorrection,
            colorClass: 'bg-accent-coral',
          },
        ]
      : []),
  ];
  const barTotal = Number(breakdown.total) || 0;

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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-foreground font-bold text-xl">
                Calorie Breakdown
              </h3>
              {showDateChip && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-accent-blue border border-accent-blue/20 bg-accent-blue/10">
                  <CalendarDays size={11} />
                  {dateLabel}
                </span>
              )}
            </div>
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

        <div className="bg-primary rounded-xl p-4 text-center mb-4">
          <p className="text-primary-foreground text-sm uppercase tracking-wide">
            Goal Target
          </p>
          <p className="text-primary-foreground text-3xl font-extrabold mt-1">
            {targetCalories != null ? energy.value(targetCalories) : '—'}
          </p>
          {selectedGoal === 'maintenance' && !formattedDifference ? (
            <p className="text-sm mt-2 font-semibold uppercase tracking-wide text-primary-foreground/80">
              Maintenance
            </p>
          ) : (
            formattedDifference !== null &&
            formattedDifference !== 0 && (
              <p className="text-sm font-semibold mt-2 text-primary-foreground/80">
                {energy.value(formattedDifference, { signed: true })}{' '}
                {energy.unit} from TDEE
              </p>
            )
          )}
        </div>

        <div className="mb-4 flex h-2 w-full gap-[2px] rounded-full overflow-hidden">
          {breakdownRows
            .filter((row) => (Number(row.value) || 0) > 0)
            .map((row) => {
              const width =
                barTotal > 0 ? (Number(row.value) / barTotal) * 100 : 0;
              return (
                <div
                  key={row.key}
                  className={`${row.colorClass} h-full`}
                  style={{ width: `${width}%` }}
                />
              );
            })}
        </div>

        <div className="space-y-3 text-sm">
          <BreakdownItem
            label="BMR"
            value={breakdown.bmr}
            total={breakdown.total}
            expanded={expandedItem === 'bmr'}
            dotClass="bg-accent-slate"
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
                {convertedWeight(bmrDetails.leanMass) &&
                  ` (${convertedWeight(bmrDetails.leanMass)})`}
                <br />
                BMR = 370 + 21.6 × {formatNumber(bmrDetails.leanMass, 1)} ={' '}
                {equationResult(breakdown.bmr)}
              </p>
            ) : (
              <p className="text-muted text-xs mt-2">
                <strong>Formula:</strong> Mifflin-St Jeor equation
                <br />
                (10 × {formatWhole(bmrDetails.weight)}) + (6.25 ×{' '}
                {formatWhole(bmrDetails.height)}) - (5 ×{' '}
                {formatWhole(bmrDetails.age)}){' '}
                {bmrDetails.gender === 'male' ? '+ 5' : '- 161'} ={' '}
                {equationResult(breakdown.bmr)}
              </p>
            )}
            {convertedBmrInputs.length > 0 && (
              <p className="text-muted text-xs mt-2">
                The formula uses metric inputs. Yours:{' '}
                {convertedBmrInputs.join(', ')}.
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
            dotClass="bg-accent-purple"
            onToggle={() => toggleExpanded('neat')}
          >
            <p className="text-muted text-xs">
              Non-exercise daily movements (walking, standing, fidgeting).
            </p>
            <p className="text-muted text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              {energy.value(breakdown.bmr)} (BMR) ×{' '}
              {effectiveActivityMultiplier.toFixed(2)} ={' '}
              {kcalText(breakdown.baseActivity)}
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
            dotClass="bg-accent-green"
            onToggle={() => toggleExpanded('steps')}
          >
            <p className="text-muted text-xs">
              Calories from walking/running in your step range.
            </p>
            <p className="text-muted text-xs mt-2">
              <strong>Calculation:</strong>
              <br />
              {breakdown.estimatedSteps.toLocaleString()} steps ÷{' '}
              {formatWhole(stepsPerUnit)} steps/{distance.unit} ={' '}
              {formatNumber(stepDistance, 2)} {distance.unit}
              <br />
              {formatNumber(stepDistance, 2)} {distance.unit} ×{' '}
              {detailText(caloriesPerUnit)} {energy.unit}/{distance.unit} ={' '}
              {kcalText(breakdown.stepCalories)}
            </p>
            <p className="text-muted text-xs mt-2">
              Stride length: {strideText} • Weight used:{' '}
              {bodyWeight.format(stepDetails.weightKg, { fixed: 1 })}
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
            dotClass="bg-accent-blue"
            onToggle={() => toggleExpanded('training')}
          >
            <p className="text-muted text-xs">
              Structured training session (resistance, weights, etc.).
            </p>
            {trainingDetails.length ? (
              <div className="text-muted text-xs mt-2 space-y-2">
                <p className="font-semibold text-muted">Calculation:</p>
                {trainingDetails.map((detail, index) =>
                  detail.effortType === 'heartRate' &&
                  detail.hrBurnModel === 'intensity' ? (
                    <p key={`${detail.typeKey}-${index}`}>
                      <strong>{detail.typeLabel}</strong> ({detail.intensityKey}{' '}
                      from avg HR {formatWhole(detail.averageHeartRate)} bpm
                      {detail.heartRatePercent != null &&
                        ` · ${detail.heartRatePercent}% ${
                          detail.heartRateModel === 'hrr' ? 'HRR' : 'of max'
                        }`}
                      ) {roundedText(detail.baseCaloriesPerHour)}/hr ×{' '}
                      {formatNumber(detail.intensityMultiplier, 2)} ×{' '}
                      {formatWhole(detail.durationMinutes)} min ÷ 60 ={' '}
                      {kcalText(detail.calories)}
                    </p>
                  ) : detail.effortType === 'heartRate' ? (
                    <p key={`${detail.typeKey}-${index}`}>
                      <strong>{detail.typeLabel}</strong>:{' '}
                      {detailText(detail.caloriesPerMinute, 2)} {energy.unit}
                      /min × {formatWhole(detail.durationMinutes)} min ={' '}
                      {kcalText(detail.calories)} (avg HR{' '}
                      {formatWhole(detail.averageHeartRate)} bpm)
                    </p>
                  ) : (
                    <p key={`${detail.typeKey}-${index}`}>
                      <strong>{detail.typeLabel}</strong> ({detail.intensityKey}
                      ) {roundedText(detail.baseCaloriesPerHour)}/hr ×{' '}
                      {formatNumber(detail.intensityMultiplier, 2)} ×{' '}
                      {formatWhole(detail.durationMinutes)} min ÷ 60 ={' '}
                      {kcalText(detail.calories)}
                    </p>
                  )
                )}
              </div>
            ) : (
              <p className="text-muted text-xs mt-2">
                {selectedDay === 'training'
                  ? 'No training sessions logged.'
                  : 'Rest day — no training calories.'}
              </p>
            )}
          </BreakdownItem>

          <BreakdownItem
            label="Cardio"
            value={breakdown.cardioBurn}
            total={breakdown.total}
            expanded={expandedItem === 'cardio'}
            dotClass="bg-accent-red"
            onToggle={() => toggleExpanded('cardio')}
          >
            <p className="text-muted text-xs">
              Cardio sessions (running, cycling, swimming, etc.).
            </p>
            {cardioDetails.length ? (
              <div className="text-muted text-xs mt-2 space-y-2">
                <p className="font-semibold text-muted">Calculation:</p>
                {cardioDetails.map((detail, index) =>
                  detail.effortType === 'heartRate' ? (
                    <p key={`${detail.typeKey}-${index}`}>
                      <strong>{detail.typeLabel}</strong>:{' '}
                      {detailText(detail.caloriesPerMinute, 2)} {energy.unit}
                      /min × {formatWhole(detail.durationMinutes)} min ={' '}
                      {kcalText(detail.calories)} (avg HR{' '}
                      {formatWhole(detail.averageHeartRate)} bpm
                      {detail.vo2Max != null &&
                        `, VO2 max ${formatNumber(detail.vo2Max, 1)}`}
                      )
                    </p>
                  ) : (
                    <p key={`${detail.typeKey}-${index}`}>
                      <strong>{detail.typeLabel}</strong> ({detail.intensityKey}
                      ) MET {formatNumber(detail.met, 1)} ×{' '}
                      {formatNumber(detail.weightKg, 1)} kg
                      {convertedWeight(detail.weightKg) &&
                        ` (${convertedWeight(detail.weightKg)})`}{' '}
                      × {formatNumber(detail.hours, 2)} hr ={' '}
                      {equationResult(detail.calories)}
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
              dotClass="bg-accent-teal"
              onToggle={() => toggleExpanded('epoc')}
            >
              <p className="text-muted text-xs">
                Additional calories burned after sessions from elevated oxygen
                demand and recovery processes.
              </p>
              <p className="text-muted text-xs mt-2">
                Training contribution: {roundedText(trainingEpoc)}
                <br />
                Cardio contribution: {roundedText(cardioEpoc)}
                <br />
                From today&apos;s sessions: {roundedText(epocFromTodaySessions)}
                <br />
                Carry-in from previous day: {roundedText(epocCarryInCalories)}
              </p>
              {hasHeartRateSessions && (
                <p className="text-muted text-xs mt-2">
                  Heart-rate sessions set their intensity from your heart rate:
                  as a share of heart-rate reserve once you have resting
                  readings (personal zones), otherwise of age-predicted max.
                </p>
              )}
              {typeof onOpenEpocInfo === 'function' && (
                <LearnMoreButton onClick={onOpenEpocInfo} />
              )}
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
              dotClass="bg-accent-pink"
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
                      : 'Uses your saved split, then applies profile-based protein/fat bounds and lets carbs absorb the remainder.'}
                  </p>
                  <div className="space-y-1">
                    <p>
                      Protein: {detailText(smartTefDetails.proteinCalories)}{' '}
                      {energy.unit} × 25% ={' '}
                      {detailText(smartTefDetails.proteinTefCalories)}{' '}
                      {energy.unit}
                    </p>
                    <p>
                      Carbs: {detailText(smartTefDetails.carbCalories)}{' '}
                      {energy.unit} × 8% ={' '}
                      {detailText(smartTefDetails.carbTefCalories)}{' '}
                      {energy.unit}
                    </p>
                    <p>
                      Fat: {detailText(smartTefDetails.fatCalories)}{' '}
                      {energy.unit} × 2% ={' '}
                      {detailText(smartTefDetails.fatTefCalories)} {energy.unit}
                    </p>
                  </div>
                  {smartTefMode === 'target' && (
                    <>
                      <p>
                        Target intake used:{' '}
                        {roundedText(smartTefDetails.targetCalories)} • P{' '}
                        {formatNumber(smartTefDetails.proteinGrams, 1)}g • C{' '}
                        {formatNumber(smartTefDetails.carbsGrams, 1)}g • F{' '}
                        {formatNumber(smartTefDetails.fatsGrams, 1)}g
                      </p>
                      {smartTefDetails.bounds && (
                        <p>
                          Bounds used: Protein{' '}
                          {formatNumber(smartTefDetails.bounds.protein?.min, 1)}
                          -
                          {formatNumber(smartTefDetails.bounds.protein?.max, 1)}
                          g • Fat{' '}
                          {formatNumber(smartTefDetails.bounds.fats?.min, 1)}-
                          {formatNumber(smartTefDetails.bounds.fats?.max, 1)}g
                        </p>
                      )}
                      {Array.isArray(smartTefDetails.warnings) &&
                        smartTefDetails.warnings.includes(
                          'carb_soft_floor_relaxed'
                        ) && (
                          <p>
                            Carb soft floor was relaxed to stay within your
                            calorie target.
                          </p>
                        )}
                    </>
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
              label={`Adaptive Thermogenesis (${resolvedAdaptiveMode === 'smart' ? 'Smart' : resolvedAdaptiveMode === 'crude' ? 'Staged' : 'Off'})`}
              value={adaptiveThermogenesisCorrection}
              total={breakdown.total}
              expanded={expandedItem === 'adaptive-thermogenesis'}
              dotClass="bg-accent-coral"
              onToggle={() => toggleExpanded('adaptive-thermogenesis')}
            >
              <p className="text-muted text-xs">
                Post-formula correction applied to baseline TDEE to account for
                metabolic adaptation.
              </p>
              <p className="text-muted text-xs mt-2">
                Baseline TDEE: {kcalText(baselineTdee)}
                <br />
                Correction:{' '}
                {energy.format(adaptiveThermogenesisCorrection, {
                  signed: true,
                })}
                <br />
                Adjusted TDEE: {kcalText(breakdown.total)}
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
              {kcalText(breakdown.total)}
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
    className="text-xs text-accent-blue md:hover:text-accent-blue/80 transition-colors focus-ring rounded-sm pressable-inline"
  >
    Learn more
  </button>
);

const BreakdownItem = ({
  label,
  value,
  total,
  dotClass,
  expanded,
  onToggle,
  children,
}) => {
  const { energy } = useUnits();
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  const displayValue = energy.value(value);

  return (
    <div className="bg-surface-highlight/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 md:hover:bg-surface-highlight/60 transition-colors text-left active:scale-[0.99] focus-ring"
      >
        <span className="text-muted flex items-center gap-2">
          {dotClass && (
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotClass}`}
            />
          )}
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
          {displayValue} {energy.unit}
        </span>
      </button>
      {/* Animate the real content height (0fr -> 1fr) instead of a max-height
          cap: a cap far above the content height makes collapse sit idle while
          the text fades, then snap shut, and it clips tall sections. */}
      <div
        aria-hidden={!expanded}
        inert={expanded ? undefined : ''}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
