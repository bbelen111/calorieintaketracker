import React, { useState } from 'react';
import { ModalShell } from '../common/ModalShell';
import {
  Save,
  Trash2,
  Calendar,
  Scale,
  Utensils,
  StickyNote,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
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
  onManageWeightClick,
  onCancel,
  onSave,
  onDelete,
  error,
  isDateLocked = false,
}) => {
  // Find weight entry that matches the selected date
  const matchingWeight = availableWeightEntries.find(
    (entry) => entry.date === date
  );

  // State for notes toggle
  const [showNotes, setShowNotes] = useState(!!notes);

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
      year: 'numeric',
    });
  };

  const formatShortDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="w-full md:max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
    >
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
            <div>
              <div className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-slate-300">
                {formatDateLabel(date)}
              </div>
              <p className="text-slate-500 text-xs mt-1">
                Date cannot be changed when editing a log.
              </p>
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
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
            <Scale size={16} className="text-purple-400" />
            Weight Entry
          </label>

          <button
            type="button"
            onClick={() => onManageWeightClick?.()}
            className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all active:scale-[0.98] flex flex-wrap items-center gap-x-3 gap-y-1 text-left hover:bg-blue-500/90"
          >
            {matchingWeight ? (
              <>
                <span className="font-semibold text-sm md:text-base">
                  {formatWeight(matchingWeight.weight)}kg
                </span>
                <span className="text-xs md:text-sm opacity-90 ml-auto whitespace-nowrap">
                  {formatShortDate(matchingWeight.date)}
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-sm md:text-base opacity-80">
                  No weight entry
                </span>
                <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
                  Tap to manage
                </span>
              </>
            )}
          </button>
        </div>

        {/* Nutrition Section - Coming Soon */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
            <Utensils size={16} className="text-green-400" />
            Nutrition Log
            <span className="ml-2 text-xs bg-amber-900/30 text-amber-300 px-2 py-1 rounded">
              Coming Soon
            </span>
          </label>

          <button
            type="button"
            disabled
            className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-slate-700 border-slate-600 text-slate-400 transition-all flex flex-wrap items-center gap-x-3 gap-y-1 text-left opacity-60 cursor-not-allowed"
          >
            <span className="font-semibold text-sm md:text-base">
              No nutrition tracker yet
            </span>
            <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
              Build tracker first
            </span>
          </button>
        </div>

        {/* Notes Toggle */}
        <div className="!mt-10">
          <button
            type="button"
            onClick={() => {
              setShowNotes(!showNotes);
              if (showNotes) {
                onNotesChange('');
              }
            }}
            className={`w-full px-4 py-3 rounded-lg border-2 transition-all active:scale-[0.98] flex items-center gap-3 font-semibold ${
              showNotes
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-750 hover:border-slate-500'
            }`}
          >
            <StickyNote
              size={18}
              className={showNotes ? 'text-white' : 'text-indigo-400'}
            />
            <span>
              {showNotes ? 'Notes Added' : 'Add Notes'}{' '}
              <span className="text-xs opacity-75">(optional)</span>
            </span>
            {showNotes && <span className="ml-auto text-xs opacity-90">✓</span>}
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              showNotes ? 'max-h-48 opacity-100 mt-3' : 'max-h-0 opacity-0'
            }`}
          >
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Any notes about this day..."
              rows={3}
              maxLength={500}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              autoFocus={showNotes}
            />
            <div className="text-slate-500 text-xs mt-1 text-right">
              {notes.length}/500 characters
            </div>
          </div>
        </div>

        {/* Mark as Completed Button */}
        <button
          type="button"
          onClick={() => onCompletedChange(!completed)}
          className={`w-full px-4 py-4 rounded-lg border-2 transition-all active:scale-[0.98] flex items-center gap-3 font-semibold ${
            completed
              ? 'bg-green-600 border-green-400 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-750 hover:border-slate-500'
          }`}
        >
          <CheckCircle2
            size={20}
            className={completed ? 'text-white' : 'text-green-400'}
          />
          <span>
            {completed ? 'Day Marked as Completed' : 'Mark Day as Completed'}
          </span>
          {completed && <span className="ml-auto text-xs opacity-90">✓</span>}
        </button>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Info Message */}
        {/* <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
          <p className="text-blue-200 text-xs">
            💡 <strong>How it works:</strong> The logbook links to existing data from your Weight Tracker and Nutrition Tracker.
            It doesn't store duplicate data - just references to keep everything organized by phases.
          </p>
        </div> */}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        {mode === 'edit' && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-3 bg-red-900 hover:bg-red-800 text-red-200 rounded-lg font-semibold transition-all"
          >
            <Trash2 size={18} />
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
          className="flex-1 px-4 py-3 bg-green-700 hover:bg-green-600 text-white rounded-lg font-semibold transition-all"
        >
          {mode === 'edit' ? 'Save Changes' : 'Add Log'}
        </button>
      </div>
    </ModalShell>
  );
};
