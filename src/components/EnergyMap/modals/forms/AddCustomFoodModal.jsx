import React, { Suspense, useState, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChefHat,
  ChevronsUpDown,
  HelpCircle,
  Plus,
  Trash2,
  Utensils,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { SegmentedToggle } from '../../common/SegmentedToggle';
import { NumericValuePickerModal } from '../pickers/NumericValuePickerModal';
import { DualWheelModal } from '../pickers/DualWheelModal';
import { EnergyPickerModal } from '../pickers/EnergyPickerModal';
import {
  buildHundredsWheel,
  buildTenthsWheel,
} from '../../../../utils/units/wheelConfigs';
import { roundTo } from '../../../../utils/units/unitFormatter';
import { useUnits } from '../../../../hooks/useUnits';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { AddCustomFoodInfoModal } from '../info/AddCustomFoodInfoModal';
import { RecipeIngredientsSection } from './RecipeIngredientsSection';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { useReducedMotionPreference } from '../../../../hooks/useMotionMode';
import { FOOD_CATEGORIES } from '../../../../constants/food/foodDatabase';
import {
  NUTRIENT_PICKER_FIELDS,
  getPortionWeightField,
  isPickerValueUnchanged,
  formatEnergyFieldValue,
  formatPickerDisplayValue,
  formatPickerValueForState,
  normalizePickerValue,
} from '../../../../utils/food/nutrientPicker';
import {
  RECIPE_MAX_INGREDIENTS,
  RECIPE_MAX_SERVINGS,
  RECIPE_MIN_SERVINGS,
  buildRecipeFood,
  buildRecipeIngredient,
  createRecipeId,
  validateRecipeDraft,
} from '../../../../utils/food/recipe';

// The ingredient picker (a fullscreen browse page: search, filters, online
// paging, portion wheel) only matters once someone opens Recipe mode, so it
// stays out of this modal's chunk.
const RecipeIngredientPickerModal = React.lazy(() =>
  import('../fullscreen/RecipeIngredientPickerModal').then((module) => ({
    default: module.RecipeIngredientPickerModal,
  }))
);

const EMPTY = [];
const ROW_EASE = [0.32, 0.72, 0, 1];

// Food | Recipe: both modes are the same form, so the pill stays the same blue
// as the "Add Custom Food" header in either position (it only glides).
const MODE_OPTIONS = [
  {
    id: 'food',
    label: 'Food',
    icon: Utensils,
    pillClassName: 'bg-accent-blue',
  },
  {
    id: 'recipe',
    label: 'Recipe',
    icon: ChefHat,
    pillClassName: 'bg-accent-blue',
  },
];

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

const CUSTOM_FOOD_TAG_IDS = new Set(CUSTOM_FOOD_TAGS.map((tag) => tag.id));

// Category chips to pre-select when editing a recipe or custom food: its saved
// tags, or its category when it was saved before tags existed. 'custom' is the
// implicit default, never a chip.
const getSavedTagSelection = (item) => {
  const tags = (item?.tags ?? []).filter((tag) => CUSTOM_FOOD_TAG_IDS.has(tag));
  if (tags.length > 0) return tags;
  return CUSTOM_FOOD_TAG_IDS.has(item?.category) ? [item.category] : [];
};

const toNutrientFieldString = (value) => {
  if (value == null || value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : '';
};

// Wheels for per-ounce entry: finer steps than the per-100g lists, split in two
// so they stay short.
const OUNCE_NUTRIENT_WHEELS = {
  calories: buildHundredsWheel({ max: 5000 }),
  protein: buildTenthsWheel({ min: 0, max: 500 }),
  carbs: buildTenthsWheel({ min: 0, max: 500 }),
  fats: buildTenthsWheel({ min: 0, max: 500 }),
  fiber: buildTenthsWheel({ min: 0, max: 200 }),
  sodium: buildHundredsWheel({ max: 5000 }),
  saturatedFats: buildTenthsWheel({ min: 0, max: 200 }),
  sugars: buildTenthsWheel({ min: 0, max: 200 }),
};
const WHOLE_NUMBER_WHEELS = new Set(['calories', 'sodium']);
const LABEL_SERVING_FIELD = {
  ...getPortionWeightField({ isOunce: true }),
  title: 'Label Serving',
};
const DEFAULT_BASIS_OUNCES = 1;

/** A stored per-100g value as form text for a basis of `basisGrams`. */
const toBasisFieldString = (value, basisGrams) => {
  if (basisGrams === 100) return toNutrientFieldString(value);
  const text = toNutrientFieldString(value);
  return text === ''
    ? ''
    : String(roundTo((Number(text) * basisGrams) / 100, 1));
};

const resolveEditablePer100g = (food) => {
  if (food?.per100g && typeof food.per100g === 'object') {
    return food.per100g;
  }
  const grams = Number(food?.grams);
  if (!Number.isFinite(grams) || grams <= 0) {
    return {};
  }
  const scale = (val) => {
    const parsed = Number(val);
    return Number.isFinite(parsed)
      ? Math.round(parsed * (100 / grams) * 10) / 10
      : null;
  };
  return {
    calories: scale(food.calories),
    protein: scale(food.protein),
    carbs: scale(food.carbs),
    fats: scale(food.fats),
    fiber: food.fiber == null ? null : scale(food.fiber),
    sodium: food.sodium == null ? null : scale(food.sodium),
    saturatedFats:
      food.saturatedFats == null ? null : scale(food.saturatedFats),
    sugars: food.sugars == null ? null : scale(food.sugars),
  };
};

export const AddCustomFoodModal = ({
  isOpen,
  isClosing,
  onClose,
  onSaveFood,
  // Recipe mode: `onSaveRecipe(recipe, { log, isEditing })` saves a recipe
  // built from existing foods. `editingRecipe` or `editingFood` opens the form
  // pre-filled (the Food | Recipe switch is hidden then) and enables the
  // corresponding delete action.
  // `userFoods` = the foods the user added this session; the ingredient picker
  // lists them next to favourites, pins and cached foods.
  onSaveRecipe,
  editingRecipe = null,
  onDeleteRecipe,
  editingFood = null,
  onDeleteFood,
  userFoods = EMPTY,
}) => {
  const prefersReducedMotion = useReducedMotionPreference();
  const units = useUnits();
  const foodUnit = units.food;
  const isEditingExisting = Boolean(editingRecipe || editingFood);
  const [mode, setMode] = useState(editingRecipe ? 'recipe' : 'food');
  // Which way the last Food | Recipe switch went (null until the user switches,
  // so opening the form - or opening a recipe to edit - plays no swap
  // animation on top of the modal's own entrance).
  const [swapDirection, setSwapDirection] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [servings, setServings] = useState(1);
  const [cookedWeightGrams, setCookedWeightGrams] = useState('');
  const ingredientPickerModal = useAnimatedModal(false);
  const deleteConfirmModal = useAnimatedModal(false);
  const infoModal = useAnimatedModal(false);
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
  // Nutrition is typed per 100 g, or per a chosen number of ounces (a label's
  // serving), and stored per 100 g either way.
  const [basisOunces, setBasisOunces] = useState(DEFAULT_BASIS_OUNCES);
  const basisGrams = foodUnit.isOunce
    ? basisOunces * foodUnit.gramsPerUnit
    : 100;
  // The stored values of the food being edited: a field the user never changed
  // saves them back exactly.
  const [originalPer100g, setOriginalPer100g] = useState(null);
  const [editedFields, setEditedFields] = useState(() => new Set());

  // Numeric fields open the shared wheel picker (same UX as Manual Entry).
  // The staged config is retained while the picker plays its close animation,
  // so its title/value never flash back to the defaults.
  const numericPickerModal = useAnimatedModal(false);
  const [numericPickerState, setNumericPickerState] = useState(null);

  // Pre-fill when opened to edit a recipe or custom food. Derived during render
  // (keyed by what is being opened) rather than in an effect, so the first
  // painted frame already shows the item and no state is set from an effect on open.
  const openKey = isOpen
    ? (editingRecipe?.id ?? editingFood?.foodId ?? editingFood?.id ?? 'new')
    : null;
  const [seededKey, setSeededKey] = useState(null);
  if (seededKey !== openKey) {
    setSeededKey(openKey);
    if (openKey && editingRecipe) {
      setMode('recipe');
      setName(editingRecipe.name ?? '');
      setSelectedTags(getSavedTagSelection(editingRecipe));
      setIngredients(editingRecipe.ingredients ?? []);
      setServings(editingRecipe.servings ?? 1);
      setCookedWeightGrams(
        editingRecipe.cookedWeightGrams != null
          ? String(editingRecipe.cookedWeightGrams)
          : ''
      );
      setPortions(editingRecipe.portions ?? []);
    } else if (openKey && editingFood) {
      const per100g = resolveEditablePer100g(editingFood);
      setMode('food');
      setName(editingFood.name ?? '');
      setSelectedTags(getSavedTagSelection(editingFood));
      setOriginalPer100g(per100g ?? {});
      setEditedFields(new Set());
      const seed = (value) => toBasisFieldString(value, basisGrams);
      setCalories(seed(per100g?.calories));
      setProtein(seed(per100g?.protein));
      setCarbs(seed(per100g?.carbs));
      setFats(seed(per100g?.fats));
      setFiber(seed(per100g?.fiber));
      setSodium(seed(per100g?.sodium));
      setSaturatedFats(seed(per100g?.saturatedFats));
      setSugars(seed(per100g?.sugars));
      setPortions(
        Array.isArray(editingFood.portions) ? editingFood.portions : []
      );
    }
  }

  // Reset form when modal closes
  React.useEffect(() => {
    if (!isClosing) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setMode('food');
      setSwapDirection(null);
      setIngredients([]);
      setServings(1);
      setCookedWeightGrams('');
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
      setBasisOunces(DEFAULT_BASIS_OUNCES);
      setOriginalPer100g(null);
      setEditedFields(new Set());
    }, 200);

    return () => clearTimeout(timer);
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
      config: getPortionWeightField(foodUnit),
      value: newPortionGrams,
      setValue: setNewPortionGrams,
    },
    basisOunces: {
      config: LABEL_SERVING_FIELD,
      value: String(basisOunces),
    },
  };

  // Changing the basis restates the untouched stored values for the new weight;
  // typed values stay, since they describe whatever weight is chosen.
  const changeBasis = (ounces) => {
    setBasisOunces(ounces);
    if (!originalPer100g) return;
    const grams = ounces * foodUnit.gramsPerUnit;
    Object.entries(numericFields).forEach(([key, field]) => {
      if (key in OUNCE_NUTRIENT_WHEELS && !editedFields.has(key)) {
        field.setValue(toBasisFieldString(originalPer100g[key], grams));
      }
    });
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

    const current = Number.parseFloat(field.value);
    const isEnergy = fieldKey === 'calories' && units.energy.isKj;
    const wheel =
      foodUnit.isOunce && !isEnergy ? OUNCE_NUTRIENT_WHEELS[fieldKey] : null;
    const precision = WHOLE_NUMBER_WHEELS.has(fieldKey) ? 0 : 1;
    const isOunceWeight = foodUnit.isOunce && fieldKey === 'portionGrams';

    window.setTimeout(() => {
      setNumericPickerState({
        fieldKey,
        config: field.config,
        wheel,
        isEnergy,
        precision,
        value: isEnergy
          ? Number.isFinite(current)
            ? current
            : 0
          : wheel
            ? roundTo(Number.isFinite(current) ? current : 0, precision)
            : normalizePickerValue(
                isOunceWeight ? foodUnit.toPicker(current) : current,
                field.config
              ),
      });
      numericPickerModal.open();
    }, 60);
  };

  // Same blur as above, so an open keyboard cannot sit over the info sheet.
  const openInfoModal = () => {
    document.activeElement?.blur?.();
    infoModal.open();
  };

  const handleNumericPickerSave = (nextValue) => {
    const fieldKey = numericPickerState?.fieldKey;
    const field = fieldKey ? numericFields[fieldKey] : null;

    if (!field) {
      numericPickerModal.requestClose();
      return;
    }

    const {
      wheel,
      isEnergy,
      precision,
      value: shownValue,
    } = numericPickerState;
    const normalizedValue =
      wheel || isEnergy
        ? Number(nextValue)
        : normalizePickerValue(Number(nextValue), field.config);

    if (fieldKey === 'basisOunces') {
      changeBasis(normalizedValue);
    } else if (fieldKey === 'portionGrams' && foodUnit.isOunce) {
      const current = Number.parseFloat(field.value);
      field.setValue(
        String(
          foodUnit.fromPicker(
            normalizedValue,
            Number.isFinite(current) ? current : null
          )
        )
      );
    } else if (isEnergy) {
      // The energy picker hands back kcal, and the original when untouched.
      if (normalizedValue !== shownValue) {
        field.setValue(String(normalizedValue));
        setEditedFields((previous) => new Set(previous).add(fieldKey));
      }
    } else {
      // Saving the wheel as it opened leaves the field exactly as it was.
      const isUnchanged = wheel
        ? field.value !== '' && normalizedValue === shownValue
        : isPickerValueUnchanged(field.value, normalizedValue, field.config);
      if (!isUnchanged) {
        field.setValue(
          wheel
            ? String(roundTo(normalizedValue, precision))
            : formatPickerValueForState(normalizedValue, field.config.step)
        );
        setEditedFields((previous) => new Set(previous).add(fieldKey));
      }
    }
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

  // --- Recipe mode ----------------------------------------------------------
  const isRecipeMode = mode === 'recipe';

  const handleSelectMode = (nextMode) => {
    if (nextMode === mode) return;
    // The section swap enters from the side the user is heading to: Recipe
    // from the right, back to Food from the left.
    setSwapDirection(nextMode === 'recipe' ? 'forward' : 'back');
    setMode(nextMode);
  };

  const recipeDraft = useMemo(
    () => ({
      name,
      servings,
      cookedWeightGrams:
        cookedWeightGrams === '' ? null : Number(cookedWeightGrams),
      ingredients,
    }),
    [name, servings, cookedWeightGrams, ingredients]
  );
  const recipeValidation = useMemo(
    () => validateRecipeDraft(recipeDraft, units),
    [recipeDraft, units]
  );
  // Live preview of the derived food (works before the recipe has a name).
  const previewFood = useMemo(
    () =>
      isRecipeMode
        ? buildRecipeFood({
            ...recipeDraft,
            id: 'recipe_preview',
            name: name.trim() || 'Recipe',
          })
        : null,
    [isRecipeMode, recipeDraft, name]
  );

  const handleAddIngredient = useCallback(({ food, grams, portionLabel }) => {
    const ingredient = buildRecipeIngredient({ food, grams, portionLabel });
    if (!ingredient) return;
    setIngredients((prev) =>
      prev.length >= RECIPE_MAX_INGREDIENTS ? prev : [...prev, ingredient]
    );
  }, []);

  const handleChangeIngredientGrams = useCallback((id, grams) => {
    setIngredients((prev) =>
      prev.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, grams } : ingredient
      )
    );
  }, []);

  const handleUpdateIngredient = useCallback((id, { grams, portionLabel }) => {
    setIngredients((prev) =>
      prev.map((ingredient) =>
        ingredient.id === id
          ? { ...ingredient, grams, portionLabel: portionLabel ?? null }
          : ingredient
      )
    );
  }, []);

  const handleRemoveIngredient = useCallback((id) => {
    setIngredients((prev) => prev.filter((ingredient) => ingredient.id !== id));
  }, []);

  const handleChangeServings = useCallback((value) => {
    setServings(
      Math.min(
        RECIPE_MAX_SERVINGS,
        Math.max(RECIPE_MIN_SERVINGS, Math.round(Number(value) || 1))
      )
    );
  }, []);

  const isFormValid = useMemo(() => {
    if (isRecipeMode) return recipeValidation.isValid;
    if (!name.trim()) return false;
    const cal = parseFloat(calories) || 0;
    const prot = parseFloat(protein) || 0;
    const carb = parseFloat(carbs) || 0;
    const fat = parseFloat(fats) || 0;
    // At least one macro or calorie should be set
    return cal > 0 || prot > 0 || carb > 0 || fat > 0;
  }, [isRecipeMode, recipeValidation, name, calories, protein, carbs, fats]);

  const handleSave = useCallback(
    (options = {}) => {
      if (!isFormValid) return;

      // Determine category from selected tags (first one wins) or default to 'custom'
      const category = selectedTags.length > 0 ? selectedTags[0] : 'custom';

      if (isRecipeMode) {
        onSaveRecipe?.(
          {
            id: editingRecipe?.id ?? createRecipeId(),
            name: name.trim(),
            category,
            tags: [...selectedTags],
            servings,
            cookedWeightGrams: recipeDraft.cookedWeightGrams,
            ingredients,
            portions: [...portions],
            createdAt: editingRecipe?.createdAt ?? null,
          },
          { log: options.log === true, isEditing: Boolean(editingRecipe) }
        );
        onClose?.();
        return;
      }

      // `null` is untracked; an unchanged stored value is returned as it was.
      const toPer100g = (key, text) => {
        if (originalPer100g && !editedFields.has(key)) {
          const stored = originalPer100g[key];
          return stored == null || stored === '' ? null : Number(stored);
        }
        if (text === '') return null;
        const typed = parseFloat(text);
        return basisGrams === 100
          ? typed
          : roundTo((typed * 100) / basisGrams, 3);
      };

      const customFood = {
        id:
          editingFood?.foodId ??
          editingFood?.id ??
          `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name.trim(),
        category: category,
        subcategory: null,
        tags: [...selectedTags, 'custom'], // Always include 'custom' internally
        source: 'user',
        isCustom: true,
        per100g: {
          calories: toPer100g('calories', calories) || 0,
          protein: toPer100g('protein', protein) || 0,
          carbs: toPer100g('carbs', carbs) || 0,
          fats: toPer100g('fats', fats) || 0,
          fiber: toPer100g('fiber', fiber),
          sodium: toPer100g('sodium', sodium),
          saturatedFats: toPer100g('saturatedFats', saturatedFats),
          sugars: toPer100g('sugars', sugars),
        },
        portions: portions.length > 0 ? portions : [],
        createdAt: editingFood?.createdAt ?? new Date().toISOString(),
      };

      onSaveFood?.(customFood, {
        log: options.log === true,
        ...(editingFood
          ? { isEditing: true, favouriteId: editingFood.id ?? null }
          : {}),
      });
      onClose?.();
    },
    [
      isFormValid,
      isRecipeMode,
      editingFood,
      editingRecipe,
      recipeDraft,
      ingredients,
      servings,
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
      onSaveRecipe,
      onClose,
      basisGrams,
      editedFields,
      originalPer100g,
    ]
  );

  const pickerField = numericPickerState?.config;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        onClose={onClose}
        contentClassName="w-full md:max-w-2xl h-[min(88dvh,800px)] flex flex-col overflow-hidden! p-0"
      >
        <div className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6">
          {/* Header: the icon + title swap with a short fade/rise when the mode
              changes (re-keyed, enter-only - the same idiom as the app header's
              stat line). Not on open, so it never doubles the modal's entrance. */}
          <div
            className={`flex items-center justify-between gap-3 ${
              isEditingExisting ? '' : 'mb-4'
            }`}
          >
            <div
              key={`title-${mode}`}
              className={`flex items-center gap-3 ${
                swapDirection ? 'header-stat-in' : ''
              }`}
            >
              {isRecipeMode ? (
                <ChefHat className="text-accent-blue" size={28} />
              ) : (
                <Utensils className="text-accent-blue" size={28} />
              )}
              <h3 className="text-foreground font-bold text-2xl">
                {isRecipeMode
                  ? editingRecipe
                    ? 'Edit Recipe'
                    : 'New Recipe'
                  : editingFood
                    ? 'Edit Custom Food'
                    : 'Add Custom Food'}
              </h3>
            </div>
            {/* Outside the re-keyed title so it stays put on a mode switch. The
                padding / negative margin widens the tap target only. */}
            <button
              type="button"
              onClick={openInfoModal}
              aria-label="Custom food info"
              className="-m-2 shrink-0 rounded-full p-2 text-muted transition-all pressable-inline focus-ring md:hover:text-foreground"
            >
              <HelpCircle size={20} />
            </button>
          </div>

          {/* Food | Recipe: one door for "make my own food", two ways to fill it
              in. A sliding pill (the Food Search Local | Online grammar). Hidden
              while editing an existing item (its type cannot change). */}
          {isEditingExisting ? null : (
            <SegmentedToggle
              ariaLabel="Food type"
              options={MODE_OPTIONS}
              value={mode}
              onChange={handleSelectMode}
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 [scrollbar-gutter:stable] scrollbar-thin scrollbar-thumb-[rgb(var(--border)/0.7)] scrollbar-track-[rgb(var(--surface)/1)]">
          <div className="space-y-5">
            {/* Food Name */}
            <div>
              <label className="block text-foreground text-sm font-semibold mb-2">
                {isRecipeMode ? 'Recipe Name' : 'Food Name'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  isRecipeMode ? 'e.g., Beef bowl' : "e.g., Mom's Chicken Curry"
                }
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

            {/* Nutrition per 100g (Food) / ingredients + servings (Recipe).
              Re-keyed by mode so the section remounts, and - once the user has
              switched - its blocks ease in from the side they are heading to
              (the Settings page-enter idiom: staggered children, enter-only,
              reduced-motion safe). Each branch's root holds the blocks as its
              direct children, which is what that animation targets. */}
            <div
              key={mode}
              className={
                swapDirection === 'forward'
                  ? 'settings-page-enter'
                  : swapDirection === 'back'
                    ? 'settings-page-back'
                    : undefined
              }
            >
              {isRecipeMode ? (
                <RecipeIngredientsSection
                  ingredients={ingredients}
                  servings={servings}
                  cookedWeightGrams={cookedWeightGrams}
                  previewFood={previewFood}
                  validation={recipeValidation}
                  userFoods={userFoods}
                  onAddIngredient={ingredientPickerModal.open}
                  onEditIngredient={handleUpdateIngredient}
                  onChangeIngredientGrams={handleChangeIngredientGrams}
                  onRemoveIngredient={handleRemoveIngredient}
                  onChangeServings={handleChangeServings}
                  onChangeCookedWeight={setCookedWeightGrams}
                />
              ) : (
                <div className="space-y-5">
                  <div>
                    {foodUnit.isOunce ? (
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="block text-foreground text-sm font-semibold">
                          Nutrition per
                        </label>
                        <button
                          type="button"
                          onClick={() => openNumericPicker('basisOunces')}
                          className="bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                          aria-label="Open label serving picker"
                        >
                          <span className="font-medium text-sm">
                            {foodUnit.format(basisGrams)}
                          </span>
                          <ChevronsUpDown
                            size={14}
                            className="text-muted shrink-0"
                          />
                        </button>
                      </div>
                    ) : (
                      <label className="block text-foreground text-sm font-semibold mb-2">
                        Nutrition {foodUnit.basisLabel}
                      </label>
                    )}

                    {/* Calories */}
                    <div className="mb-3">
                      <label className="block text-muted text-xs mb-1.5">
                        {units.energy.noun}
                      </label>
                      <button
                        type="button"
                        onClick={() => openNumericPicker('calories')}
                        className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
                        aria-label="Open calories picker"
                      >
                        <span className="font-medium text-base">
                          {formatEnergyFieldValue(calories, units.energy)}
                        </span>
                        <ChevronsUpDown
                          size={16}
                          className="text-muted shrink-0"
                        />
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
                          <ChevronsUpDown
                            size={14}
                            className="text-muted shrink-0"
                          />
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
                          <ChevronsUpDown
                            size={14}
                            className="text-muted shrink-0"
                          />
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
                          <ChevronsUpDown
                            size={14}
                            className="text-muted shrink-0"
                          />
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
                          <ChevronsUpDown
                            size={14}
                            className="text-muted shrink-0"
                          />
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
                          <ChevronsUpDown
                            size={14}
                            className="text-muted shrink-0"
                          />
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
                          <ChevronsUpDown
                            size={14}
                            className="text-muted shrink-0"
                          />
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
                          <ChevronsUpDown
                            size={14}
                            className="text-muted shrink-0"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Custom Portions */}
            <div>
              <label className="block text-foreground text-sm font-semibold mb-2">
                Custom Portions{' '}
                <span className="text-muted text-xs font-normal">
                  (optional)
                </span>
              </label>

              {/* Existing portions list: rows expand in / collapse out as they
                are added / removed, so the form below glides instead of
                jumping by a row. Each row carries its own bottom gap (inside
                the collapsing wrapper), so the gap collapses with it. */}
              <div className="mb-1">
                <AnimatePresence initial={false}>
                  {portions.map((portion) => (
                    <motion.div
                      key={portion.id}
                      initial={
                        prefersReducedMotion ? false : { height: 0, opacity: 0 }
                      }
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={
                        prefersReducedMotion
                          ? undefined
                          : { height: 0, opacity: 0 }
                      }
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : {
                              height: { duration: 0.24, ease: ROW_EASE },
                              opacity: { duration: 0.18, ease: 'easeOut' },
                            }
                      }
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="pb-2">
                        <div className="flex items-center justify-between bg-surface/60 border border-border rounded-lg px-3 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-foreground font-medium text-sm">
                              {portion.label}
                            </span>
                            <span className="text-muted text-sm">
                              (
                              {foodUnit.format(portion.grams, { space: false })}
                              )
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
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

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
                  <label className="block text-muted text-xs mb-1.5">
                    {foodUnit.isOunce ? 'Ounces' : 'Grams'}
                  </label>
                  <button
                    type="button"
                    onClick={() => openNumericPicker('portionGrams')}
                    className="w-full bg-surface-highlight text-foreground px-2.5 py-2.5 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline text-sm"
                    aria-label={
                      foodUnit.isOunce
                        ? 'Open portion weight picker'
                        : 'Open portion grams picker'
                    }
                  >
                    <span className="font-medium">
                      {formatPickerDisplayValue(
                        foodUnit.isOunce && newPortionGrams
                          ? foodUnit.toPicker(newPortionGrams)
                          : newPortionGrams,
                        foodUnit.unit
                      )}
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
          </div>
        </div>

        {/* Actions - same hierarchy as the Manual Entry modal: one dominant
            primary above two quiet secondary actions. */}
        <div className="shrink-0 border-t border-border/60 px-6 pb-6 pt-3">
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={!isFormValid}
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-xs transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:brightness-110"
            >
              {/* Re-keyed so the label eases in when the mode changes. */}
              <span
                key={`save-${mode}`}
                className={`inline-block ${swapDirection ? 'header-stat-in' : ''}`}
              >
                {isRecipeMode
                  ? editingRecipe
                    ? 'Save changes'
                    : 'Save recipe'
                  : editingFood
                    ? 'Save changes'
                    : 'Save food'}
              </span>
            </button>
            <div
              className={`grid gap-1.5 ${
                !isEditingExisting ||
                (editingRecipe && onDeleteRecipe) ||
                (editingFood && onDeleteFood)
                  ? 'grid-cols-2'
                  : 'grid-cols-1'
              }`}
            >
              <button
                type="button"
                onClick={() => onClose?.()}
                className="rounded-xl bg-surface-highlight px-2.5 py-2 text-[12px] font-semibold text-foreground transition-all press-feedback focus-ring md:hover:bg-surface"
              >
                Cancel
              </button>
              {isEditingExisting ? (
                (editingRecipe && onDeleteRecipe) ||
                (editingFood && onDeleteFood) ? (
                  <button
                    type="button"
                    onClick={deleteConfirmModal.open}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-accent-red/10 px-2.5 py-2 text-[12px] font-semibold text-accent-red transition-all press-feedback focus-ring md:hover:bg-accent-red/15"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {editingRecipe ? 'Delete recipe' : 'Delete food'}
                  </button>
                ) : null
              ) : (
                <button
                  type="button"
                  onClick={() => handleSave({ log: true })}
                  disabled={!isFormValid}
                  className="rounded-xl bg-accent-blue/10 px-2.5 py-2 text-[12px] font-semibold text-accent-blue transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:bg-accent-blue/15"
                >
                  Save &amp; log
                </button>
              )}
            </div>
          </div>
        </div>
      </ModalShell>

      <AddCustomFoodInfoModal
        isOpen={infoModal.isOpen}
        isClosing={infoModal.isClosing}
        onClose={infoModal.requestClose}
      />

      <DualWheelModal
        isOpen={numericPickerModal.isOpen && Boolean(numericPickerState?.wheel)}
        isClosing={numericPickerModal.isClosing}
        title={pickerField?.title ?? 'Select Value'}
        unitLabel={pickerField?.unitLabel ?? ''}
        value={numericPickerState?.value ?? 0}
        config={numericPickerState?.wheel}
        onCancel={numericPickerModal.requestClose}
        onSave={handleNumericPickerSave}
      />

      <EnergyPickerModal
        isOpen={
          numericPickerModal.isOpen && Boolean(numericPickerState?.isEnergy)
        }
        isClosing={numericPickerModal.isClosing}
        value={numericPickerState?.value ?? 0}
        onCancel={numericPickerModal.requestClose}
        onSave={handleNumericPickerSave}
      />

      <NumericValuePickerModal
        isOpen={
          numericPickerModal.isOpen &&
          !numericPickerState?.wheel &&
          !numericPickerState?.isEnergy
        }
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

      {ingredientPickerModal.isOpen || ingredientPickerModal.isClosing ? (
        <Suspense fallback={null}>
          <RecipeIngredientPickerModal
            isOpen={ingredientPickerModal.isOpen}
            isClosing={ingredientPickerModal.isClosing}
            onClose={ingredientPickerModal.requestClose}
            onPickIngredient={handleAddIngredient}
            ingredients={ingredients}
            ingredientCount={ingredients.length}
            onEditIngredient={handleUpdateIngredient}
            onRemoveIngredient={handleRemoveIngredient}
            customFoods={userFoods}
          />
        </Suspense>
      ) : null}

      <ConfirmActionModal
        isOpen={deleteConfirmModal.isOpen}
        isClosing={deleteConfirmModal.isClosing}
        title={
          editingRecipe ? 'Delete this recipe?' : 'Delete this custom food?'
        }
        description={
          editingRecipe
            ? 'The recipe is removed from your foods. Meals you already logged with it keep their calories and macros.'
            : 'This custom food is removed from your favourites and search. Meals you already logged with it keep their calories and macros.'
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => {
          deleteConfirmModal.requestClose();
          if (editingRecipe) {
            onDeleteRecipe?.(editingRecipe);
          } else if (editingFood) {
            onDeleteFood?.(editingFood);
          }
          onClose?.();
        }}
        onCancel={deleteConfirmModal.requestClose}
      />
    </>
  );
};
