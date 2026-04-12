import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, Trash2, Utensils, X } from 'lucide-react';
import { formatOne } from '../../../../../utils/formatting/format';
import { formatFoodDisplayName } from '../../../../../utils/food/foodPresentation';

const shortenName = (name, maxLength = 36) => {
  if (typeof name !== 'string') return name ?? '';
  if (name.length <= maxLength) return name;
  return `${name.slice(0, maxLength - 1)}…`;
};

export const FoodSearchMealPreviewPanel = ({
  isOpen,
  onClose,
  mealLabel,
  mealEntries,
  onEditMealEntry,
  onDeleteMealEntry,
}) => {
  if (!isOpen) {
    return null;
  }

  const safeEntries = Array.isArray(mealEntries) ? mealEntries : [];

  return (
    <div className="fixed inset-0 z-[1250]">
      <motion.button
        type="button"
        aria-label="Close meal preview"
        className="absolute inset-0 bg-surface/70"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 18 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-2xl rounded-t-2xl border border-border bg-surface shadow-2xl"
        style={{
          maxHeight: '74vh',
          paddingBottom: 'calc(1rem + var(--sab))',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Utensils size={18} className="text-accent-blue" />
            <h4 className="text-foreground font-semibold truncate">
              Current {mealLabel}
            </h4>
            <span className="text-xs text-muted">
              ({safeEntries.length}{' '}
              {safeEntries.length === 1 ? 'item' : 'items'})
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted md:hover:text-foreground md:hover:bg-surface-highlight pressable-inline focus-ring"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          {safeEntries.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface-highlight/60 p-4 text-center">
              <p className="text-muted text-sm">No foods in this meal yet.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {safeEntries.map((entry, idx) => (
                <motion.div
                  key={`meal-preview-${entry?.id ?? idx}`}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="bg-surface-highlight rounded-lg p-3 border border-border/50 flex justify-between items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground/80 font-semibold text-sm truncate">
                      <span
                        className="align-middle"
                        title={formatFoodDisplayName({
                          name: entry?.name,
                          brand: entry?.brand,
                        })}
                      >
                        {shortenName(
                          formatFoodDisplayName({
                            name: entry?.name,
                            brand: entry?.brand,
                          })
                        )}
                      </span>
                      {entry && entry.grams != null && (
                        <span className="ml-2 text-muted text-xs align-middle">
                          {formatOne(entry.grams)} g
                        </span>
                      )}
                    </p>
                    <p className="text-muted text-xs">
                      <span className="text-accent-emerald">
                        {formatOne(entry?.calories || 0)} kcal
                      </span>
                      {' - '}
                      <span className="text-accent-red">
                        {formatOne(entry?.protein || 0)} p
                      </span>
                      {' - '}
                      <span className="text-accent-yellow">
                        {formatOne(entry?.fats || 0)} f
                      </span>
                      {' - '}
                      <span className="text-accent-amber">
                        {formatOne(entry?.carbs || 0)} c
                      </span>
                    </p>
                  </div>

                  {(onEditMealEntry || onDeleteMealEntry) && (
                    <div className="flex items-end gap-4">
                      {onEditMealEntry && (
                        <button
                          type="button"
                          onClick={() => onEditMealEntry(entry)}
                          className="text-foreground/80 transition-all pressable-inline focus-ring md:hover:text-foreground md:hover:scale-110"
                          aria-label="Edit meal entry"
                        >
                          <Edit3 size={20} />
                        </button>
                      )}
                      {onDeleteMealEntry && (
                        <button
                          type="button"
                          onClick={() => onDeleteMealEntry(entry)}
                          className="text-accent-red transition-all pressable-inline focus-ring md:hover:text-accent-red md:hover:scale-110"
                          aria-label="Delete meal entry"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
};
