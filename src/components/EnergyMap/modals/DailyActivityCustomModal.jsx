import React from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

const titles = {
  training: 'Custom Training Day NEAT',
  rest: 'Custom Rest Day NEAT'
};

export const DailyActivityCustomModal = ({
  isOpen,
  isClosing,
  dayType,
  value,
  onChange,
  onCancel,
  onSave
}) => {
  if (!isOpen || !dayType) {
    return null;
  }

  const handleInputChange = (event) => {
    const nextValue = parseFloat(event.target.value);
    onChange(Number.isFinite(nextValue) ? nextValue : 0);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[75]"
      contentClassName="p-4 md:p-6 w-full md:max-w-md"
    >
      <div className="mb-4 md:mb-6">
        <h3 className="text-white font-bold text-xl md:text-2xl">{titles[dayType]}</h3>
        <p className="text-slate-300 text-sm mt-2">
          Enter the percentage of your BMR that represents non-exercise movement on this day. This should exclude
          intentional workouts, cardio sessions, and tracked steps—those are calculated separately.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-slate-300 text-sm block" htmlFor="custom-activity-input">
          NEAT offset (% of BMR)
        </label>
        <input
          id="custom-activity-input"
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={value}
          onChange={handleInputChange}
          className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-lg"
        />
        <p className="text-slate-400 text-xs">
          Recommended range: 20% - 45% for most lifestyles. Values are capped between 0% and 100% and should reflect
          only incidental movement.
        </p>
      </div>

      <div className="flex gap-2 md:gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all active:scale-95 font-medium"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          type="button"
          className="flex-1 bg-green-600 active:bg-green-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
