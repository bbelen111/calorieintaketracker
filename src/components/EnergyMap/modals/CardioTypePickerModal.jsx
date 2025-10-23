import React, { useEffect, useMemo, useState } from 'react';
import { Flame, Plus, Search, Trash2 } from 'lucide-react';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { ModalShell } from '../common/ModalShell';
import { ConfirmActionModal } from './ConfirmActionModal';

export const CardioTypePickerModal = ({
  isOpen,
  isClosing,
  cardioTypes,
  customCardioTypes,
  selectedType,
  onSelect,
  onClose,
  onCreateCustomCardioType,
  onDeleteCustomCardioType
}) => {
  const [query, setQuery] = useState('');
  const [pendingDeleteKey, setPendingDeleteKey] = useState(null);
  const {
    isOpen: isConfirmOpen,
    isClosing: isConfirmClosing,
    open: openConfirm,
    requestClose: requestConfirmClose,
    forceClose: forceConfirmClose
  } = useAnimatedModal(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      forceConfirmClose();
      setPendingDeleteKey(null);
    }
  }, [forceConfirmClose, isOpen]);

  useEffect(() => {
    if (!isConfirmOpen && !isConfirmClosing) {
      setPendingDeleteKey(null);
    }
  }, [isConfirmClosing, isConfirmOpen]);

  const filteredTypes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const entries = Object.entries(cardioTypes);

    if (!normalizedQuery) {
      return entries.sort((a, b) => {
        const aCustom = Boolean(customCardioTypes?.[a[0]]);
        const bCustom = Boolean(customCardioTypes?.[b[0]]);
        if (aCustom !== bCustom) {
          return aCustom ? -1 : 1;
        }
        return a[1].label.localeCompare(b[1].label);
      });
    }

    const filtered = entries.filter(([key, type]) => {
      const labelMatch = type.label.toLowerCase().includes(normalizedQuery);
      const keyMatch = key.replace(/[_-]/g, ' ').toLowerCase().includes(normalizedQuery);
      return labelMatch || keyMatch;
    });

    return filtered.sort((a, b) => {
      const aCustom = Boolean(customCardioTypes?.[a[0]]);
      const bCustom = Boolean(customCardioTypes?.[b[0]]);
      if (aCustom !== bCustom) {
        return aCustom ? -1 : 1;
      }
      return a[1].label.localeCompare(b[1].label);
    });
  }, [cardioTypes, customCardioTypes, query]);

  const renderMetValue = (value) => (typeof value === 'number' ? value.toFixed(1) : '--');

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[70]"
      contentClassName="p-4 md:p-6 w-full md:max-w-2xl"
    >
      <div className="flex flex-col gap-4 md:gap-6 h-full">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-white font-bold text-xl md:text-2xl mb-3">Browse Cardio Types</h3>
            </div>
            {onCreateCustomCardioType && (
              <button
                type="button"
                onClick={() => onCreateCustomCardioType()}
                className="p-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 hover:border-indigo-400 hover:text-white transition-colors"
                aria-label="Add custom cardio type"
              >
                <Plus size={18} />
              </button>
            )}
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, equipment, or intensity"
              className="w-full bg-slate-800 text-white placeholder:text-slate-500 pl-10 pr-4 py-2 rounded-lg border border-slate-700 focus:border-blue-400 focus:outline-none"
              type="text"
            />
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto pr-1 max-h-[60vh]" role="list">
          {filteredTypes.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-6">
              No cardio types match that search. Try a different keyword.
            </div>
          ) : (
            filteredTypes.map(([key, type]) => {
              const isActive = selectedType === key;
              const { light, moderate, vigorous } = type.met ?? {};
              const isCustom = Boolean(customCardioTypes?.[key]);

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => onSelect(key)}
                  className={`relative w-full text-left p-4 rounded-xl border-2 transition-all active:scale-[0.98] flex flex-col gap-2 ${
                    isActive
                      ? 'bg-purple-600 border-purple-400 text-white shadow-lg'
                      : 'bg-slate-700 border-slate-600 text-slate-200 hover:border-blue-400'
                  }`}
                  role="listitem"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <Flame size={24} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-base md:text-lg leading-tight">{type.label}</p>
                      <p className="text-xs md:text-sm opacity-80">
                        Light {renderMetValue(light)} • Moderate {renderMetValue(moderate)} • Vigorous {renderMetValue(vigorous)} METs
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
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
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
            className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 py-3 rounded-lg transition-all active:scale-95 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>

      <ConfirmActionModal
        isOpen={isConfirmOpen}
        isClosing={isConfirmClosing}
        title="Delete cardio type?"
        description={pendingDeleteKey ? `This will remove ${cardioTypes[pendingDeleteKey]?.label ?? 'the selected option'} from your library. Any sessions using it will revert to a default.` : 'This will remove the selected cardio type.'}
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
