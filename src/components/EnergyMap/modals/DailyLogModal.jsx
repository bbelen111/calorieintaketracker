import React from 'react';
import { ModalShell } from '../common/ModalShell';
import { Calendar, Scale, Utensils, StickyNote, Check, AlertCircle } from 'lucide-react';
import { formatWeight } from '../../../utils/weight';

export const DailyLogModal = ({
  isOpen,
  isClosing,
  mode = 'add',
  date,
  weightRef,
  nutritionRef,
  notes,
  completed,
  availableWeightEntries = [],
  onDateChange,
  onWeightRefChange,
  onNutritionRefChange,
  onNotesChange,
  onCompletedChange,
  onCancel,
  onSave,
  onDelete,
  error,
  isDateLocked = false
}) => {
  // Find selected weight entry
  const selectedWeight = availableWeightEntries.find(entry => entry.date === weightRef);
  
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
    <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="w-full md:max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
      <h3 className="text-white font-bold text-xl mb-4">
        {mode === 'edit' ? 'Edit Daily Log' : 'Add Daily Log'}
      </h3>
      
      <div className="space-y-5">
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

        {/* Weight Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <label className="block text-slate-300 text-sm font-semibold mb-3 flex items-center gap-2">
            <Scale size={16} className="text-purple-400" />
            Weight Entry
          </label>
          
          {availableWeightEntries.length > 0 ? (
            <>
              <select
                value={weightRef || ''}
                onChange={(e) => onWeightRefChange(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              >
                <option value="">No weight entry selected</option>
                {availableWeightEntries.map((entry) => (
                  <option key={entry.date} value={entry.date}>
                    {formatDateLabel(entry.date)} - {formatWeight(entry.weight)} kg
                  </option>
                ))}
              </select>
              
              {selectedWeight && (
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-600">
                  <div className="text-slate-400 text-xs mb-1">Selected Weight:</div>
                  <div className="text-white text-lg font-bold">{formatWeight(selectedWeight.weight)} kg</div>
                  <div className="text-slate-500 text-xs mt-1">{formatDateLabel(selectedWeight.date)}</div>
                </div>
              )}
            </>
          ) : (
            <div className="text-slate-400 text-sm py-3 text-center">
              No weight entries available. Log your weight first in the Weight Tracker.
            </div>
          )}
        </div>

        {/* Nutrition Section - Coming Soon */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 opacity-60">
          <label className="block text-slate-300 text-sm font-semibold mb-3 flex items-center gap-2">
            <Utensils size={16} className="text-green-400" />
            Nutrition Log
            <span className="ml-auto text-xs bg-blue-900/30 text-blue-300 px-2 py-1 rounded">Coming Soon</span>
          </label>
          
          <div className="text-slate-400 text-sm py-6 text-center border-2 border-dashed border-slate-600 rounded-lg">
            <AlertCircle size={32} className="mx-auto mb-2 text-slate-500" />
            <div className="font-semibold mb-1">Nutrition Tracker Not Built Yet</div>
            <div className="text-xs">Build the calorie/macro tracker first, then link entries here</div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
            <StickyNote size={16} />
            Notes <span className="text-slate-400 text-xs font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Any notes about this day..."
            rows={3}
            maxLength={500}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="text-slate-500 text-xs mt-1 text-right">
            {notes.length}/500 characters
          </div>
        </div>

        {/* Completed Checkbox */}
        <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg p-4">
          <input
            type="checkbox"
            id="completed"
            checked={completed}
            onChange={(e) => onCompletedChange(e.target.checked)}
            className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-2 bg-slate-700"
          />
          <label htmlFor="completed" className="flex items-center gap-2 text-slate-300 font-medium cursor-pointer">
            <Check size={18} className="text-green-400" />
            Mark this day as completed
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Info Message */}
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
          <p className="text-blue-200 text-xs">
            💡 <strong>How it works:</strong> The logbook links to existing data from your Weight Tracker and Nutrition Tracker.
            It doesn't store duplicate data - just references to keep everything organized by phases.
          </p>
        </div>
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
