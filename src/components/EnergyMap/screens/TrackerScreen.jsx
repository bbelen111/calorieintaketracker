import React, { useMemo, useState } from 'react';
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
  Edit2,
  ChevronDown,
  Calendar,
  CalendarCog,
  ChevronUp,
} from 'lucide-react';
import { MEAL_TYPE_ORDER, getMealTypeById } from '../../../constants/mealTypes';

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
  selectedStepRange,
  onStepRangeChange,
  showCalorieTargetPicker,
  onToggleCalorieTargetPicker,
  isSwiping,
}) => {
  const selectedDate = selectedDateProp || getTodayDate();
  const [collapsedMeals, setCollapsedMeals] = useState({});

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

  const toggleMealCollapse = (mealType) => {
    setCollapsedMeals((prev) => ({
      ...prev,
      [mealType]: !prev[mealType],
    }));
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
        <div className="bg-slate-700 rounded-lg px-4 py-2 border border-slate-600 flex items-center justify-between">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-blue-400" />
              <span className="text-white text-md font-semibold">
                {getWeekday(selectedDate)}
              </span>
            </div>
            <span className="text-white text-md font-semibold">
              {getMonthDayYear(selectedDate)}
            </span>
          </div>
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
          <p className="text-emerald-400 font-bold text-2xl">
            {totals.calories}
          </p>
        </div>

        {/* Calorie Target Selector */}
        <div className="relative">
          <button
            onClick={() => onToggleCalorieTargetPicker?.()}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-left flex items-center justify-between hover:bg-slate-750 transition-all"
          >
            <div className="flex-1">
              <p className="text-slate-400 text-xs mb-0.5">Target</p>
              <p className="text-white text-sm font-semibold">
                {targetCalories} cal
                <span className="text-slate-400 font-normal ml-2">
                  ({selectedStepRange} steps)
                </span>
              </p>
            </div>
            <ChevronDown
              size={18}
              className={`text-white transition-transform duration-300 ${
                showCalorieTargetPicker ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Dropdown */}
          {showCalorieTargetPicker && (
            <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
              {stepRanges.map((range) => {
                const rangeData = getRangeDetails?.(range);
                const isSelected = range === selectedStepRange;
                return (
                  <button
                    key={range}
                    onClick={() => {
                      onStepRangeChange?.(range);
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-700 transition-all border-b border-slate-700 last:border-b-0 ${
                      isSelected ? 'bg-slate-700' : ''
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
                          • {selectedDay === 'training' ? 'Training' : 'Rest'}{' '}
                          day
                        </p>
                      </div>
                      <p
                        className={`font-bold ${isSelected ? 'text-emerald-400' : 'text-slate-300'}`}
                      >
                        {rangeData?.targetCalories || 0}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-4 mb-6">
          <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                caloriesPercent >= 100 ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${caloriesPercent}%` }}
            />
          </div>
          <p className="text-slate-400 text-xs mt-1">
            {caloriesRemaining >= 0 ? (
              <>
                <span className="text-emerald-400 font-semibold">
                  {caloriesRemaining}
                </span>{' '}
                remaining
              </>
            ) : (
              <>
                <span className="text-red-400 font-semibold">
                  {Math.abs(caloriesRemaining)}
                </span>{' '}
                over target
              </>
            )}
          </p>
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
                <p className="text-white font-bold text-lg">{totals.protein}</p>
              </div>
            </div>
            <p className="text-slate-300 text-xs font-semibold mt-2">Protein</p>
            <p className="text-slate-400 text-xs">
              {proteinInRange ? (
                <span className="text-emerald-400">
                  ✓ {proteinMin}-{proteinMax}g
                </span>
              ) : (
                <span>
                  {proteinMin}-{proteinMax}g
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
                <p className="text-white font-bold text-lg">{totals.fats}</p>
              </div>
            </div>
            <p className="text-slate-300 text-xs font-semibold mt-2">Fats</p>
            <p className="text-slate-400 text-xs">
              {fatsInRange ? (
                <span className="text-emerald-400">
                  ✓ {fatsMin}-{fatsMax}g
                </span>
              ) : (
                <span>
                  {fatsMin}-{fatsMax}g
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
                <p className="text-white font-bold text-lg">{totals.carbs}</p>
              </div>
            </div>
            <p className="text-slate-300 text-xs font-semibold mt-2">Carbs</p>
            <p className="text-slate-400 text-xs">
              {targetCarbs > 0 ? (
                <span>~{targetCarbs}g</span>
              ) : (
                <span>No room</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Food Entries Section - Grouped by Meal Type */}
      <motion.div
        className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl"
        layout={!isSwiping}
        initial={false}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {hasFoodEntries ? (
            <motion.div
              key="food-list"
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
                  <Utensils className="text-emerald-400" size={24} />
                  <h2 className="text-xl font-bold text-white">Meals</h2>
                </div>
                <motion.button
                  onClick={() => onAddMealEntry?.('')}
                  type="button"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
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
                  const isCollapsed = collapsedMeals[mealTypeId] || false;

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

                  return (
                    <div
                      key={mealTypeId}
                      className="bg-slate-700 rounded-xl p-4 border border-slate-600"
                    >
                      {/* Meal Header */}
                      <button
                        onClick={() => toggleMealCollapse(mealTypeId)}
                        className="w-full flex items-center justify-between hover:bg-slate-600/50 p-2 rounded-lg transition-all mb-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{mealType.icon}</span>
                          <div className="text-left">
                            <h3 className="text-white font-bold text-base">
                              {mealType.label}
                            </h3>
                            <p className="text-slate-400 text-xs">
                              {mealEntries.length} item
                              {mealEntries.length !== 1 ? 's' : ''} •{' '}
                              {mealTotals.calories} cal
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMeal(mealTypeId);
                            }}
                            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-all"
                            title="Delete meal"
                          >
                            <Trash2 className="text-red-400" size={18} />
                          </button>
                          {isCollapsed ? (
                            <ChevronDown className="text-slate-400" size={20} />
                          ) : (
                            <ChevronUp className="text-slate-400" size={20} />
                          )}
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
                              {mealEntries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className="bg-slate-800/50 rounded-lg p-3 border border-slate-600/50"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-white font-semibold text-sm truncate">
                                        {entry.name}
                                      </h4>
                                      <p className="text-slate-400 text-xs">
                                        {new Date(
                                          entry.timestamp
                                        ).toLocaleTimeString('en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        })}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3">
                                      <button
                                        onClick={() =>
                                          handleEditFood(mealTypeId, entry.id)
                                        }
                                        type="button"
                                        className="text-slate-300 hover:text-white transition-colors hover:scale-110 active:scale-95"
                                      >
                                        <Edit2 size={16} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDeleteFood(mealTypeId, entry.id)
                                        }
                                        type="button"
                                        className="text-red-400 hover:text-red-300 transition-colors hover:scale-110 active:scale-95"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-4 gap-2 text-center">
                                    <div>
                                      <p className="text-emerald-400 font-bold text-sm">
                                        {entry.calories}
                                      </p>
                                      <p className="text-slate-500 text-xs">
                                        cal
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-red-400 font-bold text-sm">
                                        {entry.protein}
                                      </p>
                                      <p className="text-slate-500 text-xs">
                                        pro
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-yellow-400 font-bold text-sm">
                                        {entry.fats}
                                      </p>
                                      <p className="text-slate-500 text-xs">
                                        fat
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-amber-400 font-bold text-sm">
                                        {entry.carbs}
                                      </p>
                                      <p className="text-slate-500 text-xs">
                                        carb
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Add to This Meal Button */}
                            <button
                              onClick={() => onAddMealEntry?.(mealTypeId)}
                              type="button"
                              className="w-full py-2 border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-lg text-slate-400 hover:text-emerald-400 transition-all flex items-center justify-center gap-2 mt-3"
                            >
                              <Plus size={16} />
                              <span className="text-sm font-semibold">
                                Add to {mealType.label}
                              </span>
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
              key="food-empty"
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
                  <Utensils className="text-emerald-400" size={24} />
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
                  className="text-slate-400 group-hover:text-emerald-400 transition-colors"
                  size={24}
                />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
