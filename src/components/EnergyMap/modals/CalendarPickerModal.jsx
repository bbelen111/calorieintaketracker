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

  const getMacrosForDate = (date) => {
    const dateData = nutritionData[date] || {};
    // nutritionData is now nested: { date: { mealType: [entries] } }
    const allEntries = Object.values(dateData).flat();
    if (allEntries.length === 0)
      return { calories: 0, protein: 0, carbs: 0, fats: 0 };

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

  const getDayNumber = (date) => {
    return new Date(date + 'T00:00:00Z').getUTCDate();
  };

  const formatMacroDisplay = (value, hasData) => {
    // Only display if there is data for the day
    if (!hasData) return null;
    // Show 0 if value is 0 and hasData is true
    if (value === 0) return '0';
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'k';
    }
    return Math.round(value).toString();
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
    <div className="space-y-2 transition-all duration-300 ease-in-out">
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

      {/* Weeks - Fixed height for 6 weeks */}
      <div className="relative h-[372px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${calendarData[0]?.date || 'empty'}`}
            initial={{ opacity: 0, x: slideDirection * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection * -20 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
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
                  const macros = getMacrosForDate(day.date);
                  const dayNum = getDayNumber(day.date);

                  // Only show macro insights if there is data for the day
                  const hasData = day.hasEntries;
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
                      aria-label={`Select ${new Date(day.date + 'T00:00:00Z').toLocaleDateString()}${hasData ? `, ${macros.calories} calories` : ''}`}
                      aria-pressed={day.date === selectedDate}
                    >
                      {day.hasEntries && (
                        <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border border-blue-400 shadow-sm" />
                      )}
                      <span className="text-white text-sm font-bold">
                        {dayNum}
                      </span>
                      {hasData && (
                        <div className="flex flex-col gap-0 leading-none w-full px-1">
                          <span className="text-emerald-400 text-[9px] font-semibold">
                            kcal:{formatMacroDisplay(macros.calories, hasData)}
                          </span>
                          <div className="flex items-center justify-between gap-0.5">
                            <span className="text-red-400 text-[7px] font-medium">
                              P:{formatMacroDisplay(macros.protein, hasData)}
                            </span>
                            <span className="text-yellow-400 text-[7px] font-medium">
                              F:{formatMacroDisplay(macros.fats, hasData)}
                            </span>
                            <span className="text-amber-400 text-[7px] font-medium">
                              C:{formatMacroDisplay(macros.carbs, hasData)}
                            </span>
                          </div>
                        </div>
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
      <div className="flex items-center justify-center gap-4 pt-4 text-xs text-slate-400 border-t border-slate-700 mt-4">
            <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-slate-700 border-2 border-slate-600 flex flex-col items-center justify-center gap-0.5 shadow-sm relative">
            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full border border-blue-400" />
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
      const dateData = nutritionData[dateStr] || {};
      // Check if any meal type has entries
      const hasEntries = Object.values(dateData).some(
        (entries) => Array.isArray(entries) && entries.length > 0
      );

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
      <div className="p-6 relative transition-all duration-300 ease-in-out">
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
            <span className="text-slate-500 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
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
                className="absolute left-1/2 -translate-x-1/2 top-29 z-50"
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

        {/* Monthly Insights */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-12 bg-slate-700 rounded-lg p-4 border border-slate-600"
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="text-blue-400" size={18} />
            <h4 className="text-white font-bold text-sm">Monthly Average</h4>
            <motion.span
              className="text-slate-400 text-xs ml-auto"
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
              <div className="bg-slate-800 rounded-lg p-2 w-full flex flex-col items-center border border-slate-600">
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
                <p className="text-slate-400 text-[9px] font-medium">kcal</p>
              </div>
            </div>

            {/* Protein */}
            <div className="flex flex-col items-center">
              <div className="bg-slate-800 rounded-lg p-2 w-full flex flex-col items-center border border-slate-600">
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
                <p className="text-slate-400 text-[9px] font-medium">protein</p>
              </div>
            </div>

            {/* Fats */}
            <div className="flex flex-col items-center">
              <div className="bg-slate-800 rounded-lg p-2 w-full flex flex-col items-center border border-slate-600">
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
                <p className="text-slate-400 text-[9px] font-medium">fats</p>
              </div>
            </div>

            {/* Carbs */}
            <div className="flex flex-col items-center">
              <div className="bg-slate-800 rounded-lg p-2 w-full flex flex-col items-center border border-slate-600">
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
                <p className="text-slate-400 text-[9px] font-medium">carbs</p>
              </div>
            </div>
          </div>
        </motion.div>

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
