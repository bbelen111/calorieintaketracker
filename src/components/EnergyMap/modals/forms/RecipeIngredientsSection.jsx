import React, { Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronsUpDown,
  Edit3,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { MicroStat } from '../../common/MicroStat';
import { NumericValuePickerModal } from '../pickers/NumericValuePickerModal';
import { SettingsReveal } from '../fullscreen/SettingsReveal';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { useReducedMotionPreference } from '../../../../hooks/useMotionMode';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { formatOne } from '../../../../utils/formatting/format';
import { formatFoodDisplayName } from '../../../../utils/food/foodPresentation';
import { scaleMacrosFromPer100g } from '../../../../utils/food/portionNormalization';
import {
  RECIPE_COOKED_WEIGHT_PICKER_FIELD,
  formatPickerDisplayValue,
  formatPickerValueForState,
  normalizePickerValue,
} from '../../../../utils/food/nutrientPicker';
import {
  RECIPE_MAX_SERVINGS,
  RECIPE_MIN_SERVINGS,
  favouriteToIngredientFood,
} from '../../../../utils/food/recipe';

const FoodPortionModal = React.lazy(() =>
  import('../pickers/FoodPortionModal').then((module) => ({
    default: module.FoodPortionModal,
  }))
);

const MODAL_CLOSE_DELAY = 180;
const EMPTY = [];

const PICKER_BUTTON_CLASS =
  'flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-highlight/70 text-left text-foreground transition-all focus-ring pressable-inline md:hover:border-muted/50';

const STEPPER_BUTTON_CLASS =
  'flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:text-muted md:hover:bg-surface';

const ROW_EASE = [0.32, 0.72, 0, 1];

const shortenName = (name, maxLength = 36) => {
  if (typeof name !== 'string') return name ?? '';
  if (name.length <= maxLength) return name;
  return `${name.slice(0, maxLength - 1)}…`;
};

const ingredientToPortionFood = (ingredient) => ({
  id: ingredient.foodId ?? ingredient.id,
  name: ingredient.name,
  brand: ingredient.brand ?? null,
  category: ingredient.category ?? 'custom',
  source: ingredient.source ?? null,
  per100g: ingredient.per100g,
  portions: [],
});

/**
 * A number that ticks (the short fade/rise the app uses when a header stat
 * changes) ONLY when its text changes after it has mounted - so a value that is
 * simply appearing, or already there when the section opens, stays still.
 * Change is detected during render (a derived "previous value"), and the
 * element is re-keyed so the CSS animation restarts on every change.
 */
const TickValue = ({ text, as: Tag = 'p', className = '' }) => {
  const [previousText, setPreviousText] = useState(text);
  const [tick, setTick] = useState(0);
  if (previousText !== text) {
    setPreviousText(text);
    setTick((current) => current + 1);
  }

  return (
    <Tag
      key={tick}
      className={`${className} ${tick > 0 ? 'header-stat-in' : ''}`.trim()}
    >
      {text}
    </Tag>
  );
};

/**
 * The Recipe half of the "Add Custom Food" form: the ingredient list, the
 * servings stepper, a live per-serving summary, and the optional cooked weight.
 *
 * It owns no recipe data - the parent keeps `ingredients` / `servings` /
 * `cookedWeightGrams` and the derived `previewFood`, and this component only
 * renders them and reports edits. The numeric wheel (ingredient weight, cooked
 * weight) is the shared `NumericValuePickerModal`, never a free-text input.
 *
 * The root is ONE wrapper whose children are the blocks: the parent's
 * directional enter animation (`settings-page-enter`) staggers exactly those.
 *
 * Motion, all of it reduced-motion safe: ingredient rows expand / collapse as
 * they are added / removed, the empty state, the advanced disclosure, the
 * summary swap and every validation message are height-and-fade reveals
 * (`SettingsReveal`), and numbers tick when they change.
 */
export const RecipeIngredientsSection = ({
  ingredients,
  servings,
  cookedWeightGrams,
  previewFood,
  validation,
  userFoods = EMPTY,
  onAddIngredient,
  onEditIngredient,
  onChangeIngredientGrams,
  onRemoveIngredient,
  onChangeServings,
  onChangeCookedWeight,
}) => {
  const reduceMotion = useReducedMotionPreference();
  const [showAdvanced, setShowAdvanced] = useState(
    () => String(cookedWeightGrams ?? '') !== ''
  );

  // The staged picker config is retained while the wheel plays its close
  // animation, so its title/value never flash back to defaults.
  const pickerModal = useAnimatedModal(false);
  const [pickerState, setPickerState] = useState(null);

  const portionModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [portionFood, setPortionFood] = useState(null);

  useEffect(() => {
    if (!portionModal.isClosing) return undefined;
    const timer = setTimeout(() => {
      setEditingIngredient(null);
      setPortionFood(null);
    }, MODAL_CLOSE_DELAY + 50);
    return () => clearTimeout(timer);
  }, [portionModal.isClosing]);

  const openPicker = (target, config, currentValue) => {
    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }

    window.setTimeout(() => {
      setPickerState({
        target,
        config,
        value: normalizePickerValue(Number.parseFloat(currentValue), config),
      });
      pickerModal.open();
    }, 60);
  };

  const handlePickerSave = (nextValue) => {
    const target = pickerState?.target;
    const config = pickerState?.config;
    if (target && config) {
      const normalized = normalizePickerValue(Number(nextValue), config);
      if (target.kind === 'cooked') {
        onChangeCookedWeight?.(
          formatPickerValueForState(normalized, config.step)
        );
      }
    }
    pickerModal.requestClose();
  };

  const handleOpenIngredientPortion = async (ingredient) => {
    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }

    let resolvedFood = null;
    if (ingredient.foodId) {
      const { cachedFoods, foodFavourites } = useEnergyMapStore.getState();
      const fromUserFoods = userFoods.find(
        (item) => item?.id === ingredient.foodId
      );
      const fromCached = (cachedFoods ?? []).find(
        (item) => item?.id === ingredient.foodId
      );
      const fromFavourites = (foodFavourites ?? [])
        .map(favouriteToIngredientFood)
        .find((item) => item?.id === ingredient.foodId);

      resolvedFood = fromUserFoods || fromCached || fromFavourites || null;

      if (!resolvedFood) {
        try {
          const { getFoodById } =
            await import('../../../../services/foodCatalog');
          resolvedFood = await getFoodById(ingredient.foodId);
        } catch {
          resolvedFood = null;
        }
      }
    }

    setEditingIngredient(ingredient);
    setPortionFood(
      resolvedFood?.per100g ? resolvedFood : ingredientToPortionFood(ingredient)
    );
    portionModal.open();
  };

  const handleConfirmIngredientPortion = ({ grams, portionLabel }) => {
    if (editingIngredient) {
      if (typeof onEditIngredient === 'function') {
        onEditIngredient(editingIngredient.id, { grams, portionLabel });
      } else {
        onChangeIngredientGrams?.(editingIngredient.id, grams);
      }
    }
    portionModal.requestClose();
  };

  const perServing = previewFood
    ? scaleMacrosFromPer100g(previewFood.per100g, previewFood.servingGrams)
    : null;
  const hasCookedWeight = String(cookedWeightGrams ?? '') !== '';
  const pickerConfig = pickerState?.config;
  const errors = validation?.errors ?? {};

  // Reduced / off motion: no `exit` at all, so AnimatePresence removes a row the
  // moment it leaves the list instead of waiting on an exit phase.
  const rowMotion = reduceMotion
    ? {
        initial: false,
        exit: undefined,
        transition: { duration: 0 },
      }
    : {
        initial: { height: 0, opacity: 0 },
        exit: { height: 0, opacity: 0 },
        transition: {
          height: { duration: 0.24, ease: ROW_EASE },
          opacity: { duration: 0.18, ease: 'easeOut' },
        },
      };

  return (
    <div className="space-y-5">
      {/* Ingredients */}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label className="block text-sm font-semibold text-foreground">
            Ingredients
          </label>
          {ingredients.length > 0 ? (
            <TickValue
              as="span"
              className="inline-block text-xs"
              text={`${ingredients.length} ${
                ingredients.length === 1 ? 'ingredient' : 'ingredients'
              }`}
            />
          ) : null}
        </div>

        <SettingsReveal open={ingredients.length === 0} className="pb-2">
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
            Add the foods that go into this recipe and the nutrition adds up for
            you.
          </p>
        </SettingsReveal>

        <ul className="mb-1">
          <AnimatePresence initial={false}>
            {ingredients.map((ingredient) => {
              const displayName = formatFoodDisplayName({
                name: ingredient.name,
                brand: ingredient.brand,
              });
              const scaled = scaleMacrosFromPer100g(
                ingredient.per100g,
                ingredient.grams
              );

              return (
                <motion.li
                  key={ingredient.id}
                  initial={rowMotion.initial}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={rowMotion.exit}
                  transition={rowMotion.transition}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="pb-2">
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-surface-highlight/75 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground/80">
                          <span className="align-middle" title={displayName}>
                            {shortenName(displayName)}
                          </span>
                          {ingredient.grams != null ? (
                            <span className="ml-2 align-middle text-xs text-muted">
                              {formatOne(ingredient.grams)} g
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted">
                          <span className="text-accent-emerald">
                            {formatOne(scaled.calories || 0)} kcal
                          </span>
                          {' - '}
                          <span className="text-accent-red">
                            {formatOne(scaled.protein || 0)} p
                          </span>
                          {' - '}
                          <span className="text-accent-yellow">
                            {formatOne(scaled.fats || 0)} f
                          </span>
                          {' - '}
                          <span className="text-accent-amber">
                            {formatOne(scaled.carbs || 0)} c
                          </span>
                        </p>
                      </div>
                      <div className="flex items-end gap-4">
                        <button
                          type="button"
                          onClick={() =>
                            void handleOpenIngredientPortion(ingredient)
                          }
                          aria-label={`Edit ${ingredient.name}`}
                          className="text-foreground/80 transition-all pressable-inline focus-ring md:hover:scale-110 md:hover:text-foreground"
                        >
                          <Edit3 size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveIngredient?.(ingredient.id)}
                          aria-label={`Remove ${ingredient.name}`}
                          className="text-accent-red transition-all pressable-inline focus-ring md:hover:scale-110 md:hover:text-accent-red"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        <button
          type="button"
          onClick={onAddIngredient}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue/10 px-3 py-2.5 text-[13px] font-semibold text-accent-blue transition-all press-feedback focus-ring md:hover:bg-accent-blue/15"
        >
          <Plus size={16} aria-hidden="true" />
          Add ingredient
        </button>

        <SettingsReveal
          open={Boolean(errors.ingredients) && ingredients.length > 0}
          className="pt-2"
        >
          <p role="alert" className="text-xs text-accent-red">
            {errors.ingredients}
          </p>
        </SettingsReveal>
      </div>

      {/* Servings */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-foreground">
          Servings
        </label>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-highlight/70 px-3 py-2">
          <span className="text-xs text-muted">
            How many portions does this make?
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChangeServings?.(servings - 1)}
              disabled={servings <= RECIPE_MIN_SERVINGS}
              aria-label="Decrease servings"
              className={STEPPER_BUTTON_CLASS}
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <span
              aria-live="polite"
              aria-label={`${servings} servings`}
              className="min-w-6 text-center"
            >
              <TickValue
                as="span"
                className="inline-block text-base font-bold text-foreground"
                text={String(servings)}
              />
            </span>
            <button
              type="button"
              onClick={() => onChangeServings?.(servings + 1)}
              disabled={servings >= RECIPE_MAX_SERVINGS}
              aria-label="Increase servings"
              className={STEPPER_BUTTON_CLASS}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <SettingsReveal open={Boolean(errors.servingWeight)} className="pt-2">
          <p role="alert" className="text-xs text-accent-red">
            {errors.servingWeight}
          </p>
        </SettingsReveal>
      </div>

      {/* Live nutrition: the placeholder and the numbers trade places with a
          height reveal, so the card grows / shrinks instead of snapping. */}
      <div className="rounded-xl border border-border bg-surface-highlight/70 p-4">
        <p className="text-center text-xs text-muted">
          {perServing ? 'Per serving' : 'Nutrition per serving'}
        </p>
        <SettingsReveal open={!perServing} className="pt-3">
          <p className="text-center text-sm text-muted">
            Add an ingredient to see the nutrition.
          </p>
        </SettingsReveal>
        <SettingsReveal open={Boolean(perServing)} className="pt-3">
          {perServing ? (
            <>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <TickValue
                    className="text-2xl font-bold text-accent-emerald"
                    text={formatOne(perServing.calories)}
                  />
                  <p className="text-xs text-muted">kcal</p>
                </div>
                <div>
                  <TickValue
                    className="text-2xl font-bold text-accent-red"
                    text={`${formatOne(perServing.protein)}g`}
                  />
                  <p className="text-xs text-muted">protein</p>
                </div>
                <div>
                  <TickValue
                    className="text-2xl font-bold text-accent-amber"
                    text={`${formatOne(perServing.carbs)}g`}
                  />
                  <p className="text-xs text-muted">carbs</p>
                </div>
                <div>
                  <TickValue
                    className="text-2xl font-bold text-accent-yellow"
                    text={`${formatOne(perServing.fats)}g`}
                  />
                  <p className="text-xs text-muted">fats</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border/70 pt-3">
                <MicroStat
                  label="Fiber"
                  value={perServing.fiber}
                  unit="g"
                  colorClass="text-accent-green"
                />
                <MicroStat
                  label="Sodium"
                  value={perServing.sodium}
                  unit="mg"
                  colorClass="text-accent-indigo"
                />
                <MicroStat
                  label="Sat. Fat"
                  value={perServing.saturatedFats}
                  unit="g"
                  colorClass="text-accent-yellow"
                />
                <MicroStat
                  label="Sugars"
                  value={perServing.sugars}
                  unit="g"
                  colorClass="text-accent-pink"
                />
              </div>
              <TickValue
                className="mt-3 text-center text-xs text-muted"
                text={`1 serving ≈ ${formatOne(previewFood.servingGrams)} g · ${formatOne(
                  previewFood.totalGrams
                )} g total · ${formatOne(previewFood.per100g.calories)} kcal / 100 g`}
              />
            </>
          ) : null}
        </SettingsReveal>
      </div>

      {/* Cooked weight (advanced) */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((previous) => !previous)}
          aria-expanded={showAdvanced}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-foreground focus-ring"
        >
          <span>
            Cooked weight{' '}
            <span className="text-xs font-normal text-muted">(optional)</span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-muted transition-transform duration-200 ${
              showAdvanced ? 'rotate-180' : ''
            }`}
          />
        </button>
        <SettingsReveal open={showAdvanced} className="pt-2">
          <p className="mb-2 text-xs text-muted">
            Food gains or loses water when it cooks. Weigh the finished dish if
            you log by grams; one serving stays the same either way. Leave empty
            to use the ingredient weights.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                openPicker(
                  { kind: 'cooked' },
                  RECIPE_COOKED_WEIGHT_PICKER_FIELD,
                  cookedWeightGrams
                )
              }
              aria-label="Open cooked weight picker"
              className={`${PICKER_BUTTON_CLASS} flex-1 px-4 py-3`}
            >
              <span className="text-base font-medium">
                {hasCookedWeight
                  ? formatPickerDisplayValue(cookedWeightGrams, 'g')
                  : 'Use ingredient weights'}
              </span>
              <ChevronsUpDown size={16} className="shrink-0 text-muted" />
            </button>
            {hasCookedWeight ? (
              <button
                type="button"
                onClick={() => onChangeCookedWeight?.('')}
                aria-label="Clear cooked weight"
                className="shrink-0 rounded-lg p-2 text-muted transition-colors pressable-inline focus-ring md:hover:text-foreground"
              >
                <X size={18} />
              </button>
            ) : null}
          </div>
          <SettingsReveal open={Boolean(errors.cookedWeight)} className="pt-2">
            <p role="alert" className="text-xs text-accent-red">
              {errors.cookedWeight}
            </p>
          </SettingsReveal>
        </SettingsReveal>
      </div>

      <NumericValuePickerModal
        isOpen={pickerModal.isOpen}
        isClosing={pickerModal.isClosing}
        title={pickerConfig?.title ?? 'Select Value'}
        value={pickerState?.value ?? 0}
        min={pickerConfig?.min ?? 0}
        max={pickerConfig?.max ?? 100}
        step={pickerConfig?.step ?? 1}
        unitLabel={pickerConfig?.unitLabel ?? ''}
        onCancel={pickerModal.requestClose}
        onSave={handlePickerSave}
      />

      {portionModal.isOpen || portionModal.isClosing ? (
        <Suspense fallback={null}>
          <FoodPortionModal
            isOpen={portionModal.isOpen}
            isClosing={portionModal.isClosing}
            onClose={portionModal.requestClose}
            selectedFood={portionFood}
            initialGrams={editingIngredient?.grams}
            isEditing
            ingredientMode
            confirmLabel="Save changes"
            onConfirmIngredient={handleConfirmIngredientPortion}
          />
        </Suspense>
      ) : null}
    </div>
  );
};
