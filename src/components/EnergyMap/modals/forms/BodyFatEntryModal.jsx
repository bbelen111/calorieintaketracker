import React, { useEffect } from 'react';
import { Trash2, Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { DateInput } from '../../common/DateInput';
import { formatBodyFat } from '../../../../utils/bodyFat';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';

export const BodyFatEntryModal = ({
  isOpen,
  isClosing,
  mode = 'add',
  date,
  bodyFat,
  isDateLocked,
  error,
  onDateChange,
  onRequestBodyFatPicker,
  onCancel,
  onSave,
  onDelete,
}) => {
  const isEdit = mode === 'edit';
  const formattedBodyFat = (() => {
    const normalized = formatBodyFat(bodyFat);
    return normalized ? `${normalized}%` : 'Select body fat';
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

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-lg"
    >
      <h3 className="text-foreground font-bold text-xl text-center mb-6">
        {isEdit ? 'Edit Body Fat Entry' : 'Add Body Fat Entry'}
      </h3>

      <div className="space-y-5">
        <div>
          <label className="text-muted text-sm block mb-2">Entry Date</label>
          <div className="relative">
            <DateInput
              value={date ?? ''}
              onChange={(val) => onDateChange?.(val)}
              disabled={isEdit || isDateLocked}
              className={`w-full bg-surface-highlight text-foreground px-4 py-2 rounded-lg border focus:outline-none focus-ring ${
                isEdit || isDateLocked
                  ? 'border-border opacity-80 cursor-not-allowed'
                  : 'border-border focus:border-accent-blue'
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
          <label className="text-muted text-sm block mb-2">Body Fat</label>
          <button
            type="button"
            onClick={() => onRequestBodyFatPicker?.()}
            className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-primary border-accent-blue text-primary-foreground transition-all active:scale-[0.98] flex flex-wrap items-center gap-x-3 gap-y-1 text-left md:hover:brightness-110 font-semibold text-base focus-ring press-feedback"
          >
            <span className="font-semibold text-base">{formattedBodyFat}</span>
            <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
              Tap to adjust
            </span>
          </button>
        </div>
      </div>

      {error && <p className="text-accent-red text-sm mt-4">{error}</p>}

      <div className="flex gap-3 mt-6">
        {isEdit && onDelete && (
          <button
            type="button"
            onClick={() => openConfirm()}
            className="inline-flex items-center bg-accent-red/15 justify-center gap-2 px-4 py-2 rounded-lg border border-accent-red/60 text-accent-red md:hover:bg-accent-red/20 transition-all focus-ring pressable"
          >
            <Trash2 size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground ${isEdit ? 'px-3' : 'px-6'} py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className={`flex-1 bg-primary active:brightness-110 text-primary-foreground ${isEdit ? 'px-3' : 'px-6'} py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback`}
        >
          <Save size={20} />
          Save
        </button>
      </div>

      <ConfirmActionModal
        isOpen={isConfirmOpen}
        isClosing={isConfirmClosing}
        title="Delete body fat entry?"
        description="This will remove the logged body fat for the selected day."
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
