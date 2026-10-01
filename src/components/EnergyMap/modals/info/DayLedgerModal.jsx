import React, { useMemo } from 'react';
import {
  Activity,
  Bed,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  HeartPulse,
  Percent,
  Scale,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { goals as baseGoals } from '../../../../constants/goals/goals';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import {
  formatDateLabel,
  formatSignedDelta,
  formatWeight,
} from '../../../../utils/measurements/weight';
import { formatBodyFat } from '../../../../utils/measurements/bodyFat';
import {
  buildDayLedgerDetailModel,
  formatSignedKcal,
  getAdjacentTrackedDates,
  DAY_LEDGER_BALANCE_META,
} from '../../../../utils/calculations/dayLedgerPresentation';

// Mirrors DailyNeatOverrideModal's day-pill convention (module-local there).
const DAY_PILL_CLASS = {
  training: 'text-accent-blue border-accent-blue/20 bg-accent-blue/10',
  rest: 'text-accent-indigo border-accent-indigo/20 bg-accent-indigo/10',
};

const SectionCard = ({ title, children }) => (
  <div className="mt-3">
    <p className="text-muted text-[11px] font-semibold uppercase tracking-wide mb-1.5">
      {title}
    </p>
    <div className="bg-surface-highlight/40 rounded-xl border border-border p-3">
      {children}
    </div>
  </div>
);

const MetricTile = ({ icon: Icon, label, children }) => (
  <div className="bg-surface rounded-lg p-2 border border-border/60">
    <p className="flex items-center gap-1 text-[11px] text-muted mb-0.5">
      <Icon size={12} />
      {label}
    </p>
    {children}
  </div>
);

const sessionIcon = (kind) => (kind === 'cardio' ? Activity : Dumbbell);
const chipRow =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border';

export const DayLedgerModal = ({
  isOpen,
  isClosing,
  onClose,
  dateKey,
  snapshot,
  dailySnapshots = {},
  weightEntries = [],
  bodyFatEntries = [],
  stepEntries = [],
  bodyFatTrackingEnabled,
  nutritionData = {},
  userData = {},
  cardioSessions = [],
  trainingSessions = [],
  cardioTypes = {},
  trainingTypes = {},
  neatOverride = null,
  phaseLogV2 = null,
  onSelectDate,
  onOpenBreakdown,
}) => {
  const todayStr = useMemo(() => getTodayDateKey(), []);
  const adjacent = useMemo(
    () => getAdjacentTrackedDates(dailySnapshots, dateKey),
    [dailySnapshots, dateKey]
  );
  const model = useMemo(
    () =>
      buildDayLedgerDetailModel({
        snapshot,
        dateKey,
        nutritionData,
        userData,
        cardioSessions,
        trainingSessions,
        cardioTypes,
        trainingTypes,
        weightEntries,
        bodyFatEntries,
        stepEntries,
        neatOverride,
        phaseLogV2,
        bodyFatTrackingEnabled,
      }),
    [
      snapshot,
      dateKey,
      nutritionData,
      userData,
      cardioSessions,
      trainingSessions,
      cardioTypes,
      trainingTypes,
      weightEntries,
      bodyFatEntries,
      stepEntries,
      neatOverride,
      phaseLogV2,
      bodyFatTrackingEnabled,
    ]
  );

  if (!isOpen) {
    return null;
  }

  const preview = model?.preview ?? null;
  const isToday = dateKey === todayStr;
  const longDateLabel = formatDateLabel(dateKey, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const kindMeta = preview
    ? (DAY_LEDGER_BALANCE_META[preview.balanceKind] ?? null)
    : null;
  const goalMeta = preview ? (baseGoals[preview.goalAtSnapshot] ?? null) : null;
  const showBodyFat = bodyFatTrackingEnabled !== false;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full max-w-lg"
    >
      <div className="p-5 relative max-h-[85vh] overflow-y-auto">
        {/* Header with prev/next tracked-day navigation */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => adjacent.prev && onSelectDate?.(adjacent.prev)}
            disabled={!adjacent.prev}
            aria-label="Previous tracked day"
            className={`p-2 rounded-lg transition-colors focus-ring ${
              adjacent.prev
                ? 'bg-surface-highlight md:hover:bg-surface text-foreground'
                : 'opacity-40 cursor-default text-muted'
            }`}
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex-1 min-w-0 text-center">
            <h3 className="text-foreground font-black text-lg leading-tight truncate">
              {longDateLabel || 'Daily Ledger'}
            </h3>
            <p className="text-muted text-xs mt-0.5 flex items-center justify-center gap-1.5">
              <BookOpen size={12} />
              Daily Ledger
              {isToday && (
                <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[10px] font-semibold text-accent-green border border-accent-green/20 bg-accent-green/10">
                  <span className="w-1 h-1 rounded-full bg-accent-green animate-pulse" />
                  In progress
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => adjacent.next && onSelectDate?.(adjacent.next)}
            disabled={!adjacent.next}
            aria-label="Next tracked day"
            className={`p-2 rounded-lg transition-colors focus-ring ${
              adjacent.next
                ? 'bg-surface-highlight md:hover:bg-surface text-foreground'
                : 'opacity-40 cursor-default text-muted'
            }`}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {!preview || !preview.date ? (
          /* Empty state — navigated to a gap day */
          <div className="py-10 text-center">
            <div className="w-16 h-16 bg-surface-highlight rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="text-muted" size={28} />
            </div>
            <h4 className="text-foreground font-bold mb-1">
              No ledger recorded for this day
            </h4>
            <p className="text-muted text-sm">
              Use the arrows above to jump to the nearest tracked day.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 px-4 py-3 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg font-semibold transition-colors focus-ring"
            >
              Close
            </button>
          </div>
        ) : (
          <div key={model.date} className="day-ledger-in">
            {/* Day-shape chips: goal recorded at snapshot + day type (+ overrides) */}
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {goalMeta && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${goalMeta.color} text-primary-foreground`}
                >
                  {goalMeta.label}
                </span>
              )}
              <span
                className={`${chipRow} ${
                  preview.isTrainingDay
                    ? DAY_PILL_CLASS.training
                    : DAY_PILL_CLASS.rest
                }`}
              >
                {preview.isTrainingDay ? (
                  <Dumbbell size={11} />
                ) : (
                  <Bed size={11} />
                )}
                {preview.isTrainingDay ? 'Training Day' : 'Rest Day'}
              </span>
              {model.neatOverride && (
                <span
                  className={`${chipRow} text-accent-green border-accent-green/20 bg-accent-green/10`}
                >
                  <HeartPulse size={11} />
                  {model.neatOverride.label ?? 'Override'}
                  {' \u00B7 '}
                  {Math.round(model.neatOverride.multiplier * 100)}% NEAT
                </span>
              )}
              {model.dayShape.tefMode !== 'off' && (
                <span
                  className={`${chipRow} text-accent-pink border-accent-pink/20 bg-accent-pink/10`}
                >
                  TEF {'\u00B7'} {model.dayShape.tefMode}
                </span>
              )}
              {model.dayShape.atMode !== 'off' && (
                <span
                  className={`${chipRow} text-accent-orange border-accent-orange/20 bg-accent-orange/10`}
                >
                  AT {'\u00B7'} {model.dayShape.atMode}
                </span>
              )}
            </div>

            {/* Hero energy card — tap opens the full breakdown for this day */}
            <button
              type="button"
              onClick={() => onOpenBreakdown?.(preview.date)}
              className="w-full text-left bg-surface-highlight/50 rounded-xl p-4 border border-border/60 pressable-card focus-ring md:hover:border-accent-blue/50 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-muted text-xs font-medium">TDEE</p>
                  <p className="text-foreground text-3xl font-black leading-tight mt-0.5">
                    {preview.tdee.toLocaleString()}
                    <span className="text-muted text-sm font-medium ml-1">
                      kcal
                    </span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className={`text-lg font-black leading-none ${kindMeta.textClass}`}
                  >
                    {formatSignedKcal(preview.deficit)}
                  </p>
                  <p
                    className={`text-[10px] font-bold mt-1 ${kindMeta.textClass}`}
                  >
                    {kindMeta.label}
                  </p>
                </div>
              </div>
              <p className="text-muted text-xs mt-2.5">
                Eaten {preview.intake.toLocaleString()} kcal {'\u00B7'}{' '}
                {preview.stepCount.toLocaleString()} steps
              </p>
              {/* Mini composition bar (positive contributions only) */}
              {(() => {
                const total = preview.barSegments.reduce(
                  (sum, segment) => sum + segment.value,
                  0
                );
                if (total <= 0) return null;
                return (
                  <div className="flex h-2 rounded-full overflow-hidden bg-surface-highlight mt-2">
                    {preview.barSegments.map((segment) => (
                      <div
                        key={segment.key}
                        className={segment.colorClass}
                        style={{
                          width: `${Math.max(
                            2,
                            (segment.value / total) * 100
                          )}%`,
                        }}
                      />
                    ))}
                  </div>
                );
              })()}
              <div className="flex items-center justify-end gap-1 mt-3 pt-2.5 border-t border-border/60 text-accent-blue">
                <span className="text-xs font-semibold">
                  Tap to open full breakdown
                </span>
                <ChevronRight size={14} />
              </div>
            </button>

            {/* EPOC context line (always occupies a line — no layout shift) */}
            <p
              className={`text-muted text-[11px] mt-2 ${
                model.epoc.total > 0 ? '' : 'invisible'
              }`}
            >
              +{model.epoc.total.toLocaleString()} kcal EPOC{' '}
              {model.epoc.carryIn > 0 && model.epoc.fromToday > 0
                ? `(${model.epoc.carryIn.toLocaleString()} carried in \u00B7 ${model.epoc.fromToday.toLocaleString()} today)`
                : model.epoc.carryIn > 0
                  ? `(carried in: ${model.epoc.carryIn.toLocaleString()})`
                  : `(today's sessions: ${model.epoc.fromToday.toLocaleString()})`}
            </p>
            {/* Measurements + steps recorded on this exact date */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <MetricTile icon={Scale} label="Weight">
                <p className="text-foreground font-bold text-sm leading-tight">
                  {model.measurements.weight.value != null
                    ? `${formatWeight(model.measurements.weight.value)} kg`
                    : '\u2014'}
                </p>
                {model.measurements.weight.delta && (
                  <p className="text-[10px] font-semibold text-accent-blue leading-tight mt-0.5">
                    {formatSignedDelta(
                      model.measurements.weight.delta.delta,
                      'kg'
                    )}
                    {model.measurements.weight.delta.spanDays > 1
                      ? ` \u00B7 ${model.measurements.weight.delta.spanDays}d`
                      : ''}
                  </p>
                )}
              </MetricTile>
              {showBodyFat ? (
                <MetricTile icon={Percent} label="Body Fat">
                  <p className="text-foreground font-bold text-sm leading-tight">
                    {model.measurements.bodyFat.value != null
                      ? `${formatBodyFat(model.measurements.bodyFat.value)} %`
                      : '\u2014'}
                  </p>
                  {model.measurements.bodyFat.delta && (
                    <p className="text-[10px] font-semibold text-accent-blue leading-tight mt-0.5">
                      {formatSignedDelta(
                        model.measurements.bodyFat.delta.delta,
                        '%',
                        ''
                      )}
                      {model.measurements.bodyFat.delta.spanDays > 1
                        ? ` \u00B7 ${model.measurements.bodyFat.delta.spanDays}d`
                        : ''}
                    </p>
                  )}
                </MetricTile>
              ) : (
                <MetricTile icon={Dumbbell} label="Sessions">
                  <p className="text-foreground font-bold text-sm leading-tight">
                    {model.sessionsTotal > 0
                      ? `${model.sessionsTotal.toLocaleString()} kcal`
                      : '\u2014'}
                  </p>
                </MetricTile>
              )}
              <MetricTile icon={Footprints} label="Steps">
                <p className="text-foreground font-bold text-sm leading-tight">
                  {preview.stepCount.toLocaleString()}
                </p>
                {model.stepProvenance?.source && (
                  <p className="text-[10px] font-medium text-muted leading-tight mt-0.5 truncate">
                    {model.stepProvenance.source === 'healthConnect'
                      ? 'Health store'
                      : 'Manual'}
                  </p>
                )}
              </MetricTile>
            </div>

            {/* Sessions logged that day (read-only rows) */}
            <SectionCard title={`Sessions \u00B7 ${model.sessions.length}`}>
              {model.sessions.length === 0 ? (
                <p className="text-muted text-xs py-2 text-center">
                  No sessions logged that day.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {model.sessions.map((row) => {
                    const Icon = sessionIcon(row.kind);
                    return (
                      <div
                        key={`${row.kind}-${row.id}`}
                        className="bg-surface/60 rounded-lg px-3 py-2 border border-border/50 flex items-center gap-2.5"
                      >
                        <span
                          className={
                            row.kind === 'cardio'
                              ? 'text-accent-red'
                              : 'text-accent-blue'
                          }
                        >
                          <Icon size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground font-semibold text-xs truncate">
                            {row.label}
                            {!row.hasType && (
                              <span className="text-muted font-medium">
                                {' '}
                                (type removed)
                              </span>
                            )}
                          </p>
                          <p className="text-muted text-[10px] truncate">
                            {row.durationMin} min {'\u00B7'} {row.effortDisplay}
                            {row.stepOverlapEnabled
                              ? ' \u00B7 steps deducted'
                              : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-foreground font-bold text-xs leading-none">
                            ~{row.calories.toLocaleString()}
                          </p>
                          {row.startTime && (
                            <p className="text-muted text-[10px] mt-0.5">
                              {row.startTime}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
            {/* Nutrition logged that day (canonical nutritionData) */}
            <SectionCard title="Nutrition">
              {!model.nutrition.hasEntries ? (
                <p className="text-muted text-xs py-2 text-center">
                  No food logged that day.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-surface/60 rounded-lg py-2">
                      <p className="text-[11px] text-muted">Protein</p>
                      <p className="text-accent-red font-bold text-sm">
                        {model.nutrition.totals.protein} g
                      </p>
                    </div>
                    <div className="bg-surface/60 rounded-lg py-2">
                      <p className="text-[11px] text-muted">Carbs</p>
                      <p className="text-accent-amber font-bold text-sm">
                        {model.nutrition.totals.carbs} g
                      </p>
                    </div>
                    <div className="bg-surface/60 rounded-lg py-2">
                      <p className="text-[11px] text-muted">Fats</p>
                      <p className="text-accent-yellow font-bold text-sm">
                        {model.nutrition.totals.fats} g
                      </p>
                    </div>
                  </div>

                  {/* Micros: a dash when untracked (~ = partial coverage) */}
                  <div className="grid grid-cols-4 gap-2 text-center mt-2">
                    <div className="bg-surface/60 rounded-lg py-2">
                      <p className="text-[11px] text-muted">Fiber</p>
                      <p className="text-accent-green font-bold text-sm">
                        {model.nutrition.micros.fiber != null
                          ? `${model.nutrition.microCoverage.fiber ? '~' : ''}${model.nutrition.micros.fiber} g`
                          : '\u2014'}
                      </p>
                    </div>
                    <div className="bg-surface/60 rounded-lg py-2">
                      <p className="text-[11px] text-muted">Sodium</p>
                      <p className="text-accent-indigo font-bold text-sm">
                        {model.nutrition.micros.sodium != null
                          ? `${model.nutrition.microCoverage.sodium ? '~' : ''}${model.nutrition.micros.sodium} mg`
                          : '\u2014'}
                      </p>
                    </div>
                    <div className="bg-surface/60 rounded-lg py-2">
                      <p className="text-[11px] text-muted">Sat. Fat</p>
                      <p className="text-accent-yellow font-bold text-sm">
                        {model.nutrition.micros.saturatedFats != null
                          ? `${model.nutrition.microCoverage.saturatedFats ? '~' : ''}${model.nutrition.micros.saturatedFats} g`
                          : '\u2014'}
                      </p>
                    </div>
                    <div className="bg-surface/60 rounded-lg py-2">
                      <p className="text-[11px] text-muted">Sugars</p>
                      <p className="text-accent-pink font-bold text-sm">
                        {model.nutrition.micros.sugars != null
                          ? `${model.nutrition.microCoverage.sugars ? '~' : ''}${model.nutrition.micros.sugars} g`
                          : '\u2014'}
                      </p>
                    </div>
                  </div>
                  {/* Per-meal breakdown */}
                  <div className="mt-2.5 pt-2 border-t border-border flex flex-col gap-1">
                    {model.nutrition.meals.map((meal) => {
                      const MealIcon = meal.icon ?? BookOpen;
                      return (
                        <div
                          key={meal.key}
                          className="flex items-center gap-2 py-0.5"
                        >
                          <span className="text-muted">
                            <MealIcon size={13} />
                          </span>
                          <p className="text-foreground text-xs font-medium flex-1 min-w-0 truncate">
                            {meal.label}
                            <span className="text-muted font-normal">
                              {' '}
                              ({meal.entryCount}{' '}
                              {meal.entryCount === 1 ? 'item' : 'items'})
                            </span>
                          </p>
                          <p className="text-foreground font-bold text-xs flex-shrink-0">
                            {meal.calories.toLocaleString()} kcal
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </SectionCard>
            {/* Phase context (only when the date belongs to a phase log) */}
            {model.phaseContext && (
              <SectionCard title="Phase">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-foreground font-bold text-sm min-w-0 truncate">
                    {model.phaseContext.name}
                  </p>
                  <span
                    className={`${chipRow} ${
                      model.phaseContext.complete
                        ? 'text-accent-green border-accent-green/20 bg-accent-green/10'
                        : model.phaseContext.partial
                          ? 'text-accent-amber border-accent-amber/20 bg-accent-amber/10'
                          : 'text-accent-slate border-accent-slate/20 bg-accent-slate/10'
                    }`}
                  >
                    {model.phaseContext.empty
                      ? 'Empty log'
                      : model.phaseContext.complete
                        ? 'Complete'
                        : 'Partial'}
                  </span>
                </div>
                {model.phaseContext.notes !== '' && (
                  <p className="text-muted text-xs italic mt-1.5 leading-relaxed whitespace-pre-line">
                    {'\u201C'}
                    {model.phaseContext.notes}
                    {'\u201D'}
                  </p>
                )}
              </SectionCard>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-5 px-4 py-3 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg font-semibold transition-colors focus-ring"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
