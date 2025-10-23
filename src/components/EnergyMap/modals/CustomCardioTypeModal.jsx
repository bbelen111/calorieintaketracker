import React from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const CustomCardioTypeModal = ({
  isOpen,
  isClosing,
  name,
  metLight,
  metModerate,
  metVigorous,
  onNameChange,
  onMetLightChange,
  onMetModerateChange,
  onMetVigorousChange,
  onCancel,
  onSave,
  canSave
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    overlayClassName="bg-black/90 z-[80]"
    contentClassName="p-6 w-full max-w-md"
  >
    <h3 className="text-white font-bold text-xl mb-4 text-center">Create Custom Cardio</h3>

    <div className="space-y-4">
      <div>
        <label className="text-slate-300 text-sm block mb-2">Cardio Name</label>
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g., Outdoor Soccer Scrimmage"
          className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-slate-300 text-sm block mb-2">Light MET</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={metLight}
            onChange={(event) => onMetLightChange(event.target.value)}
            className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
          />
        </div>
        <div>
          <label className="text-slate-300 text-sm block mb-2">Moderate MET</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={metModerate}
            onChange={(event) => onMetModerateChange(event.target.value)}
            className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
          />
        </div>
        <div>
          <label className="text-slate-300 text-sm block mb-2">Vigorous MET</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={metVigorous}
            onChange={(event) => onMetVigorousChange(event.target.value)}
            className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
          />
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        MET values estimate intensity: light for easy pace, moderate for steady work, vigorous for all-out efforts.
      </p>
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
        disabled={!canSave}
        className={`flex-1 bg-green-600 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium ${
          canSave ? 'active:bg-green-700' : 'opacity-60 cursor-not-allowed'
        }`}
      >
        <Save size={20} />
        Save
      </button>
    </div>
  </ModalShell>
);
