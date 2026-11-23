import React, { useCallback, useEffect, useRef } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { DateInput } from './DateInput';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from '../modals/common/ConfirmActionModal';
import { SCROLL_SETTLE_DELAY } from '../../../utils/visuals/scroll';

/**
 * The one entry sheet behind the Weight, Body Fat and Resting Heart Rate
 * trackers: wheel + entry date + error line + delete (confirmed) / cancel /
 * save. The three wrappers only supply their wheel, copy and data rules, so
 * the trackers cannot drift apart again.
 *
 * Contract (every tracker inherits it):
 * - `mode` is `'add' | 'edit'`. Editing locks the date (a reading belongs to
 *   its day); delete is offered only while editing.
 * - Delete always goes through a confirm sheet.
 * - Wheel drafts relay to the parent on settle (`SCROLL_SETTLE_DELAY`), not
 *   per scroll frame — relaying per frame re-rendered the whole orchestrator
 *   at ~60fps during a flick. The wheel keeps its own live selection, so the
 *   display never lags; only the parent's draft copy does. Save passes the
 *   live value explicitly, so a save racing the trailing commit can never
 *   persist a stale draft. Pending commits are dropped when the modal closes.
 * - Conflict / validation handling lives in the owner (`onSave` returns
 *   nothing; it reports problems through `error`).
 *
 * `Picker` is the wheel component (a stable, module-level component) and
 * `pickerProps` its props; the shell supplies `onChange`, the settle-relaying
 * handler. `children` render under the date field (e.g. the camera
 * measurement).
 */
export const TrackerEntryModal = ({
  isOpen,
  isClosing,
  mode = 'add',
  title,
  unitLabel,
  value,
  onValueChange,
  Picker,
  pickerProps,
  pickerLocked = false,
  date,
  onDateChange,
  isDateLocked = false,
  dateMax,
  dateNote = null,
  error,
  canDelete = true,
  deleteTitle,
  deleteDescription,
  saveDisabled = false,
  onCancel,
  onSave,
  onDelete,
  children,
}) => {
  const isEdit = mode === 'edit';
  const showDelete = isEdit && canDelete && onDelete;

  const {
    isOpen: isConfirmOpen,
    isClosing: isConfirmClosing,
    open: openConfirm,
    requestClose: requestConfirmClose,
    forceClose: forceConfirmClose,
  } = useAnimatedModal(false);

  const pendingValueRef = useRef(null);
  const commitTimerRef = useRef(null);

  const clearPendingCommit = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  const relayValueChange = useCallback(
    (nextValue) => {
      pendingValueRef.current = nextValue;
      clearPendingCommit();
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        const pending = pendingValueRef.current;
        pendingValueRef.current = null;
        if (pending != null) {
          onValueChange?.(pending);
        }
      }, SCROLL_SETTLE_DELAY);
    },
    [clearPendingCommit, onValueChange]
  );

  // Never let a trailing commit land after the modal has closed (the parent
  // resets its draft on close).
  useEffect(() => {
    if (!isOpen) {
      pendingValueRef.current = null;
      clearPendingCommit();
    }
  }, [clearPendingCommit, isOpen]);

  useEffect(() => clearPendingCommit, [clearPendingCommit]);

  useEffect(() => {
    if (!isOpen) {
      forceConfirmClose();
    }
  }, [forceConfirmClose, isOpen]);

  const handleSaveClick = useCallback(() => {
    const liveValue = pendingValueRef.current ?? value;
    pendingValueRef.current = null;
    clearPendingCommit();
    onSave?.(liveValue);
  }, [clearPendingCommit, onSave, value]);

  const isDateDisabled = isEdit || isDateLocked;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-lg"
    >
      <h3 className="text-foreground font-bold text-xl text-center mb-5">
        {title}
      </h3>

      <div className="space-y-4">
        <div className={pickerLocked ? 'opacity-60 pointer-events-none' : ''}>
          <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
            {unitLabel}
          </p>
          <Picker {...pickerProps} onChange={relayValueChange} />
        </div>

        <div>
          <label className="text-muted text-sm block mb-2">Entry Date</label>
          <div className="relative">
            <DateInput
              value={date ?? ''}
              onChange={(val) => onDateChange?.(val)}
              max={dateMax}
              disabled={isDateDisabled}
              className={`w-full bg-surface-highlight text-foreground px-4 py-2 rounded-lg border focus:outline-hidden focus-ring ${
                isDateDisabled
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
              Date locked because today&#39;s entry already exists.
            </p>
          )}
          {dateNote}
        </div>

        {children}
      </div>

      {error && <p className="text-accent-red text-sm mt-4">{error}</p>}

      <div className="flex gap-3 mt-6">
        {showDelete && (
          <button
            type="button"
            onClick={() => openConfirm()}
            aria-label="Delete entry"
            className="inline-flex items-center bg-accent-red/15 justify-center gap-2 px-4 py-2 rounded-lg border border-accent-red/60 text-accent-red md:hover:bg-accent-red/20 transition-all focus-ring pressable"
          >
            <Trash2 size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground ${showDelete ? 'px-3' : 'px-6'} py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback`}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saveDisabled}
          onClick={handleSaveClick}
          className={`flex-1 bg-primary active:brightness-110 text-primary-foreground ${showDelete ? 'px-3' : 'px-6'} py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback disabled:opacity-60`}
        >
          <Save size={20} />
          Save
        </button>
      </div>

      <ConfirmActionModal
        isOpen={isConfirmOpen}
        isClosing={isConfirmClosing}
        title={deleteTitle}
        description={deleteDescription}
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
