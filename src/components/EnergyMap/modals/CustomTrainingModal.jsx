import React from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const CustomTrainingModal = ({
  isOpen,
  isClosing,
  name,
  calories,
  description,
  onNameChange,
  onCaloriesChange,
  onDescriptionChange,
  onCancel,
  onSave
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    overlayClassName="bg-black/90 z-[70]"
    contentClassName="p-6 w-full max-w-md"
  >
    <h3 className="text-white font-bold text-xl mb-4 text-center">Custom Training Type</h3>

    <div className="space-y-4">
      <div>
        <label className="text-slate-300 text-sm block mb-2">Training Name</label>
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="My Training"
          className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
        />
      </div>

      <div>
        <label className="text-slate-300 text-sm block mb-2">Description</label>
        <input
          type="text"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Custom training style"
          className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
        />
      </div>

      <div>
        <label className="text-slate-300 text-sm block mb-2">Calories Per Hour</label>
        <input
          type="number"
          value={calories}
          onChange={(event) => onCaloriesChange(parseInt(event.target.value, 10) || 0)}
          placeholder="220"
          className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
        />
        <p className="text-slate-400 text-xs mt-1">Typical range: 180-300 cal/hr</p>
      </div>
    </div>

    <div className="flex gap-3 mt-6">
      <button
        onClick={onCancel}
        type="button"
        className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        type="button"
        className="flex-1 bg-green-600 active:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
      >
        <Save size={20} />
        Save
      </button>
    </div>
  </ModalShell>
);
