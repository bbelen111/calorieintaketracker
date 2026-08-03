import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { DateInput } from '../../common/DateInput';
import { formatBodyFat } from '../../../../utils/measurements/bodyFat';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../../utils/visuals/scroll';
import {
  MAX_BODY_FAT_PERCENT,
  MIN_BODY_FAT_PERCENT,
} from '../../../../utils/measurements/bodyFat';

const MIN_BODY_FAT = MIN_BODY_FAT_PERCENT;
const MAX_BODY_FAT = MAX_BODY_FAT_PERCENT;
const BODY_FAT_VALUES = Array.from(
  { length: MAX_BODY_FAT - MIN_BODY_FAT + 1 },
  (_, index) => MIN_BODY_FAT + index
);
const DECIMAL_VALUES = Array.from({ length: 10 }, (_, index) => index);
const PICKER_USER_DRIVEN_RESET_MS = 400;

const clampWhole = (value) => {
  if (!Number.isFinite(value)) {
    return MIN_BODY_FAT;
  }
  return Math.min(Math.max(Math.round(value), MIN_BODY_FAT), MAX_BODY_FAT);
};

const clampDecimal = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), 9);
};

const normalizeBodyFat = (value) => {
  if (!Number.isFinite(value)) {
    return MIN_BODY_FAT;
  }
  return Math.min(Math.max(value, MIN_BODY_FAT), MAX_BODY_FAT);
};

const convertBodyFatToParts = (bodyFat) => {
  const normalized = Math.round(normalizeBodyFat(bodyFat) * 10) / 10;
  let whole = Math.floor(normalized);
  let decimal = Math.round((normalized - whole) * 10);

  if (decimal === 10) {
    whole = Math.min(whole + 1, MAX_BODY_FAT);
    decimal = 0;
  }

  if (whole === MAX_BODY_FAT) {
    decimal = 0;
  }

  return {
    whole,
    decimal,
  };
};

const buildBodyFatValue = (whole, decimal) => {
  const clampedWhole = clampWhole(whole);
  const safeDecimal = clampedWhole === MAX_BODY_FAT ? 0 : clampDecimal(decimal);
  return Math.round((clampedWhole + safeDecimal / 10) * 10) / 10;
};

export const BodyFatPicker = ({ value, onChange }) => {
  const wholeRef = useRef(null);
  const decimalRef = useRef(null);
  const wholeTimeoutRef = useRef(null);
  const decimalTimeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);
  const selectionRef = useRef({ whole: MIN_BODY_FAT, decimal: 0 });
  const isUserDrivenRef = useRef(false);
  const userDrivenTimeoutRef = useRef(null);

  const [selectedWhole, setSelectedWhole] = useState(MIN_BODY_FAT);
  const [selectedDecimal, setSelectedDecimal] = useState(0);

  const [handleWholeScroll, setHandleWholeScroll] = useState(() => () => {});
  const [handleDecimalScroll, setHandleDecimalScroll] = useState(
    () => () => {}
  );

  const markUserDriven = useCallback(() => {
    isUserDrivenRef.current = true;
    if (userDrivenTimeoutRef.current) {
      clearTimeout(userDrivenTimeoutRef.current);
    }
    userDrivenTimeoutRef.current = setTimeout(() => {
      isUserDrivenRef.current = false;
    }, PICKER_USER_DRIVEN_RESET_MS);
  }, []);

  const applySelection = useCallback(
    (whole, decimal, behavior = 'instant') => {
      markUserDriven();

      const clampedWhole = clampWhole(whole);
      const clampedDecimal =
        clampedWhole === MAX_BODY_FAT ? 0 : clampDecimal(decimal);

      selectionRef.current = {
        whole: clampedWhole,
        decimal: clampedDecimal,
      };

      setSelectedWhole(clampedWhole);
      setSelectedDecimal(clampedDecimal);

      if (wholeRef.current) {
        alignScrollContainerToValue(
          wholeRef.current,
          clampedWhole.toString(),
          behavior
        );
      }

      if (decimalRef.current) {
        alignScrollContainerToValue(
          decimalRef.current,
          clampedDecimal.toString(),
          behavior
        );
      }

      onChange?.(buildBodyFatValue(clampedWhole, clampedDecimal));
    },
    [markUserDriven, onChange]
  );

  useEffect(
    () => () => {
      clearTimeout(wholeTimeoutRef.current);
      clearTimeout(decimalTimeoutRef.current);
      clearTimeout(userDrivenTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const parts = convertBodyFatToParts(value);

    const frame = requestAnimationFrame(() => {
      selectionRef.current = { whole: parts.whole, decimal: parts.decimal };
      setSelectedWhole(parts.whole);
      setSelectedDecimal(parts.decimal);

      // Skip programmatic alignment for user-driven scroll changes. The
      // picker settle handler already snap-aligns after the gesture ends;
      // re-aligning here would fight the finger and cause choppy scrolling.
      if (isUserDrivenRef.current) {
        return;
      }

      if (wholeRef.current) {
        alignScrollContainerToValue(
          wholeRef.current,
          parts.whole.toString(),
          behavior
        );
      }
      if (decimalRef.current) {
        alignScrollContainerToValue(
          decimalRef.current,
          parts.decimal.toString(),
          behavior
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [value]);

  const handleWholeChange = useCallback(
    (nextWhole) => {
      markUserDriven();

      const clampedWhole = clampWhole(nextWhole);
      const nextDecimal =
        clampedWhole === MAX_BODY_FAT ? 0 : selectionRef.current.decimal;

      selectionRef.current = {
        whole: clampedWhole,
        decimal: nextDecimal,
      };

      setSelectedWhole(clampedWhole);
      setSelectedDecimal(nextDecimal);

      if (clampedWhole === MAX_BODY_FAT && decimalRef.current) {
        alignScrollContainerToValue(decimalRef.current, '0', 'smooth');
      }

      onChange?.(buildBodyFatValue(clampedWhole, nextDecimal));
    },
    [markUserDriven, onChange]
  );

  const handleDecimalChange = useCallback(
    (nextDecimal) => {
      markUserDriven();

      const clampedDecimal =
        selectionRef.current.whole === MAX_BODY_FAT
          ? 0
          : clampDecimal(nextDecimal);

      selectionRef.current = {
        whole: selectionRef.current.whole,
        decimal: clampedDecimal,
      };

      setSelectedDecimal(clampedDecimal);

      onChange?.(buildBodyFatValue(selectionRef.current.whole, clampedDecimal));
    },
    [markUserDriven, onChange]
  );

  useEffect(() => {
    setHandleWholeScroll(() =>
      createPickerScrollHandler(
        wholeRef,
        wholeTimeoutRef,
        (val) => parseInt(val, 10),
        handleWholeChange
      )
    );
  }, [handleWholeChange]);

  useEffect(() => {
    setHandleDecimalScroll(() =>
      createPickerScrollHandler(
        decimalRef,
        decimalTimeoutRef,
        (val) => parseInt(val, 10),
        handleDecimalChange
      )
    );
  }, [handleDecimalChange]);

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
            <div className="h-16 bg-transparent" />
            <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
          </div>
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

          <div
            ref={wholeRef}
            className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
            onScroll={handleWholeScroll}
          >
            <div className="h-16" />
            {BODY_FAT_VALUES.map((bodyFatValue) => (
              <div
                key={bodyFatValue}
                data-value={bodyFatValue}
                onClick={() =>
                  applySelection(
                    bodyFatValue,
                    selectionRef.current.decimal,
                    'smooth',
                    true
                  )
                }
                className={`h-16 flex items-center justify-center text-2xl font-bold snap-center cursor-pointer transition-all ${
                  selectedWhole === bodyFatValue
                    ? 'text-foreground scale-110'
                    : 'text-muted'
                }`}
              >
                {bodyFatValue}
              </div>
            ))}
            <div className="h-16" />
          </div>
        </div>
      </div>

      <div className="w-20 flex-shrink-0">
        <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
            <div className="h-16 bg-transparent" />
            <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
          </div>
          <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

          <div
            ref={decimalRef}
            className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
            onScroll={handleDecimalScroll}
          >
            <div className="h-16" />
            {DECIMAL_VALUES.map((decimal) => {
              const isDisabled =
                selectedWhole === MAX_BODY_FAT && decimal !== 0;
              return (
                <div
                  key={decimal}
                  data-value={decimal}
                  onClick={() => {
                    if (isDisabled) return;
                    applySelection(
                      selectionRef.current.whole,
                      decimal,
                      'smooth',
                      true
                    );
                  }}
                  className={`h-16 flex items-center justify-center text-2xl font-bold snap-center cursor-pointer transition-all ${
                    selectedDecimal === decimal
                      ? 'text-foreground scale-110'
                      : 'text-muted'
                  } ${isDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  .{decimal}
                </div>
              );
            })}
            <div className="h-16" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const BodyFatPickerModal = ({
  isOpen,
  isClosing,
  value,
  onCancel,
  onSave,
}) => {
  const draftValueRef = useRef(value);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        Select Body Fat
      </h3>
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        Percentage
      </p>

      <BodyFatPicker
        value={value}
        onChange={(nextValue) => {
          draftValueRef.current = nextValue;
        }}
      />

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave?.(draftValueRef.current)}
          type="button"
          className="flex-1 bg-primary active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};

export const BodyFatEntryModal = ({
  isOpen,
  isClosing,
  mode = 'add',
  date,
  bodyFat,
  isDateLocked,
  error,
  onDateChange,
  onBodyFatChange,
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
          <label className="text-muted text-sm block mb-2">Body Fat</label>
          <BodyFatPicker value={bodyFat} onChange={onBodyFatChange} />
          <p className="text-muted text-xs mt-2 text-center">
            {formattedBodyFat}
          </p>
        </div>

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
              Date locked because today&#39;s entry already exists.
            </p>
          )}
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
