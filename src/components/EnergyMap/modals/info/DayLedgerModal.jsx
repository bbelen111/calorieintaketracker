import React, { useMemo, useRef, useState } from 'react';
import {
  Bed,
  Beef,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cookie,
  Droplet,
  Dumbbell,
  Footprints,
  Heart,
  HeartPulse,
  Percent,
  Scale,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { TrackerCardMetric } from '../../common/TrackerSelectionCard';
import { goals as baseGoals } from '../../../../constants/goals/goals';
import { NUTRIENT_META } from '../../../../constants/nutrients/nutrients';
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

const DAY_PILL_CLASS = {
  training: 'text-accent-blue border-accent-blue/20 bg-accent-blue/10',
  rest: 'text-accent-indigo border-accent-indigo/20 bg-accent-indigo/10',
};

const chipRow =
  'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold border';

// Canonical nutrient text colors (mirrors `NUTRIENT_META` color names) and the
// app's canonical micro order — fiber is a nutrient here, never a macro.
const NUTRIENT_TEXT_CLASS = {
  fiber: 'text-accent-green',
  sodium: 'text-accent-indigo',
  saturatedFats: 'text-accent-yellow',
  sugars: 'text-accent-pink',
};
const MICRO_KEYS_ORDER = ['fiber', 'sodium', 'saturatedFats', 'sugars'];

// Finger-swipe day navigation: a horizontal gesture only counts when it clears
// the distance threshold AND dominates the vertical axis, so a vertical scroll
// through a long ledger never switches days.
const SWIPE_MIN_DISTANCE_PX = 50;
const SWIPE_AXIS_DOMINANCE = 1.2;

const SectionTitle = ({ children }) => (
  <p className="text-muted text-[11px] font-semibold uppercase tracking-wide mb-2">
    {children}
  </p>
);

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

  // Day-to-day finger swipe. Direction drives the enter animation: +1 -> the
  // next tracked day slides in from the right, -1 -> the previous day enters
  // from the left.
  const [enterDirection, setEnterDirection] = useState(0);
  const swipeRef = useRef({ tracking: false, x0: 0, y0: 0, x: 0, y: 0 });

  const goToDay = (targetKey, direction) => {
    if (!targetKey) {
      return;
    }
    setEnterDirection(direction);
    onSelectDate?.(targetKey);
  };

  const handleBodyTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }
    swipeRef.current = {
      tracking: true,
      x0: touch.clientX,
      y0: touch.clientY,
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleBodyTouchMove = (event) => {
    const touch = event.touches?.[0];
    if (!touch || !swipeRef.current.tracking) {
      return;
    }
    swipeRef.current.x = touch.clientX;
    swipeRef.current.y = touch.clientY;
  };

  const handleBodyTouchEnd = () => {
    const gesture = swipeRef.current;
    if (!gesture.tracking) {
      return;
    }
    swipeRef.current.tracking = false;
    const dx = gesture.x - gesture.x0;
    const dy = gesture.y - gesture.y0;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) {
      return;
    }
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_DOMINANCE) {
      return;
    }
    if (dx < 0) {
      goToDay(adjacent.next, 1);
    } else {
      goToDay(adjacent.prev, -1);
    }
  };

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
  const shortDateLabel = formatDateLabel(dateKey, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const kindMeta = preview
    ? (DAY_LEDGER_BALANCE_META[preview.balanceKind] ?? null)
    : null;
  const goalMeta = preview ? (baseGoals[preview.goalAtSnapshot] ?? null) : null;
  const showBodyFat = bodyFatTrackingEnabled !== false;
  const hasEpoc = Boolean(preview) && model.epoc.total > 0;

  const macroCalories = preview
    ? {
        protein: (model.nutrition.totals.protein ?? 0) * 4,
        carbs: (model.nutrition.totals.carbs ?? 0) * 4,
        fats: (model.nutrition.totals.fats ?? 0) * 9,
      }
    : { protein: 0, carbs: 0, fats: 0 };
  const macroTotal =
    macroCalories.protein + macroCalories.carbs + macroCalories.fats;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full max-w-lg h-[80dvh] min-h-[480px] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-5 pt-5 pb-3 border-b border-border/50">
        <button
          type="button"
          onClick={() => goToDay(adjacent.prev, -1)}
          disabled={!adjacent.prev}
          aria-label="Previous tracked day"
          className={`p-2 rounded-lg focus-ring pressable-inline ${
            adjacent.prev
              ? 'bg-surface-highlight text-foreground md:hover:bg-surface'
              : 'opacity-40 cursor-default text-muted'
          }`}
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 min-w-0 text-center">
          <h3 className="text-foreground font-black text-lg leading-tight truncate">
            {shortDateLabel || 'Daily ledger'}
          </h3>
          <p className="text-muted text-xs mt-0.5 flex items-center justify-center gap-1.5">
            <BookOpen size={12} />
            Daily ledger
            {isToday && (
              <span className="inline-flex items-center gap-1 px-2 py-px rounded-md text-[10px] font-semibold text-accent-green border border-accent-green/20 bg-accent-green/10">
                <span className="w-1 h-1 bg-accent-green animate-pulse" />
                In progress
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => goToDay(adjacent.next, 1)}
          disabled={!adjacent.next}
          aria-label="Next tracked day"
          className={`p-2 rounded-lg focus-ring pressable-inline ${
            adjacent.next
              ? 'bg-surface-highlight text-foreground md:hover:bg-surface'
              : 'opacity-40 cursor-default text-muted'
          }`}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Body — swipe left/right with a finger to step between tracked days */}
      <div
        className="flex-1 overflow-y-auto px-5 py-4 touch-pan-y"
        onTouchStart={handleBodyTouchStart}
        onTouchMove={handleBodyTouchMove}
        onTouchEnd={handleBodyTouchEnd}
      >
        {!preview || !preview.date ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-surface-highlight rounded-full flex items-center justify-center mb-4">
              <BookOpen className="text-muted" size={28} />
            </div>
            <h4 className="text-foreground font-bold mb-1">
              No ledger recorded for this day
            </h4>
            <p className="text-muted text-sm">
              Use the arrows above to jump to the nearest tracked day.
            </p>
          </div>
        ) : (
          <div
            key={model.date}
            className={`space-y-5 ${
              enterDirection > 0
                ? 'day-ledger-in-right'
                : enterDirection < 0
                  ? 'day-ledger-in-left'
                  : 'day-ledger-in'
            }`}
          >
            {/* Day-shape chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {goalMeta && (
                <span
                  className={`${chipRow} ${goalMeta.color} text-primary-foreground border-transparent`}
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
                {preview.isTrainingDay ? 'Training day' : 'Rest day'}
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

            {/* Hero TDEE card */}
            <button
              type="button"
              onClick={() => onOpenBreakdown?.(preview.date)}
              className="w-full text-left bg-surface-highlight/60 rounded-xl p-4 border border-border/60 pressable-card focus-ring md:hover:border-accent-blue/40 transition-colors"
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

              <p className="text-muted text-xs mt-2">
                Eaten {preview.intake.toLocaleString()} kcal {'\u00B7'}{' '}
                {preview.stepCount.toLocaleString()} steps
              </p>

              {/* Composition bar */}
              {(() => {
                const total = preview.barSegments.reduce(
                  (sum, segment) => sum + segment.value,
                  0
                );
                if (total <= 0) return null;
                return (
                  <div className="flex h-2 rounded-full overflow-hidden bg-surface mt-3">
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

              {/* EPOC + breakdown link. When there is no EPOC the card simply
                  shrinks: no divider and no reserved empty band. */}
              <div
                className={`flex gap-3 ${
                  hasEpoc
                    ? 'items-end justify-between mt-3 pt-3 border-t border-border/60'
                    : 'items-center justify-end mt-2'
                }`}
              >
                {hasEpoc && (
                  <div className="min-w-0">
                    <p className="text-foreground text-sm font-semibold">
                      +{model.epoc.total.toLocaleString()} kcal EPOC
                    </p>
                    <p className="text-muted text-[11px] truncate">
                      {model.epoc.carryIn > 0 && model.epoc.fromToday > 0
                        ? `${model.epoc.carryIn.toLocaleString()} carried in \u00B7 ${model.epoc.fromToday.toLocaleString()} today`
                        : model.epoc.carryIn > 0
                          ? `carried in: ${model.epoc.carryIn.toLocaleString()}`
                          : `today's sessions: ${model.epoc.fromToday.toLocaleString()}`}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-0.5 text-accent-blue flex-shrink-0">
                  <span className="text-xs font-semibold">Full breakdown</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            </button>

            {/* Measurements */}
            <div className="bg-surface-highlight/40 rounded-xl border border-border/60 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
                <div className="flex items-center gap-3 min-w-0">
                  <Scale size={18} className="text-accent-blue flex-shrink-0" />
                  <span className="text-foreground text-sm font-medium">
                    Weight
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-foreground font-bold text-base">
                    {model.measurements.weight.value != null
                      ? `${formatWeight(model.measurements.weight.value)} kg`
                      : '\u2014'}
                  </span>
                  {model.measurements.weight.delta &&
                    model.measurements.weight.delta.delta !== 0 && (
                      <TrackerCardMetric
                        label={
                          model.measurements.weight.delta.spanDays > 1
                            ? `vs prev (${model.measurements.weight.delta.spanDays}d)`
                            : 'vs prev'
                        }
                        value={formatSignedDelta(
                          model.measurements.weight.delta.delta,
                          'kg'
                        )}
                      />
                    )}
                </div>
              </div>

              {showBodyFat ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <Percent
                      size={18}
                      className="text-accent-blue flex-shrink-0"
                    />
                    <span className="text-foreground text-sm font-medium">
                      Body fat
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-foreground font-bold text-base">
                      {model.measurements.bodyFat.value != null
                        ? `${formatBodyFat(model.measurements.bodyFat.value)} %`
                        : '\u2014'}
                    </span>
                    {model.measurements.bodyFat.delta &&
                      model.measurements.bodyFat.delta.delta !== 0 && (
                        <TrackerCardMetric
                          label={
                            model.measurements.bodyFat.delta.spanDays > 1
                              ? `vs prev (${model.measurements.bodyFat.delta.spanDays}d)`
                              : 'vs prev'
                          }
                          value={formatSignedDelta(
                            model.measurements.bodyFat.delta.delta,
                            '%',
                            ''
                          )}
                        />
                      )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <Dumbbell
                      size={18}
                      className="text-accent-blue flex-shrink-0"
                    />
                    <span className="text-foreground text-sm font-medium">
                      Sessions
                    </span>
                  </div>
                  <span className="text-foreground font-bold text-base flex-shrink-0">
                    {model.sessionsTotal > 0
                      ? `${model.sessionsTotal.toLocaleString()} kcal`
                      : '\u2014'}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Footprints
                    size={18}
                    className="text-accent-blue flex-shrink-0"
                  />
                  <span className="text-foreground text-sm font-medium">
                    Steps
                  </span>
                </div>
                <span className="text-foreground font-bold text-base flex-shrink-0">
                  {preview.stepCount.toLocaleString()}
                </span>
              </div>
            </div>
            {/* Sessions */}
            <div>
              <SectionTitle>Sessions · {model.sessions.length}</SectionTitle>
              <div className="bg-surface-highlight/40 rounded-xl border border-border/60 p-3">
                {model.sessions.length === 0 ? (
                  <p className="text-muted text-xs py-3 text-center">
                    No sessions logged that day.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {model.sessions.map((row) => {
                      const Icon = row.kind === 'cardio' ? Heart : Dumbbell;
                      return (
                        <div
                          key={`${row.kind}-${row.id}`}
                          className="flex items-center gap-3"
                        >
                          <Icon
                            size={18}
                            className="text-accent-blue flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground font-semibold text-sm truncate">
                              {row.label}
                              {!row.hasType && (
                                <span className="text-muted font-medium">
                                  {' '}
                                  (type removed)
                                </span>
                              )}
                            </p>
                            <p className="text-muted text-[11px] truncate">
                              {row.startTime && `${row.startTime} \u00B7 `}
                              {row.durationMin} min {'\u00B7'}{' '}
                              {row.effortDisplay}
                              {row.stepOverlapEnabled
                                ? ' \u00B7 steps deducted'
                                : ''}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-foreground font-bold text-sm leading-none">
                              ~{row.calories.toLocaleString()}
                              <span className="text-[10px] font-medium text-muted ml-0.5">
                                kcal
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Nutrition */}
            <div>
              <SectionTitle>Nutrition</SectionTitle>
              <div className="bg-surface-highlight/40 rounded-xl border border-border/60 p-4">
                {!model.nutrition.hasEntries ? (
                  <p className="text-muted text-xs py-3 text-center">
                    No food logged that day.
                  </p>
                ) : (
                  <>
                    {/* Macro bar */}
                    {macroTotal > 0 && (
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-surface mb-4">
                        <div
                          className="bg-accent-red"
                          style={{
                            width: `${Math.max(
                              2,
                              (macroCalories.protein / macroTotal) * 100
                            )}%`,
                          }}
                        />
                        <div
                          className="bg-accent-amber"
                          style={{
                            width: `${Math.max(
                              2,
                              (macroCalories.carbs / macroTotal) * 100
                            )}%`,
                          }}
                        />
                        <div
                          className="bg-accent-yellow"
                          style={{
                            width: `${Math.max(
                              2,
                              (macroCalories.fats / macroTotal) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    )}

                    {/* Macros — app icons + accent colors, single row */}
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <Beef
                          size={18}
                          className="text-accent-red mx-auto mb-1"
                        />
                        <p className="text-[11px] text-muted">Protein</p>
                        <p className="text-foreground font-bold text-base">
                          {model.nutrition.totals.protein} g
                        </p>
                      </div>
                      <div>
                        <Cookie
                          size={18}
                          className="text-accent-amber mx-auto mb-1"
                        />
                        <p className="text-[11px] text-muted">Carbs</p>
                        <p className="text-foreground font-bold text-base">
                          {model.nutrition.totals.carbs} g
                        </p>
                      </div>
                      <div>
                        <Droplet
                          size={18}
                          className="text-accent-yellow mx-auto mb-1"
                        />
                        <p className="text-[11px] text-muted">Fats</p>
                        <p className="text-foreground font-bold text-base">
                          {model.nutrition.totals.fats} g
                        </p>
                      </div>
                    </div>

                    {/* Micros — canonical nutrient colors; fiber lives here */}
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-border/40 pt-3">
                      {MICRO_KEYS_ORDER.filter(
                        (key) => model.nutrition.micros[key] != null
                      ).map((key) => (
                        <span
                          key={key}
                          className="inline-flex items-baseline gap-1 text-xs"
                        >
                          <span className="text-muted">
                            {NUTRIENT_META[key].label}
                          </span>
                          <span
                            className={`font-semibold ${NUTRIENT_TEXT_CLASS[key]}`}
                          >
                            {model.nutrition.micros[key]}{' '}
                            {NUTRIENT_META[key].unit}
                          </span>
                        </span>
                      ))}
                      {MICRO_KEYS_ORDER.every(
                        (key) => model.nutrition.micros[key] == null
                      ) && (
                        <span className="text-muted text-xs">
                          No micros tracked
                        </span>
                      )}
                    </div>

                    {/* Meals */}
                    <div className="mt-3 pt-3 border-t border-border/40 flex flex-col gap-2">
                      {model.nutrition.meals.map((meal) => {
                        const MealIcon = meal.icon ?? BookOpen;
                        return (
                          <div
                            key={meal.key}
                            className="flex items-center gap-2.5"
                          >
                            <span className="text-muted">
                              <MealIcon size={15} />
                            </span>
                            <p className="text-foreground text-sm font-medium flex-1 min-w-0 truncate">
                              {meal.label}
                              <span className="text-muted font-normal">
                                {' '}
                                · {meal.entryCount}{' '}
                                {meal.entryCount === 1 ? 'item' : 'items'}
                              </span>
                            </p>
                            <p className="text-foreground font-bold text-sm flex-shrink-0">
                              {meal.calories.toLocaleString()} kcal
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Phase */}
            {model.phaseContext && (
              <div>
                <SectionTitle>Phase</SectionTitle>
                <div className="bg-surface-highlight/40 rounded-xl border border-border/60 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted text-[11px]">Phase</p>
                    <p className="text-foreground font-bold text-base truncate">
                      {model.phaseContext.name}
                    </p>
                  </div>
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
                  <p className="text-muted text-xs italic mt-2 leading-relaxed whitespace-pre-line px-1">
                    {'\u201C'}
                    {model.phaseContext.notes}
                    {'\u201D'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-5 pt-3 pb-5 border-t border-border/50">
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-3 bg-surface-highlight text-foreground rounded-lg font-semibold transition-colors focus-ring press-feedback md:hover:bg-surface"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
};
