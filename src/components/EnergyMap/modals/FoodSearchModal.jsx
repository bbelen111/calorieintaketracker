import React, { useState, useMemo } from 'react';
import { Search, Plus, X, Edit3, Camera, Sparkles, Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { searchFoods, FOOD_CATEGORIES } from '../../../constants/foodDatabase';

export const FoodSearchModal = ({
  isOpen,
  isClosing,
  onClose,
  onAddFood,
  // Manual entry props
  foodName,
  setFoodName,
  calories,
  setCalories,
  protein,
  setProtein,
  carbs,
  setCarbs,
  fats,
  setFats,
}) => {
  const [activeTab, setActiveTab] = useState('search'); // 'search', 'manual', 'photo', 'ai'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [quantityValue, setQuantityValue] = useState('100');
  const [quantityType, setQuantityType] = useState('grams'); // 'grams' or 'calories'

  const searchResults = useMemo(() => searchFoods(searchQuery), [searchQuery]);

  const calculateNutrition = () => {
    if (!selectedFood) return null;

    const per100g = selectedFood.per100g;
    let multiplier = 1;

    if (quantityType === 'grams') {
      const grams = parseFloat(quantityValue) || 0;
      multiplier = grams / 100;
    } else {
      // calories mode: solve for grams needed to reach target calories
      const targetCalories = parseFloat(quantityValue) || 0;
      const gramsNeeded = (targetCalories / per100g.calories) * 100;
      multiplier = gramsNeeded / 100;
    }

    return {
      name: selectedFood.name,
      calories: Math.round(per100g.calories * multiplier),
      protein: Math.round(per100g.protein * multiplier * 10) / 10,
      carbs: Math.round(per100g.carbs * multiplier * 10) / 10,
      fats: Math.round(per100g.fats * multiplier * 10) / 10,
      grams: Math.round(
        quantityType === 'grams'
          ? parseFloat(quantityValue)
          : ((parseFloat(quantityValue) || 0) / per100g.calories) * 100
      ),
    };
  };

  const nutrition = selectedFood ? calculateNutrition() : null;

  const handleAddFood = () => {
    if (!nutrition) return;

    const foodEntry = {
      id: Date.now(),
      name: nutrition.name,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fats: nutrition.fats,
      timestamp: new Date().toISOString(),
    };

    onAddFood?.(foodEntry);
  };

  const handleSelectFood = (food) => {
    setSelectedFood(food);
    setQuantityValue('100');
    setQuantityType('grams');
  };

  const handleClearSelection = () => {
    setSelectedFood(null);
    setQuantityValue('100');
    setQuantityType('grams');
  };

  const getCategoryColor = (category) => {
    return FOOD_CATEGORIES[category]?.color || 'slate';
  };

  const handleManualSave = () => {
    if (!foodName.trim()) {
      window.alert('Please enter a food name');
      return;
    }

    const foodEntry = {
      id: Date.now(),
      name: foodName.trim(),
      calories: parseFloat(calories) || 0,
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fats: parseFloat(fats) || 0,
      timestamp: new Date().toISOString(),
    };

    onAddFood?.(foodEntry);
  };

  const tabs = [
    { id: 'search', label: 'Search', icon: Search, available: true },
    { id: 'manual', label: 'Manual', icon: Edit3, available: true },
    { id: 'photo', label: 'Photo', icon: Camera, available: false },
    { id: 'ai', label: 'AI', icon: Sparkles, available: false },
  ];

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-3xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <Search className="text-blue-400" size={28} />
        <h3 className="text-white font-bold text-2xl">Add Food</h3>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-600">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          const isDisabled = !tab.available;

          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-4 py-2 font-semibold text-sm transition-all relative ${
                isDisabled
                  ? 'text-slate-500 cursor-not-allowed'
                  : isActive
                    ? 'text-blue-400'
                    : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <IconComponent size={18} />
              {tab.label}
              {isDisabled && (
                <span className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-500 rounded">
                  Soon
                </span>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Search Tab Content */}
      {activeTab === 'search' && (
        <>
          {!selectedFood ? (
            <>
              {/* Search Input */}
              <div className="mb-4">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={20}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for a food..."
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                  />
                </div>
              </div>

              {/* Search Results */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="bg-slate-700/50 border border-slate-600 border-dashed rounded-lg p-8 text-center">
                    <Search className="mx-auto text-slate-500 mb-3" size={32} />
                    <p className="text-slate-400 text-sm">No foods found</p>
                  </div>
                ) : (
                  searchResults.map((food) => {
                    const categoryColor = getCategoryColor(food.category);
                    return (
                      <button
                        key={food.id}
                        onClick={() => handleSelectFood(food)}
                        className="w-full bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg p-3 text-left transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-semibold text-sm truncate">
                              {food.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`text-xs px-2 py-0.5 bg-${categoryColor}-500/20 text-${categoryColor}-400 rounded`}
                              >
                                {FOOD_CATEGORIES[food.category]?.label}
                              </span>
                              <span className="text-slate-400 text-xs">
                                per 100g
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <div className="text-center">
                              <p className="text-emerald-400 font-bold">
                                {food.per100g.calories}
                              </p>
                              <p className="text-slate-500">cal</p>
                            </div>
                            <div className="text-center">
                              <p className="text-red-400 font-bold">
                                {food.per100g.protein}g
                              </p>
                              <p className="text-slate-500">prot</p>
                            </div>
                            <div className="text-center">
                              <p className="text-amber-400 font-bold">
                                {food.per100g.carbs}g
                              </p>
                              <p className="text-slate-500">carb</p>
                            </div>
                            <div className="text-center">
                              <p className="text-yellow-400 font-bold">
                                {food.per100g.fats}g
                              </p>
                              <p className="text-slate-500">fat</p>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              {/* Selected Food Details */}
              <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-white font-bold text-lg">
                      {selectedFood.name}
                    </h4>
                    <span
                      className={`inline-block text-xs px-2 py-0.5 bg-${getCategoryColor(selectedFood.category)}-500/20 text-${getCategoryColor(selectedFood.category)}-400 rounded mt-1`}
                    >
                      {FOOD_CATEGORIES[selectedFood.category]?.label}
                    </span>
                  </div>
                  <button
                    onClick={handleClearSelection}
                    className="text-slate-400 hover:text-white transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Quantity Input */}
                <div className="mb-4">
                  <label className="block text-slate-300 text-sm font-semibold mb-2">
                    Quantity
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={quantityValue}
                      onChange={(e) => setQuantityValue(e.target.value)}
                      placeholder="100"
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <select
                      value={quantityType}
                      onChange={(e) => setQuantityType(e.target.value)}
                      className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="grams">grams</option>
                      <option value="calories">calories</option>
                    </select>
                  </div>
                </div>

                {/* Calculated Nutrition */}
                {nutrition && (
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <p className="text-slate-400 text-xs mb-2">
                      For {nutrition.grams}g:
                    </p>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-emerald-400 font-bold text-lg">
                          {nutrition.calories}
                        </p>
                        <p className="text-slate-400 text-xs">kcal</p>
                      </div>
                      <div>
                        <p className="text-red-400 font-bold text-lg">
                          {nutrition.protein}g
                        </p>
                        <p className="text-slate-400 text-xs">protein</p>
                      </div>
                      <div>
                        <p className="text-amber-400 font-bold text-lg">
                          {nutrition.carbs}g
                        </p>
                        <p className="text-slate-400 text-xs">carbs</p>
                      </div>
                      <div>
                        <p className="text-yellow-400 font-bold text-lg">
                          {nutrition.fats}g
                        </p>
                        <p className="text-slate-400 text-xs">fats</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Manual Tab Content */}
      {activeTab === 'manual' && (
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
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
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
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
        {activeTab === 'search' && selectedFood && (
          <button
            onClick={handleAddFood}
            disabled={!nutrition || nutrition.calories === 0}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            Add Food
          </button>
        )}
        {activeTab === 'manual' && (
          <button
            onClick={handleManualSave}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Save size={18} />
            Add Food
          </button>
        )}
      </div>
    </ModalShell>
  );
};
