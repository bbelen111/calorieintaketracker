import React, { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Lightweight date picker modal — replaces the broken WebView `<input type="date">` dialog.
 *
 * Props:
 *  - isOpen / isClosing / onClose — standard modal lifecycle
 *  - selectedDate — current value as 'YYYY-MM-DD' (or '' / null)
 *  - onSelect(dateStr) — called with 'YYYY-MM-DD' when a day is tapped
 *  - minDate — optional 'YYYY-MM-DD' lower bound
 *  - maxDate — optional 'YYYY-MM-DD' upper bound
 */
export const DatePickerModal = ({
  isOpen,
  isClosing,
  onClose,
  selectedDate,
  onSelect,
  minDate,
  maxDate,
}) => {
  // Determine initial month view from selectedDate or today
  const initialDate = selectedDate
    ? new Date(selectedDate + 'T00:00:00')
    : new Date();

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Build 42-cell calendar grid (6 weeks)
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startDow = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells = [];

    // Previous month ghost days
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({ day: d, month: m, year: y, ghost: true });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month: viewMonth, year: viewYear, ghost: false });
    }

    // Next month ghost days (fill to 42)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({ day: d, month: m, year: y, ghost: true });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const toDateStr = useCallback(
    (cell) =>
      `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`,
    []
  );

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  const isDisabled = useCallback(
    (dateStr) => {
      if (minDate && dateStr < minDate) return true;
      if (maxDate && dateStr > maxDate) return true;
      return false;
    },
    [minDate, maxDate]
  );

  const goToPrevMonth = () => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  };

  const goToNextMonth = () => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  };

  const goToToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  };

  const handleSelect = (cell) => {
    const dateStr = toDateStr(cell);
    if (isDisabled(dateStr)) return;
    onSelect(dateStr);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-5 w-full max-w-sm"
    >
      {/* Header — Month/Year + nav arrows */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="p-2 rounded-lg md:hover:bg-surface-highlight pressable-inline focus-ring"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} className="text-foreground" />
        </button>

        <button
          type="button"
          onClick={goToToday}
          className="text-foreground font-bold text-base md:hover:text-accent-blue transition-colors focus-ring rounded px-2 py-1"
          aria-label="Go to today"
        >
          {MONTH_NAMES[viewMonth]} {viewYear}
        </button>

        <button
          type="button"
          onClick={goToNextMonth}
          className="p-2 rounded-lg md:hover:bg-surface-highlight pressable-inline focus-ring"
          aria-label="Next month"
        >
          <ChevronRight size={20} className="text-foreground" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map((label, i) => (
          <div
            key={i}
            className={`text-center text-[11px] font-semibold pb-1 ${
              i === 0 ? 'text-accent-red' : 'text-muted'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((cell, i) => {
          const dateStr = toDateStr(cell);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          const disabled = cell.ghost || isDisabled(dateStr);

          let cellClass =
            'aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-colors';

          if (disabled) {
            cellClass += ' text-muted/30 cursor-default';
          } else if (isSelected) {
            cellClass +=
              ' bg-accent-blue text-white font-bold ring-2 ring-accent-blue/50';
          } else if (isToday) {
            cellClass +=
              ' border-2 border-accent-blue text-accent-blue font-bold md:hover:bg-accent-blue/10';
          } else {
            cellClass +=
              ' text-foreground md:hover:bg-surface-highlight active:bg-surface-highlight';
          }

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && handleSelect(cell)}
              className={cellClass}
              aria-label={dateStr}
              aria-selected={isSelected}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-surface-highlight text-foreground py-2.5 rounded-lg font-medium md:hover:bg-surface transition-colors focus-ring press-feedback"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
};
