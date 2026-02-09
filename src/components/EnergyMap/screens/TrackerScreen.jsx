import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  Plus,
  Utensils,
  Flame,
  AlertTriangle,
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
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { ConfirmActionModal } from '../modals/ConfirmActionModal';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';

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
        className="text-border"
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

// Shorten a long name for UI while keeping full name available via title
const shortenName = (name, maxLength = 36) => {
  if (typeof name !== 'string') return name ?? '';
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength - 1) + '…';
};

const parseDateKey = (dateStr) => new Date(`${dateStr}T00:00:00Z`);

const toDateKey = (date) => date.toISOString().split('T')[0];

const getIsoWeekYear = (date) => {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  return d.getUTCFullYear();
};

const getIsoWeekNumber = (date) => {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getUTCDay() + 6) % 7)) /
        7
    )
  );
};

const getWeekStartDate = (dateStr) => {
  const date = parseDateKey(dateStr);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return date;
};

export const TrackerScreen = ({
  nutritionData,
  onAddMealEntry,
  onAddFoodToMeal,
  onEditFoodEntry,
  onDeleteFoodEntry,
  onDeleteMeal,
  targetProtein,
  targetFats,
  stepRanges,
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
  const store = useEnergyMapStore(
    (state) => ({
      nutritionData: state.nutritionData ?? {},
      stepRanges: state.userData.stepRanges ?? [],
      weight: state.userData.weight,
      calculateTargetForGoal: state.calculateTargetForGoal,
    }),
    shallow
  );

  const resolvedNutritionData = nutritionData ?? store.nutritionData;
  const resolvedStepRanges = stepRanges ?? store.stepRanges;
  const resolvedTargetProtein =
    targetProtein ?? Math.round((Number(store.weight) || 0) * 2);
  const resolvedTargetFats =
    targetFats ?? Math.round((Number(store.weight) || 0) * 0.8);
  const resolvedCalculateTargetForGoal = store.calculateTargetForGoal;
  const resolvedGetRangeDetails = useMemo(
    () =>
      getRangeDetails ??
      ((steps) =>
        resolvedCalculateTargetForGoal?.(
          steps,
          selectedDay === 'training',
          selectedGoal
        )),
    [getRangeDetails, selectedDay, selectedGoal, resolvedCalculateTargetForGoal]
  );
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
  const [weekSlideDirection, setWeekSlideDirection] = useState(1);

  // Confirm modals for delete actions
  const deleteFoodConfirmModal = useAnimatedModal();
  const deleteMealConfirmModal = useAnimatedModal();
  const [pendingFoodDelete, setPendingFoodDelete] = useState(null);
  const [pendingMealDelete, setPendingMealDelete] = useState(null);
  const previousDateRef = useRef(selectedDate);
  const todayKey = getTodayDate();
  const weekStartKey = useMemo(() => {
    const start = getWeekStartDate(selectedDate);
    return toDateKey(start);
  }, [selectedDate]);
  const weekDates = useMemo(() => {
    const start = getWeekStartDate(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return {
        key: toDateKey(date),
        day: date.getUTCDate(),
        weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      };
    });
  }, [selectedDate]);
  const selectedMonthLabel = useMemo(() => {
    const date = parseDateKey(selectedDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }, [selectedDate]);
  const selectedWeekLabel = useMemo(() => {
    const date = parseDateKey(selectedDate);
    const weekNumber = getIsoWeekNumber(date);
    const weekYear = getIsoWeekYear(date);
    return `Week ${weekNumber}${weekYear !== date.getUTCFullYear() ? ` • ${weekYear}` : ''}`;
  }, [selectedDate]);

  // Calculate ranges based on bodyweight (matching InsightsScreen)
  // targetProtein is passed as weight * 2, so range is weight * 2.0 to weight * 2.4
  // targetFats is passed as weight * 0.8, so range is weight * 0.8 to weight * 1.0
  const proteinMin = Math.round(resolvedTargetProtein); // 2.0g per kg (already calculated)
  const proteinMax = Math.round(resolvedTargetProtein * 1.2); // 2.4g per kg (2 * 1.2 = 2.4)
  const fatsMin = Math.round(resolvedTargetFats); // 0.8g per kg (already calculated)
  const fatsMax = Math.round(resolvedTargetFats * 1.25); // 1.0g per kg (0.8 * 1.25 = 1.0)

  // Get data for selected date - now nested by meal type
  const dayData = useMemo(() => {
    const data = resolvedNutritionData[selectedDate] || {};
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
  }, [resolvedNutritionData, selectedDate]);

  const { meals, hasEntries: hasFoodEntries } = dayData;

  // (countEntriesForDate inlined inside effect below to avoid hook dependency issues)
  const [skipMealAnimation, setSkipMealAnimation] = useState(false);
  const [allowInitialAnimation, setAllowInitialAnimation] = useState(false);

  useEffect(() => {
    if (previousDateRef.current === selectedDate) {
      return;
    }

    // Determine if previous and current dates both have zero entries and update flag
    const prevData = resolvedNutritionData[previousDateRef.current] || {};
    const currData = resolvedNutritionData[selectedDate] || {};
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
  }, [resolvedNutritionData, selectedDate, skipMealAnimation]);

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

  // Clean up pending deletion state when modals close
  useEffect(() => {
    if (deleteFoodConfirmModal.isClosing) {
      const timer = setTimeout(() => setPendingFoodDelete(null), 200);
      return () => clearTimeout(timer);
    }
  }, [deleteFoodConfirmModal.isClosing]);

  useEffect(() => {
    if (deleteMealConfirmModal.isClosing) {
      const timer = setTimeout(() => setPendingMealDelete(null), 200);
      return () => clearTimeout(timer);
    }
  }, [deleteMealConfirmModal.isClosing]);

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
    Math.round((totals.protein / resolvedTargetProtein) * 100)
  );
  const fatsPercent = Math.min(
    100,
    Math.round((totals.fats / resolvedTargetFats) * 100)
  );

  // Check if within range
  const proteinInRange =
    totals.protein >= proteinMin && totals.protein <= proteinMax;
  const fatsInRange = totals.fats >= fatsMin && totals.fats <= fatsMax;
  const proteinOver = totals.protein > proteinMax;
  const fatsOver = totals.fats > fatsMax;

  // Get calorie target from selected step range
  const calorieTargetData = useMemo(() => {
    if (!resolvedGetRangeDetails || !selectedStepRange) return null;
    return resolvedGetRangeDetails(selectedStepRange);
  }, [resolvedGetRangeDetails, selectedStepRange]);

  const targetCalories = calorieTargetData?.targetCalories || 2500;
  const caloriesRemaining = targetCalories - totals.calories;
  const caloriesPercent = Math.min(
    100,
    Math.round((totals.calories / targetCalories) * 100)
  );

  // Calculate target carbs from remaining calories after protein and fats
  // Protein: 4 cal/g, Fats: 9 cal/g, Carbs: 4 cal/g
  const proteinCalories = resolvedTargetProtein * 4;
  const fatsCalories = resolvedTargetFats * 9;
  const remainingCaloriesForCarbs =
    targetCalories - proteinCalories - fatsCalories;
  const targetCarbs = Math.max(0, Math.round(remainingCaloriesForCarbs / 4));
  const carbsPercent =
    targetCarbs > 0
      ? Math.min(100, Math.round((totals.carbs / targetCarbs) * 100))
      : 0;
  const carbsOver = targetCarbs > 0 && totals.carbs > targetCarbs;

  const handleEditFood = (mealType, entryId) => {
    onEditFoodEntry?.(mealType, entryId);
  };

  const handleDeleteFood = (mealType, entryId) => {
    setPendingFoodDelete({ mealType, entryId });
    deleteFoodConfirmModal.open();
  };

  const confirmDeleteFood = () => {
    if (pendingFoodDelete) {
      onDeleteFoodEntry?.(
        selectedDate,
        pendingFoodDelete.mealType,
        pendingFoodDelete.entryId
      );
    }
    deleteFoodConfirmModal.requestClose();
  };

  const cancelDeleteFood = () => {
    deleteFoodConfirmModal.requestClose();
  };

  const handleDeleteMeal = (mealType) => {
    setPendingMealDelete(mealType);
    deleteMealConfirmModal.open();
  };

  const confirmDeleteMeal = () => {
    if (pendingMealDelete) {
      onDeleteMeal?.(selectedDate, pendingMealDelete);
    }
    deleteMealConfirmModal.requestClose();
  };

  const cancelDeleteMeal = () => {
    deleteMealConfirmModal.requestClose();
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
      // If opening this meal, close all others
      if (current) {
        const newState = {};
        MEAL_TYPE_ORDER.forEach((id) => {
          newState[id] = id === mealType ? false : true;
        });
        return newState;
      }
      // If closing, just close this one
      return {
        ...prev,
        [mealType]: true,
      };
    });
  };

  const changeDateBy = (offset) => {
    const base = selectedDate || getTodayDate();
    const date = new Date(base + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    const iso = date.toISOString().split('T')[0];
    setWeekSlideDirection(offset >= 0 ? 1 : -1);
    if (typeof onSelectedDateChange === 'function') {
      onSelectedDateChange(iso);
    } else {
      setInternalSelectedDate(iso);
    }
  };

  const hasEntriesForDate = (dateKey) => {
    const data = resolvedNutritionData[dateKey];
    if (!data) return false;
    return MEAL_TYPE_ORDER.some((mealTypeId) => {
      const entries = Array.isArray(data[mealTypeId]) ? data[mealTypeId] : [];
      return entries.length > 0;
    });
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="text-accent-blue" size={32} />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Calorie Tracker
            </h1>
          </div>
          <button
            onClick={() => calendarModal?.open()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold transition-all active:scale-95 flex items-center gap-2 press-feedback focus-ring md:hover:bg-blue-500"
          >
            <CalendarCog size={20} />
            <span className="hidden md:inline">Calendar</span>
          </button>
        </div>
        <div className="p-0">
          <div className="flex items-center justify-between mt-5 mb-3 border border-border/50 rounded-md px-1 py-1.5 bg-surface-highlight/50 shadow-sm shadow-slate-900/20">
            <div className="flex items-center gap-1.5 h-6">
              <button
                onClick={() => changeDateBy(-7)}
                type="button"
                className="rounded transition-colors flex items-center"
                title="Previous week"
              >
                <div>
                  <ChevronLeft className="text-muted" size={20} />
                </div>
              </button>
              <div className="flex items-center gap-1 text-slate-200 text-[15px] font-semibold leading-none">
                <Calendar size={16} className="text-accent-blue" />
                <div className="relative h-4 flex items-center">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={`month-${selectedMonthLabel}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22 }}
                      className="text-foreground text-[15px] font-semibold block leading-none"
                    >
                      {selectedMonthLabel}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 h-6">
              <div className="relative h-4 flex items-center">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={`week-${selectedWeekLabel}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-foreground text-[15px] font-semibold block leading-none"
                  >
                    {selectedWeekLabel}
                  </motion.span>
                </AnimatePresence>
              </div>
              <button
                onClick={() => changeDateBy(7)}
                type="button"
                className="rounded transition-colors flex items-center"
                title="Next week"
              >
                <div>
                  <ChevronRight className="text-muted" size={20} />
                </div>
              </button>
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={weekStartKey}
              initial={{ opacity: 0, x: 18 * weekSlideDirection }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 * weekSlideDirection }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="grid grid-cols-7 gap-1"
            >
              {weekDates.map((weekDate) => {
                const isSelected = weekDate.key === selectedDate;
                const isToday = weekDate.key === todayKey;
                const hasEntries = hasEntriesForDate(weekDate.key);
                return (
                  <button
                    key={`week-${weekDate.key}`}
                    type="button"
                    onClick={() => {
                      if (typeof onSelectedDateChange === 'function') {
                        onSelectedDateChange(weekDate.key);
                      } else {
                        setInternalSelectedDate(weekDate.key);
                      }
                    }}
                    className={`relative flex flex-col items-center justify-center rounded-md border py-2 text-[15px] font-semibold transition-all active:scale-95 focus-ring shadow-sm shadow-slate-900/20 ${
                      isSelected
                        ? 'bg-blue-600 border-blue-400 text-white'
                        : 'bg-surface-highlight/60 border-border/50 text-foreground md:hover:bg-surface-highlight/70'
                    } ${isToday && !isSelected ? 'ring-1 ring-accent-blue/70' : ''}`}
                  >
                    <span className="text-[10px]">{weekDate.weekday}</span>
                    <span className="text-[13px] font-semibold">
                      {weekDate.day}
                    </span>
                    <span
                      className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                        hasEntries ? 'bg-emerald-400' : 'bg-transparent'
                      }`}
                    />
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Total Calories */}
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="text-accent-blue" size={20} />
            <span className="text-foreground text-lg font-bold tracking-wide">
              Total Calories
            </span>
          </div>
          <div className="h-8">
            <AnimatePresence mode="wait">
              <motion.p
                key={`totals-cal-${totals.calories}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`
                    ${caloriesRemaining < 0 ? 'text-accent-red' : 'text-accent-emerald'}
                    font-bold text-2xl
                  `}
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
            className="w-full bg-surface-highlight/50 border border-border/50 rounded-lg px-3 py-2 text-left flex items-center justify-between md:hover:bg-surface-highlight transition-all shadow-sm shadow-slate-900/20 pressable-card focus-ring"
          >
            <div className="flex-1">
              <p className="text-muted text-xs mb-0.5">Target</p>
              {/* Animate only the text when the selection/target changes */}
              <div className="relative h-6">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`target-${targetCalories}-${selectedStepRange}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-foreground text-sm font-semibold absolute left-0"
                  >
                    {formatOne(targetCalories)} kcal
                    <span className="text-muted font-normal ml-2">
                      ({selectedStepRange} steps)
                    </span>
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            <ChevronDown
              size={22}
              className={`text-foreground transition-transform duration-300 ${
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
                className="absolute z-10 w-full mt-2 bg-surface border border-border/50 rounded-lg shadow-2xl max-h-64 overflow-y-auto"
                style={{ transformOrigin: 'top center' }}
              >
                {resolvedStepRanges.map((range) => {
                  const rangeData = resolvedGetRangeDetails?.(range);
                  const isSelected = range === selectedStepRange;
                  return (
                    <button
                      key={`range-${range}`}
                      onClick={() => {
                        onStepRangeChange?.(range);
                      }}
                      className={`w-full px-4 py-3 text-left md:hover:bg-surface-highlight transition-all border-b border-border/50 last:border-b-0 pressable-card focus-ring ${
                        isSelected ? 'bg-surface-highlight/60' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-foreground font-semibold text-sm">
                            {range} steps
                          </p>
                          <p className="text-muted text-xs">
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
                          className={`font-bold ${isSelected ? 'text-accent-emerald' : 'text-muted'}`}
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
          <div className="w-full bg-surface-highlight rounded-full h-3 overflow-hidden">
            <div
              className={`h-full ${
                caloriesPercent >= 100 ? 'bg-red-500' : 'bg-accent-emerald'
              }`}
              style={{
                width: `${caloriesPercent}%`,
                transition: 'width 220ms ease',
              }}
            />
          </div>
          <div className="text-muted text-xs mt-1">
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
                    <span className="text-accent-emerald font-semibold">
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
                color={proteinOver ? 'text-accent-red' : 'text-accent-red'}
                size={100}
                strokeWidth={8}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Beef className="text-accent-red mb-1" size={20} />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`protein-${totals.protein}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-foreground/80 font-bold text-lg"
                  >
                    {formatOne(totals.protein)}
                  </motion.p>
                </AnimatePresence>
                {proteinOver ? (
                  <AlertTriangle className="mt-1 text-accent-red" size={12} />
                ) : proteinInRange ? (
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent-emerald" />
                ) : null}
              </div>
            </div>
            <p className="text-muted text-xs font-semibold mt-2">Protein</p>
            <p className="text-muted text-xs">
              <span>
                {formatOne(proteinMin)}-{formatOne(proteinMax)}g
              </span>
            </p>
          </div>

          {/* Fats */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <CircularProgress
                percent={fatsPercent}
                color={fatsOver ? 'text-accent-red' : 'text-accent-yellow'}
                size={100}
                strokeWidth={8}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Droplet className="text-accent-yellow mb-1" size={20} />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`fats-${totals.fats}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-foreground/80 font-bold text-lg"
                  >
                    {formatOne(totals.fats)}
                  </motion.p>
                </AnimatePresence>
                {fatsOver ? (
                  <AlertTriangle className="mt-1 text-accent-red" size={12} />
                ) : fatsInRange ? (
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent-emerald" />
                ) : null}
              </div>
            </div>
            <p className="text-muted text-xs font-semibold mt-2">Fats</p>
            <p className="text-muted text-xs">
              <span>
                {formatOne(fatsMin)}-{formatOne(fatsMax)}g
              </span>
            </p>
          </div>

          {/* Carbs */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <CircularProgress
                percent={carbsPercent}
                color={carbsOver ? 'text-accent-red' : 'text-accent-amber'}
                size={100}
                strokeWidth={8}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Cookie className="text-accent-amber mb-1" size={20} />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`carbs-${totals.carbs}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="text-foreground/80 font-bold text-lg"
                  >
                    {formatOne(totals.carbs)}
                  </motion.p>
                </AnimatePresence>
                {carbsOver ? (
                  <AlertTriangle className="mt-1 text-accent-red" size={12} />
                ) : null}
              </div>
            </div>
            <p className="text-muted text-xs font-semibold mt-2">Carbs</p>
            <p className="text-muted text-xs">
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
        <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
          {hasFoodEntries ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Utensils className="text-accent-blue" size={24} />
                  <h2 className="text-xl font-bold text-foreground">Meals</h2>
                </div>
                <button
                  onClick={() => onAddMealEntry?.('')}
                  type="button"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all press-feedback focus-ring md:hover:bg-blue-500"
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
                      className="bg-surface-highlight/50 rounded-xl p-2 border border-border/50 shadow-md shadow-slate-900/20"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleMealCollapse(mealTypeId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleMealCollapse(mealTypeId);
                          }
                        }}
                        className="w-full flex items-center justify-between p-2 rounded-lg transition-all pressable-card focus-ring"
                      >
                        <div className="flex items-center gap-3">
                          {React.createElement(mealType.icon, {
                            className: 'text-foreground/80',
                            size: 20,
                          })}
                          <div className="text-left">
                            <h3 className="text-foreground/80 font-bold text-base">
                              {mealType.label}
                            </h3>
                            <p className="text-muted text-xs">
                              <span>
                                {`${mealEntries.length} item${mealEntries.length !== 1 ? 's' : ''} - `}
                              </span>
                              <span className="text-accent-emerald">
                                {formatOne(mealTotals.calories)} kcal
                              </span>
                              <span>{` - ${mealTime}`}</span>
                            </p>
                            <p className="text-muted text-xs mt-0.5">
                              <span className="text-accent-red">
                                {formatOne(mealTotals.protein)}p
                              </span>
                              <span className="mx-1">•</span>
                              <span className="text-accent-yellow">
                                {formatOne(mealTotals.fats)}f
                              </span>
                              <span className="mx-1">•</span>
                              <span className="text-accent-amber">
                                {formatOne(mealTotals.carbs)}c
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMeal(mealTypeId);
                            }}
                            className="p-1.5 rounded-lg transition-all pressable-inline focus-ring md:hover:bg-red-500/20"
                            title="Delete meal"
                          >
                            <Trash2 className="text-accent-red" size={22} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddFoodToMealClick(mealTypeId);
                            }}
                            className="p-1.5 rounded-lg transition-all pressable-inline focus-ring md:hover:bg-blue-500/20"
                            title="Add food"
                          >
                            <Plus className="text-foreground/80" size={22} />
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-center pb-1">
                        <span className="h-1 w-10 rounded-full bg-border/70" />
                      </div>

                      {!isCollapsed && (
                        <div className="space-y-2 mt-2 overflow-hidden">
                          <div className="space-y-2">
                            {mealEntries.map((entry, idx) => (
                              <div
                                key={`entry-${entry.id}-${idx}`}
                                className="bg-surface-highlight rounded-lg p-3 border border-border/50 flex justify-between items-start gap-3 shadow-lg shadow-slate-900/20"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-foreground/80 font-semibold text-sm truncate">
                                    <span
                                      className="align-middle"
                                      title={entry.name}
                                    >
                                      {shortenName(entry.name)}
                                    </span>
                                    {entry && entry.grams != null && (
                                      <span className="ml-2 text-foreground/80 text-xs align-middle">
                                        {formatOne(entry.grams)} g
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-foreground/80 text-xs">
                                    <span className="text-accent-emerald">
                                      {formatOne(entry.calories)} kcal
                                    </span>
                                    {' - '}
                                    <span className="text-accent-red">
                                      {formatOne(entry.protein)} p
                                    </span>
                                    {' - '}
                                    <span className="text-accent-yellow">
                                      {formatOne(entry.fats)} f
                                    </span>
                                    {' - '}
                                    <span className="text-accent-amber">
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
                                    className="text-foreground/80 transition-all active:scale-95 pressable-inline focus-ring md:hover:text-foreground md:hover:scale-110"
                                  >
                                    <Edit3 size={22} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteFood(mealTypeId, entry.id)
                                    }
                                    type="button"
                                    className="text-accent-red transition-all active:scale-95 pressable-inline focus-ring md:hover:text-accent-red/80 md:hover:scale-110"
                                  >
                                    <Trash2 size={22} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
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
                className="w-full flex items-center justify-between p-4 rounded-xl transition-all group pressable-card focus-ring md:hover:bg-surface-highlight/50"
              >
                <div className="flex items-center gap-3">
                  <Utensils className="text-accent-blue" size={24} />
                  <div className="text-left">
                    <h2 className="text-lg font-bold text-foreground">
                      Add Food Entry
                    </h2>
                    <p className="text-muted text-sm">
                      Track your meals and nutrition
                    </p>
                  </div>
                </div>
                <Plus
                  className="text-muted md:group-hover:text-accent-blue transition-colors"
                  size={24}
                />
              </button>
            </div>
          )}
        </div>
      ) : (
        <motion.div
          className="bg-surface rounded-2xl p-6 border border-border shadow-2xl"
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
                    <Utensils className="text-accent-blue" size={24} />
                    <h2 className="text-xl font-bold text-foreground">Meals</h2>
                  </div>
                  <motion.button
                    onClick={() => onAddMealEntry?.('')}
                    type="button"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all press-feedback focus-ring md:hover:bg-blue-500"
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
                        className="bg-surface-highlight/50 rounded-xl p-2 border border-border/50 shadow-lg shadow-slate-900/20"
                      >
                        {/* Meal Header */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleMealCollapse(mealTypeId)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleMealCollapse(mealTypeId);
                            }
                          }}
                          className="w-full flex items-center justify-between p-2 rounded-lg transition-all pressable-card focus-ring"
                        >
                          <div className="flex items-center gap-3">
                            {React.createElement(mealType.icon, {
                              className: 'text-foreground/80',
                              size: 20,
                            })}
                            <div className="text-left">
                              <h3 className="text-foreground/80 font-bold text-base">
                                {mealType.label}
                              </h3>
                              <p className="text-muted text-xs">
                                <span>
                                  {`${mealEntries.length} item${mealEntries.length !== 1 ? 's' : ''} - `}
                                </span>
                                <span className="text-accent-emerald">
                                  {formatOne(mealTotals.calories)} kcal
                                </span>
                                <span>{` - ${mealTime}`}</span>
                              </p>
                              <p className="text-muted text-xs mt-0.5">
                                <span className="text-accent-red">
                                  {formatOne(mealTotals.protein)}p
                                </span>
                                <span className="mx-1">•</span>
                                <span className="text-accent-yellow">
                                  {formatOne(mealTotals.fats)}f
                                </span>
                                <span className="mx-1">•</span>
                                <span className="text-accent-amber">
                                  {formatOne(mealTotals.carbs)}c
                                </span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddFoodToMealClick(mealTypeId);
                              }}
                              className="p-1.5 rounded-lg transition-all pressable-inline focus-ring md:hover:bg-blue-500/20"
                              title="Add food"
                            >
                              <Plus className="text-foreground/80" size={22} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMeal(mealTypeId);
                              }}
                              className="p-1.5 rounded-lg transition-all pressable-inline focus-ring md:hover:bg-red-500/20"
                              title="Delete meal"
                            >
                              <Trash2 className="text-accent-red" size={22} />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <span className="h-1 w-20 rounded-full bg-border/70" />
                        </div>

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
                                    className="bg-surface-highlight/50 rounded-lg p-3 border border-border/50 flex justify-between items-start gap-3 shadow-lg shadow-slate-900/20"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-foreground/80 font-semibold text-sm truncate">
                                        <span
                                          className="align-middle"
                                          title={entry.name}
                                        >
                                          {shortenName(entry.name)}
                                        </span>
                                        {entry && entry.grams != null && (
                                          <span className="ml-2 text-muted text-xs align-middle">
                                            {formatOne(entry.grams)} g
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-muted text-xs">
                                        <span className="text-accent-emerald">
                                          {formatOne(entry.calories)} kcal
                                        </span>
                                        {' - '}
                                        <span className="text-accent-red">
                                          {formatOne(entry.protein)} p
                                        </span>
                                        {' - '}
                                        <span className="text-accent-yellow">
                                          {formatOne(entry.fats)} f
                                        </span>
                                        {' - '}
                                        <span className="text-accent-amber">
                                          {formatOne(entry.carbs)} c
                                        </span>
                                      </p>
                                    </div>
                                    <div className="flex items-end gap-6">
                                      <button
                                        onClick={() =>
                                          handleEditFood(mealTypeId, entry.id)
                                        }
                                        type="button"
                                        className="text-foreground/80 transition-all active:scale-95 pressable-inline focus-ring md:hover:text-foreground md:hover:scale-110"
                                      >
                                        <Edit3 size={22} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDeleteFood(mealTypeId, entry.id)
                                        }
                                        type="button"
                                        className="text-accent-red transition-all active:scale-95 pressable-inline focus-ring md:hover:text-accent-red md:hover:scale-110"
                                      >
                                        <Trash2 size={22} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
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
                  className="w-full flex items-center justify-between p-4 rounded-xl transition-all group pressable-card focus-ring md:hover:bg-surface-highlight/50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="flex items-center gap-3">
                    <Utensils className="text-accent-blue" size={24} />
                    <div className="text-left">
                      <h2 className="text-lg font-bold text-foreground">
                        Add Food Entry
                      </h2>
                      <p className="text-muted text-sm">
                        Track your meals and nutrition
                      </p>
                    </div>
                  </div>
                  <Plus
                    className="text-muted md:group-hover:text-blue-400 transition-colors"
                    size={24}
                  />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Confirm Delete Food Modal */}
      <ConfirmActionModal
        isOpen={deleteFoodConfirmModal.isOpen}
        isClosing={deleteFoodConfirmModal.isClosing}
        title="Delete Food Entry"
        description="Are you sure you want to delete this food entry? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={confirmDeleteFood}
        onCancel={cancelDeleteFood}
      />

      {/* Confirm Delete Meal Modal */}
      <ConfirmActionModal
        isOpen={deleteMealConfirmModal.isOpen}
        isClosing={deleteMealConfirmModal.isClosing}
        title="Delete Entire Meal"
        description={
          pendingMealDelete
            ? `Are you sure you want to delete all ${getMealTypeById(pendingMealDelete).label} entries? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={confirmDeleteMeal}
        onCancel={cancelDeleteMeal}
      />
    </div>
  );
};
