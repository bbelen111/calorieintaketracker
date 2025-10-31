import React from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const GoalModal = ({
  isOpen,
  isClosing,
  goals,
  tempSelectedGoal,
  onSelect,
  onCancel,
  onSave,
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    contentClassName="w-full md:max-w-2xl p-4 md:p-6"
  >
    <h3 className="text-white font-bold text-xl md:text-2xl mb-4 md:mb-6">
      Select Your Goal
    </h3>

    <div className="grid grid-cols-1 gap-3">
      {Object.entries(goals).map(([key, goal]) => {
        const Icon = goal.icon;
        const isActive = tempSelectedGoal === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${
              isActive
                ? `${goal.color} border-white text-white shadow-lg`
                : 'bg-slate-700 border-slate-600 text-slate-300'
            }`}
            type="button"
          >
            <div className="flex items-center gap-4">
              <Icon size={32} className="flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-lg">{goal.label}</p>
                <p className="text-sm opacity-90 mt-1">{goal.desc}</p>
                {goal.warning && (
                  <p className="text-xs opacity-75 mt-2 line-clamp-2">
                    {goal.warning}
                  </p>
                )}
              </div>
              {isActive && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-white" />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>

    <div className="flex gap-2 md:gap-3 mt-4">
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
        className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
      >
        <Save size={20} />
        <span className="hidden sm:inline">Save &amp;</span> Close
      </button>
    </div>
  </ModalShell>
);
