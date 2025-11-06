import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
} from 'react';
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
  const [isDragging, setIsDragging] = useState(false);
  const [sidePadding, setSidePadding] = useState(0);
  const scrollerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  const ITEM_WIDTH = 56;

  // Generate gram values from 10 to 1000 including 0.5 g steps
  const gramValues = useMemo(() => {
    const values = [];
    const start = 10;
    const end = 1000;
    const totalSteps = Math.round((end - start) * 2);

    for (let step = 0; step <= totalSteps; step += 1) {
      const rawValue = start + step * 0.5;
      const value = Math.round(rawValue * 10) / 10;
      const isMajor = Number.isInteger(value);
      values.push({ value, isMajor });
    }

    return values;
  }, []);

  const findValueIndex = useCallback(
    (target) =>
      gramValues.findIndex(({ value }) => Math.abs(value - target) < 0.0001),
    [gramValues]
  );

  const centerOnValue = useCallback(
    (value, behavior = 'auto') => {
      if (!scrollerRef.current) return;
      const index = findValueIndex(value);
      if (index === -1) return;

      const containerWidth = scrollerRef.current.offsetWidth;
      const scrollPosition =
        sidePadding + index * ITEM_WIDTH + ITEM_WIDTH / 2 - containerWidth / 2;

      scrollerRef.current.scrollTo({
        left: scrollPosition,
        behavior,
      });
    },
    [ITEM_WIDTH, findValueIndex, sidePadding]
  );

  const getNearestIndex = useCallback(() => {
    if (!scrollerRef.current) return 0;

    const containerWidth = scrollerRef.current.offsetWidth;
    const scrollLeft = scrollerRef.current.scrollLeft;
    const centerPosition = scrollLeft + containerWidth / 2;
    const relative = centerPosition - sidePadding - ITEM_WIDTH / 2;
    const rawIndex = Math.round(relative / ITEM_WIDTH);

    return Math.max(0, Math.min(rawIndex, gramValues.length - 1));
  }, [ITEM_WIDTH, gramValues.length, sidePadding]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePadding = () => {
      if (!scrollerRef.current) return;
      const containerWidth = scrollerRef.current.offsetWidth;
      const padding = Math.max(0, containerWidth / 2 - ITEM_WIDTH / 2);
      setSidePadding(padding);
    };

    updatePadding();

    let observer;
    if (typeof ResizeObserver !== 'undefined' && scrollerRef.current) {
      observer = new ResizeObserver(updatePadding);
      observer.observe(scrollerRef.current);
    }

    window.addEventListener('resize', updatePadding);

    return () => {
      window.removeEventListener('resize', updatePadding);
      if (observer) observer.disconnect();
    };
  }, [ITEM_WIDTH, isOpen]);

  // Reset to 100g when modal opens
  useEffect(() => {
    if (!isOpen || !selectedFood) return undefined;

    const timer = setTimeout(() => {
      setGrams(100);
      centerOnValue(100);
    }, 80);

    return () => clearTimeout(timer);
  }, [centerOnValue, isOpen, selectedFood]);

  const handleScroll = useCallback(() => {
    const index = getNearestIndex();
    const entry = gramValues[index];
    if (!entry) return;
    const value = Math.round(entry.value * 10) / 10;

    setGrams((prev) => (prev === value ? prev : value));
  }, [getNearestIndex, gramValues]);

  const handleMouseDown = useCallback((e) => {
    if (!scrollerRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollerRef.current.offsetLeft;
    scrollLeftRef.current = scrollerRef.current.scrollLeft;
    scrollerRef.current.style.cursor = 'grabbing';
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current || !scrollerRef.current) return;
    if (e.cancelable) e.preventDefault();
    const x = e.pageX - scrollerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1;
    scrollerRef.current.scrollLeft = scrollLeftRef.current - walk;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (scrollerRef.current) {
      scrollerRef.current.style.cursor = 'grab';
    }

    const targetEntry = gramValues[getNearestIndex()];
    if (!targetEntry) return;
    const sanitizedValue = Math.round(targetEntry.value * 10) / 10;
    centerOnValue(sanitizedValue, 'smooth');
    setGrams(sanitizedValue);
  }, [centerOnValue, getNearestIndex, gramValues]);

  const handleTouchStart = useCallback((e) => {
    if (!scrollerRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.touches[0].pageX - scrollerRef.current.offsetLeft;
    scrollLeftRef.current = scrollerRef.current.scrollLeft;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDraggingRef.current || !scrollerRef.current) return;
    if (e.cancelable) e.preventDefault();
    const x = e.touches[0].pageX - scrollerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1;
    scrollerRef.current.scrollLeft = scrollLeftRef.current - walk;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const targetEntry = gramValues[getNearestIndex()];
    if (!targetEntry) return;
    const sanitizedValue = Math.round(targetEntry.value * 10) / 10;
    centerOnValue(sanitizedValue, 'smooth');
    setGrams(sanitizedValue);
  }, [centerOnValue, getNearestIndex, gramValues]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleWindowMouseUp = () => handleMouseUp();
    const handleWindowTouchEnd = () => handleTouchEnd();

    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('touchend', handleWindowTouchEnd);
    window.addEventListener('touchcancel', handleWindowTouchEnd);

    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('touchend', handleWindowTouchEnd);
      window.removeEventListener('touchcancel', handleWindowTouchEnd);
    };
  }, [handleMouseUp, handleTouchEnd, isOpen]);

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
            <span className="text-4xl font-bold text-white">
              {Number.isInteger(grams) ? grams : grams.toFixed(1)}
            </span>
            <span className="text-lg text-slate-400">grams</span>
          </div>
        </div>

        {/* Horizontal scroller */}
        <div className="relative rounded-xl bg-slate-800/80 py-4">
          {/* Center indicator line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-blue-400 z-10 pointer-events-none" />

          {/* Gradient overlays */}
          <div className="absolute top-0 bottom-0 left-0 w-20 bg-gradient-to-r from-slate-800 via-slate-800/80 to-transparent z-10 pointer-events-none" />
          <div className="absolute top-0 bottom-0 right-0 w-20 bg-gradient-to-l from-slate-800 via-slate-800/80 to-transparent z-10 pointer-events-none" />

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
            onTouchCancel={handleTouchEnd}
            className="flex overflow-x-auto scrollbar-hide cursor-grab select-none"
            style={{
              scrollSnapType: isDragging ? 'none' : 'x mandatory',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Left padding */}
            <div className="flex-shrink-0" style={{ width: sidePadding }} />

            {/* Gram values */}
            {gramValues.map(({ value, isMajor }) => {
              const isSelected = value === grams;
              const baseHeight = isMajor ? 'h-12' : 'h-8';
              const selectedHeight = isMajor ? 'h-20' : 'h-14';
              const displayValue = Number.isInteger(value)
                ? value
                : value.toFixed(1);
              const labelClassName = [
                'mt-2 text-[11px]',
                'transition-colors transition-opacity duration-200',
                isSelected
                  ? 'text-blue-400 font-semibold opacity-0'
                  : isMajor
                    ? 'text-slate-300 opacity-80'
                    : 'text-slate-500 opacity-60',
              ].join(' ');
              return (
                <div
                  key={value}
                  className="flex-shrink-0 flex flex-col items-center justify-end h-24"
                  style={{ width: ITEM_WIDTH, scrollSnapAlign: 'center' }}
                >
                  {/* Tick mark */}
                  <div
                    className={`w-px rounded-full transition-all ${
                      isSelected
                        ? `${selectedHeight} bg-blue-400`
                        : `${baseHeight} ${
                            isMajor ? 'bg-slate-500' : 'bg-slate-600'
                          }`
                    }`}
                  />
                  {/* Value label */}
                  <span className={labelClassName}>{displayValue}</span>
                </div>
              );
            })}

            {/* Right padding */}
            <div className="flex-shrink-0" style={{ width: sidePadding }} />
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
