import React, { useState, useMemo } from 'react';
import {
  Bookmark,
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
} from 'lucide-react';

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
  onAddFoodEntry,
  onUpdateFoodEntry,
  onDeleteFoodEntry,
  targetProtein = 150,
  targetFats = 70,
  stepRanges = [],
  selectedGoal = 'maintenance',
  selectedDay = 'training',
  getRangeDetails,
  calendarModal,
  selectedDate: selectedDateProp,
}) => {
  const selectedDate = selectedDateProp || getTodayDate();
  const [isAddingFood, setIsAddingFood] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [selectedStepRange, setSelectedStepRange] = useState('12k');
  const [showCalorieTargetPicker, setShowCalorieTargetPicker] = useState(false);

  // Form state
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');

  // Calculate ranges based on bodyweight (matching InsightsScreen)
  // targetProtein is passed as weight * 2, so range is weight * 2.0 to weight * 2.4
  // targetFats is passed as weight * 0.8, so range is weight * 0.8 to weight * 1.0
  const proteinMin = Math.round(targetProtein); // 2.0g per kg (already calculated)
  const proteinMax = Math.round(targetProtein * 1.2); // 2.4g per kg (2 * 1.2 = 2.4)
  const fatsMin = Math.round(targetFats); // 0.8g per kg (already calculated)
  const fatsMax = Math.round(targetFats * 1.25); // 1.0g per kg (0.8 * 1.25 = 1.0)

  // Get entries for selected date
  const dayEntries = useMemo(() => {
    const entries = nutritionData[selectedDate] || [];
    return Array.isArray(entries) ? entries : [];
  }, [nutritionData, selectedDate]);

  // Calculate totals
  const totals = useMemo(() => {
    return dayEntries.reduce(
      (acc, entry) => ({
        calories: acc.calories + (entry.calories || 0),
        protein: acc.protein + (entry.protein || 0),
        carbs: acc.carbs + (entry.carbs || 0),
        fats: acc.fats + (entry.fats || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [dayEntries]);

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

  const resetForm = () => {
    setFoodName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFats('');
    setEditingEntry(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAddingFood(true);
  };

  const handleStartEdit = (entry) => {
    setFoodName(entry.name);
    setCalories(String(entry.calories || ''));
    setProtein(String(entry.protein || ''));
    setCarbs(String(entry.carbs || ''));
    setFats(String(entry.fats || ''));
    setEditingEntry(entry);
    setIsAddingFood(true);
  };

  const handleCancel = () => {
    setIsAddingFood(false);
    resetForm();
  };

  const handleSave = () => {
    if (!foodName.trim()) {
      window.alert('Please enter a food name');
      return;
    }

    const entry = {
      id: editingEntry?.id || Date.now(),
      name: foodName.trim(),
      calories: parseFloat(calories) || 0,
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fats: parseFloat(fats) || 0,
      timestamp: editingEntry?.timestamp || new Date().toISOString(),
    };

    if (editingEntry) {
      onUpdateFoodEntry?.(selectedDate, entry);
    } else {
      onAddFoodEntry?.(selectedDate, entry);
    }

    setIsAddingFood(false);
    resetForm();
  };

  const handleDelete = (entryId) => {
    if (window.confirm('Delete this food entry?')) {
      onDeleteFoodEntry?.(selectedDate, entryId);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header - Weekly Snapshot */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="text-blue-400" size={32} />
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Weekly Snapshot
            </h1>
          </div>
          <button
            onClick={() => calendarModal?.open()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            <Calendar size={20} />
            <span className="hidden md:inline">Calendar</span>
          </button>
        </div>

        {/* Date Display - Read Only */}
        <div className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white">
          {formatDate(selectedDate)}
        </div>
      </div>

      {/* Daily Summary */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
          <Bookmark className="text-blue-400" size={20} />
          Daily Summary - {formatDate(selectedDate)}
        </h2>
        {/* Total Calories */}
        <div className="bg-slate-700 rounded-lg p-4 border border-slate-600 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="text-blue-400" size={20} />
              <span className="text-slate-300 text-sm font-semibold">
                Total Calories
              </span>
            </div>
            <p className="text-white font-bold text-2xl">{totals.calories}</p>
          </div>

          {/* Calorie Target Selector */}
          <div className="relative">
            <button
              onClick={() =>
                setShowCalorieTargetPicker(!showCalorieTargetPicker)
              }
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
                        setSelectedStepRange(range);
                        setShowCalorieTargetPicker(false);
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
          <div className="mt-3">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
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
        </div>

        {/* Macros - Circular Progress */}
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

      {/* Add/Edit Food Form */}
      {isAddingFood && (
        <div className="bg-slate-800 rounded-2xl p-6 border border-emerald-500 shadow-2xl">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <Utensils className="text-emerald-400" size={20} />
            {editingEntry ? 'Edit Food Entry' : 'Add Food Entry'}
          </h3>

          <div className="space-y-4">
            {/* Food Name */}
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">
                Food Name
              </label>
              <input
                type="text"
                value={foodName}
                onChange={(e) => setFoodName(e.target.value)}
                placeholder="e.g., Chicken Breast"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Calories */}
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">
                Calories
              </label>
              <input
                type="number"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Macros Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-2">
                  Protein (g)
                </label>
                <input
                  type="number"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-2">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-2">
                  Fats (g)
                </label>
                <input
                  type="number"
                  value={fats}
                  onChange={(e) => setFats(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-all"
              >
                {editingEntry ? 'Save Changes' : 'Add Food'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Food Entries List */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <Utensils className="text-blue-400" size={20} />
            Food Entries ({dayEntries.length})
          </h3>
          <button
            onClick={handleStartAdd}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            <Plus size={18} />
            <span className="hidden md:inline">Add Meal</span>
          </button>
        </div>

        {dayEntries.length === 0 ? (
          <div className="text-center py-8">
            <Utensils className="mx-auto text-slate-600 mb-3" size={48} />
            <p className="text-slate-400 text-sm">
              No food entries for this day yet
            </p>
            <button
              onClick={handleStartAdd}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-all active:scale-95 inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Add First Entry
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="text-white font-semibold text-base">
                      {entry.name}
                    </h4>
                    <p className="text-slate-400 text-xs mt-1">
                      {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEdit(entry)}
                      className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all active:scale-95"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all active:scale-95"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-orange-400 font-bold text-lg">
                      {entry.calories}
                    </p>
                    <p className="text-slate-400 text-xs">cal</p>
                  </div>
                  <div>
                    <p className="text-red-400 font-bold text-lg">
                      {entry.protein}
                    </p>
                    <p className="text-slate-400 text-xs">protein</p>
                  </div>
                  <div>
                    <p className="text-amber-400 font-bold text-lg">
                      {entry.carbs}
                    </p>
                    <p className="text-slate-400 text-xs">carbs</p>
                  </div>
                  <div>
                    <p className="text-yellow-400 font-bold text-lg">
                      {entry.fats}
                    </p>
                    <p className="text-slate-400 text-xs">fats</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
