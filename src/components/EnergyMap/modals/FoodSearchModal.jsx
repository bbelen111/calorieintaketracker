import React, { useState, useMemo } from 'react';
import { Search, Edit3 } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { searchFoods, FOOD_CATEGORIES } from '../../../constants/foodDatabase';

export const FoodSearchModal = ({
  isOpen,
  isClosing,
  onClose,
  onSelectFood,
  onOpenManualEntry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => searchFoods(searchQuery), [searchQuery]);

  const getCategoryColor = (category) => {
    return FOOD_CATEGORIES[category]?.color || 'slate';
  };

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

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => {}}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold transition-all"
        >
          <Search size={18} />
          Search Database
        </button>
        <button
          onClick={onOpenManualEntry}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          <Edit3 size={18} />
          Manual Entry
        </button>
      </div>

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
                onClick={() => onSelectFood?.(food)}
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
                      <span className="text-slate-400 text-xs">per 100g</span>
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

      {/* Cancel Button */}
      <div className="mt-4">
        <button
          onClick={onClose}
          className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
};
