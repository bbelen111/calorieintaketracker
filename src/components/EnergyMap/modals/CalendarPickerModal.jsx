import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  TrendingUp,
  Flame,
  Beef,
  Cookie,
  Droplet,
} from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

const TOOLTIP_MAX_WIDTH = 170;
const TOOLTIP_VERTICAL_OFFSET = 12;

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

      const newDateStr = newDate.toISOString().split('T')[0];
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
      return 'bg-blue-500 border-blue-400 ring-2 ring-blue-300 shadow-lg';
    }
    if (isFocused) {
      return 'bg-surface-highlight/90 border-border/90 ring-2 ring-border hover:bg-surface-highlight/80';
    }
    if (hasEntries) {
      return 'bg-surface-highlight border-blue-400 hover:bg-surface-highlight/90';
    }
    return 'bg-surface-highlight border-border/80 hover:bg-surface-highlight/90';
  };

  const getDayNumber = (date) => {
    return new Date(date + 'T00:00:00Z').getUTCDate();
  };

  const handleDateClick = (date, event) => {
    setFocusedDate(date);
    onDateClick(date, event);
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
              i === 0 ? 'text-red-400' : 'text-muted'
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
                      onClick={(event) =>
                        !isGhost && handleDateClick(day.date, event)
                      }
                      onMouseEnter={() => !isGhost && setFocusedDate(day.date)}
                      whileHover={!isGhost ? { scale: 1.05 } : {}}
                      whileTap={!isGhost ? { scale: 0.98 } : {}}
                      transition={{ duration: 0.15 }}
                      disabled={isGhost}
                      data-calendar-date={day.date}
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
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400" />
                      )}
                      <span
                        className={`text-sm font-bold ${isGhost ? 'text-muted/50' : 'text-foreground'}`}
                      >
                        {dayNum}
                      </span>
                      {isGhost && (
                        <span className="text-muted/50 text-[8px] font-medium absolute bottom-1">
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

      {/* Legend
      <div className="flex items-center justify-center gap-4 pt-4 text-xs text-muted border-t border-border mt-4">
            <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-surface-highlight border-2 border-border/80 flex flex-col items-center justify-center gap-0.5 shadow-sm relative">
            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full border border-blue-400" />
            <span className="text-foreground font-bold text-[10px]">15</span>
            <span className="text-white text-[6px] leading-none opacity-80">
              2k
            </span>
          </div>
          <span>Has entries</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-surface-highlight border-2 border-border/80 flex items-center justify-center shadow-sm">
            <span className="text-foreground font-bold text-xs">1</span>
          </div>
          <span>No entries</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500 border-2 border-blue-400 ring-2 ring-blue-300 flex items-center justify-center shadow-sm">
            <span className="text-foreground font-bold text-xs">1</span>
          </div>
          <span>Selected</span>
        </div>
      </div> */}
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
  const [tooltipDate, setTooltipDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef(null);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => today.toISOString().split('T')[0], [today]);

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
      const dateStr = date.toISOString().split('T')[0];
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
      };
    }

    return {
      avgCalories: Math.round(totalCalories / daysWithData),
      avgProtein: Math.round(totalProtein / daysWithData),
      avgCarbs: Math.round(totalCarbs / daysWithData),
      avgFats: Math.round(totalFats / daysWithData),
      daysWithData,
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
        const dateStr = date.toISOString().split('T')[0];
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
      const dateStr = date.toISOString().split('T')[0];
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
        const dateStr = date.toISOString().split('T')[0];
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

  const handleDateClick = (date, event) => {
    const target = event?.currentTarget;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const nextPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top,
    };

    if (tooltipDate && tooltipDate !== date) {
      setTooltipClosing(true);
      setTooltipEntered(false);
    }

    setTooltipPosition(nextPosition);
    setTooltipDate(date);
    setTooltipClosing(false);
  };

  const handleKeyboardSelect = (date) => {
    onSelectDate(date);
    onClose();
  };

  const handlePrevMonth = () => {
    setSlideDirection(-1);
    if (currentMonth === 0) {
      onMonthChange(11, currentYear - 1);
    } else {
      onMonthChange(currentMonth - 1, currentYear);
    }
  };

  const handleNextMonth = () => {
    setSlideDirection(1);
    if (currentMonth === 11) {
      onMonthChange(0, currentYear + 1);
    } else {
      onMonthChange(currentMonth + 1, currentYear);
    }
  };

  const handleMonthSelect = (month) => {
    onMonthChange(month, currentYear);
    setShowMonthPicker(false);
    setTooltipDate(null);
  };

  const handleYearSelect = (year) => {
    onMonthChange(currentMonth, year);
    setShowYearPicker(false);
    setTooltipDate(null);
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

  const closeTooltip = () => {
    setTooltipClosing(true);
    setTimeout(() => {
      setTooltipDate(null);
      setTooltipClosing(false);
    }, 150);
  };

  const handleTooltipClick = () => {
    if (tooltipDate) {
      onSelectDate(tooltipDate);
      onClose();
      closeTooltip();
    }
  };

  useEffect(() => {
    if (!tooltipDate) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const tooltipNode = tooltipRef.current;
      const calendarCell = event.target.closest('[data-calendar-date]');

      if (tooltipNode?.contains(event.target) || calendarCell) {
        return;
      }

      closeTooltip();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [tooltipDate]);

  useEffect(() => {
    if (tooltipDate && !tooltipClosing) {
      const frame = requestAnimationFrame(() => setTooltipEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    if (!tooltipDate) {
      Promise.resolve().then(() => setTooltipEntered(false));
    }
    return undefined;
  }, [tooltipDate, tooltipClosing]);

  useEffect(() => {
    if (!isOpen) {
      setTooltipDate(null);
    }
  }, [isOpen]);

  const tooltipMacros = useMemo(() => {
    if (!tooltipDate) {
      return { calories: 0, protein: 0, carbs: 0, fats: 0 };
    }
    return getMacrosForDate(tooltipDate, nutritionData);
  }, [tooltipDate, nutritionData]);

  const hasTooltipData = useMemo(() => {
    if (!tooltipDate) return false;
    const dateData = nutritionData[tooltipDate] || {};
    return Object.values(dateData).some(
      (entries) => Array.isArray(entries) && entries.length > 0
    );
  }, [tooltipDate, nutritionData]);

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
            <h3 className="text-foreground font-bold text-xl flex items-center gap-2">
              <Calendar className="text-blue-400" size={24} />
              Select Date
            </h3>

            <motion.button
              type="button"
              onClick={handleTodayClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              aria-label="Select today"
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <CalendarIcon size={16} />
              Today
            </motion.button>
          </div>

          {/* Compact Month/Year Header with Navigation */}
          <div className="flex items-center justify-between mb-6 gap-2">
            <motion.button
              type="button"
              onClick={handlePrevMonth}
              whileHover={{ scale: 1.05, x: -2 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 bg-surface-highlight hover:bg-surface-highlight/90 text-foreground rounded-lg transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={20} />
            </motion.button>

            <div className="flex items-center gap-3 relative w-full justify-center">
              <button
                type="button"
                onClick={() => {
                  setShowMonthPicker(!showMonthPicker);
                  setShowYearPicker(false);
                }}
                className="text-white font-semibold text-lg hover:text-blue-400 transition-colors cursor-pointer underline underline-offset-4 mr-auto"
              >
                {monthNames[currentMonth]}
              </button>

              {/* Centered separator dot */}
              <span className="text-muted absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
                •
              </span>

              <button
                type="button"
                onClick={() => {
                  setShowYearPicker(!showYearPicker);
                  setShowMonthPicker(false);
                }}
                className="text-white font-semibold text-lg hover:text-blue-400 transition-colors cursor-pointer underline underline-offset-4 ml-auto"
              >
                {currentYear}
              </button>
            </div>

            <motion.button
              type="button"
              onClick={handleNextMonth}
              whileHover={{ scale: 1.05, x: 2 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 bg-surface-highlight hover:bg-surface-highlight/90 text-foreground rounded-lg transition-colors"
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
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute left-1/5 -translate-x-1/2 top-29 z-50"
                >
                  <div className="grid grid-cols-3 gap-2 p-4 bg-surface rounded-lg border-2 border-border shadow-2xl w-64">
                    {monthNames.map((month, index) => (
                      <motion.button
                        key={month}
                        type="button"
                        onClick={() => handleMonthSelect(index)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-3 py-2 rounded-lg font-semibold transition-colors text-sm whitespace-nowrap ${
                          index === currentMonth
                            ? 'bg-blue-600 text-white'
                            : 'bg-surface-highlight text-foreground/80 hover:bg-surface-highlight/90 hover:text-foreground'
                        }`}
                      >
                        {month.slice(0, 3)}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
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
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute left-1/2 -translate-x-1/2 top-29 z-50"
                >
                  <div className="grid grid-cols-4 gap-2 p-4 bg-surface rounded-lg border-2 border-border shadow-2xl w-56">
                    {yearRange.map((year) => (
                      <motion.button
                        key={year}
                        type="button"
                        onClick={() => handleYearSelect(year)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-1 py-2 rounded-lg font-semibold transition-colors text-sm ${
                          year === currentYear
                            ? 'bg-blue-600 text-white'
                            : 'bg-surface-highlight text-foreground/80 hover:bg-surface-highlight/90 hover:text-foreground'
                        }`}
                      >
                        {year}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Calendar */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="touch-pan-y select-none"
          >
            <CalendarHeatmap
              calendarData={calendarData}
              onDateClick={handleDateClick}
              onKeyboardSelect={handleKeyboardSelect}
              selectedDate={selectedDate}
              slideDirection={slideDirection}
              monthNames={monthNames}
            />
          </div>

          {/* Monthly Insights */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 bg-surface-highlight rounded-lg p-4 border border-border/80"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="text-blue-400" size={18} />
              <h4 className="text-foreground font-bold text-sm">Monthly Average</h4>
              <motion.span
                className="text-muted text-xs ml-auto"
                key={monthlyInsights.daysWithData}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {monthlyInsights.daysWithData > 0 ? (
                  <>
                    {monthlyInsights.daysWithData} day
                    {monthlyInsights.daysWithData === 1
                      ? ' tracked'
                      : 's tracked'}
                  </>
                ) : (
                  'No data yet'
                )}
              </motion.span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {/* Calories */}
              <div className="flex flex-col items-center">
                <div className="bg-surface rounded-lg p-2 w-full flex flex-col items-center border border-border/80">
                  <Flame className="text-emerald-400 mb-1" size={16} />
                  <motion.p
                    className="text-emerald-400 font-bold text-base"
                    key={monthlyInsights.avgCalories}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <AnimatedNumber value={monthlyInsights.avgCalories} />
                  </motion.p>
                  <p className="text-muted text-[9px] font-medium">kcal</p>
                </div>
              </div>

              {/* Protein */}
              <div className="flex flex-col items-center">
                <div className="bg-surface rounded-lg p-2 w-full flex flex-col items-center border border-border/80">
                  <Beef className="text-red-400 mb-1" size={16} />
                  <motion.p
                    className="text-red-400 font-bold text-base"
                    key={monthlyInsights.avgProtein}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <AnimatedNumber value={monthlyInsights.avgProtein} />
                  </motion.p>
                  <p className="text-muted text-[9px] font-medium">
                    protein
                  </p>
                </div>
              </div>

              {/* Fats */}
              <div className="flex flex-col items-center">
                <div className="bg-surface rounded-lg p-2 w-full flex flex-col items-center border border-border/80">
                  <Droplet className="text-yellow-400 mb-1" size={16} />
                  <motion.p
                    className="text-yellow-400 font-bold text-base"
                    key={monthlyInsights.avgFats}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <AnimatedNumber value={monthlyInsights.avgFats} />
                  </motion.p>
                  <p className="text-muted text-[9px] font-medium">fats</p>
                </div>
              </div>

              {/* Carbs */}
              <div className="flex flex-col items-center">
                <div className="bg-surface rounded-lg p-2 w-full flex flex-col items-center border border-border/80">
                  <Cookie className="text-amber-400 mb-1" size={16} />
                  <motion.p
                    className="text-amber-400 font-bold text-base"
                    key={monthlyInsights.avgCarbs}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <AnimatedNumber value={monthlyInsights.avgCarbs} />
                  </motion.p>
                  <p className="text-muted text-[9px] font-medium">carbs</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Close Button */}
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full mt-6 px-4 py-3 bg-surface-highlight hover:bg-surface-highlight/90 text-foreground rounded-lg font-semibold transition-colors"
          >
            Close
          </motion.button>
        </div>
      </ModalShell>

      {tooltipDate && (
        <div
          ref={tooltipRef}
          className={`fixed z-[1200] bg-surface border border-border/80 rounded-lg shadow-2xl p-2.5 transform -translate-x-1/2 -translate-y-full pointer-events-auto transition duration-150 ease-out max-w-[170px] w-fit ${
            tooltipEntered && !tooltipClosing
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95'
          }`}
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y - TOOLTIP_VERTICAL_OFFSET}px`,
            maxWidth: `${TOOLTIP_MAX_WIDTH}px`,
          }}
          onClick={handleTooltipClick}
        >
          <div className="cursor-pointer hover:bg-surface-highlight/50 rounded p-2 transition-all">
            <p className="text-muted text-[11px] mb-1">
              {new Date(tooltipDate + 'T00:00:00Z').toLocaleDateString(
                'en-US',
                {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }
              )}
            </p>
            {hasTooltipData ? (
              <>
                <p className="text-emerald-400 text-lg font-bold">
                  {Math.round(tooltipMacros.calories)} kcal
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-red-400 font-semibold">
                    P {Math.round(tooltipMacros.protein)}g
                  </span>
                  <span className="text-amber-400 font-semibold">
                    C {Math.round(tooltipMacros.carbs)}g
                  </span>
                  <span className="text-yellow-400 font-semibold">
                    F {Math.round(tooltipMacros.fats)}g
                  </span>
                </div>
              </>
            ) : (
              <p className="text-foreground/80 text-sm font-semibold">No entries</p>
            )}
            <p className="text-muted text-[10px] mt-2 uppercase tracking-wide">
              Tap to open day
            </p>
          </div>

          <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-border"></div>
        </div>
      )}
    </>
  );

  // AnimatedNumber component for smooth transitions
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
};
