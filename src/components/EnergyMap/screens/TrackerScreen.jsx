import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  Plus,
  Utensils,
  Flame,
  Beef,
  Cookie,
  Droplet,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarCog,
} from 'lucide-react';
import { MEAL_TYPE_ORDER, getMealTypeById } from '../../../constants/mealTypes';
import { formatOne } from '../../../utils/format';

const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

// Circular progress bar component
const CircularProgress = ({ percent, color, size = 120, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        className="text-slate-700"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={color}
        strokeLinecap="round"
        style={{
          transition: 'stroke-dashoffset 0.5s ease',
        }}
      />
    </svg>
  );
};

export const TrackerScreen = ({
  nutritionData = {},
  onAddMealEntry,
  onAddFoodToMeal,
  onEditFoodEntry,
  onDeleteFoodEntry,
  onDeleteMeal,
  targetProtein = 150,
  targetFats = 70,
  stepRanges = [],
  selectedGoal = 'maintenance',
  selectedDay = 'training',
  getRangeDetails,
  calendarModal,
  selectedDate: selectedDateProp,
  onSelectedDateChange,
  selectedStepRange,
  onStepRangeChange,
  showCalorieTargetPicker,
  onToggleCalorieTargetPicker,
  isSwiping,
}) => {
  // Support controlled (selectedDateProp + onSelectedDateChange) or uncontrolled mode
  const [internalSelectedDate, setInternalSelectedDate] = useState(
    selectedDateProp || getTodayDate()
  );

  // Treat as controlled only if parent provided both a value and an updater.
  const isControlled = Boolean(
    selectedDateProp !== undefined && typeof onSelectedDateChange === 'function'
  );

  const selectedDate = isControlled ? selectedDateProp : internalSelectedDate;
  const [collapsedMeals, setCollapsedMeals] = useState({});
  const previousDateRef = useRef(selectedDate);
  // Whether the current selected date is today (used to show an indicator)
  const isTodaySelected = selectedDate === getTodayDate();

  // Days difference between selected date and today (UTC days)
  const msPerDay = 24 * 60 * 60 * 1000;
  const selectedDateObj = new Date(selectedDate + 'T00:00:00Z');
  const todayDateObj = new Date(getTodayDate() + 'T00:00:00Z');
  const dayDifference = Math.round(
    (selectedDateObj.getTime() - todayDateObj.getTime()) / msPerDay
  );

  // Badge text for past/future
  let dateBadgeText = '';
  if (dayDifference === 0) {
    dateBadgeText = '';
  } else if (dayDifference < 0) {
    const days = Math.abs(dayDifference);
    dateBadgeText = days === 1 ? '1 day ago' : `${days} days ago`;
  } else {
    dateBadgeText =
      dayDifference === 1 ? 'in 1 day' : `in ${dayDifference} days`;
  }

  // Calculate ranges based on bodyweight (matching InsightsScreen)
  // targetProtein is passed as weight * 2, so range is weight * 2.0 to weight * 2.4
  // targetFats is passed as weight * 0.8, so range is weight * 0.8 to weight * 1.0
  const proteinMin = Math.round(targetProtein); // 2.0g per kg (already calculated)
  const proteinMax = Math.round(targetProtein * 1.2); // 2.4g per kg (2 * 1.2 = 2.4)
  const fatsMin = Math.round(targetFats); // 0.8g per kg (already calculated)
  const fatsMax = Math.round(targetFats * 1.25); // 1.0g per kg (0.8 * 1.25 = 1.0)

  // Get data for selected date - now nested by meal type
  const dayData = useMemo(() => {
    const data = nutritionData[selectedDate] || {};
    // Organize meals by type with entries
    const meals = {};
    let hasEntries = false;

    MEAL_TYPE_ORDER.forEach((mealTypeId) => {
      const entries = Array.isArray(data[mealTypeId]) ? data[mealTypeId] : [];
      if (entries.length > 0) {
        meals[mealTypeId] = entries;
        hasEntries = true;
      }
    });

    return { meals, hasEntries };
  }, [nutritionData, selectedDate]);

  const { meals, hasEntries: hasFoodEntries } = dayData;

  // (countEntriesForDate inlined inside effect below to avoid hook dependency issues)
  const [skipMealAnimation, setSkipMealAnimation] = useState(false);
  const [allowInitialAnimation, setAllowInitialAnimation] = useState(false);

  useEffect(() => {
    if (previousDateRef.current === selectedDate) {
      return;
    }

    // Determine if previous and current dates both have zero entries and update flag
    const prevData = nutritionData[previousDateRef.current] || {};
    const currData = nutritionData[selectedDate] || {};
    const prevCount = MEAL_TYPE_ORDER.reduce((n, mealTypeId) => {
      const arr = Array.isArray(prevData[mealTypeId])
        ? prevData[mealTypeId]
        : [];
      return n + arr.length;
    }, 0);
    const currCount = MEAL_TYPE_ORDER.reduce((n, mealTypeId) => {
      const arr = Array.isArray(currData[mealTypeId])
        ? currData[mealTypeId]
        : [];
      return n + arr.length;
    }, 0);
    const bothEmpty =
      !!previousDateRef.current &&
      prevCount === 0 &&
      currCount === 0 &&
      previousDateRef.current !== selectedDate;
    let skipRaf = null;
    if (skipMealAnimation !== bothEmpty) {
      // Defer state update to next frame to avoid cascading renders within the effect
      skipRaf = requestAnimationFrame(() => setSkipMealAnimation(bothEmpty));
    }

    // If we are coming from an empty date into a non-empty date, allow the initial AnimatePresence animation
    let allowRaf = null;
    if (prevCount === 0 && currCount > 0) {
      // Defer this set to next frame so it doesn't cascade with other state updates in this effect
      allowRaf = requestAnimationFrame(() => setAllowInitialAnimation(true));
    }

    previousDateRef.current = selectedDate;

    let frame = requestAnimationFrame(() => {
      setCollapsedMeals({});
      frame = null;
    });

    return () => {
      if (frame != null) {
        cancelAnimationFrame(frame);
      }
      if (skipRaf != null) {
        cancelAnimationFrame(skipRaf);
      }
      if (allowRaf != null) {
        cancelAnimationFrame(allowRaf);
      }
    };
  }, [selectedDate, nutritionData, skipMealAnimation]);

  // Reset the allowInitialAnimation flag after one frame so initial animations only run once
  useEffect(() => {
    if (!allowInitialAnimation) return;
    let raf = requestAnimationFrame(() => {
      setAllowInitialAnimation(false);
      raf = null;
    });
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [allowInitialAnimation]);

  // Calculate totals across all meals
  const totals = useMemo(() => {
    const allEntries = Object.values(meals).flat();
    return allEntries.reduce(
      (acc, entry) => ({
        calories: acc.calories + (entry.calories || 0),
        protein: acc.protein + (entry.protein || 0),
        carbs: acc.carbs + (entry.carbs || 0),
        fats: acc.fats + (entry.fats || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [meals]);

  const proteinPercent = Math.min(
    100,
    Math.round((totals.protein / targetProtein) * 100)
  );
  const fatsPercent = Math.min(
    100,
    Math.round((totals.fats / targetFats) * 100)
  );

  // Check if within range
  const proteinInRange =
    totals.protein >= proteinMin && totals.protein <= proteinMax;
  const fatsInRange = totals.fats >= fatsMin && totals.fats <= fatsMax;

  // Get calorie target from selected step range
  const calorieTargetData = useMemo(() => {
    if (!getRangeDetails || !selectedStepRange) return null;
    return getRangeDetails(selectedStepRange);
  }, [getRangeDetails, selectedStepRange]);

  const targetCalories = calorieTargetData?.targetCalories || 2500;
  const caloriesRemaining = targetCalories - totals.calories;
  const caloriesPercent = Math.min(
    100,
    Math.round((totals.calories / targetCalories) * 100)
  );

  // Calculate target carbs from remaining calories after protein and fats
  // Protein: 4 cal/g, Fats: 9 cal/g, Carbs: 4 cal/g
  const proteinCalories = targetProtein * 4;
  const fatsCalories = targetFats * 9;
  const remainingCaloriesForCarbs =
    targetCalories - proteinCalories - fatsCalories;
  const targetCarbs = Math.max(0, Math.round(remainingCaloriesForCarbs / 4));
  const carbsPercent = Math.min(
    100,
    Math.round((totals.carbs / targetCarbs) * 100)
  );

  const handleEditFood = (mealType, entryId) => {
    onEditFoodEntry?.(mealType, entryId);
  };

  const handleDeleteFood = (mealType, entryId) => {
    if (window.confirm('Delete this food entry?')) {
      onDeleteFoodEntry?.(selectedDate, mealType, entryId);
    }
  };

  const handleDeleteMeal = (mealType) => {
    if (
      window.confirm(`Delete all ${getMealTypeById(mealType).label} entries?`)
    ) {
      onDeleteMeal?.(selectedDate, mealType);
    }
  };

  const handleAddFoodToMealClick = (mealType) => {
    if (onAddFoodToMeal) {
      onAddFoodToMeal(mealType);
    } else {
      onAddMealEntry?.(mealType);
    }
  };

  const toggleMealCollapse = (mealType) => {
    setCollapsedMeals((prev) => {
      const current = prev[mealType] ?? true;
      return {
        ...prev,
        [mealType]: !current,
      };
    });
  };

  const getWeekday = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };
  const getMonthDayYear = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const changeDateBy = (offset) => {
    const base = selectedDate || getTodayDate();
    const date = new Date(base + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    const iso = date.toISOString().split('T')[0];
    if (typeof onSelectedDateChange === 'function') {
      onSelectedDateChange(iso);
    } else {
      setInternalSelectedDate(iso);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="text-blue-400" size={32} />
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Calorie Tracker
            </h1>
          </div>
          <button
            onClick={() => calendarModal?.open()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            <CalendarCog size={20} />
            <span className="hidden md:inline">Calendar</span>
          </button>
        </div>
        <div className="bg-slate-700/50 rounded-lg py-1 border border-slate-600/50 flex items-center justify-between relative shadow-lg shadow-slate-900/20">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center">
              <button
                onClick={() => changeDateBy(-1)}
                type="button"
                className="p-1 rounded transition-colors"
                title="Previous day"
              >
                <ChevronLeft className="text-slate-300" size={22} />
              </button>
              <Calendar size={18} className="text-blue-400" />
              <div className="relative h-6 ml-1">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={`${selectedDate}-weekday`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-white text-md font-semibold block"
                  >
                    {getWeekday(selectedDate)}
                    {!isTodaySelected && (
                      <span className="ml-2 text-slate-400 text-xs font-normal">
                        {dateBadgeText}
                      </span>
                    )}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
            <div className="flex items-center">
              <div className="relative h-6">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={`${selectedDate}-monthday`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-white text-md font-semibold block"
                  >
                    {getMonthDayYear(selectedDate)}
                  </motion.span>
                </AnimatePresence>
              </div>
              <button
                onClick={() => changeDateBy(1)}
                type="button"
                className="p-1 rounded transition-colors"
                title="Next day"
              >
                <ChevronRight className="text-slate-300" size={22} />
              </button>
            </div>
          </div>

          {/* relative-day text moved next to weekday (see weekday span) */}
        </div>
      </div>

      {/* Total Calories */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="text-blue-400" size={20} />
            <span className="text-white text-lg font-bold tracking-wide">
              Total Calories
            </span>
          </div>
          <div className="h-8">
            <AnimatePresence mode="wait">
              <motion.p
                key={`totals-cal-${totals.calories}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-emerald-400 font-bold text-2xl"
              >
                {formatOne(totals.calories)}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* Calorie Target Selector */}
        <div className="relative">
          <button
            onClick={() => onToggleCalorieTargetPicker?.()}
            className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-left flex items-center justify-between hover:bg-slate-750 transition-all  shadow-lg shadow-slate-900/20"
          >
            <div className="flex-1">
              <p className="text-slate-400 text-xs mb-0.5">Target</p>
              {/* Animate only the text when the selection/target changes */}
              <div className="relative h-6">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`target-${targetCalories}-${selectedStepRange}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-white text-sm font-semibold absolute left-0"
                  >
                    {formatOne(targetCalories)} kcal
                    <span className="text-slate-400 font-normal ml-2">
                      ({selectedStepRange} steps)
                    </span>
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            <ChevronDown
              size={22}
              className={`text-white transition-transform duration-300 ${
                showCalorieTargetPicker ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Dropdown - animate both open and close */}
          <AnimatePresence>
            {showCalorieTargetPicker && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
                className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-600/50 rounded-lg shadow-2xl max-h-64 overflow-y-auto"
                style={{ transformOrigin: 'top center' }}
              >
                {stepRanges.map((range) => {
                  const rangeData = getRangeDetails?.(range);
                  const isSelected = range === selectedStepRange;
                  return (
                    <button
                      key={`range-${range}`}
                      onClick={() => {
                        onStepRangeChange?.(range);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-slate-700 transition-all border-b border-slate-700/50 last:border-b-0 ${
                        isSelected ? 'bg-slate-700/60' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-semibold text-sm">
                            {range} steps
                          </p>
                          <p className="text-slate-400 text-xs">
                            {selectedGoal === 'maintenance'
                              ? 'Maintain weight'
                              : selectedGoal === 'bulking'
                                ? 'Lean bulk'
                                : selectedGoal === 'aggressive_bulk'
                                  ? 'Aggressive bulk'
                                  : selectedGoal === 'cutting'
                                    ? 'Moderate cut'
                                    : selectedGoal === 'aggressive_cut'
                                      ? 'Aggressive cut'
                                      : 'Unknown'}{' '}
                            - {selectedDay === 'training' ? 'Training' : 'Rest'}{' '}
                            day
                          </p>
                        </div>
                        <p
                          className={`font-bold ${isSelected ? 'text-emerald-400' : 'text-slate-300'}`}
                        >
                          {formatOne(rangeData?.targetCalories || 0)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 mb-6">
          <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full ${
                caloriesPercent >= 100 ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{
                width: `${caloriesPercent}%`,
                transition: 'width 220ms ease',
              }}
            />
          </div>
          <div className="text-slate-400 text-xs mt-1">
            <AnimatePresence mode="wait">
              <motion.span
                key={`remaining-${caloriesRemaining}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="inline-block"
              >
                {caloriesRemaining >= 0 ? (
                  <>
                    <span className="text-emerald-400 font-semibold">
                      {formatOne(caloriesRemaining)}
                    </span>{' '}
                    remaining
                  </>
                ) : (
                  <>
                    <span className="text-red-400 font-semibold">
                      {formatOne(Math.abs(caloriesRemaining))}
                    </span>{' '}
                    over target
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {/* Protein */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <CircularProgress
                percent={proteinPercent}
                color="text-red-500"
                size={100}
                strokeWidth={8}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Beef className="text-red-400 mb-1" size={20} />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`protein-${totals.protein}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-white font-bold text-lg"
                  >
                    {formatOne(totals.protein)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            <p className="text-slate-300 text-xs font-semibold mt-2">Protein</p>
            <p className="text-slate-400 text-xs">
              {proteinInRange ? (
                <span className="text-blue-400">
                  ✓ {formatOne(proteinMin)}-{formatOne(proteinMax)}g
                </span>
              ) : (
                <span>
                  {formatOne(proteinMin)}-{formatOne(proteinMax)}g
                </span>
              )}
            </p>
          </div>

          {/* Fats */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <CircularProgress
                percent={fatsPercent}
                color="text-yellow-500"
                size={100}
                strokeWidth={8}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Droplet className="text-yellow-400 mb-1" size={20} />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`fats-${totals.fats}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-white font-bold text-lg"
                  >
                    {formatOne(totals.fats)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            <p className="text-slate-300 text-xs font-semibold mt-2">Fats</p>
            <p className="text-slate-400 text-xs">
              {fatsInRange ? (
                <span className="text-blue-400">
                  ✓ {formatOne(fatsMin)}-{formatOne(fatsMax)}g
                </span>
              ) : (
                <span>
                  {formatOne(fatsMin)}-{formatOne(fatsMax)}g
                </span>
              )}
            </p>
          </div>

          {/* Carbs */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <CircularProgress
                percent={carbsPercent}
                color="text-amber-500"
                size={100}
                strokeWidth={8}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Cookie className="text-amber-400 mb-1" size={20} />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`carbs-${totals.carbs}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-white font-bold text-lg"
                  >
                    {formatOne(totals.carbs)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            <p className="text-slate-300 text-xs font-semibold mt-2">Carbs</p>
            <p className="text-slate-400 text-xs">
              {targetCarbs > 0 ? (
                <span>~{formatOne(targetCarbs)}g</span>
              ) : (
                <span>No room</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Food Entries Section - Grouped by Meal Type */}
      {skipMealAnimation ? (
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
          {hasFoodEntries ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Utensils className="text-blue-400" size={24} />
                  <h2 className="text-xl font-bold text-white">Meals</h2>
                </div>
                <button
                  onClick={() => onAddMealEntry?.('')}
                  type="button"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                >
                  <Plus size={20} />
                  Add
                </button>
              </div>

              <div className="space-y-3">
                {MEAL_TYPE_ORDER.map((mealTypeId) => {
                  const mealEntries = meals[mealTypeId];
                  if (!mealEntries || mealEntries.length === 0) return null;

                  const mealType = getMealTypeById(mealTypeId);
                  const isCollapsed = collapsedMeals[mealTypeId] ?? true;

                  const mealTotals = mealEntries.reduce(
                    (acc, entry) => ({
                      calories: acc.calories + (entry.calories || 0),
                      protein: acc.protein + (entry.protein || 0),
                      carbs: acc.carbs + (entry.carbs || 0),
                      fats: acc.fats + (entry.fats || 0),
                    }),
                    { calories: 0, protein: 0, carbs: 0, fats: 0 }
                  );

                  const latestTimestamp = mealEntries.reduce(
                    (latest, entry) => {
                      const entryTime = new Date(entry.timestamp).getTime();
                      return entryTime > latest ? entryTime : latest;
                    },
                    0
                  );
                  const mealTime = new Date(latestTimestamp).toLocaleTimeString(
                    'en-US',
                    {
                      hour: 'numeric',
                      minute: '2-digit',
                    }
                  );

                  return (
                    <div
                      key={`meal-${mealTypeId}`}
                      className="bg-slate-700/50 rounded-xl p-2 border border-slate-600/50 shadow-lg shadow-slate-900/20"
                    >
                      <button
                        onClick={() => toggleMealCollapse(mealTypeId)}
                        className="w-full flex items-center justify-between p-2 rounded-lg transition-all"
                      >
                        <div className="flex items-center gap-3">
                          {React.createElement(mealType.icon, {
                            className: 'text-white',
                            size: 20,
                          })}
                          <div className="text-left">
                            <h3 className="text-white font-bold text-base">
                              {mealType.label}
                            </h3>
                            <p className="text-slate-400 text-xs">
                              {`${mealEntries.length} item${mealEntries.length !== 1 ? 's' : ''} - ${formatOne(mealTotals.calories)} kcal - ${mealTime}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMeal(mealTypeId);
                            }}
                            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-all"
                            title="Delete meal"
                          >
                            <Trash2 className="text-red-400" size={22} />
                          </button>
                          <ChevronDown
                            className={`text-white transition-transform duration-300 ${
                              !isCollapsed ? 'rotate-180' : ''
                            }`}
                            size={22}
                          />
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div className="space-y-2 mt-2 overflow-hidden">
                          <div className="space-y-2">
                            {mealEntries.map((entry, idx) => (
                              <div
                                key={`entry-${entry.id}-${idx}`}
                                className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/50 flex justify-between items-start gap-3 shadow-lg shadow-slate-900/20"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-semibold text-sm truncate">
                                    <span className="align-middle">
                                      {entry.name}
                                    </span>
                                    {entry && entry.grams != null && (
                                      <span className="ml-2 text-slate-400 text-xs align-middle">
                                        {formatOne(entry.grams)} g
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-slate-400 text-xs">
                                    <span className="text-emerald-400">
                                      {formatOne(entry.calories)} kcal
                                    </span>
                                    {' - '}
                                    <span className="text-red-400">
                                      {formatOne(entry.protein)} p
                                    </span>
                                    {' - '}
                                    <span className="text-yellow-400">
                                      {formatOne(entry.fats)} f
                                    </span>
                                    {' - '}
                                    <span className="text-amber-400">
                                      {formatOne(entry.carbs)} c
                                    </span>
                                  </p>
                                </div>
                                <div className="flex items-end gap-3">
                                  <button
                                    onClick={() =>
                                      handleEditFood(mealTypeId, entry.id)
                                    }
                                    type="button"
                                    className="text-slate-200 hover:text-white transition-all hover:scale-110 active:scale-95"
                                  >
                                    <Edit3 size={22} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteFood(mealTypeId, entry.id)
                                    }
                                    type="button"
                                    className="text-red-400 hover:text-red-300 transition-all hover:scale-110 active:scale-95"
                                  >
                                    <Trash2 size={22} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            onClick={() => handleAddFoodToMealClick(mealTypeId)}
                            type="button"
                            className="w-full py-1 border-2 border-slate-600/50 hover:border-blue-500 rounded-lg text-slate-400 hover:text-blue-400 transition-all flex items-center justify-center gap-2 mt-3"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <button
                onClick={() => onAddMealEntry?.('')}
                type="button"
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 rounded-xl transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Utensils className="text-blue-400" size={24} />
                  <div className="text-left">
                    <h2 className="text-lg font-bold text-white">
                      Add Food Entry
                    </h2>
                    <p className="text-slate-400 text-sm">
                      Track your meals and nutrition
                    </p>
                  </div>
                </div>
                <Plus
                  className="text-slate-400 group-hover:text-blue-400 transition-colors"
                  size={24}
                />
              </button>
            </div>
          )}
        </div>
      ) : (
        <motion.div
          className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl"
          layout={!isSwiping}
          initial={false}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        >
          <AnimatePresence mode="wait" initial={allowInitialAnimation}>
            {hasFoodEntries ? (
              <motion.div
                key={`food-list-${selectedDate}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <motion.div
                  className="flex items-center justify-between mb-4"
                  layout={isSwiping ? false : 'position'}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <div className="flex items-center gap-2">
                    <Utensils className="text-blue-400" size={24} />
                    <h2 className="text-xl font-bold text-white">Meals</h2>
                  </div>
                  <motion.button
                    onClick={() => onAddMealEntry?.('')}
                    type="button"
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={20} />
                    Add
                  </motion.button>
                </motion.div>

                <motion.div layout={!isSwiping} className="space-y-3">
                  {MEAL_TYPE_ORDER.map((mealTypeId) => {
                    const mealEntries = meals[mealTypeId];
                    if (!mealEntries || mealEntries.length === 0) return null;

                    const mealType = getMealTypeById(mealTypeId);
                    const isCollapsed = collapsedMeals[mealTypeId] ?? true;

                    // Calculate meal totals
                    const mealTotals = mealEntries.reduce(
                      (acc, entry) => ({
                        calories: acc.calories + (entry.calories || 0),
                        protein: acc.protein + (entry.protein || 0),
                        carbs: acc.carbs + (entry.carbs || 0),
                        fats: acc.fats + (entry.fats || 0),
                      }),
                      { calories: 0, protein: 0, carbs: 0, fats: 0 }
                    );

                    // Get the latest timestamp from entries
                    const latestTimestamp = mealEntries.reduce(
                      (latest, entry) => {
                        const entryTime = new Date(entry.timestamp).getTime();
                        return entryTime > latest ? entryTime : latest;
                      },
                      0
                    );
                    const mealTime = new Date(
                      latestTimestamp
                    ).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={`meal-${mealTypeId}`}
                        className="bg-slate-700/50 rounded-xl p-2 border border-slate-600/50 shadow-lg shadow-slate-900/20"
                      >
                        {/* Meal Header */}
                        <button
                          onClick={() => toggleMealCollapse(mealTypeId)}
                          className="w-full flex items-center justify-between p-2 rounded-lg transition-all"
                        >
                          <div className="flex items-center gap-3">
                            {React.createElement(mealType.icon, {
                              className: 'text-white',
                              size: 20,
                            })}
                            <div className="text-left">
                              <h3 className="text-white font-bold text-base">
                                {mealType.label}
                              </h3>
                              <p className="text-slate-400 text-xs">
                                {`${mealEntries.length} item${mealEntries.length !== 1 ? 's' : ''} - ${formatOne(mealTotals.calories)} kcal - ${mealTime}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMeal(mealTypeId);
                              }}
                              className="p-1.5 hover:bg-red-500/20 rounded-lg transition-all"
                              title="Delete meal"
                            >
                              <Trash2 className="text-red-400" size={22} />
                            </button>
                            {/* Animate the meal chevron by rotating a single icon instead of swapping icons */}
                            <ChevronDown
                              className={`text-white transition-transform duration-300 ${
                                !isCollapsed ? 'rotate-180' : ''
                              }`}
                              size={22}
                            />
                          </div>
                        </button>

                        {/* Food Items */}
                        <AnimatePresence initial={false}>
                          {!isCollapsed && (
                            <motion.div
                              key={`meal-${mealTypeId}`}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{
                                duration: 0.3,
                                ease: [0.4, 0, 0.2, 1],
                              }}
                              className="space-y-2 mt-2 overflow-hidden"
                            >
                              <div className="space-y-2">
                                {mealEntries.map((entry, idx) => (
                                  <div
                                    key={`entry-${entry.id}-${idx}`}
                                    className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/50 flex justify-between items-start gap-3 shadow-lg shadow-slate-900/20"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-white font-semibold text-sm truncate">
                                        <span className="align-middle">
                                          {entry.name}
                                        </span>
                                        {entry && entry.grams != null && (
                                          <span className="ml-2 text-slate-400 text-xs align-middle">
                                            {formatOne(entry.grams)} g
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-slate-400 text-xs">
                                        <span className="text-emerald-400">
                                          {formatOne(entry.calories)} kcal
                                        </span>
                                        {' - '}
                                        <span className="text-red-400">
                                          {formatOne(entry.protein)} p
                                        </span>
                                        {' - '}
                                        <span className="text-yellow-400">
                                          {formatOne(entry.fats)} f
                                        </span>
                                        {' - '}
                                        <span className="text-amber-400">
                                          {formatOne(entry.carbs)} c
                                        </span>
                                      </p>
                                    </div>
                                    <div className="flex items-end gap-3">
                                      <button
                                        onClick={() =>
                                          handleEditFood(mealTypeId, entry.id)
                                        }
                                        type="button"
                                        className="text-slate-200 hover:text-white transition-all hover:scale-110 active:scale-95"
                                      >
                                        <Edit3 size={22} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDeleteFood(mealTypeId, entry.id)
                                        }
                                        type="button"
                                        className="text-red-400 hover:text-red-300 transition-all hover:scale-110 active:scale-95"
                                      >
                                        <Trash2 size={22} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Add to This Meal Button */}
                              <button
                                onClick={() =>
                                  handleAddFoodToMealClick(mealTypeId)
                                }
                                type="button"
                                className="w-full py-1 border-2 border-slate-600/50 hover:border-blue-500 rounded-lg text-slate-400 hover:text-blue-400 transition-all flex items-center justify-center gap-2 mt-3"
                              >
                                <Plus size={16} />
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key={`food-empty-${selectedDate}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <motion.button
                  onClick={() => onAddMealEntry?.('')}
                  type="button"
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 rounded-xl transition-all group"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="flex items-center gap-3">
                    <Utensils className="text-blue-400" size={24} />
                    <div className="text-left">
                      <h2 className="text-lg font-bold text-white">
                        Add Food Entry
                      </h2>
                      <p className="text-slate-400 text-sm">
                        Track your meals and nutrition
                      </p>
                    </div>
                  </div>
                  <Plus
                    className="text-slate-400 group-hover:text-blue-400 transition-colors"
                    size={24}
                  />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};
