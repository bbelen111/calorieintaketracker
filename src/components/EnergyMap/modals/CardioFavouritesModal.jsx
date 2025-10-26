import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Plus, Trash2 } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from './ConfirmActionModal';

const getCardioLabel = (cardioTypes, type) => cardioTypes?.[type]?.label ?? 'Custom Cardio';

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

const isSameSession = (current, favourite) => {
  if (!current || !favourite) {
    return false;
  }

  const currentEffort = current.effortType ?? 'intensity';
  const favouriteEffort = favourite.effortType ?? 'intensity';

  if ((current.type ?? 'treadmill_walk') !== (favourite.type ?? 'treadmill_walk')) {
    return false;
  }

  const currentDuration = Number(current.duration);
  const favouriteDuration = Number(favourite.duration);
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
    const currentHeartRate = Number(current.averageHeartRate);
    const favouriteHeartRate = Number(favourite.averageHeartRate);
    return currentHeartRate === favouriteHeartRate;
  }

  return (current.intensity ?? 'moderate') === (favourite.intensity ?? 'moderate');
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
  calculateCardioCalories
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const {
    isOpen: isConfirmOpen,
    isClosing: isConfirmClosing,
    open: openConfirm,
    requestClose: requestConfirmClose,
    forceClose: forceConfirmClose
  } = useAnimatedModal(false);

  const sortedFavourites = useMemo(() => {
    if (!Array.isArray(favourites)) {
      return [];
    }

    return favourites
      .filter(Boolean)
      .slice()
      .sort((a, b) => {
        const labelA = getCardioLabel(cardioTypes, a.type).toLowerCase();
        const labelB = getCardioLabel(cardioTypes, b.type).toLowerCase();
        if (labelA === labelB) {
          const durationValueA = Number(a.duration);
          const durationValueB = Number(b.duration);
          const safeDurationA = Number.isFinite(durationValueA) ? durationValueA : 0;
          const safeDurationB = Number.isFinite(durationValueB) ? durationValueB : 0;
          return safeDurationA - safeDurationB;
        }
        return labelA.localeCompare(labelB);
      });
  }, [cardioTypes, favourites]);

  const hasFavourites = sortedFavourites.length > 0;

  useEffect(() => {
    if (!isOpen) {
      forceConfirmClose();
      setPendingDeleteId(null);
    }
  }, [forceConfirmClose, isOpen]);

  useEffect(() => {
    if (!isConfirmOpen && !isConfirmClosing) {
      setPendingDeleteId(null);
    }
  }, [isConfirmClosing, isConfirmOpen]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[60]"
      contentClassName="p-4 md:p-6 w-full md:max-w-lg"
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-bold text-xl md:text-2xl">Favourite Cardio Sessions</h3>
            <p className="text-slate-400 text-sm md:text-base mt-1">
              Save your go-to workouts for quick reuse.
            </p>
          </div>
          {typeof onCreateFavourite === 'function' && (
            <button
              type="button"
              onClick={() => onCreateFavourite(currentSession)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-amber-400 hover:text-white"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>

        <div className="space-y-3 overflow-y-auto pr-1 max-h-[60vh]" role="list">
          {hasFavourites ? (
            sortedFavourites.map((favourite) => {
              const key = favourite.id ?? `${favourite.type}-${favourite.duration}`;
              const label = getCardioLabel(cardioTypes, favourite.type);
              const effortSummary = formatEffortSummary(favourite);
              const caloriesSummary = getCaloriesSummary(calculateCardioCalories, favourite);
              const active = isSameSession(currentSession, favourite);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectFavourite?.(favourite)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all active:scale-[0.98] flex flex-col gap-2 ${
                    active
                      ? 'bg-red-600/80 border-red-400 text-white shadow-lg'
                      : 'bg-slate-700 border-slate-600 text-slate-200 hover:border-blue-400'
                  }`}
                  role="listitem"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 rounded-full p-2 ${active ? 'bg-white/15' : 'bg-white/10'}`}>
                      <Heart size={18} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-base md:text-lg leading-tight">{label}</p>
                      <p className="text-xs md:text-sm opacity-80">
                        {formatDuration(favourite.duration)} • {effortSummary}
                        {caloriesSummary ? ` • ${caloriesSummary}` : ''}
                      </p>
                    </div>
                    {typeof onDeleteFavourite === 'function' && favourite.id != null && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDeleteId(favourite.id);
                          openConfirm();
                        }}
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
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
            <div className="text-center text-slate-400 text-sm py-10">
              No favourites yet. Add one to reuse your preferred cardio setup.
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 py-3 rounded-lg transition-all active:scale-95 font-medium"
          >
            Close
          </button>
        </div>
      </div>

      <ConfirmActionModal
        isOpen={isConfirmOpen}
        isClosing={isConfirmClosing}
        title="Remove favourite session?"
        description={pendingDeleteId != null ? 'This favourite will be removed from your quick list. You can recreate it anytime from a session.' : 'This favourite will be removed from your quick list.'}
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
