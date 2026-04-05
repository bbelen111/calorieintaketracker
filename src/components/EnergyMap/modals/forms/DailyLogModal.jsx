import React, { useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { DateInput } from '../../common/DateInput';
import {
  Trash2,
  Calendar,
  Scale,
  Target,
  Utensils,
  StickyNote,
  CheckCircle2,
} from 'lucide-react';
import { formatWeight } from '../../../../utils/measurements/weight';
import { formatBodyFat } from '../../../../utils/measurements/bodyFat';
import { formatOne } from '../../../../utils/formatting/format';
import {
  getNutritionTotalsForDate,
  hasNutritionEntriesForDate,
} from '../../../../utils/phases/phases';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';

export const DailyLogModal = ({
  isOpen,
  isClosing,
  mode = 'add',
  date,
  weightRef,
  bodyFatRef,
  nutritionRef,
  notes,
  completed,
  availableWeightEntries = [],
  availableBodyFatEntries = [],
  availableNutritionData = {},
  onDateChange,
  onWeightRefChange,
  onBodyFatRefChange,
  onNutritionRefChange,
  onNotesChange,
  onCompletedChange,
  onManageWeightClick,
  onManageBodyFatClick,
  onManageNutritionClick,
  bodyFatTrackingEnabled = true,
  onCancel,
  onSave,
  onDelete,
  error,
  isDateLocked = false,
}) => {
  const { weightEntries, bodyFatEntries } = useEnergyMapStore(
    (state) => ({
      weightEntries: state.weightEntries,
      bodyFatEntries: state.bodyFatEntries,
    }),
    shallow
  );

  const resolvedWeightEntries = availableWeightEntries ?? weightEntries;
  const resolvedBodyFatEntries = availableBodyFatEntries ?? bodyFatEntries;
  const resolvedNutritionData =
    availableNutritionData && typeof availableNutritionData === 'object'
      ? availableNutritionData
      : {};

  // Find weight entry that matches the selected date
  const matchingWeight = resolvedWeightEntries.find(
    (entry) => entry.date === date
  );
  const matchingBodyFat = resolvedBodyFatEntries.find(
    (entry) => entry.date === date
  );
  const matchingNutritionRef = hasNutritionEntriesForDate(
    resolvedNutritionData,
    date
  )
    ? date
    : '';
  const nutritionTotals = getNutritionTotalsForDate(
    resolvedNutritionData,
    date
  );

  // State for notes toggle
  const [showNotes, setShowNotes] = useState(!!notes);

  useEffect(() => {
    setShowNotes(Boolean(notes));
  }, [notes]);

  useEffect(() => {
    const nextWeightRef = matchingWeight?.date ?? '';
    if (nextWeightRef !== (weightRef || '')) {
      onWeightRefChange?.(nextWeightRef);
    }

    if (matchingNutritionRef !== (nutritionRef || '')) {
      onNutritionRefChange?.(matchingNutritionRef);
    }

    if (!bodyFatTrackingEnabled) {
      if ((bodyFatRef || '') !== '') {
        onBodyFatRefChange?.('');
      }
      return;
    }

    const nextBodyFatRef = matchingBodyFat?.date ?? '';
    if (nextBodyFatRef !== (bodyFatRef || '')) {
      onBodyFatRefChange?.(nextBodyFatRef);
    }
  }, [
    bodyFatRef,
    bodyFatTrackingEnabled,
    matchingBodyFat?.date,
    matchingWeight?.date,
    onBodyFatRefChange,
    onNutritionRefChange,
    onWeightRefChange,
    nutritionRef,
    weightRef,
    matchingNutritionRef,
  ]);

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
      <h3 className="text-foreground font-bold text-xl mb-4">
        {mode === 'edit' ? 'Edit Daily Log' : 'Add Daily Log'}
      </h3>

      <div className="space-y-5">
        {/* Date */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2 flex items-center gap-2">
            <Calendar size={16} />
            Date
          </label>
          {isDateLocked ? (
            <div>
              <div className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground">
                {formatDateLabel(date)}
              </div>
              <p className="text-muted text-xs mt-1">
                Date cannot be changed when editing a log.
              </p>
            </div>
          ) : (
            <DateInput
              value={formatDateForInput(date)}
              onChange={(val) => onDateChange(val)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-accent-blue focus-ring"
            />
          )}
        </div>

        {/* Body Fat Section */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2 flex items-center gap-2">
            <Target size={16} className="text-accent-amber" />
            Body Fat Entry
          </label>

          {bodyFatTrackingEnabled ? (
            <button
              type="button"
              onClick={() => onManageBodyFatClick?.()}
              className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-accent-amber border-accent-amber/70 text-primary-foreground transition-all press-feedback flex flex-wrap items-center gap-x-3 gap-y-1 text-left focus-ring md:hover:brightness-110"
            >
              {matchingBodyFat ? (
                <>
                  <span className="font-semibold text-sm md:text-base">
                    {formatBodyFat(matchingBodyFat.bodyFat)}%
                  </span>
                  <span className="text-xs md:text-sm opacity-90 ml-auto whitespace-nowrap">
                    {formatShortDate(matchingBodyFat.date)}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-sm md:text-base opacity-80">
                    No body fat entry
                  </span>
                  <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
                    Tap to manage
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-surface-highlight border-border text-muted transition-all flex flex-wrap items-center gap-x-3 gap-y-1 text-left opacity-60 cursor-not-allowed"
            >
              <span className="font-semibold text-sm md:text-base">
                Body fat tracking disabled
              </span>
              <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
                Enable in settings
              </span>
            </button>
          )}
        </div>

        {/* Weight Section */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2 flex items-center gap-2">
            <Scale size={16} className="text-accent-purple" />
            Weight Entry
          </label>

          <button
            type="button"
            onClick={() => onManageWeightClick?.()}
            className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-primary border-accent-blue text-primary-foreground transition-all press-feedback flex flex-wrap items-center gap-x-3 gap-y-1 text-left focus-ring md:hover:brightness-110"
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

        {/* Nutrition Section */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2 flex items-center gap-2">
            <Utensils size={16} className="text-accent-green" />
            Nutrition Log
          </label>

          <button
            type="button"
            onClick={() => onManageNutritionClick?.()}
            className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-accent-green border-accent-green/70 text-primary-foreground transition-all press-feedback flex flex-wrap items-center gap-x-3 gap-y-1 text-left focus-ring md:hover:brightness-110"
          >
            {matchingNutritionRef ? (
              <>
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-sm md:text-base">
                    {formatOne(nutritionTotals.calories)} kcal
                  </span>
                  <span className="text-[11px] md:text-xs opacity-90">
                    P {formatOne(nutritionTotals.protein)}g · C{' '}
                    {formatOne(nutritionTotals.carbs)}g · F{' '}
                    {formatOne(nutritionTotals.fats)}g
                  </span>
                </div>
                <span className="text-xs md:text-sm opacity-90 ml-auto whitespace-nowrap">
                  {formatShortDate(matchingNutritionRef)}
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-sm md:text-base opacity-90">
                  No nutrition logged
                </span>
                <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
                  Tap to manage
                </span>
              </>
            )}
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
            className={`w-full px-4 py-3 rounded-lg border-2 transition-all press-feedback focus-ring flex items-center gap-3 font-semibold ${
              showNotes
                ? 'bg-accent-indigo border-accent-indigo/70 text-primary-foreground'
                : 'bg-surface border-border text-foreground md:hover:bg-surface-highlight'
            }`}
          >
            <StickyNote
              size={18}
              className={
                showNotes ? 'text-primary-foreground' : 'text-accent-purple'
              }
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
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent-blue focus-ring resize-none"
              autoFocus={showNotes}
            />
            <div className="text-muted text-xs mt-1 text-right">
              {notes.length}/500 characters
            </div>
          </div>
        </div>

        {/* Mark as Completed Button */}
        <button
          type="button"
          onClick={() => onCompletedChange(!completed)}
          className={`w-full px-4 py-4 rounded-lg border-2 transition-all press-feedback focus-ring flex items-center gap-3 font-semibold ${
            completed
              ? 'bg-accent-green border-accent-green/70 text-primary-foreground'
              : 'bg-surface border-border text-foreground md:hover:bg-surface-highlight'
          }`}
        >
          <CheckCircle2
            size={20}
            className={
              completed ? 'text-primary-foreground' : 'text-accent-green'
            }
          />
          <span>
            {completed ? 'Day Marked as Completed' : 'Mark Day as Completed'}
          </span>
          {completed && <span className="ml-auto text-xs opacity-90">✓</span>}
        </button>

        <div className="bg-surface-highlight/60 border border-border rounded-lg px-3 py-2 text-xs text-muted">
          Linked sources:{' '}
          <span className="font-semibold text-foreground">
            Weight {weightRef ? '✓' : '—'}
          </span>
          {' · '}
          <span className="font-semibold text-foreground">
            Body Fat {bodyFatRef ? '✓' : '—'}
          </span>
          {' · '}
          <span className="font-semibold text-foreground">
            Nutrition {nutritionRef ? '✓' : '—'}
          </span>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-accent-red/15 border border-accent-red/50 rounded-lg p-3">
            <p className="text-accent-red text-sm">{error}</p>
          </div>
        )}

        {/* Info Message */}
        {/* <div className="bg-accent-blue/15 border border-accent-blue/50 rounded-lg p-3">
          <p className="text-accent-blue text-xs">
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
            className="px-4 py-3 bg-accent-red/15 text-accent-red border border-accent-red/60 rounded-lg font-semibold transition-all press-feedback focus-ring md:hover:bg-accent-red/20"
          >
            <Trash2 size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 bg-surface-highlight text-foreground rounded-lg font-semibold transition-all press-feedback focus-ring md:hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold transition-all press-feedback focus-ring md:hover:brightness-110"
        >
          {mode === 'edit' ? 'Save Changes' : 'Add Log'}
        </button>
      </div>
    </ModalShell>
  );
};
