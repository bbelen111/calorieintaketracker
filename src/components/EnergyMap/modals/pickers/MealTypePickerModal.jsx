import React, { useEffect, useRef, useState } from 'react';
import { Utensils, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  MEAL_TYPE_ORDER,
  getMealTypeById,
} from '../../../../constants/meal/mealTypes';

const FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS = [
  {
    id: 'search_local',
    label: 'Search · Local',
    description: 'Open Food Search in Local mode',
  },
  {
    id: 'search_online',
    label: 'Search · Online',
    description: 'Open Food Search in Online mode',
  },
  {
    id: 'favourites',
    label: 'Favorites',
    description: 'Open your saved favorites',
  },
  {
    id: 'chat',
    label: 'AI Chat',
    description: 'Open AI chat mode first',
  },
  {
    id: 'manual_entry',
    label: 'Manual Entry',
    description: 'Open Manual Entry right away',
  },
  {
    id: 'barcode',
    label: 'Barcode Scan',
    description: 'Start barcode flow right away',
  },
];

const FOOD_SEARCH_DEFAULT_ENTRY_SET = new Set(
  FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS.map((option) => option.id)
);

const normalizeFoodSearchDefaultEntry = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return FOOD_SEARCH_DEFAULT_ENTRY_SET.has(normalized)
    ? normalized
    : 'search_local';
};

export const MealTypePickerModal = ({
  isOpen,
  isClosing,
  onClose,
  onSelect,
  mealTypeItemCounts = {}, // { [mealTypeId]: number }
}) => {
  const { foodSearchDefaultEntry, setFoodSearchDefaultEntry } =
    useEnergyMapStore(
      (state) => ({
        foodSearchDefaultEntry: state.userData?.foodSearchDefaultEntry,
        setFoodSearchDefaultEntry: state.setFoodSearchDefaultEntry,
      }),
      shallow
    );

  const [isDefaultEntryMenuOpen, setIsDefaultEntryMenuOpen] = useState(false);
  const defaultEntryMenuRef = useRef(null);
  const defaultEntryCloseTimerRef = useRef(null);
  const resolvedFoodSearchDefaultEntry = normalizeFoodSearchDefaultEntry(
    foodSearchDefaultEntry
  );

  const handleClose = () => {
    if (defaultEntryCloseTimerRef.current) {
      clearTimeout(defaultEntryCloseTimerRef.current);
      defaultEntryCloseTimerRef.current = null;
    }
    setIsDefaultEntryMenuOpen(false);
    onClose?.();
  };

  const handleSelect = (mealTypeId) => {
    onSelect?.(mealTypeId);
    handleClose();
  };

  const handleDefaultEntrySelect = (entryId) => {
    const normalizedEntry = normalizeFoodSearchDefaultEntry(entryId);
    setFoodSearchDefaultEntry?.(normalizedEntry);

    if (defaultEntryCloseTimerRef.current) {
      clearTimeout(defaultEntryCloseTimerRef.current);
    }

    defaultEntryCloseTimerRef.current = setTimeout(() => {
      setIsDefaultEntryMenuOpen(false);
      defaultEntryCloseTimerRef.current = null;
    }, 240);
  };

  useEffect(() => {
    if (!isDefaultEntryMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (
        defaultEntryMenuRef.current &&
        !defaultEntryMenuRef.current.contains(event.target)
      ) {
        setIsDefaultEntryMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDefaultEntryMenuOpen]);

  useEffect(() => {
    return () => {
      if (defaultEntryCloseTimerRef.current) {
        clearTimeout(defaultEntryCloseTimerRef.current);
        defaultEntryCloseTimerRef.current = null;
      }
    };
  }, []);

  // Inline color/focus classes (simplified)

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={handleClose}
      contentClassName="w-full md:max-w-md p-6"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Utensils className="text-accent-blue" size={28} />
          <h3 className="text-foreground font-bold text-2xl">Meal Type</h3>
        </div>

        <div className="relative" ref={defaultEntryMenuRef}>
          <button
            type="button"
            onClick={() => setIsDefaultEntryMenuOpen((previous) => !previous)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg transition-all press-feedback focus-ring md:hover:brightness-110"
            aria-label="Food search default settings"
          >
            <Settings size={18} />
            <span className="hidden md:inline">Settings</span>
          </button>

          <AnimatePresence>
            {isDefaultEntryMenuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute right-0 top-full mt-2 z-[1250] w-72 rounded-xl border border-border bg-surface shadow-xl p-2"
              >
                <p className="px-2 pt-1 pb-2 text-xs text-muted font-medium">
                  Default Food Search start
                </p>

                <div className="space-y-1">
                  {FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS.map((option) => {
                    const isSelected =
                      resolvedFoodSearchDefaultEntry === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleDefaultEntrySelect(option.id)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left transition-all pressable-card focus-ring ${
                          isSelected
                            ? 'border-accent-blue/50 bg-accent-blue/10'
                            : 'border-transparent bg-surface-highlight md:hover:border-border/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground leading-tight">
                              {option.label}
                            </p>
                            <p className="text-xs text-muted mt-1 leading-tight">
                              {option.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="space-y-3">
        {MEAL_TYPE_ORDER.map((mealTypeId) => {
          const mealType = getMealTypeById(mealTypeId);
          const Icon = mealType.icon;
          const itemCount = mealTypeItemCounts[mealTypeId] || 0;
          return (
            <button
              key={`meal-${mealTypeId}`}
              onClick={() => handleSelect(mealTypeId)}
              className="w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 shadow-sm bg-surface-highlight border-border md:hover:border-accent-blue/50 focus-ring pressable-card"
              tabIndex={0}
            >
              <Icon className="text-foreground" size={24} />
              <div className="flex-1 text-left">
                <h4 className="text-foreground font-semibold text-lg">
                  {mealType.label}
                </h4>
              </div>
              {/* Item count on right if > 0, subtle style */}
              {itemCount > 0 && (
                <span className="ml-2 text-xs text-muted font-medium px-2 py-1 rounded bg-foreground/10 border border-border">
                  {itemCount} food {itemCount === 1 ? 'item' : 'items'}
                </span>
              )}
              {/* Removed selection circle for selected meal type */}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={handleClose}
          className="flex-1 px-4 py-3 bg-surface-highlight text-foreground rounded-lg font-semibold transition-all press-feedback focus-ring md:hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
};
