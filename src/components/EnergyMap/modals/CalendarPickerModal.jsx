import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

const CalendarHeatmap = ({
  calendarData,
  onDateClick,
  selectedDate,
  onKeyboardSelect,
  slideDirection,
  nutritionData,
}) => {
  const [focusedDate, setFocusedDate] = useState(
    selectedDate || calendarData[0]?.date || null
  );

  // Group by weeks
  const weeks = useMemo(() => {
    const weekArray = [];
    let currentWeek = [];

    calendarData.forEach((day) => {
      // Start new week on Sunday (dayOfWeek === 0)
      if (day.dayOfWeek === 0 && currentWeek.length > 0) {
        weekArray.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    });

    // Push last week if it has days
    if (currentWeek.length > 0) {
      weekArray.push(currentWeek);
    }

    return weekArray;
  }, [calendarData]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!focusedDate) return;

      const currentDate = new Date(focusedDate + 'T00:00:00');
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

  const getStatusColor = (date) => {
    const isSelected = date === selectedDate;
    const isFocused = date === focusedDate;

    if (isSelected) {
      return 'bg-blue-500 border-blue-400 ring-2 ring-blue-300 shadow-lg';
    }
    if (isFocused) {
      return 'bg-slate-600 border-slate-400 ring-2 ring-slate-500 hover:bg-slate-500';
    }
    return 'bg-slate-700 border-slate-600 hover:bg-slate-600';
  };

  const getCaloriesForDate = (date) => {
    const entries = nutritionData[date] || [];
    if (!Array.isArray(entries) || entries.length === 0) return 0;

    return entries.reduce((total, entry) => total + (entry.calories || 0), 0);
  };

  const getDayNumber = (date) => {
    return new Date(date + 'T00:00:00Z').getUTCDate();
  };

  const formatCaloriesDisplay = (calories) => {
    if (calories === 0) return null;
    // Show exact number with commas for readability
    return calories.toLocaleString();
  };

  const handleDateClick = (date) => {
    setFocusedDate(date);
    onDateClick(date);
  };

  if (weeks.length === 0) {
    return (
      <div className="text-slate-400 text-sm text-center py-4">
        No calendar data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Day labels */}
      <div className="grid grid-cols-7 gap-2 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div
            key={i}
            className={`text-xs text-center font-semibold ${
              i === 0 ? 'text-red-400' : 'text-slate-400'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${calendarData[0]?.date || 'empty'}`}
          initial={{ opacity: 0, x: slideDirection * 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: slideDirection * -20 }}
          transition={{ duration: 0.2 }}
        >
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-2 mb-2">
              {/* Pad start of first week if doesn't start on Sunday */}
              {weekIndex === 0 &&
                week[0].dayOfWeek !== 0 &&
                Array.from({ length: week[0].dayOfWeek }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}

              {week.map((day) => {
                const calories = getCaloriesForDate(day.date);
                const caloriesText = formatCaloriesDisplay(calories);
                const dayNum = getDayNumber(day.date);

                return (
                  <motion.button
                    key={day.date}
                    type="button"
                    onClick={() => handleDateClick(day.date)}
                    onMouseEnter={() => setFocusedDate(day.date)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors relative ${getStatusColor(day.date)}`}
                    aria-label={`Select ${new Date(day.date + 'T00:00:00').toLocaleDateString()}${caloriesText ? `, ${caloriesText} calories` : ''}`}
                    aria-pressed={day.date === selectedDate}
                  >
                    {day.hasEntries && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full border border-emerald-400 shadow-sm" />
                    )}
                    <span className="text-white text-sm">{dayNum}</span>
                    {caloriesText && (
                      <span className="text-white text-[8px] leading-none opacity-80">
                        {caloriesText}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Legend
      <div className="flex items-center justify-center gap-4 pt-4 text-xs text-slate-400 border-t border-slate-700 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-slate-700 border-2 border-slate-600 flex flex-col items-center justify-center gap-0.5 shadow-sm relative">
            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full border border-emerald-400" />
            <span className="text-white font-bold text-[10px]">15</span>
            <span className="text-white text-[6px] leading-none opacity-80">
              2k
            </span>
          </div>
          <span>Has entries</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-slate-700 border-2 border-slate-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-xs">1</span>
          </div>
          <span>No entries</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500 border-2 border-blue-400 ring-2 ring-blue-300 flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-xs">1</span>
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

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => today.toISOString().split('T')[0], [today]);

  // Generate year range (5 years back, 1 year forward)
  const yearRange = useMemo(() => {
    const currentYearNum = today.getFullYear();
    const years = [];
    for (let i = currentYearNum - 5; i <= currentYearNum + 1; i++) {
      years.push(i);
    }
    return years;
  }, [today]);

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
  // Generate calendar data for the current month
  const calendarData = useMemo(() => {
    const year = currentYear;
    const month = currentMonth;
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    const data = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, month, day));
      const dateStr = date.toISOString().split('T')[0];
      const hasEntries =
        nutritionData[dateStr] && nutritionData[dateStr].length > 0;

      data.push({
        date: dateStr,
        dayOfWeek: date.getUTCDay(),
        hasEntries,
      });
    }

    return data;
  }, [currentMonth, currentYear, nutritionData]);

  const handleDateClick = (date) => {
    onSelectDate(date);
    onClose();
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
  };

  const handleYearSelect = (year) => {
    onMonthChange(currentMonth, year);
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
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full max-w-lg"
    >
      <div className="p-6 relative">
        <div className="flex items-center justify-between mb-6 gap-2">
          <h3 className="text-white font-bold text-xl flex items-center gap-2">
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
            className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </motion.button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowMonthPicker(!showMonthPicker);
                setShowYearPicker(false);
              }}
              className="text-white font-semibold text-lg hover:text-blue-400 transition-colors cursor-pointer underline underline-offset-4"
            >
              {monthNames[currentMonth]}
            </button>

            <span className="text-slate-500">•</span>

            <button
              type="button"
              onClick={() => {
                setShowYearPicker(!showYearPicker);
                setShowMonthPicker(false);
              }}
              className="text-white font-semibold text-lg hover:text-blue-400 transition-colors cursor-pointer underline underline-offset-4"
            >
              {currentYear}
            </button>
          </div>

          <motion.button
            type="button"
            onClick={handleNextMonth}
            whileHover={{ scale: 1.05, x: 2 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
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
                <div className="grid grid-cols-3 gap-2 p-4 bg-slate-800 rounded-lg border-2 border-slate-700 shadow-2xl w-64">
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
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
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
                className="absolute left-1/3 -translate-x-1/2 top-29 z-50"
              >
                <div className="grid grid-cols-4 gap-2 p-4 bg-slate-800 rounded-lg border-2 border-slate-700 shadow-2xl w-56">
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
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
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
            nutritionData={nutritionData}
          />
        </div>

        {/* Close Button */}
        <motion.button
          onClick={onClose}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full mt-6 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
        >
          Close
        </motion.button>
      </div>
    </ModalShell>
  );
};
