import React, { useEffect } from 'react';
import { Trash2, Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatWeight } from '../../../utils/weight';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from './ConfirmActionModal';

export const WeightEntryModal = ({
  isOpen,
  isClosing,
  mode = 'add',
  date,
  weight,
  isDateLocked,
  error,
  onDateChange,
  onRequestWeightPicker,
  onCancel,
  onSave,
  onDelete,
}) => {
  const isEdit = mode === 'edit';
  const formattedWeight = (() => {
    const normalized = formatWeight(weight);
    return normalized ? `${normalized} kg` : 'Select weight';
  })();

  const {
    isOpen: isConfirmOpen,
    isClosing: isConfirmClosing,
    open: openConfirm,
    requestClose: requestConfirmClose,
    forceClose: forceConfirmClose,
  } = useAnimatedModal(false);

  useEffect(() => {
    if (!isOpen) {
      forceConfirmClose();
    }
  }, [forceConfirmClose, isOpen]);

  const handleDateChange = (event) => {
    if (isEdit || isDateLocked) {
      return;
    }
    onDateChange?.(event.target.value);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-lg"
    >
      <h3 className="text-foreground font-bold text-xl text-center mb-6">
        {isEdit ? 'Edit Weight Entry' : 'Add Weight Entry'}
      </h3>

      <div className="space-y-5">
        <div>
          <label className="text-foreground/80 text-sm block mb-2">
            Entry Date
          </label>
          <div className="relative">
            <input
              type="date"
              value={date ?? ''}
              onChange={handleDateChange}
              disabled={isEdit || isDateLocked}
              className={`w-full bg-surface-highlight text-white px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-surface ${
                isEdit || isDateLocked
                  ? 'border-border/80 opacity-80 cursor-not-allowed'
                  : 'border-border/80 focus:border-blue-400'
              }`}
            />
          </div>
          {isEdit && (
            <p className="text-muted text-xs mt-1">
              Date cannot be changed when editing an entry.
            </p>
          )}
          {!isEdit && isDateLocked && (
            <p className="text-muted text-xs mt-1">
              Date locked because today&apos;s entry already exists.
            </p>
          )}
        </div>

        <div>
          <label className="text-foreground/80 text-sm block mb-2">Weight</label>
          <button
            type="button"
            onClick={() => onRequestWeightPicker?.()}
            className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all active:scale-[0.98] flex flex-wrap items-center gap-x-3 gap-y-1 text-left md:hover:bg-blue-500/90 font-semibold text-base focus-ring press-feedback"
          >
            <span className="font-semibold text-base">{formattedWeight}</span>
            <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
              Tap to adjust
            </span>
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      <div className="flex gap-3 mt-6">
        {isEdit && onDelete && (
          <button
            type="button"
            onClick={() => openConfirm()}
            className="inline-flex items-center bg-red-900/30 justify-center gap-2 px-4 py-2 rounded-lg border border-red-600/80 text-red-300 md:hover:bg-red-900/30 transition-all focus-ring pressable"
          >
            <Trash2 size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 bg-surface-highlight active:bg-surface-highlight/90 text-white ${isEdit ? 'px-3' : 'px-6'} py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className={`flex-1 bg-blue-600 active:bg-blue-700 text-white ${isEdit ? 'px-3' : 'px-6'} py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback`}
        >
          <Save size={20} />
          Save
        </button>
      </div>

      <ConfirmActionModal
        isOpen={isConfirmOpen}
        isClosing={isConfirmClosing}
        title="Delete weight entry?"
        description="This will remove the logged weight for the selected day."
        confirmLabel="Delete"
        cancelLabel="Keep Entry"
        tone="danger"
        onConfirm={() => {
          requestConfirmClose();
          onDelete?.();
        }}
        onCancel={() => requestConfirmClose()}
      />
    </ModalShell>
  );
};
