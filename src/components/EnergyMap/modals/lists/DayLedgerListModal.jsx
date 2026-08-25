import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  Percent,
  Scale,
  TrendingUp,
  Utensils,
  CalendarCheck,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { goals as baseGoals } from '../../../../constants/goals/goals';
import {
  formatDateKeyUtc,
  getTodayDateKey,
} from '../../../../utils/data/dateKeys';
import {
  formatDateLabel,
  formatWeight,
} from '../../../../utils/measurements/weight';
import { formatBodyFat } from '../../../../utils/measurements/bodyFat';
import {
  buildDaySnapshotPreview,
  formatSignedKcal,
  getMeasurementForDate,
  isValidDaySnapshot,
  summarizeMonthSnapshots,
  DAY_LEDGER_BALANCE_META,
} from '../../../../utils/calculations/dayLedgerPresentation';
import { getDailyBalanceKind } from '../../../../utils/calculations/rollingEnergyBalance';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAYS_IN_GRID = 42; // Always 6 weeks, mirroring CalendarPickerModal

// Mirrors DailyNeatOverrideModal's day-pill convention (module-local there).
const DAY_PILL_CLASS = {
  training: 'text-accent-blue border-accent-blue/20 bg-accent-blue/10',
  rest: 'text-accent-indigo border-accent-indigo/20 bg-accent-indigo/10',
};

const SummaryTile = ({ icon: Icon, label, children }) => (
  <div className="bg-surface rounded-lg p-2.5 border border-border/60">
    <p className="flex items-center gap-1 text-[11px] text-muted mb-1">
      <Icon size={12} />
      {label}
    </p>
    {children}
  </div>
);

export const DayLedgerListModal = ({
  isOpen,
  isClosing,
  onClose,
  dailySnapshots = {},
  weightEntries = [],
  bodyFatEntries = [],
  bodyFatTrackingEnabled,
  selectedDate = null,
  onSelectDay,
  onOpenDayDetail,
  currentMonth,
  currentYear,
  onMonthChange,
}) => {
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [slideDirection, setSlideDirection] = useState(0);

  const todayStr = useMemo(() => getTodayDateKey(), []);

  const yearRange = useMemo(() => {
    const years = [];
    for (let i = currentYear - 4; i <= currentYear + 3; i += 1) {
      years.push(i);
    }
    return years;
  }, [currentYear]);

  // Build the fixed 42-cell grid (leading/trailing ghost days included).
  const calendarData = useMemo(() => {
    const data = [];
    const startOffset = new Date(
      Date.UTC(currentYear, currentMonth, 1)
    ).getUTCDay();
    for (let i = 0; i < DAYS_IN_GRID; i += 1) {
      const date = new Date(
        Date.UTC(currentYear, currentMonth, 1 - startOffset + i)
      );
      data.push({
        date: formatDateKeyUtc(date),
        dayNum: date.getUTCDate(),
        isGhost: date.getUTCMonth() !== currentMonth,
      });
    }
    return data;
  }, [currentMonth, currentYear]);

  const resolvedCells = useMemo(
    () =>
      calendarData.map((day) => ({
        ...day,
        hasSnapshot:
          !day.isGhost &&
          day.date <= todayStr &&
          isValidDaySnapshot(dailySnapshots[day.date]),
      })),
    [calendarData, dailySnapshots, todayStr]
  );

  // Group into week rows like CalendarPickerModal's CalendarHeatmap.
  const weeks = useMemo(() => {
    const weekArray = [];
    for (let i = 0; i < 6; i += 1) {
      weekArray.push(resolvedCells.slice(i * 7, i * 7 + 7));
    }
    return weekArray;
  }, [resolvedCells]);

  const monthSummary = useMemo(
    () =>
      summarizeMonthSnapshots(dailySnapshots, currentYear, currentMonth, null, {
        weightEntries,
        bodyFatEntries,
      }),
    [bodyFatEntries, currentMonth, currentYear, dailySnapshots, weightEntries]
  );

  const selectedPreview = useMemo(
    () =>
      selectedDate
        ? buildDaySnapshotPreview(dailySnapshots[selectedDate])
        : null,
    [dailySnapshots, selectedDate]
  );

  const showBodyFat = bodyFatTrackingEnabled !== false;

  // Measurements recorded on the picked day (exact-date lookups; dash-safe).
  const previewMeasurements = useMemo(
    () =>
      selectedPreview
        ? {
            weight: getMeasurementForDate(
              weightEntries,
              selectedPreview.date,
              'weight'
            ),
            bodyFat: getMeasurementForDate(
              bodyFatEntries,
              selectedPreview.date,
              'bodyFat'
            ),
          }
        : { weight: null, bodyFat: null },
    [bodyFatEntries, selectedPreview, weightEntries]
  );

  // Combined cardio + training burn for the picked day (snapshot-derived).
  const pickedSessionBurn = selectedPreview
    ? Math.round(selectedPreview.cardioBurn + selectedPreview.trainingBurn)
    : 0;

  // Selecting a different month always resets any picked day so the bottom
  // panel predictably falls back to the month summary.
  const changeMonth = (month, year) => {
    onSelectDay?.(null);
    onMonthChange(month, year);
  };

  const handlePrevMonth = () => {
    setSlideDirection(-1);
    if (currentMonth === 0) {
      changeMonth(11, currentYear - 1);
    } else {
      changeMonth(currentMonth - 1, currentYear);
    }
  };

  const handleNextMonth = () => {
    setSlideDirection(1);
    if (currentMonth === 11) {
      changeMonth(0, currentYear + 1);
    } else {
      changeMonth(currentMonth + 1, currentYear);
    }
  };

  // Jump to the current month AND select today when it has a ledger,
  // mirroring CalendarPickerModal's selecting Today behaviour.
  const handleTodayClick = () => {
    const now = new Date();
    setSlideDirection(
      now.getFullYear() > currentYear ||
        (now.getFullYear() === currentYear && now.getMonth() > currentMonth)
        ? 1
        : -1
    );
    onMonthChange(now.getMonth(), now.getFullYear());
    onSelectDay?.(
      isValidDaySnapshot(dailySnapshots[todayStr]) ? todayStr : null
    );
  };

  // Toggle selection: tapping the picked day again deselects it and the
  // bottom panel returns to the month summary.
  const handleDayClick = (day) => {
    if (!day || day.isGhost || !day.hasSnapshot) {
      return;
    }
    onSelectDay?.(selectedDate === day.date ? null : day.date);
  };

  const getCellClass = (day) => {
    if (day.isGhost) {
      return 'bg-surface/30 border-border/30 cursor-default';
    }
    if (day.hasSnapshot && day.date === selectedDate) {
      return 'bg-accent-blue border-accent-blue/70 ring-2 ring-accent-blue/40 shadow-lg cursor-pointer';
    }
    if (!day.hasSnapshot) {
      return 'bg-surface-highlight/80 border-border cursor-default';
    }
    const preview = buildDaySnapshotPreview(dailySnapshots[day.date]);
    const meta =
      (preview && DAY_LEDGER_BALANCE_META[preview.balanceKind]) ??
      DAY_LEDGER_BALANCE_META.maintenance;
    return `${meta.cellClass} cursor-pointer`;
  };

  const minSwipeDistance = 50;

  const onTouchStart = (event) => {
    setTouchEnd(null);
    setTouchStart(event.targetTouches[0].clientX);
  };

  const onTouchMove = (event) => {
    setTouchEnd(event.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      return;
    }
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) {
      handleNextMonth();
    } else if (distance < -minSwipeDistance) {
      handlePrevMonth();
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full max-w-lg"
    >
      <div className="p-5 relative max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <h3 className="text-foreground font-black text-2xl flex items-center gap-2">
            Daily Ledger
          </h3>
          <motion.button
            type="button"
            onClick={handleTodayClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-label="Jump to current month"
            className="px-3 py-2 bg-primary md:hover:brightness-110 text-primary-foreground rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 text-sm press-feedback focus-ring"
          >
            <CalendarIcon size={16} />
            Today
          </motion.button>
        </div>

        {/* Month/Year navigation (pickers anchor beneath this row) */}
        <div className="relative">
          <div className="flex items-center justify-between mb-4 gap-2">
            <motion.button
              type="button"
              onClick={handlePrevMonth}
              whileHover={{ scale: 1.05, x: -2 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg transition-colors focus-ring"
              aria-label="Previous month"
            >
              <ChevronLeft size={20} />
            </motion.button>

            <div className="flex items-center gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  setShowMonthPicker(!showMonthPicker);
                  setShowYearPicker(false);
                }}
                className="text-foreground font-semibold text-xl md:hover:text-accent-blue transition-colors cursor-pointer underline underline-offset-4 focus-ring"
              >
                {MONTH_NAMES[currentMonth]}
              </button>
              <span className="text-muted pointer-events-none select-none">
                •
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowYearPicker(!showYearPicker);
                  setShowMonthPicker(false);
                }}
                className="text-foreground font-semibold text-xl md:hover:text-accent-blue transition-colors cursor-pointer underline underline-offset-4 focus-ring"
              >
                {currentYear}
              </button>
            </div>

            <motion.button
              type="button"
              onClick={handleNextMonth}
              whileHover={{ scale: 1.05, x: 2 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg transition-colors focus-ring"
              aria-label="Next month"
            >
              <ChevronRight size={20} />
            </motion.button>
          </div>

          {/* Month Picker Overlay — anchored under the nav row. Horizontal
              centering uses flex (never Tailwind translate), so Framer Motion
              transforms on the inner card cannot break positioning. */}
          <AnimatePresence>
            {showMonthPicker && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMonthPicker(false)}
                />
                <div className="absolute inset-x-0 top-full mt-2 z-50 flex justify-center pointer-events-none">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="pointer-events-auto grid grid-cols-3 gap-2 p-1 bg-surface rounded-lg border-2 border-border shadow-2xl w-64"
                  >
                    {MONTH_NAMES.map((month, index) => (
                      <motion.button
                        key={month}
                        type="button"
                        onClick={() => {
                          changeMonth(index, currentYear);
                          setShowMonthPicker(false);
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-3 py-2 rounded font-semibold transition-colors text-sm whitespace-nowrap ${
                          index === currentMonth
                            ? 'text-primary-foreground bg-primary'
                            : 'text-foreground md:hover:bg-surface'
                        }`}
                      >
                        {month.slice(0, 3)}
                      </motion.button>
                    ))}
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>

          {/* Year Picker Overlay — same anchored pattern as months */}
          <AnimatePresence>
            {showYearPicker && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-40"
                  onClick={() => setShowYearPicker(false)}
                />
                <div className="absolute inset-x-0 top-full mt-2 z-50 flex justify-center pointer-events-none">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="pointer-events-auto grid grid-cols-4 gap-1.5 p-1 bg-surface rounded-lg border-2 border-border shadow-2xl w-56"
                  >
                    {yearRange.map((year) => (
                      <motion.button
                        key={year}
                        type="button"
                        onClick={() => {
                          changeMonth(currentMonth, year);
                          setShowYearPicker(false);
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-2 py-3 rounded font-semibold transition-colors text-sm ${
                          year === currentYear
                            ? 'bg-primary text-primary-foreground'
                            : 'text-foreground md:hover:bg-surface'
                        }`}
                      >
                        {year}
                      </motion.button>
                    ))}
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className={`text-[10px] text-center font-semibold ${
                index === 0 ? 'text-accent-red' : 'text-muted'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar grid (swipeable between months) */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="touch-pan-y select-none"
        >
          <div className="relative min-h-[260px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${currentYear}-${currentMonth}`}
                initial={{ opacity: 0, x: slideDirection * 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: slideDirection * -20 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="grid grid-cols-7 gap-1 mb-1">
                    {week.map((day) => {
                      const ghostMonthAbbr = day.isGhost
                        ? MONTH_NAMES[
                            new Date(`${day.date}T00:00:00Z`).getUTCMonth()
                          ].slice(0, 3)
                        : '';
                      return (
                        <motion.button
                          key={day.date}
                          type="button"
                          onClick={() => handleDayClick(day)}
                          whileHover={
                            !day.isGhost && day.hasSnapshot
                              ? { scale: 1.05 }
                              : {}
                          }
                          whileTap={
                            !day.isGhost && day.hasSnapshot
                              ? { scale: 0.98 }
                              : {}
                          }
                          transition={{ duration: 0.15 }}
                          disabled={day.isGhost || !day.hasSnapshot}
                          data-ledger-date={day.date}
                          aria-label={`${day.date}${
                            day.hasSnapshot ? ' (tracked)' : ''
                          }`}
                          aria-pressed={day.date === selectedDate}
                          className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center relative text-xs font-bold transition-colors focus-ring ${getCellClass(day)}`}
                        >
                          <span
                            className={`text-sm font-bold ${
                              day.isGhost || !day.hasSnapshot
                                ? 'text-muted'
                                : 'text-foreground'
                            }`}
                          >
                            {day.dayNum}
                          </span>
                          {day.isGhost && (
                            <span className="text-muted text-[8px] font-medium absolute bottom-1">
                              {ghostMonthAbbr}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Balance-kind legend */}
        <div className="flex items-center justify-center gap-3 pt-3 mt-3 border-t border-border text-[10px] text-muted flex-wrap">
          {['deficit', 'surplus', 'maintenance'].map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-sm ${DAY_LEDGER_BALANCE_META[kind].dotClass}`}
              />
              {DAY_LEDGER_BALANCE_META[kind].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-accent-blue" />
            Selected
          </span>
        </div>

        {/* Dual-mode panel: fixed height so switching never resizes the modal */}
        <div className="relative h-[240px] mt-4">
          <AnimatePresence mode="wait" initial={false}>
            {selectedPreview ? (
              <motion.button
                key={`preview-${selectedPreview.date}`}
                type="button"
                onClick={() => onOpenDayDetail?.(selectedPreview.date)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                aria-label={`Open full ledger for ${selectedPreview.date}`}
                className="absolute inset-0 overflow-y-auto text-left bg-surface-highlight/40 rounded-xl border border-border p-4 pressable-card focus-ring md:hover:border-accent-blue/50 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-foreground font-bold text-sm">
                      {formatDateLabel(selectedPreview.date)}
                    </p>
                    <p className="text-muted text-xs mt-0.5 truncate">
                      {selectedPreview.stepCount.toLocaleString()} steps
                      {showBodyFat && pickedSessionBurn > 0
                        ? ` · ~${pickedSessionBurn.toLocaleString()} kcal sessions`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
                    {(() => {
                      const goalMeta =
                        baseGoals[selectedPreview.goalAtSnapshot] ?? null;
                      if (!goalMeta) return null;
                      return (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${goalMeta.color} text-primary-foreground`}
                        >
                          {goalMeta.label}
                        </span>
                      );
                    })()}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                        selectedPreview.isTrainingDay
                          ? DAY_PILL_CLASS.training
                          : DAY_PILL_CLASS.rest
                      }`}
                    >
                      {selectedPreview.isTrainingDay ? 'Training' : 'Rest'}
                    </span>
                    {selectedPreview.date === todayStr && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-accent-green border border-accent-green/20 bg-accent-green/10">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                        In progress
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted text-[11px]">Eaten</p>
                    <p className="text-foreground font-bold text-lg leading-tight">
                      {Math.round(selectedPreview.intake).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center flex-shrink-0">
                    <p
                      className={`text-xl font-black leading-none ${DAY_LEDGER_BALANCE_META[selectedPreview.balanceKind].textClass}`}
                    >
                      {formatSignedKcal(selectedPreview.deficit)}
                    </p>
                    <p
                      className={`text-[10px] font-semibold mt-1 ${DAY_LEDGER_BALANCE_META[selectedPreview.balanceKind].textClass}`}
                    >
                      {
                        DAY_LEDGER_BALANCE_META[selectedPreview.balanceKind]
                          .label
                      }
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-muted text-[11px]">Burned</p>
                    <p className="text-foreground font-bold text-lg leading-tight">
                      {Math.round(selectedPreview.tdee).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Mini composition bar (positive contributions only) */}
                {(() => {
                  const total = selectedPreview.barSegments.reduce(
                    (sum, segment) => sum + segment.value,
                    0
                  );
                  if (total <= 0) return null;
                  return (
                    <div className="flex h-2 rounded-full overflow-hidden bg-surface-highlight mt-3">
                      {selectedPreview.barSegments.map((segment) => (
                        <div
                          key={segment.key}
                          className={segment.colorClass}
                          style={{
                            width: `${Math.max(2, (segment.value / total) * 100)}%`,
                          }}
                        />
                      ))}
                    </div>
                  );
                })()}

                {/* Measurement / session cards (mirror the month-summary tiles) */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <SummaryTile icon={Scale} label="Weight">
                    <p className="text-foreground font-bold text-base leading-tight">
                      {previewMeasurements.weight != null
                        ? `${formatWeight(previewMeasurements.weight)} kg`
                        : '\u2014'}
                    </p>
                  </SummaryTile>
                  {showBodyFat ? (
                    <SummaryTile icon={Percent} label="Body Fat">
                      <p className="text-foreground font-bold text-base leading-tight">
                        {previewMeasurements.bodyFat != null
                          ? `${formatBodyFat(previewMeasurements.bodyFat)} %`
                          : '\u2014'}
                      </p>
                    </SummaryTile>
                  ) : (
                    <SummaryTile icon={Dumbbell} label="Sessions">
                      <p className="text-foreground font-bold text-base leading-tight">
                        {pickedSessionBurn > 0
                          ? `${pickedSessionBurn.toLocaleString()} kcal`
                          : '\u2014'}
                      </p>
                      <p className="text-muted text-[10px] font-medium leading-tight">
                        Cardio{' '}
                        {Math.round(
                          selectedPreview.cardioBurn
                        ).toLocaleString()}{' '}
                        · Training{' '}
                        {Math.round(
                          selectedPreview.trainingBurn
                        ).toLocaleString()}
                      </p>
                    </SummaryTile>
                  )}
                </div>

                {selectedPreview.epocCarryInCalories > 0 && (
                  <p className="text-muted text-[11px] mt-2">
                    +{selectedPreview.epocCarryInCalories} kcal EPOC carried in
                  </p>
                )}

                <div className="flex items-center justify-end gap-1 mt-3 pt-2.5 border-t border-border text-muted">
                  <span className="text-xs font-medium">
                    Tap to view full ledger
                  </span>
                  <ChevronRight size={14} />
                </div>
              </motion.button>
            ) : (
              <motion.div
                key="month-summary"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                className="absolute inset-0 overflow-y-auto bg-surface-highlight/40 rounded-xl border border-border p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-foreground font-bold text-sm">
                      Month Summary
                    </p>
                    <p className="text-muted text-xs">
                      {MONTH_NAMES[currentMonth]} {currentYear}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-accent-blue border border-accent-blue/20 bg-accent-blue/10">
                    <CalendarCheck size={11} />
                    {monthSummary.daysTracked}/{monthSummary.daysInMonth} days
                  </span>
                </div>

                {monthSummary.daysTracked === 0 ? (
                  <div className="min-h-[150px] flex flex-col items-center justify-center text-center py-4">
                    <CalendarX className="text-muted/50" size={36} />
                    <p className="text-muted text-xs mt-3 max-w-[240px]">
                      No recorded days this month yet. Tap a highlighted day to
                      preview its ledger.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <SummaryTile icon={Utensils} label="Avg Energy">
                        <p className="text-foreground font-bold text-sm leading-tight">
                          {monthSummary.avgIntake.toLocaleString()}
                          <span className="text-muted text-[10px] font-medium">
                            {' '}
                            in
                          </span>
                        </p>
                        <p className="text-foreground font-bold text-sm leading-tight">
                          {monthSummary.avgTdee.toLocaleString()}
                          <span className="text-muted text-[10px] font-medium">
                            {' '}
                            burn
                          </span>
                        </p>
                      </SummaryTile>
                      <SummaryTile icon={TrendingUp} label="Balance">
                        <p
                          className={`font-bold text-sm leading-tight ${
                            DAY_LEDGER_BALANCE_META[
                              getDailyBalanceKind(monthSummary.avgBalance)
                            ].textClass
                          }`}
                        >
                          {formatSignedKcal(monthSummary.avgBalance)}
                          <span className="text-muted text-[10px] font-medium">
                            {' '}
                            avg
                          </span>
                        </p>
                        <p
                          className={`font-bold text-sm leading-tight ${
                            DAY_LEDGER_BALANCE_META[
                              getDailyBalanceKind(monthSummary.totalBalance)
                            ].textClass
                          }`}
                        >
                          {formatSignedKcal(monthSummary.totalBalance)}
                          <span className="text-muted text-[10px] font-medium">
                            {' '}
                            total
                          </span>
                        </p>
                      </SummaryTile>
                      <SummaryTile icon={Scale} label="Avg Weight">
                        <p className="text-foreground font-bold text-sm leading-tight">
                          {monthSummary.avgWeightKg != null
                            ? `${monthSummary.avgWeightKg} kg`
                            : '\u2014'}
                        </p>
                        {showBodyFat &&
                          monthSummary.avgBodyFatPercent != null && (
                            <p className="text-accent-pink font-semibold text-[11px] leading-tight">
                              {monthSummary.avgBodyFatPercent}% BF
                            </p>
                          )}
                      </SummaryTile>
                      <SummaryTile icon={Footprints} label="Avg Steps">
                        <p className="text-foreground font-bold text-sm leading-tight">
                          {monthSummary.avgSteps.toLocaleString()}
                        </p>
                      </SummaryTile>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-red" />
                        {monthSummary.deficitDays} deficit
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                        {monthSummary.surplusDays} surplus
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-slate" />
                        {monthSummary.maintenanceDays} maintenance
                      </span>
                      <span className="ml-auto font-medium text-foreground/80">
                        Est. change ≈{' '}
                        {monthSummary.estimatedWeightChangeKg === 0
                          ? '±0'
                          : `${monthSummary.estimatedWeightChangeKg > 0 ? '-' : '+'}${Math.abs(monthSummary.estimatedWeightChangeKg).toFixed(2)}`}
                        {' kg'}
                      </span>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Close Button */}
        <motion.button
          type="button"
          onClick={onClose}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full mt-5 px-4 py-3 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg font-semibold transition-colors focus-ring"
        >
          Close
        </motion.button>
      </div>
    </ModalShell>
  );
};
