import React, { useState, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, Plus, Trash2, X } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatOne } from '../../../utils/format';

const CUSTOM_FOOD_TAGS = [
  { id: 'custom', label: 'Custom', color: 'blue' },
  { id: 'homemade', label: 'Homemade', color: 'emerald' },
  { id: 'recipe', label: 'Recipe', color: 'amber' },
  { id: 'restaurant', label: 'Restaurant', color: 'purple' },
  { id: 'snack', label: 'Snack', color: 'pink' },
];

const sanitizeNumericInput = (value) => {
  if (value === '') return '';
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return parts[0];
  return parts.shift() + '.' + parts.join('');
};

export const AddCustomFoodModal = ({
  isOpen,
  isClosing,
  onClose,
  onSaveFood,
}) => {
  const [name, setName] = useState('');
  const [selectedTags, setSelectedTags] = useState(['custom']); // Always include 'custom' tag
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
        setSelectedTags(['custom']);
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
    // Don't allow removing the 'custom' tag
    if (tagId === 'custom') return;

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

    const customFood = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      category: 'custom', // Special category for custom foods
      subcategory: null,
      tags: selectedTags,
      source: 'user', // Mark as user-created
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

  const getTagColor = (tagId) => {
    const tag = CUSTOM_FOOD_TAGS.find((t) => t.id === tagId);
    return tag?.color || 'slate';
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      fullHeight
      overlayClassName="fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch"
      contentClassName="fixed inset-0 w-screen h-screen p-0 bg-slate-900 rounded-none border-none !max-h-none flex flex-col overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Back"
            className="text-slate-300 md:hover:text-white transition-all pressable-inline focus-ring"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-2">
            <Plus className="text-blue-400" size={24} />
            <h3 className="text-white font-bold text-xl">Add Custom Food</h3>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 bg-slate-800 border-t border-slate-700 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Food Name */}
          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-2">
              Food Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Mom's Chicken Curry"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_FOOD_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag.id);
                const isCustomTag = tag.id === 'custom';
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    disabled={isCustomTag}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      isSelected
                        ? `bg-${tag.color}-500/30 text-${tag.color}-400 border border-${tag.color}-500/50`
                        : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                    } ${isCustomTag ? 'cursor-default' : 'cursor-pointer md:hover:border-slate-500'}`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
            <p className="text-slate-500 text-xs mt-2">
              The &quot;Custom&quot; tag is always included for foods created
              here.
            </p>
          </div>

          {/* Nutrition per 100g */}
          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-3">
              Nutrition per 100g <span className="text-red-400">*</span>
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
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                  onChange={(e) =>
                    setCarbs(sanitizeNumericInput(e.target.value))
                  }
                  placeholder="0"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                  onChange={(e) =>
                    setFats(sanitizeNumericInput(e.target.value))
                  }
                  placeholder="0"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
            <label className="block text-slate-300 text-sm font-semibold mb-3">
              Custom Portions{' '}
              <span className="text-slate-500 text-xs font-normal">
                (optional)
              </span>
            </label>

            {/* Existing portions list */}
            {portions.length > 0 && (
              <div className="space-y-2 mb-4">
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
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
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
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
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
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-4 bg-slate-900 border-t border-slate-700 flex-shrink-0">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="flex-1 px-4 py-3 bg-slate-700 md:hover:bg-slate-600 text-white rounded-lg font-semibold transition-all text-sm press-feedback focus-ring"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isFormValid}
            className="flex-1 px-4 py-3 bg-blue-600 md:hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2 text-sm press-feedback focus-ring"
          >
            <Plus size={18} />
            Save Food
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
