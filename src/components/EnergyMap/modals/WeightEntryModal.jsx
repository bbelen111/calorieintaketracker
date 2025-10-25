import React from 'react';
import { Calendar, Scale, Trash2, Save } from 'lucide-react';
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
            className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all active:scale-[0.98] flex flex-wrap items-center gap-x-3 gap-y-1 text-left hover:bg-blue-500/90 font-semibold text-base"
          >
            <span className="font-semibold text-base">{formattedWeight}</span>
            <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">Tap to adjust</span>
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      <div className="flex gap-3 mt-6">
        {isEdit && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center bg-red-900/30 justify-center gap-2 px-4 py-2 rounded-lg border border-red-600/80 text-red-300 hover:bg-red-900/30 transition-all"
          >
            <Trash2 size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 bg-slate-700 active:bg-slate-600 text-white ${isEdit ? 'px-3' : 'px-6'} py-3 rounded-lg transition-all active:scale-95 font-medium`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className={`flex-1 bg-green-600 active:bg-green-700 text-white ${isEdit ? 'px-3' : 'px-6'} py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium`}
        >
          <Save size={20} />
          Save Entry
        </button>
      </div>
    </ModalShell>
  );
};
