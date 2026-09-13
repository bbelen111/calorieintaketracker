import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Flame,
  Beef,
  Cookie,
  Droplet,
  CalendarCheck,
  CalendarX,
  Utensils,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  formatDateKeyUtc,
  getTodayDateKey,
} from '../../../../utils/data/dateKeys';
import { formatDateLabel } from '../../../../utils/measurements/weight';

// Mirrors DayLedgerListModal's SummaryTile grammar (module-local there) so the
// calendar picker's dual panel shares one design language with the ledger.
const SummaryTile = ({ icon: Icon, label, children }) => (
  <div className="bg-surface rounded-lg p-2 border border-border/60">
    <p className="flex items-center gap-1 text-[11px] text-muted mb-0.5">
      <Icon size={12} />
      {label}
    </p>
    {children}
  </div>
);

// Count-up number for tile values. Module-scope (not nested inside the modal
// component) so the RAF tween survives parent re-renders and actually plays.
function AnimatedNumber({ value, duration = 500 }) {
  const [displayValue, setDisplayValue] = useState(value);
  const rafRef = useRef();
  const startValueRef = useRef(value);
  const startTimeRef = useRef();

  useEffect(() => {
    if (value === displayValue) return;
    startValueRef.current = displayValue;
    startTimeRef.current = window.performance.now();

    const animate = (now) => {
      const elapsed = now - startTimeRef.current;
      if (elapsed >= duration) {
        setDisplayValue(value);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const newValue = Math.round(
        startValueRef.current + (value - startValueRef.current) * progress
      );
      setDisplayValue(newValue);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line
  }, [value]);

  return <span>{displayValue}</span>;
}

const getMacrosForDate = (date, nutritionData) => {
  const dateData = nutritionData[date] || {};
  const allEntries = Object.values(dateData).flat();
  if (allEntries.length === 0) {
    return { calories: 0, protein: 0, carbs: 0, fats: 0 };
  }

  return allEntries.reduce(
    (acc, entry) => ({
      calories: acc.calories + (entry.calories || 0),
      protein: acc.protein + (entry.protein || 0),
      carbs: acc.carbs + (entry.carbs || 0),
      fats: acc.fats + (entry.fats || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
};

const CalendarHeatmap = ({
  calendarData,
  onDateClick,
  selectedDate,
  onKeyboardSelect,
  slideDirection,
  monthNames,
}) => {
  const [focusedDate, setFocusedDate] = useState(
    selectedDate || calendarData[0]?.date || null
  );

  // Group by weeks (now always 6 weeks with 42 cells)
  const weeks = useMemo(() => {
    const weekArray = [];
    for (let i = 0; i < 6; i++) {
      weekArray.push(calendarData.slice(i * 7, (i + 1) * 7));
    }
    return weekArray;
  }, [calendarData]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!focusedDate) return;

      const currentDate = new Date(focusedDate + 'T00:00:00Z');
      let newDate = new Date(currentDate);

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          newDate.setDate(currentDate.getDate() - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          newDate.setDate(currentDate.getDate() + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          newDate.setDate(currentDate.getDate() - 7);
          break;
        case 'ArrowDown':
          e.preventDefault();
          newDate.setDate(currentDate.getDate() + 7);
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedDate) {
            onKeyboardSelect(focusedDate);
          }
          return;
        default:
          return;
      }

      const newDateStr = formatDateKeyUtc(newDate);
      // Check if the new date is in the current view
      const isInView = calendarData.some((day) => day.date === newDateStr);
      if (isInView) {
        setFocusedDate(newDateStr);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedDate, calendarData, onKeyboardSelect]);

  const getStatusColor = (date, isGhost, hasEntries) => {
    const isSelected = date === selectedDate;
    const isFocused = date === focusedDate;

    if (isGhost) {
      return 'bg-surface/30 border-border/30 cursor-default';
    }
    if (isSelected) {
      return 'bg-accent-blue border-accent-blue/70 ring-2 ring-accent-blue/40 shadow-lg';
    }
    if (isFocused) {
      return 'bg-surface-highlight border-accent-blue ring-2 ring-border md:hover:bg-surface';
    }
    if (hasEntries) {
      return 'bg-surface-highlight border-border md:hover:bg-surface';
    }
    return 'bg-surface-highlight/80 border-border md:hover:bg-surface-highlight';
  };

  const getDayNumber = (date) => {
    return new Date(date + 'T00:00:00Z').getUTCDate();
  };

  const handleDateClick = (date) => {
    setFocusedDate(date);
    onDateClick(date);
  };

  if (weeks.length === 0) {
    return (
      <div className="text-muted text-sm text-center py-4">
        No calendar data available
      </div>
    );
  }

  return (
    <div className="space-y-2 transition-all duration-300 ease-in-out">
      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div
            key={i}
            className={`text-[10px] text-center font-semibold ${
              i === 0 ? 'text-accent-red' : 'text-muted'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Weeks - Auto height based on content density */}
      <div className="relative min-h-[260px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${calendarData[0]?.date || 'empty'}`}
            initial={{ opacity: 0, x: slideDirection * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection * -20 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1 mb-1">
                {week.map((day) => {
                  const dayNum = getDayNumber(day.date);

                  // Only show macro insights if there is data for the day
                  const hasData = day.hasEntries;
                  const isGhost = day.isGhost;

                  // Get month abbreviation for ghost cells
                  const ghostMonthAbbr = isGhost
                    ? monthNames[
                        new Date(day.date + 'T00:00:00Z').getUTCMonth()
                      ].slice(0, 3)
                    : '';

                  return (
                    <motion.button
                      key={day.date}
                      type="button"
                      onClick={() => !isGhost && handleDateClick(day.date)}
                      onMouseEnter={() => !isGhost && setFocusedDate(day.date)}
                      whileHover={!isGhost ? { scale: 1.05 } : {}}
                      whileTap={!isGhost ? { scale: 0.98 } : {}}
                      transition={{ duration: 0.15 }}
                      disabled={isGhost}
                      className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center text-xs font-bold transition-colors relative ${getStatusColor(day.date, isGhost, hasData)}`}
                      aria-label={
                        isGhost
                          ? `${new Date(day.date + 'T00:00:00Z').toLocaleDateString()} (outside current month)`
                          : `Preview ${new Date(day.date + 'T00:00:00Z').toLocaleDateString()}${hasData ? ' (has entries)' : ''}`
                      }
                      aria-pressed={day.date === selectedDate}
                      aria-disabled={isGhost}
                    >
                      {hasData && !isGhost && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent-blue" />
                      )}
                      <span
                        className={`text-sm font-bold ${isGhost ? 'text-muted' : 'text-foreground'}`}
                      >
                        {dayNum}
                      </span>
                      {isGhost && (
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
  );
};

export const CalendarPickerModal = ({
  isOpen,
  isClosing,
  onClose,
  onSelectDate,
  nutritionData = {},
  selectedDate,
  currentMonth,
  currentYear,
  onMonthChange,
}) => {
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [slideDirection, setSlideDirection] = useState(0); // -1 for left, 1 for right

  // Day preview state for the bottom dual-mode panel (replaces the old
  // floating tooltip). previewDate drives panel visibility; lastPreviewDate
  // keeps the panel mounted (hidden) after deselect so the stacked container
  // height never changes. Render-phase retention mirrors the
  // DayLedgerListModal contract (no refs read during render, no
  // setState-in-effect).
  const [previewDate, setPreviewDate] = useState(null);
  const [lastPreviewDate, setLastPreviewDate] = useState(null);
  const [previewSource, setPreviewSource] = useState(null);
  if (!isOpen) {
    if (previewDate !== null) {
      setPreviewDate(null);
    }
    if (lastPreviewDate !== null) {
      setLastPreviewDate(null);
      setPreviewSource(null);
    }
  } else if (previewDate !== previewSource) {
    setPreviewSource(previewDate);
    if (previewDate) {
      setLastPreviewDate(previewDate);
    }
  }
  const dayPanelDate = previewDate ?? lastPreviewDate;

  const todayStr = useMemo(() => getTodayDateKey(), []);

  // Generate year range dynamically based on selected year (4 years before, current, 3 years after)
  const yearRange = useMemo(() => {
    const years = [];
    for (let i = currentYear - 4; i <= currentYear + 3; i++) {
      years.push(i);
    }
    return years;
  }, [currentYear]);

  // Month names
  const monthNames = useMemo(
    () => [
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
    ],
    []
  );

  // Calculate monthly insights
  const monthlyInsights = useMemo(() => {
    const year = currentYear;
    const month = currentMonth;
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFats = 0;
    let daysWithData = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, month, day));
      const dateStr = formatDateKeyUtc(date);
      const dateData = nutritionData[dateStr] || {};
      const allEntries = Object.values(dateData).flat();

      if (allEntries.length > 0) {
        daysWithData++;
        const dayMacros = allEntries.reduce(
          (acc, entry) => ({
            calories: acc.calories + (entry.calories || 0),
            protein: acc.protein + (entry.protein || 0),
            carbs: acc.carbs + (entry.carbs || 0),
            fats: acc.fats + (entry.fats || 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fats: 0 }
        );
        totalCalories += dayMacros.calories;
        totalProtein += dayMacros.protein;
        totalCarbs += dayMacros.carbs;
        totalFats += dayMacros.fats;
      }
    }

    if (daysWithData === 0) {
      return {
        avgCalories: 0,
        avgProtein: 0,
        avgCarbs: 0,
        avgFats: 0,
        daysWithData: 0,
        daysInMonth,
      };
    }

    return {
      avgCalories: Math.round(totalCalories / daysWithData),
      avgProtein: Math.round(totalProtein / daysWithData),
      avgCarbs: Math.round(totalCarbs / daysWithData),
      avgFats: Math.round(totalFats / daysWithData),
      daysWithData,
      daysInMonth,
    };
  }, [currentMonth, currentYear, nutritionData]);
  // Generate calendar data for the current month with ghost cells
  const calendarData = useMemo(() => {
    const year = currentYear;
    const month = currentMonth;
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getUTCDay();

    const data = [];

    // Add ghost cells for previous month
    if (firstDayOfWeek > 0) {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonthLastDay = new Date(prevYear, prevMonth + 1, 0).getDate();

      for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        const date = new Date(Date.UTC(prevYear, prevMonth, day));
        const dateStr = formatDateKeyUtc(date);
        data.push({
          date: dateStr,
          dayOfWeek: date.getUTCDay(),
          hasEntries: false,
          isGhost: true,
          isPrevMonth: true,
        });
      }
    }

    // Add current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, month, day));
      const dateStr = formatDateKeyUtc(date);
      const dateData = nutritionData[dateStr] || {};
      // Check if any meal type has entries
      const hasEntries = Object.values(dateData).some(
        (entries) => Array.isArray(entries) && entries.length > 0
      );

      data.push({
        date: dateStr,
        dayOfWeek: date.getUTCDay(),
        hasEntries,
        isGhost: false,
      });
    }

    // Add ghost cells for next month to complete 6 weeks (42 cells)
    const remainingCells = 42 - data.length;
    if (remainingCells > 0) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;

      for (let day = 1; day <= remainingCells; day++) {
        const date = new Date(Date.UTC(nextYear, nextMonth, day));
        const dateStr = formatDateKeyUtc(date);
        data.push({
          date: dateStr,
          dayOfWeek: date.getUTCDay(),
          hasEntries: false,
          isGhost: true,
          isNextMonth: true,
        });
      }
    }

    return data;
  }, [currentMonth, currentYear, nutritionData]);

  // Toggle preview: tapping the previewed day again deselects it and the
  // bottom panel returns to the Monthly Average card.
  const handleDayClick = (date) => {
    setPreviewDate((prev) => (prev === date ? null : date));
  };

  const handleSelectPreviewedDay = () => {
    if (dayPanelDate) {
      onSelectDate(dayPanelDate);
      onClose();
    }
  };

  const handleKeyboardSelect = (date) => {
    onSelectDate(date);
    onClose();
  };

  // Changing months always clears any previewed day so the bottom panel
  // predictably falls back to the Monthly Average card.
  const changeMonth = (month, year) => {
    setPreviewDate(null);
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

  const handleMonthSelect = (month) => {
    changeMonth(month, currentYear);
    setShowMonthPicker(false);
  };

  const handleYearSelect = (year) => {
    changeMonth(currentMonth, year);
    setShowYearPicker(false);
  };

  const handleTodayClick = () => {
    const todayDate = new Date();
    onMonthChange(todayDate.getMonth(), todayDate.getFullYear());
    // Small delay to let calendar render before selecting
    setTimeout(() => {
      onSelectDate(todayStr);
      onClose();
    }, 100);
  };

  const dayMacros = useMemo(() => {
    if (!dayPanelDate) {
      return { calories: 0, protein: 0, carbs: 0, fats: 0 };
    }
    return getMacrosForDate(dayPanelDate, nutritionData);
  }, [dayPanelDate, nutritionData]);

  const hasDayData = useMemo(() => {
    if (!dayPanelDate) return false;
    const dateData = nutritionData[dayPanelDate] || {};
    return Object.values(dateData).some(
      (entries) => Array.isArray(entries) && entries.length > 0
    );
  }, [dayPanelDate, nutritionData]);

  // Total food items logged on the previewed day (drives the entries pill).
  const dayEntryCount = useMemo(() => {
    if (!dayPanelDate) return 0;
    const dateData = nutritionData[dayPanelDate] || {};
    return Object.values(dateData).reduce(
      (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
      0
    );
  }, [dayPanelDate, nutritionData]);

  // Swipe handlers for calendar navigation
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      handleNextMonth();
    } else if (isRightSwipe) {
      handlePrevMonth();
    }
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        onClose={onClose}
        contentClassName="w-full max-w-lg"
      >
        <div className="p-6 relative transition-all duration-300 ease-in-out">
          <div className="flex items-center justify-between mb-6 gap-2">
            <h3 className="text-foreground font-black text-2xl flex items-center gap-2">
              Tracker Calendar
            </h3>

            <motion.button
              type="button"
              onClick={handleTodayClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              aria-label="Select today"
              className="px-3 py-2 bg-primary md:hover:brightness-110 text-primary-foreground rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <CalendarIcon size={16} />
              Today
            </motion.button>
          </div>

          {/* Compact Month/Year Header with Navigation (month/year overlays
              anchor beneath this row via the relative wrapper) */}
          <div className="relative">
            <div className="flex items-center justify-between mb-6 gap-2">
              <motion.button
                type="button"
                onClick={handlePrevMonth}
                whileHover={{ scale: 1.05, x: -2 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg transition-colors"
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
                  className="text-foreground font-semibold text-xl md:hover:text-accent-blue transition-colors cursor-pointer underline underline-offset-4"
                >
                  {monthNames[currentMonth]}
                </button>

                {/* Centered separator dot */}
                <span className="text-muted pointer-events-none select-none">
                  •
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setShowYearPicker(!showYearPicker);
                    setShowMonthPicker(false);
                  }}
                  className="text-foreground font-semibold text-xl md:hover:text-accent-blue transition-colors cursor-pointer underline underline-offset-4"
                >
                  {currentYear}
                </button>
              </div>

              <motion.button
                type="button"
                onClick={handleNextMonth}
                whileHover={{ scale: 1.05, x: 2 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={20} />
              </motion.button>
            </div>

            {/* Month Picker Overlay */}
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
                      {monthNames.map((month, index) => (
                        <motion.button
                          key={month}
                          type="button"
                          onClick={() => handleMonthSelect(index)}
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

            {/* Year Picker Overlay */}
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
                          onClick={() => handleYearSelect(year)}
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

          {/* Calendar */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="touch-pan-y select-none"
          >
            <CalendarHeatmap
              calendarData={calendarData}
              onDateClick={handleDayClick}
              onKeyboardSelect={handleKeyboardSelect}
              selectedDate={selectedDate}
              slideDirection={slideDirection}
              monthNames={monthNames}
            />
          </div>

          {/* Calendar-cell legend - DayLedgerListModal's legend grammar
              (swatch + label, shared separator + type scale) adapted to this
              modal's cell states instead of balance kinds: the round blue dot
              mirrors the in-cell marker that flags logged days, plain cells
              are untracked, and the filled blue cell is the current
              selection. Always rendered (static reference, never toggled by
              panel state, so it cannot shift layout). */}
          <div className="flex items-center justify-center gap-3 pt-3 mt-3 border-t border-border text-[10px] text-muted flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent-blue" />
              Has entries
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-accent-slate" />
              No entries
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-accent-blue" />
              Selected
            </span>
          </div>

          {/* Dual-mode panel: grid-stacked "auto-fixed" height (same contract
              as DayLedgerListModal). The day-preview card (a whole-card button,
              like DayLedger's "tap to view full ledger" card) and the Monthly
              Averages card are ALWAYS mounted, stacked in the same grid cell
              (row-start-1 col-start-1); opacity decides which is visible, so
              the container height is the natural max across all states -
              zero layout shift, no height animation, no unmount swaps.
              Both surfaces share DayLedgerListModal's design language: /40
              chrome, header row with pill chips, SummaryTile stat grid and
              0.16s opacity+y crossfades (filled/empty branches stacked the
              same way inside each surface). */}
          <div className="grid mt-4">
            {dayPanelDate && (
              <motion.button
                type="button"
                onClick={handleSelectPreviewedDay}
                initial={false}
                animate={{
                  opacity: previewDate ? 1 : 0,
                  y: previewDate ? 0 : 8,
                }}
                transition={{ duration: 0.16 }}
                aria-label={`Select ${formatDateLabel(dayPanelDate)}`}
                aria-hidden={!previewDate}
                tabIndex={previewDate ? 0 : -1}
                className={`row-start-1 col-start-1 overflow-y-auto text-left bg-surface-highlight/40 rounded-xl border border-border p-3 pressable-card focus-ring md:hover:border-accent-blue/50 transition-all ${
                  previewDate ? '' : 'pointer-events-none'
                }`}
              >
                {/* Header row: date + pill chips (DayLedger grammar) */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-foreground font-bold text-sm min-w-0 truncate">
                    {formatDateLabel(dayPanelDate, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                        hasDayData
                          ? 'text-accent-blue border-accent-blue/20 bg-accent-blue/10'
                          : 'text-muted border-border bg-surface'
                      }`}
                    >
                      <Utensils size={11} />
                      {hasDayData
                        ? `${dayEntryCount} ${
                            dayEntryCount === 1 ? 'entry' : 'entries'
                          }`
                        : 'No entries'}
                    </span>
                    {dayPanelDate === todayStr && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-accent-green border border-accent-green/20 bg-accent-green/10">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                        In progress
                      </span>
                    )}
                  </div>
                </div>

                {/* Filled vs empty day branch, stacked like DayLedgerListModal's
                    inner month states so the surface height stays constant */}
                <div className="grid">
                  <motion.div
                    initial={false}
                    animate={{
                      opacity: hasDayData ? 0 : 1,
                      y: hasDayData ? -6 : 0,
                    }}
                    transition={{ duration: 0.16 }}
                    aria-hidden={hasDayData}
                    className={`row-start-1 col-start-1 min-h-[88px] flex flex-col items-center justify-center text-center py-3 ${
                      hasDayData ? 'pointer-events-none' : ''
                    }`}
                  >
                    <Utensils className="text-muted/50" size={28} />
                    <p className="text-muted text-xs mt-2 max-w-[220px]">
                      No food logged for this day yet.
                    </p>
                  </motion.div>

                  <motion.div
                    initial={false}
                    animate={{
                      opacity: hasDayData ? 1 : 0,
                      y: hasDayData ? 0 : 6,
                    }}
                    transition={{ duration: 0.16 }}
                    aria-hidden={!hasDayData}
                    className={`row-start-1 col-start-1 ${
                      hasDayData ? '' : 'pointer-events-none'
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <SummaryTile icon={Flame} label="Calories">
                        <p className="text-accent-emerald font-bold text-sm leading-tight">
                          <AnimatedNumber
                            value={Math.round(dayMacros.calories)}
                          />
                          <span className="text-muted text-[10px] font-medium">
                            {' '}
                            kcal
                          </span>
                        </p>
                      </SummaryTile>
                      <SummaryTile icon={Beef} label="Protein">
                        <p className="text-accent-red font-bold text-sm leading-tight">
                          <AnimatedNumber
                            value={Math.round(dayMacros.protein)}
                          />
                          <span className="text-muted text-[10px] font-medium">
                            {' '}
                            g
                          </span>
                        </p>
                      </SummaryTile>
                      <SummaryTile icon={Cookie} label="Carbs">
                        <p className="text-accent-amber font-bold text-sm leading-tight">
                          <AnimatedNumber value={Math.round(dayMacros.carbs)} />
                          <span className="text-muted text-[10px] font-medium">
                            {' '}
                            g
                          </span>
                        </p>
                      </SummaryTile>
                      <SummaryTile icon={Droplet} label="Fats">
                        <p className="text-accent-yellow font-bold text-sm leading-tight">
                          <AnimatedNumber value={Math.round(dayMacros.fats)} />
                          <span className="text-muted text-[10px] font-medium">
                            {' '}
                            g
                          </span>
                        </p>
                      </SummaryTile>
                    </div>
                  </motion.div>
                </div>

                {/* Whole-card tap-target footer (DayLedger grammar) */}
                <div className="flex items-center justify-end gap-1 mt-1.5 pt-1.5 border-t border-border text-muted">
                  <span className="text-xs font-medium">
                    Tap to select this day
                  </span>
                  <ChevronRight size={14} />
                </div>
              </motion.button>
            )}

            {/* Monthly Averages surface (hidden while a day is previewed) */}
            <motion.div
              initial={false}
              animate={{
                opacity: previewDate ? 0 : 1,
                y: previewDate ? -8 : 0,
              }}
              transition={{ duration: 0.16 }}
              aria-hidden={!!previewDate}
              className={`row-start-1 col-start-1 overflow-y-auto bg-surface-highlight/40 rounded-xl border border-border p-3 ${
                previewDate ? 'pointer-events-none' : ''
              }`}
            >
              {/* Header row: title + days-tracked pill (DayLedger grammar) */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-foreground font-bold text-sm">
                    Monthly Averages
                  </p>
                  <p className="text-muted text-xs mt-0.5">
                    {monthNames[currentMonth]} {currentYear}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-accent-blue border border-accent-blue/20 bg-accent-blue/10 flex-shrink-0">
                  <CalendarCheck size={11} />
                  <motion.span
                    key={monthlyInsights.daysWithData}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="inline-flex items-center"
                  >
                    {monthlyInsights.daysWithData}/{monthlyInsights.daysInMonth}{' '}
                    days
                  </motion.span>
                </span>
              </div>

              {/* Empty vs filled month branch, stacked like DayLedgerListModal
                  (constant surface height, crossfade only) */}
              <div className="grid">
                <motion.div
                  initial={false}
                  animate={{
                    opacity: monthlyInsights.daysWithData === 0 ? 1 : 0,
                    y: monthlyInsights.daysWithData === 0 ? 0 : 6,
                  }}
                  transition={{ duration: 0.16 }}
                  aria-hidden={monthlyInsights.daysWithData !== 0}
                  className={`row-start-1 col-start-1 min-h-[110px] flex flex-col items-center justify-center text-center py-2 ${
                    monthlyInsights.daysWithData === 0
                      ? ''
                      : 'pointer-events-none'
                  }`}
                >
                  <CalendarX className="text-muted/50" size={36} />
                  <p className="text-muted text-xs mt-2 max-w-[240px]">
                    No logged food this month yet. Tap a highlighted day to
                    preview it.
                  </p>
                </motion.div>

                <motion.div
                  initial={false}
                  animate={{
                    opacity: monthlyInsights.daysWithData > 0 ? 1 : 0,
                    y: monthlyInsights.daysWithData > 0 ? 0 : -6,
                  }}
                  transition={{ duration: 0.16 }}
                  aria-hidden={monthlyInsights.daysWithData === 0}
                  className={`row-start-1 col-start-1 ${
                    monthlyInsights.daysWithData > 0
                      ? ''
                      : 'pointer-events-none'
                  }`}
                >
                  {/* Tracked-days progress bar (DayLedger mini-bar anatomy:
                      solid bg-surface-highlight track on the /40 surface) */}
                  <div className="h-2 w-full rounded-full overflow-hidden bg-surface-highlight">
                    <motion.div
                      className="h-full rounded-full bg-accent-blue"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${
                          (monthlyInsights.daysWithData /
                            monthlyInsights.daysInMonth) *
                          100
                        }%`,
                      }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    <SummaryTile icon={Flame} label="Avg Energy">
                      <p className="text-accent-emerald font-bold text-sm leading-tight">
                        <AnimatedNumber value={monthlyInsights.avgCalories} />
                        <span className="text-muted text-[10px] font-medium">
                          {' '}
                          kcal
                        </span>
                      </p>
                    </SummaryTile>
                    <SummaryTile icon={Beef} label="Avg Protein">
                      <p className="text-accent-red font-bold text-sm leading-tight">
                        <AnimatedNumber value={monthlyInsights.avgProtein} />
                        <span className="text-muted text-[10px] font-medium">
                          {' '}
                          g
                        </span>
                      </p>
                    </SummaryTile>
                    <SummaryTile icon={Cookie} label="Avg Carbs">
                      <p className="text-accent-amber font-bold text-sm leading-tight">
                        <AnimatedNumber value={monthlyInsights.avgCarbs} />
                        <span className="text-muted text-[10px] font-medium">
                          {' '}
                          g
                        </span>
                      </p>
                    </SummaryTile>
                    <SummaryTile icon={Droplet} label="Avg Fats">
                      <p className="text-accent-yellow font-bold text-sm leading-tight">
                        <AnimatedNumber value={monthlyInsights.avgFats} />
                        <span className="text-muted text-[10px] font-medium">
                          {' '}
                          g
                        </span>
                      </p>
                    </SummaryTile>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>

          {/* Close Button */}
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full mt-6 px-4 py-3 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg font-semibold transition-colors"
          >
            Close
          </motion.button>
        </div>
      </ModalShell>
    </>
  );
};
