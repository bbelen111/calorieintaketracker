import React from 'react';
import { ModalShell } from '../common/ModalShell';
import { Calendar, Zap, Activity, StickyNote, Check } from 'lucide-react';

export const DailyLogModal = ({
  isOpen,
  isClosing,
  mode = 'add',
  date,
  calories,
  protein,
  carbs,
  fats,
  steps,
  notes,
  completed,
  onDateChange,
  onCaloriesChange,
  onProteinChange,
  onCarbsChange,
  onFatsChange,
  onStepsChange,
  onNotesChange,
  onCompletedChange,
  onCancel,
  onSave,
  onDelete,
  error,
  isDateLocked = false
}) => {
  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    return dateStr; // Already in YYYY-MM-DD format
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="w-full md:max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
      <h3 className="text-white font-bold text-xl mb-4">
        {mode === 'edit' ? 'Edit Daily Log' : 'Add Daily Log'}
      </h3>
      
      <div className="space-y-4">
        {/* Date */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
            <Calendar size={16} />
            Date
          </label>
          {isDateLocked ? (
            <div className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-slate-300">
              {formatDateLabel(date)}
            </div>
          ) : (
            <input
              type="date"
              value={formatDateForInput(date)}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Calories */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
            <Zap size={16} className="text-yellow-400" />
            Calories <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            value={calories}
            onChange={(e) => onCaloriesChange(e.target.value)}
            placeholder="e.g., 3200"
            min="0"
            max="10000"
            step="1"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Macros */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Macros <span className="text-slate-400 text-xs font-normal">(optional)</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Protein (g)</label>
              <input
                type="number"
                value={protein}
                onChange={(e) => onProteinChange(e.target.value)}
                placeholder="160"
                min="0"
                max="1000"
                step="1"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Carbs (g)</label>
              <input
                type="number"
                value={carbs}
                onChange={(e) => onCarbsChange(e.target.value)}
                placeholder="400"
                min="0"
                max="2000"
                step="1"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Fats (g)</label>
              <input
                type="number"
                value={fats}
                onChange={(e) => onFatsChange(e.target.value)}
                placeholder="89"
                min="0"
                max="500"
                step="1"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
            <Activity size={16} className="text-blue-400" />
            Steps <span className="text-slate-400 text-xs font-normal">(optional)</span>
          </label>
          <input
            type="number"
            value={steps}
            onChange={(e) => onStepsChange(e.target.value)}
            placeholder="e.g., 12000"
            min="0"
            max="100000"
            step="100"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
            <StickyNote size={16} className="text-purple-400" />
            Notes <span className="text-slate-400 text-xs font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="How was your day? Training notes, energy levels, etc."
            rows={3}
            maxLength={500}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <p className="text-slate-500 text-xs mt-1">
            {notes.length}/500 characters
          </p>
        </div>

        {/* Completed Toggle */}
        <div className="bg-slate-700 border border-slate-600 rounded-lg p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={completed}
              onChange={(e) => onCompletedChange(e.target.checked)}
              className="w-5 h-5 rounded border-slate-500 bg-slate-800 text-green-600 focus:ring-2 focus:ring-green-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-green-400" />
                <span className="text-white font-semibold">Mark as Complete</span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                Check this when you've finished logging all data for this day
              </p>
            </div>
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        {mode === 'edit' && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-3 bg-red-900 hover:bg-red-800 text-red-200 rounded-lg font-semibold transition-all"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all"
        >
          {mode === 'edit' ? 'Save Changes' : 'Add Log'}
        </button>
      </div>
    </ModalShell>
  );
};
