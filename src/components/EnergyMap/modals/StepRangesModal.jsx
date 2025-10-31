import React from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const StepRangesModal = ({
  isOpen,
  isClosing,
  stepRanges,
  newStepRange,
  onNewStepRangeChange,
  onAddRange,
  onRemoveRange,
  onClose,
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    overlayClassName="z-[60]"
    contentClassName="p-6 max-w-md w-full"
  >
    <h3 className="text-white font-bold text-xl mb-4">
      Edit Step Count Ranges
    </h3>

    <div className="space-y-4">
      <div>
        <label className="text-slate-300 text-sm block mb-2">
          Add New Range
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newStepRange}
            onChange={(event) => onNewStepRangeChange(event.target.value)}
            placeholder="e.g., 15k or >25k"
            className="flex-1 bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
          />
          <button
            onClick={onAddRange}
            type="button"
            className="bg-blue-600 active:bg-blue-700 text-white px-4 py-3 rounded-lg flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </div>

      <div>
        <label className="text-slate-300 text-sm block mb-2">
          Current Ranges
        </label>
        {stepRanges.length === 0 ? (
          <p className="text-slate-400 text-sm italic">
            No step ranges configured yet
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stepRanges.map((step) => (
              <div
                key={step}
                className="bg-slate-700 text-white px-3 py-2 rounded-lg flex items-center gap-2"
              >
                <span className="text-sm">{step}</span>
                <button
                  onClick={() => onRemoveRange(step)}
                  type="button"
                  className="text-red-400 active:text-red-300 transition-all p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    <div className="flex gap-2 md:gap-3 mt-6">
      <button
        onClick={onClose}
        type="button"
        className="flex-1 bg-green-600 active:bg-green-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
      >
        <Save size={20} />
        Done
      </button>
    </div>
  </ModalShell>
);
