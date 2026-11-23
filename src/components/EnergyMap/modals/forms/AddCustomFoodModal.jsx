import React, { useState, useCallback, useMemo, useRef } from 'react';
import { ChevronsUpDown, Plus, Trash2, Utensils } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { NumericValuePickerModal } from '../pickers/NumericValuePickerModal';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { FOOD_CATEGORIES } from '../../../../constants/food/foodDatabase';
import {
  NUTRIENT_PICKER_FIELDS,
  PORTION_GRAMS_PICKER_FIELD,
  formatPickerDisplayValue,
  formatPickerValueForState,
  normalizePickerValue,
} from '../../../../utils/food/nutrientPicker';

// Build tags from FOOD_CATEGORIES, excluding 'custom' and 'manual' as they're auto-applied
const CUSTOM_FOOD_TAGS = Object.entries(FOOD_CATEGORIES)
  .filter(([key]) => key !== 'custom' && key !== 'manual')
  .map(([id, { label, color }]) => ({ id, label, color }));

// Tag color mapping for styling (matching FoodSearchModal's getCategoryClasses).
// Selected chips carry a soft accent glow so the current category reads at a glance.
const TAG_STYLES = {
  protein: {
    idle: 'bg-surface-highlight/50 text-muted border-border',
    active:
      'bg-accent-red/20 text-accent-red border-accent-red/60 shadow-[0_0_8px_-3px_rgb(var(--accent-red)/0.35)]',
  },
  carbs: {
    idle: 'bg-surface-highlight/50 text-muted border-border',
    active:
      'bg-accent-amber/20 text-accent-amber border-accent-amber/60 shadow-[0_0_8px_-3px_rgb(var(--accent-amber)/0.35)]',
  },
  vegetables: {
    idle: 'bg-surface-highlight/50 text-muted border-border',
    active:
      'bg-accent-green/20 text-accent-green border-accent-green/60 shadow-[0_0_8px_-3px_rgb(var(--accent-green)/0.35)]',
  },
  fats: {
    idle: 'bg-surface-highlight/50 text-muted border-border',
    active:
      'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/60 shadow-[0_0_8px_-3px_rgb(var(--accent-yellow)/0.35)]',
  },
  supplements: {
    idle: 'bg-surface-highlight/50 text-muted border-border',
    active:
      'bg-accent-purple/20 text-accent-purple border-accent-purple/60 shadow-[0_0_8px_-3px_rgb(var(--accent-purple)/0.35)]',
  },
  default: {
    idle: 'bg-surface-highlight/50 text-muted border-border',
    active:
      'bg-accent-blue/20 text-accent-blue border-accent-blue/60 shadow-[0_0_8px_-3px_rgb(var(--accent-blue)/0.35)]',
  },
};

const getTagClasses = (tagId, isSelected) => {
  const styles = TAG_STYLES[tagId] || TAG_STYLES.default;
  return isSelected ? styles.active : styles.idle;
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
  const [fiber, setFiber] = useState('');
  const [sodium, setSodium] = useState('');
  const [saturatedFats, setSaturatedFats] = useState('');
  const [sugars, setSugars] = useState('');
  const [portions, setPortions] = useState([]);
  const [newPortionLabel, setNewPortionLabel] = useState('');
  const [newPortionGrams, setNewPortionGrams] = useState('');
  const portionIdRef = useRef(1);

  // Numeric fields open the shared wheel picker (same UX as Manual Entry).
  // The staged config is retained while the picker plays its close animation,
  // so its title/value never flash back to the defaults.
  const numericPickerModal = useAnimatedModal(false);
  const [numericPickerState, setNumericPickerState] = useState(null);

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
        setFiber('');
        setSodium('');
        setSaturatedFats('');
        setSugars('');
        setPortions([]);
        setNewPortionLabel('');
        setNewPortionGrams('');
      }, 200);
    }
  }, [isClosing]);

  const numericFields = {
    calories: {
      config: NUTRIENT_PICKER_FIELDS.calories,
      value: calories,
      setValue: setCalories,
    },
    protein: {
      config: NUTRIENT_PICKER_FIELDS.protein,
      value: protein,
      setValue: setProtein,
    },
    carbs: {
      config: NUTRIENT_PICKER_FIELDS.carbs,
      value: carbs,
      setValue: setCarbs,
    },
    fats: {
      config: NUTRIENT_PICKER_FIELDS.fats,
      value: fats,
      setValue: setFats,
    },
    fiber: {
      config: NUTRIENT_PICKER_FIELDS.fiber,
      value: fiber,
      setValue: setFiber,
    },
    sodium: {
      config: NUTRIENT_PICKER_FIELDS.sodium,
      value: sodium,
      setValue: setSodium,
    },
    saturatedFats: {
      config: NUTRIENT_PICKER_FIELDS.saturatedFats,
      value: saturatedFats,
      setValue: setSaturatedFats,
    },
    sugars: {
      config: NUTRIENT_PICKER_FIELDS.sugars,
      value: sugars,
      setValue: setSugars,
    },
    portionGrams: {
      config: PORTION_GRAMS_PICKER_FIELD,
      value: newPortionGrams,
      setValue: setNewPortionGrams,
    },
  };

  // Blur whatever text field has focus before the picker mounts, so the
  // keyboard cannot sit over the wheel (mirrors the Manual Entry modal).
  const openNumericPicker = (fieldKey) => {
    const field = numericFields[fieldKey];
    if (!field) return;

    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }

    window.setTimeout(() => {
      setNumericPickerState({
        fieldKey,
        config: field.config,
        value: normalizePickerValue(
          Number.parseFloat(field.value),
          field.config
        ),
      });
      numericPickerModal.open();
    }, 60);
  };

  const handleNumericPickerSave = (nextValue) => {
    const fieldKey = numericPickerState?.fieldKey;
    const field = fieldKey ? numericFields[fieldKey] : null;

    if (!field) {
      numericPickerModal.requestClose();
      return;
    }

    const normalizedValue = normalizePickerValue(
      Number(nextValue),
      field.config
    );
    field.setValue(
      formatPickerValueForState(normalizedValue, field.config.step)
    );
    numericPickerModal.requestClose();
  };

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

  const handleSave = useCallback(
    (options = {}) => {
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
          fiber: fiber !== '' ? parseFloat(fiber) : null,
          sodium: sodium !== '' ? parseFloat(sodium) : null,
          saturatedFats:
            saturatedFats !== '' ? parseFloat(saturatedFats) : null,
          sugars: sugars !== '' ? parseFloat(sugars) : null,
        },
        portions: portions.length > 0 ? portions : [],
        createdAt: new Date().toISOString(),
      };

      onSaveFood?.(customFood, { log: options.log === true });
      onClose?.();
    },
    [
      isFormValid,
      name,
      selectedTags,
      calories,
      protein,
      carbs,
      fats,
      fiber,
      sodium,
      saturatedFats,
      sugars,
      portions,
      onSaveFood,
      onClose,
    ]
  );

  const pickerField = numericPickerState?.config;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        onClose={onClose}
        contentClassName="w-full md:max-w-2xl p-6"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Utensils className="text-accent-blue" size={28} />
          <h3 className="text-foreground font-bold text-2xl">
            Add Custom Food
          </h3>
        </div>

        <div className="space-y-5">
          {/* Food Name */}
          <div>
            <label className="block text-foreground text-sm font-semibold mb-2">
              Food Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Mom's Chicken Curry"
              className="w-full bg-surface-highlight border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus-ring"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-foreground text-sm font-semibold mb-2">
              Category
            </label>
            <div className="flex flex-wrap gap-2.5">
              {CUSTOM_FOOD_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    aria-pressed={isSelected}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all cursor-pointer pressable focus-ring md:hover:opacity-90 ${getTagClasses(tag.id, isSelected)}`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nutrition per 100g */}
          <div>
            <label className="block text-foreground text-sm font-semibold mb-2">
              Nutrition per 100g
            </label>

            {/* Calories */}
            <div className="mb-3">
              <label className="block text-muted text-xs mb-1.5">
                Calories
              </label>
              <button
                type="button"
                onClick={() => openNumericPicker('calories')}
                className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
                aria-label="Open calories picker"
              >
                <span className="font-medium text-base">
                  {formatPickerDisplayValue(calories, 'kcal')}
                </span>
                <ChevronsUpDown size={16} className="text-muted shrink-0" />
              </button>
            </div>

            {/* Macros Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-muted text-xs mb-1.5">
                  Protein (g)
                </label>
                <button
                  type="button"
                  onClick={() => openNumericPicker('protein')}
                  className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                  aria-label="Open protein picker"
                >
                  <span className="font-medium text-sm">
                    {formatPickerDisplayValue(protein, 'g')}
                  </span>
                  <ChevronsUpDown size={14} className="text-muted shrink-0" />
                </button>
              </div>
              <div>
                <label className="block text-muted text-xs mb-1.5">
                  Carbs (g)
                </label>
                <button
                  type="button"
                  onClick={() => openNumericPicker('carbs')}
                  className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                  aria-label="Open carbs picker"
                >
                  <span className="font-medium text-sm">
                    {formatPickerDisplayValue(carbs, 'g')}
                  </span>
                  <ChevronsUpDown size={14} className="text-muted shrink-0" />
                </button>
              </div>
              <div>
                <label className="block text-muted text-xs mb-1.5">
                  Fats (g)
                </label>
                <button
                  type="button"
                  onClick={() => openNumericPicker('fats')}
                  className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                  aria-label="Open fats picker"
                >
                  <span className="font-medium text-sm">
                    {formatPickerDisplayValue(fats, 'g')}
                  </span>
                  <ChevronsUpDown size={14} className="text-muted shrink-0" />
                </button>
              </div>
            </div>

            {/* Micros Grid (optional, nullable; empty = untracked) */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-muted text-xs mb-1.5">
                  Fiber (g)
                </label>
                <button
                  type="button"
                  onClick={() => openNumericPicker('fiber')}
                  className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                  aria-label="Open fiber picker"
                >
                  <span className="font-medium text-sm">
                    {formatPickerDisplayValue(fiber, 'g')}
                  </span>
                  <ChevronsUpDown size={14} className="text-muted shrink-0" />
                </button>
              </div>
              <div>
                <label className="block text-muted text-xs mb-1.5">
                  Sodium (mg)
                </label>
                <button
                  type="button"
                  onClick={() => openNumericPicker('sodium')}
                  className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                  aria-label="Open sodium picker"
                >
                  <span className="font-medium text-sm">
                    {formatPickerDisplayValue(sodium, 'mg')}
                  </span>
                  <ChevronsUpDown size={14} className="text-muted shrink-0" />
                </button>
              </div>
              <div>
                <label className="block text-muted text-xs mb-1.5">
                  Sat. Fat (g)
                </label>
                <button
                  type="button"
                  onClick={() => openNumericPicker('saturatedFats')}
                  className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                  aria-label="Open saturated fat picker"
                >
                  <span className="font-medium text-sm">
                    {formatPickerDisplayValue(saturatedFats, 'g')}
                  </span>
                  <ChevronsUpDown size={14} className="text-muted shrink-0" />
                </button>
              </div>
              <div>
                <label className="block text-muted text-xs mb-1.5">
                  Sugars (g)
                </label>
                <button
                  type="button"
                  onClick={() => openNumericPicker('sugars')}
                  className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                  aria-label="Open sugars picker"
                >
                  <span className="font-medium text-sm">
                    {formatPickerDisplayValue(sugars, 'g')}
                  </span>
                  <ChevronsUpDown size={14} className="text-muted shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* Custom Portions */}
          <div>
            <label className="block text-foreground text-sm font-semibold mb-2">
              Custom Portions{' '}
              <span className="text-muted text-xs font-normal">(optional)</span>
            </label>

            {/* Existing portions list */}
            {portions.length > 0 && (
              <div className="space-y-2 mb-3">
                {portions.map((portion) => (
                  <div
                    key={portion.id}
                    className="flex items-center justify-between bg-surface/60 border border-border rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-foreground font-medium text-sm">
                        {portion.label}
                      </span>
                      <span className="text-muted text-sm">
                        ({portion.grams}g)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePortion(portion.id)}
                      className="text-muted md:hover:text-accent-red transition-colors pressable-inline focus-ring"
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
                <label className="block text-muted text-xs mb-1.5">
                  Portion name
                </label>
                <input
                  type="text"
                  value={newPortionLabel}
                  onChange={(e) => setNewPortionLabel(e.target.value)}
                  placeholder="e.g., 1 serving"
                  className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2.5 text-foreground placeholder:text-muted focus-ring text-sm"
                />
              </div>
              <div className="w-28">
                <label className="block text-muted text-xs mb-1.5">Grams</label>
                <button
                  type="button"
                  onClick={() => openNumericPicker('portionGrams')}
                  className="w-full bg-surface-highlight text-foreground px-2.5 py-2.5 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline text-sm"
                  aria-label="Open portion grams picker"
                >
                  <span className="font-medium">
                    {formatPickerDisplayValue(newPortionGrams, 'g')}
                  </span>
                  <ChevronsUpDown size={14} className="text-muted shrink-0" />
                </button>
              </div>
              <button
                type="button"
                onClick={addPortion}
                disabled={!newPortionLabel.trim() || !newPortionGrams}
                className="px-3 py-2.5 bg-primary md:hover:brightness-110 disabled:bg-surface-highlight/60 disabled:cursor-not-allowed disabled:text-muted text-primary-foreground rounded-lg font-medium transition-all press-feedback focus-ring"
                aria-label="Add portion"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          {/* Actions - same hierarchy as the Manual Entry modal: one dominant
              primary above two quiet secondary actions. */}
          <div className="flex flex-col gap-1.5 pt-2">
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={!isFormValid}
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-xs transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:brightness-110"
            >
              Save food
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onClose?.()}
                className="rounded-xl bg-surface-highlight px-2.5 py-2 text-[12px] font-semibold text-foreground transition-all press-feedback focus-ring md:hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSave({ log: true })}
                disabled={!isFormValid}
                className="rounded-xl bg-accent-blue/10 px-2.5 py-2 text-[12px] font-semibold text-accent-blue transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:bg-accent-blue/15"
              >
                Save &amp; log
              </button>
            </div>
          </div>
        </div>
      </ModalShell>

      <NumericValuePickerModal
        isOpen={numericPickerModal.isOpen}
        isClosing={numericPickerModal.isClosing}
        title={pickerField?.title ?? 'Select Value'}
        value={numericPickerState?.value ?? 0}
        min={pickerField?.min ?? 0}
        max={pickerField?.max ?? 100}
        step={pickerField?.step ?? 1}
        unitLabel={pickerField?.unitLabel ?? ''}
        onCancel={numericPickerModal.requestClose}
        onSave={handleNumericPickerSave}
      />
    </>
  );
};
