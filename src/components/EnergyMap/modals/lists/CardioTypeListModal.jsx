import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Plus, Search, Trash2 } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { ModalShell } from '../../common/ModalShell';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { ConfirmActionModal } from '../common/ConfirmActionModal';

const LONG_PRESS_DURATION = 650;

export const CardioTypeListModal = ({
  isOpen,
  isClosing,
  cardioTypes,
  customCardioTypes,
  selectedType,
  onSelect,
  onClose,
  onCreateCustomCardioType,
  onDeleteCustomCardioType,
}) => {
  const {
    storeCardioTypes,
    storeCustomTypes,
    storePinnedCardioTypes,
    togglePinnedCardioType,
  } = useEnergyMapStore(
    (state) => ({
      storeCardioTypes: state.cardioTypes,
      storeCustomTypes: state.userData?.customCardioTypes,
      storePinnedCardioTypes: state.pinnedCardioTypes,
      togglePinnedCardioType: state.togglePinnedCardioType,
    }),
    shallow
  );
  const resolvedCardioTypes = cardioTypes ?? storeCardioTypes;
  const resolvedCustomTypes = customCardioTypes ?? storeCustomTypes;
  const resolvedPinnedCardioTypes = useMemo(
    () => (Array.isArray(storePinnedCardioTypes) ? storePinnedCardioTypes : []),
    [storePinnedCardioTypes]
  );
  const [query, setQuery] = useState('');
  const [pendingDeleteKey, setPendingDeleteKey] = useState(null);
  const [longPressingId, setLongPressingId] = useState(null);
  const longPressTimerRef = useRef(null);
  const skipNextClickRef = useRef(false);
  const {
    isOpen: isConfirmOpen,
    isClosing: isConfirmClosing,
    open: openConfirm,
    requestClose: requestConfirmClose,
    forceClose: forceConfirmClose,
  } = useAnimatedModal(false);

  // Reset state when modal closes (avoid setState in effect)
  useEffect(() => {
    if (!isOpen) {
      // Delay state reset until after close animation
      setTimeout(() => {
        setQuery('');
        setPendingDeleteKey(null);
      }, 200); // match ModalShell exit animation duration
      forceConfirmClose();
    }
  }, [forceConfirmClose, isOpen]);

  // Reset pendingDeleteKey after confirm modal closes (avoid setState in effect)
  useEffect(() => {
    if (!isConfirmOpen && !isConfirmClosing) {
      setTimeout(() => {
        setPendingDeleteKey(null);
      }, 200); // match ConfirmActionModal exit animation duration
    }
  }, [isConfirmClosing, isConfirmOpen]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const filteredTypes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const entries = Object.entries(resolvedCardioTypes ?? {});

    const sorted = (
      !normalizedQuery
        ? entries
        : entries.filter(([key, type]) => {
            const labelMatch = type.label
              .toLowerCase()
              .includes(normalizedQuery);
            const keyMatch = key
              .replace(/[_-]/g, ' ')
              .toLowerCase()
              .includes(normalizedQuery);
            return labelMatch || keyMatch;
          })
    ).sort((a, b) => {
      const aCustom = Boolean(resolvedCustomTypes?.[a[0]]);
      const bCustom = Boolean(resolvedCustomTypes?.[b[0]]);
      if (aCustom !== bCustom) {
        return aCustom ? -1 : 1;
      }
      return a[1].label.localeCompare(b[1].label);
    });

    return sorted.sort((a, b) => {
      const aIsPinned = resolvedPinnedCardioTypes.includes(a[0]);
      const bIsPinned = resolvedPinnedCardioTypes.includes(b[0]);

      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      return 0;
    });
  }, [
    query,
    resolvedCardioTypes,
    resolvedCustomTypes,
    resolvedPinnedCardioTypes,
  ]);

  const handlePressStart = (typeKey, event) => {
    if (event?.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    setLongPressingId(typeKey);
    skipNextClickRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      togglePinnedCardioType?.(typeKey);
      skipNextClickRef.current = true;
      setLongPressingId(null);
    }, LONG_PRESS_DURATION);
  };

  const handlePressEnd = (shouldResetSkip = false) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    setLongPressingId(null);

    if (shouldResetSkip) {
      skipNextClickRef.current = false;
    }
  };

  const handleSelectType = (typeKey) => {
    if (skipNextClickRef.current) {
      skipNextClickRef.current = false;
      return;
    }

    onSelect(typeKey);
  };

  const renderMetValue = (value) =>
    typeof value === 'number' ? value.toFixed(1) : '--';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-surface/80 z-[70]"
      contentClassName="p-4 md:p-6 w-full md:max-w-2xl"
    >
      <div className="flex flex-col gap-4 md:gap-6 h-full">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-foreground font-bold text-xl flex-1">
              Browse Cardio Types
            </h3>
            {onCreateCustomCardioType && (
              <button
                type="button"
                onClick={() => onCreateCustomCardioType()}
                className="p-2 rounded-lg border border-border bg-surface-highlight text-foreground md:hover:border-accent-blue transition-colors ml-2"
                aria-label="Add custom cardio type"
              >
                <Plus size={18} />
              </button>
            )}
          </div>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, equipment, or intensity"
              className="w-full bg-surface-highlight text-foreground placeholder:text-muted pl-10 pr-4 py-2 rounded-lg border border-border focus:border-accent-blue focus:outline-none"
              type="text"
            />
          </div>
        </div>

        <div
          className="space-y-3 overflow-y-auto pr-1 max-h-[60vh]"
          role="list"
        >
          {filteredTypes.length === 0 ? (
            <div className="text-center text-muted text-sm py-6">
              No cardio types match that search. Try a different keyword.
            </div>
          ) : (
            filteredTypes.map(([key, type]) => {
              const isActive = selectedType === key;
              const { light, moderate, vigorous } = type.met ?? {};
              const isCustom = Boolean(resolvedCustomTypes?.[key]);
              const isPinned = resolvedPinnedCardioTypes.includes(key);
              const isLongPressing = longPressingId === key;
              const baseSurfaceClass = isActive
                ? 'border-primary bg-primary'
                : isPinned || isLongPressing
                  ? 'border-accent-blue bg-surface-highlight md:hover:bg-surface-highlight/60'
                  : 'border-border bg-surface-highlight md:hover:bg-surface-highlight/60';

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => handleSelectType(key)}
                  onPointerDown={(event) => handlePressStart(key, event)}
                  onPointerUp={() => handlePressEnd(false)}
                  onPointerLeave={() => handlePressEnd(true)}
                  onPointerCancel={() => handlePressEnd(true)}
                  className={`relative w-full rounded-xl border px-4 py-4 text-left transition-all focus-ring flex flex-col gap-2 ${baseSurfaceClass} ${
                    isLongPressing ? 'scale-[0.98]' : 'pressable-card'
                  }`}
                  role="listitem"
                >
                  {isPinned && (
                    <div
                      className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${isActive ? 'bg-primary-foreground' : 'bg-accent-blue'}`}
                    />
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 rounded-full p-1 bg-surface-highlight/20">
                      <Flame size={24} className="text-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-semibold text-base md:text-lg leading-tight">
                        {type.label}
                      </p>
                      <p
                        className={`text-xs md:text-sm ${isActive ? 'text-primary-foreground' : 'text-muted'}`}
                      >
                        Light {renderMetValue(light)} • Moderate{' '}
                        {renderMetValue(moderate)} • Vigorous{' '}
                        {renderMetValue(vigorous)} METs
                      </p>
                    </div>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!onDeleteCustomCardioType) {
                            return;
                          }
                          setPendingDeleteKey(key);
                          openConfirm();
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onPointerCancel={(event) => event.stopPropagation()}
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground/10 md:hover:bg-foreground/20 transition-colors flex items-center justify-center focus-ring pressable"
                        aria-label="Delete custom cardio type"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 bg-surface-highlight text-foreground px-4 py-3 rounded-lg transition-all active:scale-95 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>

      <ConfirmActionModal
        isOpen={isConfirmOpen}
        isClosing={isConfirmClosing}
        title="Delete cardio type?"
        description={
          pendingDeleteKey
            ? `This will remove ${resolvedCardioTypes?.[pendingDeleteKey]?.label ?? 'the selected option'} from your library. Any sessions using it will revert to a default.`
            : 'This will remove the selected cardio type.'
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => {
          if (pendingDeleteKey) {
            onDeleteCustomCardioType?.(pendingDeleteKey);
          }
          requestConfirmClose();
        }}
        onCancel={() => {
          requestConfirmClose();
        }}
      />
    </ModalShell>
  );
};
