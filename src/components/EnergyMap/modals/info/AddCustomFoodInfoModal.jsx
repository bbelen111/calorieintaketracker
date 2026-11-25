import React from 'react';
import { ChefHat, Info, Utensils, X } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { RECIPE_MAX_SERVING_GRAMS } from '../../../../utils/food/recipe';
import { useUnits } from '../../../../hooks/useUnits';

/**
 * Read-only explainer for the "Add Custom Food" form (Food and Recipe modes).
 */
export const AddCustomFoodInfoModal = ({ isOpen, isClosing, onClose }) => {
  const { food: foodUnit } = useUnits();

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="shrink-0 text-accent-blue" />
          <h3 className="text-foreground font-bold text-xl">
            Custom Foods &amp; Recipes
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
          aria-label="Close custom food info"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-muted">
        <p>
          <span className="font-bold text-foreground">Custom foods</span> cover
          anything search doesn&apos;t have. Choose{' '}
          <span className="text-foreground font-semibold">Food</span> if you
          know its nutrition, or{' '}
          <span className="text-foreground font-semibold">Recipe</span> to build
          a dish out of other foods.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-foreground font-bold">
            <Utensils size={18} className="text-accent-blue" />
            <span>Food</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {foodUnit.isOunce ? (
              <li>
                Set{' '}
                <span className="text-foreground font-semibold">
                  Nutrition per
                </span>{' '}
                to the weight your numbers are for (the label&apos;s serving, or
                1 oz), then enter them.
              </li>
            ) : (
              <li>
                Enter every value{' '}
                <span className="text-foreground font-semibold">per 100 g</span>
                . If the label only lists a serving, use value × 100 ÷ serving
                grams.
              </li>
            )}
            <li>
              It needs a name and at least calories or one macro. Calories are
              not calculated from the macros, so enter them too.
            </li>
            <li>
              Fiber, sodium, saturated fat and sugars are optional. One you
              never set is saved as untracked, even though it reads 0. If the
              food really has none, open that field and save 0.
            </li>
          </ul>
        </div>

        <div className="bg-surface-highlight/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-foreground font-bold">
            <ChefHat size={18} className="text-accent-blue" />
            <span>Recipe</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>
              Add each ingredient with its weight, then set how many servings
              the dish makes. Nutrition per serving updates as you go.
            </li>
            <li>
              <span className="text-foreground font-semibold">
                Cooked weight
              </span>{' '}
              is optional. It matters if you log the dish by grams; one serving
              stays the same either way.
            </li>
            <li>
              A serving can weigh up to{' '}
              {foodUnit.format(RECIPE_MAX_SERVING_GRAMS)}. If yours is heavier,
              add more servings.
            </li>
            <li>
              If any ingredient is missing fiber, sodium, saturated fat or
              sugars, the recipe leaves that value untracked.
            </li>
          </ul>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-bold text-accent-blue">Category and portions</p>
          <p>
            A category is optional. If you pick several, the first one is the
            main category.
          </p>
          <p>
            Custom portions, such as &quot;1 bowl&quot;, become quick choices
            when you log. Tap the plus button to add each one to the list.
          </p>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-bold text-accent-blue">Saving</p>
          <p>
            <span className="text-foreground font-semibold">Save</span> keeps it
            for later.{' '}
            <span className="text-foreground font-semibold">
              Save &amp; log
            </span>{' '}
            also opens the portion screen so you can log it now (a recipe starts
            at one serving).
          </p>
          <p>
            <span className="text-foreground font-semibold">Custom foods</span>{' '}
            appear in Local search and Favourites. Edit or delete them from
            Favourites.
          </p>
          <p>
            <span className="text-foreground font-semibold">Recipes</span>{' '}
            appear in Local search. Use the edit button beside one to change or
            delete it.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-xs">
          <span className="text-foreground font-semibold">Note:</span> Editing
          or deleting a food or recipe doesn&apos;t change meals you already
          logged. A recipe also keeps its own copy of each ingredient&apos;s
          nutrition from when you added it.
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-lg transition-all press-feedback focus-ring font-medium md:hover:brightness-110"
        >
          Got it
        </button>
      </div>
    </ModalShell>
  );
};
