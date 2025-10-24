import React from 'react';
import { Calendar, Scale, Trash2 } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatWeight } from '../../../utils/weight';

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
  onDelete
}) => {
  const isEdit = mode === 'edit';
  const formattedWeight = (() => {
    const normalized = formatWeight(weight);
    return normalized ? `${normalized} kg` : 'Select weight';
  })();

  const handleDateChange = (event) => {
    if (isDateLocked) {
      return;
    }
    onDateChange?.(event.target.value);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
  overlayClassName="!z-[90]"
      contentClassName="p-6 w-full max-w-lg"
    >
      <h3 className="text-white font-bold text-xl text-center mb-2">
        {isEdit ? 'Edit Weight Entry' : 'Add Weight Entry'}
      </h3>
      <p className="text-slate-400 text-sm text-center mb-6">
        Log one weight per day to keep your progress up to date.
      </p>

      <div className="space-y-5">
        <div>
          <label className="text-slate-300 text-sm block mb-2">Entry Date</label>
          <div className="relative">
            <input
              type="date"
              value={date ?? ''}
              onChange={handleDateChange}
              disabled={isDateLocked}
              className={`w-full bg-slate-700 text-white px-4 pr-12 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                isDateLocked ? 'border-slate-600 opacity-80 cursor-not-allowed' : 'border-slate-600 focus:border-blue-400'
              }`}
            />
            <Calendar size={18} className="text-slate-400 absolute top-1/2 -translate-y-1/2 right-3" />
          </div>
          {isDateLocked && (
            <p className="text-slate-500 text-xs mt-1">Date locked because today\'s entry already exists.</p>
          )}
        </div>

        <div>
          <label className="text-slate-300 text-sm block mb-2">Weight</label>
          <button
            type="button"
            onClick={() => onRequestWeightPicker?.()}
            className="w-full bg-gradient-to-r from-blue-900/40 to-blue-800/30 hover:from-blue-800/40 hover:to-blue-700/30 border border-blue-700/50 rounded-lg px-4 py-4 flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-950/60 border border-blue-700/60 flex items-center justify-center">
                <Scale size={22} className="text-blue-300" />
              </div>
              <div className="text-left">
                <p className="text-white text-2xl font-semibold leading-none">{formattedWeight}</p>
                <p className="text-slate-400 text-xs uppercase tracking-wide mt-1">Tap to adjust weight</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-6">
        {isEdit && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red-600/80 text-red-300 hover:bg-red-900/30 transition-all"
          >
            <Trash2 size={18} />
            Delete Entry
          </button>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-all"
          >
            Save Entry
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
