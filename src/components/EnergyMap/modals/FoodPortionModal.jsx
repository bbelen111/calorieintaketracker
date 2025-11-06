import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { FOOD_CATEGORIES } from '../../../constants/foodDatabase';

export const FoodPortionModal = ({
  isOpen,
  isClosing,
  onClose,
  onAddFood,
  selectedFood,
}) => {
  const [grams, setGrams] = useState(100);
  const scrollerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  // Generate gram values from 10 to 1000
  const gramValues = Array.from({ length: 100 }, (_, i) => 10 + i * 10);

  const centerOnValue = useCallback(
    (value) => {
      if (!scrollerRef.current) return;
      const index = gramValues.indexOf(value);
      if (index === -1) return;

      const itemWidth = 80; // Width of each item
      const containerWidth = scrollerRef.current.offsetWidth;
      const scrollPosition =
        index * itemWidth - containerWidth / 2 + itemWidth / 2;

      scrollerRef.current.scrollLeft = scrollPosition;
    },
    [gramValues]
  );

  // Reset to 100g when modal opens
  useEffect(() => {
    if (isOpen && selectedFood) {
      // Reset state after modal is visible
      const timer = setTimeout(() => {
        setGrams(100);
        centerOnValue(100);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedFood, centerOnValue]);

  const handleScroll = () => {
    if (!scrollerRef.current) return;

    const scrollLeft = scrollerRef.current.scrollLeft;
    const itemWidth = 80;
    const containerWidth = scrollerRef.current.offsetWidth;
    const centerPosition = scrollLeft + containerWidth / 2;
    const index = Math.round(centerPosition / itemWidth);
    const clampedIndex = Math.max(0, Math.min(index, gramValues.length - 1));

    setGrams(gramValues[clampedIndex]);
  };

  const handleMouseDown = (e) => {
    if (!scrollerRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollerRef.current.offsetLeft;
    scrollLeftRef.current = scrollerRef.current.scrollLeft;
    scrollerRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current || !scrollerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    scrollerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (scrollerRef.current) {
      scrollerRef.current.style.cursor = 'grab';
      // Snap to nearest value
      const scrollLeft = scrollerRef.current.scrollLeft;
      const itemWidth = 80;
      const containerWidth = scrollerRef.current.offsetWidth;
      const centerPosition = scrollLeft + containerWidth / 2;
      const index = Math.round(centerPosition / itemWidth);
      const clampedIndex = Math.max(0, Math.min(index, gramValues.length - 1));

      centerOnValue(gramValues[clampedIndex]);
    }
  };

  const handleTouchStart = (e) => {
    if (!scrollerRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.touches[0].pageX - scrollerRef.current.offsetLeft;
    scrollLeftRef.current = scrollerRef.current.scrollLeft;
  };

  const handleTouchMove = (e) => {
    if (!isDraggingRef.current || !scrollerRef.current) return;
    const x = e.touches[0].pageX - scrollerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    scrollerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    if (scrollerRef.current) {
      // Snap to nearest value
      const scrollLeft = scrollerRef.current.scrollLeft;
      const itemWidth = 80;
      const containerWidth = scrollerRef.current.offsetWidth;
      const centerPosition = scrollLeft + containerWidth / 2;
      const index = Math.round(centerPosition / itemWidth);
      const clampedIndex = Math.max(0, Math.min(index, gramValues.length - 1));

      centerOnValue(gramValues[clampedIndex]);
    }
  };

  const calculateNutrition = () => {
    if (!selectedFood) return null;

    const per100g = selectedFood.per100g;
    const multiplier = grams / 100;

    return {
      name: selectedFood.name,
      calories: Math.round(per100g.calories * multiplier),
      protein: Math.round(per100g.protein * multiplier * 10) / 10,
      carbs: Math.round(per100g.carbs * multiplier * 10) / 10,
      fats: Math.round(per100g.fats * multiplier * 10) / 10,
      grams: grams,
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

  const getCategoryColor = (category) => {
    return FOOD_CATEGORIES[category]?.color || 'slate';
  };

  if (!selectedFood) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-2xl p-6"
    >
      {/* Header with food details */}
      <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mb-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-white font-bold text-xl">
              {selectedFood.name}
            </h3>
            <span
              className={`inline-block text-xs px-2 py-0.5 bg-${getCategoryColor(selectedFood.category)}-500/20 text-${getCategoryColor(selectedFood.category)}-400 rounded mt-1`}
            >
              {FOOD_CATEGORIES[selectedFood.category]?.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Reference nutrition (per 100g) */}
        <div className="mt-3 pt-3 border-t border-slate-600">
          <p className="text-slate-400 text-xs mb-2">Per 100g:</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-emerald-400 font-bold text-sm">
                {selectedFood.per100g.calories}
              </p>
              <p className="text-slate-500 text-xs">kcal</p>
            </div>
            <div>
              <p className="text-red-400 font-bold text-sm">
                {selectedFood.per100g.protein}g
              </p>
              <p className="text-slate-500 text-xs">protein</p>
            </div>
            <div>
              <p className="text-amber-400 font-bold text-sm">
                {selectedFood.per100g.carbs}g
              </p>
              <p className="text-slate-500 text-xs">carbs</p>
            </div>
            <div>
              <p className="text-yellow-400 font-bold text-sm">
                {selectedFood.per100g.fats}g
              </p>
              <p className="text-slate-500 text-xs">fats</p>
            </div>
          </div>
        </div>
      </div>

      {/* Portion Selector */}
      <div className="mb-6">
        <label className="block text-slate-300 text-sm font-semibold mb-3 text-center">
          Select Portion
        </label>

        {/* Current selected value display */}
        <div className="text-center mb-4">
          <div className="inline-flex items-baseline gap-2 bg-slate-700/50 border border-slate-600 rounded-lg px-6 py-3">
            <span className="text-4xl font-bold text-white">{grams}</span>
            <span className="text-lg text-slate-400">grams</span>
          </div>
        </div>

        {/* Horizontal scroller */}
        <div className="relative">
          {/* Center indicator line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-blue-400 z-10 pointer-events-none" />

          {/* Gradient overlays */}
          <div className="absolute top-0 bottom-0 left-0 w-20 bg-gradient-to-r from-slate-800 to-transparent z-10 pointer-events-none" />
          <div className="absolute top-0 bottom-0 right-0 w-20 bg-gradient-to-l from-slate-800 to-transparent z-10 pointer-events-none" />

          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="flex overflow-x-auto scrollbar-hide cursor-grab select-none"
            style={{
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Left padding */}
            <div
              className="flex-shrink-0"
              style={{ width: 'calc(50% - 40px)' }}
            />

            {/* Gram values */}
            {gramValues.map((value) => {
              const isSelected = value === grams;
              return (
                <div
                  key={value}
                  className="flex-shrink-0 flex flex-col items-center justify-end"
                  style={{ width: '80px', scrollSnapAlign: 'center' }}
                >
                  {/* Tick mark */}
                  <div
                    className={`transition-all ${
                      isSelected ? 'h-16 bg-blue-400' : 'h-8 bg-slate-600'
                    }`}
                    style={{ width: '2px' }}
                  />
                  {/* Value label */}
                  <span
                    className={`text-xs mt-2 transition-all ${
                      isSelected ? 'text-blue-400 font-bold' : 'text-slate-500'
                    }`}
                  >
                    {value}
                  </span>
                </div>
              );
            })}

            {/* Right padding */}
            <div
              className="flex-shrink-0"
              style={{ width: 'calc(50% - 40px)' }}
            />
          </div>
        </div>
      </div>

      {/* Calculated Nutrition */}
      {nutrition && (
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mb-6">
          <p className="text-slate-400 text-xs mb-3 text-center">
            For {nutrition.grams}g:
          </p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-emerald-400 font-bold text-2xl">
                {nutrition.calories}
              </p>
              <p className="text-slate-400 text-xs">kcal</p>
            </div>
            <div>
              <p className="text-red-400 font-bold text-2xl">
                {nutrition.protein}g
              </p>
              <p className="text-slate-400 text-xs">protein</p>
            </div>
            <div>
              <p className="text-amber-400 font-bold text-2xl">
                {nutrition.carbs}g
              </p>
              <p className="text-slate-400 text-xs">carbs</p>
            </div>
            <div>
              <p className="text-yellow-400 font-bold text-2xl">
                {nutrition.fats}g
              </p>
              <p className="text-slate-400 text-xs">fats</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleAddFood}
          disabled={!nutrition || nutrition.calories === 0}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          Add Food
        </button>
      </div>
    </ModalShell>
  );
};
