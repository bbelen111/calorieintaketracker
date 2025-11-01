import React, { useState, useMemo } from 'react';
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
}) => {
  const today = getTodayDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [isAddingFood, setIsAddingFood] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

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
      {/* Header */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="text-emerald-400" size={32} />
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Calorie Tracker
            </h1>
          </div>
          <button
            onClick={handleStartAdd}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-all active:scale-95 flex items-center gap-2"
          >
            <Plus size={20} />
            <span className="hidden md:inline">Add Food</span>
          </button>
        </div>

        {/* Date Selector */}
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Daily Summary */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
          <Flame className="text-orange-400" size={20} />
          Daily Summary - {formatDate(selectedDate)}
        </h2>

        {/* Total Calories - No Target */}
        <div className="bg-slate-700 rounded-lg p-4 border border-slate-600 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="text-orange-400" size={20} />
              <span className="text-slate-300 text-sm font-semibold">
                Total Calories
              </span>
            </div>
            <p className="text-white font-bold text-2xl">{totals.calories}</p>
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
                percent={100}
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
            <p className="text-slate-400 text-xs">No target</p>
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
        <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <Utensils className="text-blue-400" size={20} />
          Food Entries ({dayEntries.length})
        </h3>

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
