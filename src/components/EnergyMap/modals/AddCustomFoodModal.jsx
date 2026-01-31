import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Plus, Trash2, Utensils } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatOne } from '../../../utils/format';
import { FOOD_CATEGORIES } from '../../../constants/foodDatabase';

// Build tags from FOOD_CATEGORIES, excluding 'custom' and 'manual' as they're auto-applied
const CUSTOM_FOOD_TAGS = Object.entries(FOOD_CATEGORIES)
  .filter(([key]) => key !== 'custom' && key !== 'manual')
  .map(([id, { label, color }]) => ({ id, label, color }));

const sanitizeNumericInput = (value) => {
  if (value === '') return '';
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return parts[0];
  return parts.shift() + '.' + parts.join('');
};

// Tag color mapping for styling (matching FoodSearchModal's getCategoryClasses)
const getTagClasses = (tagId, isSelected) => {
  const colorMap = {
    protein: isSelected
      ? 'bg-red-500/30 text-red-400 border-red-500/50'
      : 'bg-slate-700/50 text-slate-400 border-slate-600',
    carbs: isSelected
      ? 'bg-amber-500/30 text-amber-400 border-amber-500/50'
      : 'bg-slate-700/50 text-slate-400 border-slate-600',
    vegetables: isSelected
      ? 'bg-green-500/30 text-green-400 border-green-500/50'
      : 'bg-slate-700/50 text-slate-400 border-slate-600',
    fats: isSelected
      ? 'bg-yellow-500/30 text-yellow-400 border-yellow-500/50'
      : 'bg-slate-700/50 text-slate-400 border-slate-600',
    supplements: isSelected
      ? 'bg-purple-500/30 text-purple-400 border-purple-500/50'
      : 'bg-slate-700/50 text-slate-400 border-slate-600',
  };
  return (
    colorMap[tagId] ||
    (isSelected
      ? 'bg-blue-500/30 text-blue-400 border-blue-500/50'
      : 'bg-slate-700/50 text-slate-400 border-slate-600')
  );
};

export const AddCustomFoodModal = ({
  isOpen,
  isClosing,
  onClose,
  onSaveFood,
}) => {
  const [name, setName] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [portions, setPortions] = useState([]);
  const [newPortionLabel, setNewPortionLabel] = useState('');
  const [newPortionGrams, setNewPortionGrams] = useState('');
  const portionIdRef = useRef(1);

  // Reset form when modal closes
  React.useEffect(() => {
    if (isClosing) {
      setTimeout(() => {
        setName('');
        setSelectedTags([]);
        setCalories('');
        setProtein('');
        setCarbs('');
        setFats('');
        setPortions([]);
        setNewPortionLabel('');
        setNewPortionGrams('');
      }, 200);
    }
  }, [isClosing]);

  const toggleTag = useCallback((tagId) => {
    setSelectedTags((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((t) => t !== tagId);
      }
      return [...prev, tagId];
    });
  }, []);

  const addPortion = useCallback(() => {
    if (!newPortionLabel.trim() || !newPortionGrams) return;

    const gramsValue = parseFloat(newPortionGrams);
    if (!Number.isFinite(gramsValue) || gramsValue <= 0) return;

    setPortions((prev) => [
      ...prev,
      {
        id: `custom_portion_${portionIdRef.current++}`,
        label: newPortionLabel.trim(),
        grams: gramsValue,
      },
    ]);
    setNewPortionLabel('');
    setNewPortionGrams('');
  }, [newPortionLabel, newPortionGrams]);

  const removePortion = useCallback((portionId) => {
    setPortions((prev) => prev.filter((p) => p.id !== portionId));
  }, []);

  const isFormValid = useMemo(() => {
    if (!name.trim()) return false;
    const cal = parseFloat(calories) || 0;
    const prot = parseFloat(protein) || 0;
    const carb = parseFloat(carbs) || 0;
    const fat = parseFloat(fats) || 0;
    // At least one macro or calorie should be set
    return cal > 0 || prot > 0 || carb > 0 || fat > 0;
  }, [name, calories, protein, carbs, fats]);

  const handleSave = useCallback(() => {
    if (!isFormValid) return;

    // Determine category from selected tags (first one wins) or default to 'custom'
    const category = selectedTags.length > 0 ? selectedTags[0] : 'custom';

    const customFood = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      category: category,
      subcategory: null,
      tags: [...selectedTags, 'custom'], // Always include 'custom' internally
      source: 'user',
      isCustom: true,
      per100g: {
        calories: parseFloat(calories) || 0,
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fats: parseFloat(fats) || 0,
      },
      portions: portions.length > 0 ? portions : [],
      createdAt: new Date().toISOString(),
    };

    onSaveFood?.(customFood);
    onClose?.();
  }, [
    isFormValid,
    name,
    selectedTags,
    calories,
    protein,
    carbs,
    fats,
    portions,
    onSaveFood,
    onClose,
  ]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-2xl p-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Utensils className="text-blue-400" size={28} />
        <h3 className="text-white font-bold text-2xl">Add Custom Food</h3>
      </div>

      <div className="space-y-5">
        {/* Food Name */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Food Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Mom's Chicken Curry"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus-ring"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Category
          </label>
          <div className="flex flex-wrap gap-2">
            {CUSTOM_FOOD_TAGS.map((tag) => {
              const isSelected = selectedTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-all cursor-pointer md:hover:opacity-80 ${getTagClasses(tag.id, isSelected)}`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Nutrition per 100g */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Nutrition per 100g
          </label>

          {/* Calories */}
          <div className="mb-3">
            <label className="block text-slate-400 text-xs mb-1.5">
              Calories
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={calories}
              onChange={(e) =>
                setCalories(sanitizeNumericInput(e.target.value))
              }
              placeholder="0"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus-ring"
            />
          </div>

          {/* Macros Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">
                Protein (g)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={protein}
                onChange={(e) =>
                  setProtein(sanitizeNumericInput(e.target.value))
                }
                placeholder="0"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus-ring"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">
                Carbs (g)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={carbs}
                onChange={(e) => setCarbs(sanitizeNumericInput(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus-ring"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">
                Fats (g)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={fats}
                onChange={(e) => setFats(sanitizeNumericInput(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus-ring"
              />
            </div>
          </div>
        </div>

        {/* Preview Card */}
        {(parseFloat(calories) > 0 ||
          parseFloat(protein) > 0 ||
          parseFloat(carbs) > 0 ||
          parseFloat(fats) > 0) && (
          <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
            <p className="text-slate-400 text-xs mb-3 text-center">
              Preview (per 100g)
            </p>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-emerald-400 font-bold text-xl">
                  {formatOne(parseFloat(calories) || 0)}
                </p>
                <p className="text-slate-400 text-xs">kcal</p>
              </div>
              <div>
                <p className="text-red-400 font-bold text-xl">
                  {formatOne(parseFloat(protein) || 0)}g
                </p>
                <p className="text-slate-400 text-xs">protein</p>
              </div>
              <div>
                <p className="text-amber-400 font-bold text-xl">
                  {formatOne(parseFloat(carbs) || 0)}g
                </p>
                <p className="text-slate-400 text-xs">carbs</p>
              </div>
              <div>
                <p className="text-yellow-400 font-bold text-xl">
                  {formatOne(parseFloat(fats) || 0)}g
                </p>
                <p className="text-slate-400 text-xs">fats</p>
              </div>
            </div>
          </div>
        )}

        {/* Custom Portions */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Custom Portions{' '}
            <span className="text-slate-500 text-xs font-normal">
              (optional)
            </span>
          </label>

          {/* Existing portions list */}
          {portions.length > 0 && (
            <div className="space-y-2 mb-3">
              {portions.map((portion) => (
                <div
                  key={portion.id}
                  className="flex items-center justify-between bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium text-sm">
                      {portion.label}
                    </span>
                    <span className="text-slate-400 text-sm">
                      ({portion.grams}g)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePortion(portion.id)}
                    className="text-slate-400 md:hover:text-red-400 transition-colors pressable-inline focus-ring"
                    aria-label={`Remove ${portion.label}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new portion */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-slate-400 text-xs mb-1.5">
                Portion name
              </label>
              <input
                type="text"
                value={newPortionLabel}
                onChange={(e) => setNewPortionLabel(e.target.value)}
                placeholder="e.g., 1 serving"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus-ring text-sm"
              />
            </div>
            <div className="w-24">
              <label className="block text-slate-400 text-xs mb-1.5">
                Grams
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={newPortionGrams}
                onChange={(e) =>
                  setNewPortionGrams(sanitizeNumericInput(e.target.value))
                }
                placeholder="0"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus-ring text-sm"
              />
            </div>
            <button
              type="button"
              onClick={addPortion}
              disabled={!newPortionLabel.trim() || !newPortionGrams}
              className="px-3 py-2.5 bg-blue-600 md:hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all press-feedback focus-ring"
              aria-label="Add portion"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="flex-1 h-10 px-4 bg-slate-700 md:hover:bg-slate-600 text-white rounded-lg font-semibold transition-all text-sm press-feedback focus-ring"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isFormValid}
            className="flex-1 h-10 px-4 bg-blue-600 md:hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2 text-sm press-feedback focus-ring"
          >
            <Plus size={18} />
            Save Food
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
