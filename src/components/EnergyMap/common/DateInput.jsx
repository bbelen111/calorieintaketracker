import React from 'react';
import { Calendar } from 'lucide-react';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { DatePickerModal } from '../modals/pickers/DatePickerModal';

/**
 * Drop-in replacement for `<input type="date">`.
 * Renders a styled button showing the formatted date and opens a custom
 * DatePickerModal on tap — avoids the broken Android WebView date picker.
 *
 * Props mirror the native date input:
 *  - value — 'YYYY-MM-DD' string (or '' / null)
 *  - onChange(dateStr) — called with 'YYYY-MM-DD'
 *  - disabled — prevent interaction
 *  - className — forwarded to the outer button
 *  - min — optional minimum date 'YYYY-MM-DD'
 *  - max — optional maximum date 'YYYY-MM-DD'
 *  - placeholder — text when no date selected
 */
export const DateInput = ({
  value,
  onChange,
  disabled = false,
  className = '',
  min,
  max,
  placeholder = 'Select date',
}) => {
  const modal = useAnimatedModal();

  const handleSelect = (dateStr) => {
    onChange?.(dateStr);
    modal.requestClose();
  };

  const displayText = value ? formatDisplayDate(value) : placeholder;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && modal.open()}
        className={`flex items-center justify-between text-left ${className}`}
      >
        <span className={value ? '' : 'text-muted'}>{displayText}</span>
        <Calendar size={16} className="text-muted flex-shrink-0 ml-2" />
      </button>

      <DatePickerModal
        isOpen={modal.isOpen}
        isClosing={modal.isClosing}
        onClose={modal.requestClose}
        selectedDate={value || ''}
        onSelect={handleSelect}
        minDate={min}
        maxDate={max}
      />
    </>
  );
};

/**
 * Format 'YYYY-MM-DD' into a human-readable string (e.g. "Mon, 1 Mar 2026")
 */
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
