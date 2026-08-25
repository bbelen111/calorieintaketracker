import React, { useMemo } from 'react';
import {
  Bed,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Percent,
  Scale,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { goals as baseGoals } from '../../../../constants/goals/goals';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import {
  formatDateLabel,
  formatWeight,
} from '../../../../utils/measurements/weight';
import { formatBodyFat } from '../../../../utils/measurements/bodyFat';
import {
  hasNutritionEntriesForDate,
  getNutritionTotalsForDate,
} from '../../../../utils/phases/phases';
import {
  buildDaySnapshotPreview,
  formatSignedKcal,
  getAdjacentTrackedDates,
  getMeasurementForDate,
  DAY_LEDGER_BALANCE_META,
} from '../../../../utils/calculations/dayLedgerPresentation';

// Mirrors DailyNeatOverrideModal's day-pill convention (module-local there).
const DAY_PILL_CLASS = {
  training: 'text-accent-blue border-accent-blue/20 bg-accent-blue/10',
  rest: 'text-accent-indigo border-accent-indigo/20 bg-accent-indigo/10',
};

const MeasurementChip = ({ icon: Icon, label, valueText }) => (
  <div className="bg-surface-highlight/50 rounded-lg px-3 py-2.5 border border-border/50">
    <p className="flex items-center gap-1 text-muted text-[11px] font-medium">
      <Icon size={11} />
      {label}
    </p>
    <p className="text-foreground font-bold text-base leading-tight mt-0.5">
      {valueText ?? '\u2014'}
    </p>
  </div>
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
  bodyFatTrackingEnabled,
  nutritionData = {},
  onSelectDate,
  onOpenBreakdown,
}) => {
  const todayStr = useMemo(() => getTodayDateKey(), []);
  const adjacent = useMemo(
    () => getAdjacentTrackedDates(dailySnapshots, dateKey),
    [dailySnapshots, dateKey]
  );
  const preview = useMemo(() => buildDaySnapshotPreview(snapshot), [snapshot]);
  const macros = useMemo(() => {
    if (!dateKey || !hasNutritionEntriesForDate(nutritionData, dateKey)) {
      return null;
    }
    return getNutritionTotalsForDate(nutritionData, dateKey);
  }, [nutritionData, dateKey]);

  if (!isOpen) {
    return null;
  }

  const isToday = dateKey === todayStr;
  const longDateLabel = formatDateLabel(dateKey, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const goalMeta = preview ? (baseGoals[preview.goalAtSnapshot] ?? null) : null;
  const kindMeta = preview
    ? (DAY_LEDGER_BALANCE_META[preview.balanceKind] ?? null)
    : null;
  const dayWeight =
    preview?.date != null
      ? getMeasurementForDate(weightEntries, preview.date, 'weight')
      : null;
  const dayBodyFat = getMeasurementForDate(
    bodyFatEntries,
    preview?.date,
    'bodyFat'
  );
  const showBodyFatChip = bodyFatTrackingEnabled !== false;

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

        {/* Badges: goal recorded at snapshot + day type */}
        {preview && (
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {goalMeta && (
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${goalMeta.color} text-primary-foreground`}
              >
                {goalMeta.label}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
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
          </div>
        )}

        {!preview || !preview.date ? (
          /* Empty state 窶・navigated to a gap day */
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
          </div>
        ) : (
          <>
            {/* Measurements recorded on this exact date */}
            <div
              className={`grid gap-2 ${
                showBodyFatChip ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              <MeasurementChip
                icon={Scale}
                label="Weight"
                valueText={
                  dayWeight != null ? `${formatWeight(dayWeight)} kg` : null
                }
              />
              {showBodyFatChip && (
                <MeasurementChip
                  icon={Percent}
                  label="Body Fat"
                  valueText={
                    dayBodyFat != null ? `${formatBodyFat(dayBodyFat)} %` : null
                  }
                />
              )}
            </div>

            {/* Single energy card 窶・tap opens the breakdown for this day */}
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
                Eaten {preview.intake.toLocaleString()} kcal ﾂｷ{' '}
                {preview.stepCount.toLocaleString()} steps
              </p>
              <div className="flex items-center justify-end gap-1 mt-3 pt-2.5 border-t border-border/60 text-accent-blue">
                <span className="text-xs font-semibold">
                  Tap to open full breakdown
                </span>
                <ChevronRight size={14} />
              </div>
            </button>

            {/* Macros logged that day (computed live from nutritionData) */}
            {macros && (
              <div className="mt-4 bg-surface rounded-xl border border-border p-4">
                <p className="text-foreground font-bold text-sm mb-3">
                  Macros Logged
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-surface-highlight/50 rounded-lg py-2">
                    <p className="text-[11px] text-muted">Protein</p>
                    <p className="text-accent-red font-bold text-sm">
                      {Math.round(macros.protein)} g
                    </p>
                  </div>
                  <div className="bg-surface-highlight/50 rounded-lg py-2">
                    <p className="text-[11px] text-muted">Carbs</p>
                    <p className="text-accent-amber font-bold text-sm">
                      {Math.round(macros.carbs)} g
                    </p>
                  </div>
                  <div className="bg-surface-highlight/50 rounded-lg py-2">
                    <p className="text-[11px] text-muted">Fats</p>
                    <p className="text-accent-yellow font-bold text-sm">
                      {Math.round(macros.fats)} g
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-5 px-4 py-3 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg font-semibold transition-colors focus-ring"
            >
              Close
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
};
