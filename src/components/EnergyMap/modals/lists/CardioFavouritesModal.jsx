import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Plus, Trash2 } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { ConfirmActionModal } from '../common/ConfirmActionModal';

const getCardioLabel = (cardioTypes, type) =>
  cardioTypes?.[type]?.label ?? 'Custom Cardio';

const formatDuration = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'Unknown duration';
  }
  return `${numeric} min`;
};

const formatEffortSummary = (session) => {
  const effortType = session?.effortType ?? 'intensity';
  if (effortType === 'heartRate') {
    const heartRate = Number(session?.averageHeartRate);
    if (!Number.isFinite(heartRate) || heartRate <= 0) {
      return 'Heart rate';
    }
    return `${heartRate} bpm avg`;
  }

  const intensity = (session?.intensity ?? 'moderate').toString();
  return `${intensity.charAt(0).toUpperCase()}${intensity.slice(1)} intensity`;
};

const getCaloriesSummary = (calculateCalories, session) => {
  if (typeof calculateCalories !== 'function') {
    return null;
  }
  const value = Number(calculateCalories(session));
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return `~${Math.round(value)} calories`;
};

const normalizeFavouriteSession = (session) => {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const preferredEffortType =
    session.effortType === 'heartRate' ? 'heartRate' : 'intensity';
  const parsedHeartRate = Number.parseInt(session.averageHeartRate, 10);
  const hasValidHeartRate =
    Number.isFinite(parsedHeartRate) && parsedHeartRate > 0;
  const effortType =
    preferredEffortType === 'heartRate' && hasValidHeartRate
      ? 'heartRate'
      : 'intensity';

  return {
    ...session,
    effortType,
    intensity: session.intensity ?? 'moderate',
    averageHeartRate: effortType === 'heartRate' ? parsedHeartRate : '',
  };
};

const isSameSession = (current, favourite) => {
  const normalizedCurrent = normalizeFavouriteSession(current);
  const normalizedFavourite = normalizeFavouriteSession(favourite);
  if (!normalizedCurrent || !normalizedFavourite) {
    return false;
  }

  const currentEffort = normalizedCurrent.effortType ?? 'intensity';
  const favouriteEffort = normalizedFavourite.effortType ?? 'intensity';

  if (
    (normalizedCurrent.type ?? 'treadmill_walk') !==
    (normalizedFavourite.type ?? 'treadmill_walk')
  ) {
    return false;
  }

  const currentDuration = Number(normalizedCurrent.duration);
  const favouriteDuration = Number(normalizedFavourite.duration);
  if (Number.isFinite(currentDuration) && Number.isFinite(favouriteDuration)) {
    if (currentDuration !== favouriteDuration) {
      return false;
    }
  } else if (currentDuration !== favouriteDuration) {
    return false;
  }

  if (currentEffort !== favouriteEffort) {
    return false;
  }

  if (currentEffort === 'heartRate') {
    const currentHeartRate = Number(normalizedCurrent.averageHeartRate);
    const favouriteHeartRate = Number(normalizedFavourite.averageHeartRate);
    return currentHeartRate === favouriteHeartRate;
  }

  return (
    (normalizedCurrent.intensity ?? 'moderate') ===
    (normalizedFavourite.intensity ?? 'moderate')
  );
};

export const CardioFavouritesModal = ({
  isOpen,
  isClosing,
  favourites,
  cardioTypes,
  currentSession,
  onSelectFavourite,
  onCreateFavourite,
  onDeleteFavourite,
  onClose,
  calculateCardioCalories,
}) => {
  const {
    cardioTypes: storeCardioTypes,
    cardioFavourites,
    calculateCardioSessionCalories,
  } = useEnergyMapStore(
    (state) => ({
      cardioTypes: state.cardioTypes,
      cardioFavourites: state.cardioFavourites,
      calculateCardioSessionCalories: state.calculateCardioSessionCalories,
    }),
    shallow
  );
  const resolvedCardioTypes = cardioTypes ?? storeCardioTypes;
  const resolvedFavourites = favourites ?? cardioFavourites;
  const resolvedCalculateCalories =
    calculateCardioCalories ?? calculateCardioSessionCalories;
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const {
    isOpen: isConfirmOpen,
    isClosing: isConfirmClosing,
    open: openConfirm,
    requestClose: requestConfirmClose,
    forceClose: forceConfirmClose,
  } = useAnimatedModal(false);

  const sortedFavourites = useMemo(() => {
    if (!Array.isArray(resolvedFavourites)) {
      return [];
    }

    return resolvedFavourites
      .filter(Boolean)
      .slice()
      .sort((a, b) => {
        const labelA = getCardioLabel(
          resolvedCardioTypes,
          a.type
        ).toLowerCase();
        const labelB = getCardioLabel(
          resolvedCardioTypes,
          b.type
        ).toLowerCase();
        if (labelA === labelB) {
          const durationValueA = Number(a.duration);
          const durationValueB = Number(b.duration);
          const safeDurationA = Number.isFinite(durationValueA)
            ? durationValueA
            : 0;
          const safeDurationB = Number.isFinite(durationValueB)
            ? durationValueB
            : 0;
          return safeDurationA - safeDurationB;
        }
        return labelA.localeCompare(labelB);
      });
  }, [resolvedCardioTypes, resolvedFavourites]);

  const hasFavourites = sortedFavourites.length > 0;

  useEffect(() => {
    if (!isOpen) {
      forceConfirmClose();
    }
  }, [forceConfirmClose, isOpen]);

  useEffect(() => {
    if (!isConfirmOpen && !isConfirmClosing) {
      const timeout = setTimeout(() => {
        setPendingDeleteId(null);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [isConfirmClosing, isConfirmOpen]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-surface/80 z-[60]"
      contentClassName="p-4 md:p-6 w-full md:max-w-lg"
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-foreground font-bold text-xl md:text-2xl">
              Favourite Cardio Sessions
            </h3>
            <p className="text-muted text-sm md:text-base mt-1">
              Save your go-to workouts for quick reuse.
            </p>
          </div>
          {typeof onCreateFavourite === 'function' && (
            <button
              type="button"
              onClick={() => onCreateFavourite(currentSession)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-highlight px-3 py-2 text-sm font-medium text-foreground transition-colors md:hover:border-accent-amber focus-ring pressable"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>

        <div
          className="space-y-3 overflow-y-auto pr-1 max-h-[60vh]"
          role="list"
        >
          {hasFavourites ? (
            sortedFavourites.map((favourite) => {
              const normalizedFavourite = normalizeFavouriteSession(favourite);
              const key =
                favourite.id ?? `${favourite.type}-${favourite.duration}`;
              const label = getCardioLabel(resolvedCardioTypes, favourite.type);
              const effortSummary = formatEffortSummary(normalizedFavourite);
              const caloriesSummary = getCaloriesSummary(
                resolvedCalculateCalories,
                normalizedFavourite
              );

              // Kept for accessibility, no longer used for visual styling differences
              const active = isSameSession(currentSession, normalizedFavourite);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectFavourite?.(normalizedFavourite)}
                  className="w-full text-left p-3 md:p-4 rounded-xl flex flex-col gap-2 transition-all pressable-card focus-ring border border-primary bg-primary/90 text-primary-foreground shadow-sm"
                  role="listitem"
                  aria-current={active ? 'true' : 'false'}
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex-shrink-0 rounded-full p-2 bg-primary-foreground/15">
                      <Heart size={18} className="text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base md:text-lg leading-tight truncate">
                        {label}
                      </p>
                      <p className="text-xs md:text-sm mt-0.5 truncate text-primary-foreground/80">
                        {formatDuration(favourite.duration)} | {effortSummary}
                        {caloriesSummary ? ` | ${caloriesSummary}` : ''}
                      </p>
                    </div>
                    {typeof onDeleteFavourite === 'function' &&
                      favourite.id != null && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDeleteId(favourite.id);
                            openConfirm();
                          }}
                          className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-highlight/20 md:hover:bg-surface-highlight/40 pressable-inline focus-ring flex items-center justify-center text-primary-foreground"
                          aria-label="Delete favourite cardio session"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="text-center text-muted text-sm py-10">
              No favourites yet. Add one to reuse your preferred cardio setup.
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 bg-surface-highlight text-foreground px-4 py-3 rounded-lg transition-all active:scale-95 font-medium"
          >
            Close
          </button>
        </div>
      </div>

      <ConfirmActionModal
        isOpen={isConfirmOpen}
        isClosing={isConfirmClosing}
        title="Remove favourite session?"
        description={
          pendingDeleteId != null
            ? 'This favourite will be removed from your quick list. You can recreate it anytime from a session.'
            : 'This favourite will be removed from your quick list.'
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => {
          requestConfirmClose();
          if (pendingDeleteId != null) {
            onDeleteFavourite?.(pendingDeleteId);
          }
        }}
        onCancel={() => requestConfirmClose()}
      />
    </ModalShell>
  );
};
