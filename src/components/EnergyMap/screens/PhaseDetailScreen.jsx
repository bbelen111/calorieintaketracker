import React, { useMemo } from 'react';
import {
  ChevronLeft,
  Plus,
  TrendingUp,
  Calendar,
  Target,
  Zap,
  Activity,
  Archive,
  Trash2,
} from 'lucide-react';
import { goals } from '../../../constants/goals';
import { formatWeight } from '../../../utils/weight';
import {
  calculatePhaseMetrics,
  getNutritionTotalsForDate,
  getPhaseCalendarData,
  getRecentDailyLogs,
} from '../../../utils/phases';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const CalendarHeatmap = ({ calendarData, onDateClick }) => {
  // Group by weeks
  const weeks = useMemo(() => {
    const weekArray = [];
    let currentWeek = [];

    calendarData.forEach((day) => {
      // Start new week on Sunday (dayOfWeek === 0)
      if (day.dayOfWeek === 0 && currentWeek.length > 0) {
        weekArray.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    });

    // Push last week if it has days
    if (currentWeek.length > 0) {
      weekArray.push(currentWeek);
    }

    return weekArray;
  }, [calendarData]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-accent-green border-accent-green md:hover:brightness-110';
      case 'partial':
        return 'bg-accent-yellow border-accent-yellow md:hover:brightness-110';
      case 'empty':
      default:
        return 'bg-surface-highlight border-border md:hover:border-border';
    }
  };

  const getStatusSymbol = (status) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'partial':
        return '○';
      case 'empty':
      default:
        return '—';
    }
  };

  if (weeks.length === 0) {
    return (
      <div className="text-muted text-sm text-center py-4">
        No calendar data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Day labels */}
      <div className="grid grid-cols-7 gap-2 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div key={i} className="text-muted text-xs text-center font-semibold">
            {day}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7 gap-2">
          {/* Pad start of first week if doesn't start on Sunday */}
          {weekIndex === 0 &&
            week[0].dayOfWeek !== 0 &&
            Array.from({ length: week[0].dayOfWeek }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}

          {week.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => onDateClick(day.date, day.log)}
              className={`aspect-square rounded-md border-2 flex items-center justify-center text-xs font-bold transition-all active:scale-95 pressable-card focus-ring ${getStatusColor(day.status)}`}
              title={`${formatDate(day.date)} - ${day.status}`}
            >
              <span className="text-foreground">
                {getStatusSymbol(day.status)}
              </span>
            </button>
          ))}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 pt-2 text-xs text-muted">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-accent-green border border-accent-green" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-accent-yellow border border-accent-yellow" />
          <span>Partial</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-surface-highlight border border-border" />
          <span>Empty</span>
        </div>
      </div>
    </div>
  );
};

const DailyLogCard = ({ log, nutritionTotals, onEdit }) => {
  const hasWeightRef = Boolean(log.weightRef?.trim());
  const hasBodyFatRef = Boolean(log.bodyFatRef?.trim());
  const hasNutritionRef = Boolean(log.nutritionRef?.trim());
  const hasNutritionTotals =
    Number(nutritionTotals?.calories || 0) > 0 ||
    Number(nutritionTotals?.protein || 0) > 0 ||
    Number(nutritionTotals?.carbs || 0) > 0 ||
    Number(nutritionTotals?.fats || 0) > 0;

  return (
    <button
      type="button"
      onClick={() => onEdit(log)}
      className="w-full text-left bg-surface border border-border rounded-lg p-4 md:hover:border-border transition-all pressable-card focus-ring"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-foreground font-semibold">
              {formatDate(log.date)}
            </span>
            {log.completed && (
              <span className="px-2 py-0.5 bg-accent-green/15 border border-accent-green/50 rounded text-accent-green text-xs font-semibold">
                ✓ Complete
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Activity size={14} className="text-accent-blue" />
              <span>Weight {hasWeightRef ? '✓' : '—'}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Target size={14} className="text-accent-amber" />
              <span>Body Fat {hasBodyFatRef ? '✓' : '—'}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap size={14} className="text-accent-yellow" />
              <span>Nutrition {hasNutritionRef ? '✓' : '—'}</span>
            </span>
          </div>
        </div>
      </div>

      {log.notes && (
        <div className="mt-2 text-xs text-muted line-clamp-2">{log.notes}</div>
      )}

      {hasNutritionRef && hasNutritionTotals && (
        <div className="mt-2 text-xs text-muted">
          {Math.round(nutritionTotals.calories)} kcal · P{' '}
          {Math.round(nutritionTotals.protein)}g · C{' '}
          {Math.round(nutritionTotals.carbs)}g · F{' '}
          {Math.round(nutritionTotals.fats)}g
        </div>
      )}
    </button>
  );
};

export const PhaseDetailScreen = ({
  phase,
  weightEntries,
  nutritionData,
  onBack,
  onAddLog,
  onEditLog,
  onArchive,
  onDelete,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      weightEntries: state.weightEntries ?? [],
      nutritionData: state.nutritionData ?? {},
    }),
    shallow
  );

  const resolvedWeightEntries = weightEntries ?? store.weightEntries;
  const resolvedNutritionData = nutritionData ?? store.nutritionData;

  const metrics = useMemo(
    () =>
      calculatePhaseMetrics(
        phase,
        resolvedWeightEntries,
        resolvedNutritionData
      ),
    [phase, resolvedNutritionData, resolvedWeightEntries]
  );

  const calendarData = useMemo(
    () => getPhaseCalendarData(phase, resolvedNutritionData),
    [phase, resolvedNutritionData]
  );

  const recentLogs = useMemo(
    () =>
      getRecentDailyLogs(phase, 7).map((log) => ({
        ...log,
        nutritionTotals: getNutritionTotalsForDate(
          resolvedNutritionData,
          log.nutritionRef
        ),
      })),
    [phase, resolvedNutritionData]
  );

  const goal = goals[phase.goalType] || goals.maintenance;
  // Helper for goal badge color classes
  const getGoalBadgeClass = () => {
    if (!goal || !goal.color)
      return 'bg-surface-highlight text-muted border-border';
    return `${goal.color} text-primary-foreground border-2 ${goal.color.replace('bg-', 'border-')}`;
  };
  const isActive = phase.status === 'active';

  const handleCalendarDateClick = (date, existingLog) => {
    if (existingLog) {
      onEditLog(existingLog);
    } else {
      onAddLog(date);
    }
  };

  const currentDay = useMemo(() => {
    if (!phase.startDate) return 1;
    const start = new Date(phase.startDate + 'T00:00:00Z');
    const now = new Date();
    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [phase.startDate]);

  const weightChangeDisplay =
    metrics.weightChange === 0
      ? '—'
      : `${metrics.weightChange > 0 ? '+' : ''}${formatWeight(Math.abs(metrics.weightChange))} kg`;

  const weeklyRateDisplay =
    metrics.avgWeeklyRate === 0
      ? '0.0 kg/wk'
      : `${metrics.avgWeeklyRate > 0 ? '+' : ''}${metrics.avgWeeklyRate.toFixed(2)} kg/wk`;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-muted transition-colors mb-4 press-feedback focus-ring md:hover:text-foreground"
        >
          <ChevronLeft size={20} />
          <span className="font-semibold">Back to Logbook</span>
        </button>

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {phase.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {isActive && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-green/15 border border-accent-green/50 rounded-md text-accent-green text-xs font-semibold">
                  <span className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
                  ACTIVE
                </span>
              )}
              <span
                className={`px-2 py-1 rounded-md text-xs font-semibold ${getGoalBadgeClass()}`}
              >
                {goal.label}
              </span>
            </div>
          </div>

          {/* Phase Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onArchive}
              className="p-2 text-muted rounded-lg transition-all pressable-inline focus-ring md:hover:text-accent-green md:hover:bg-surface-highlight"
              title="Archive Phase"
            >
              <Archive size={20} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-2 text-muted rounded-lg transition-all pressable-inline focus-ring md:hover:text-accent-red md:hover:bg-surface-highlight"
              title="Delete Phase"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="flex items-center gap-1 text-muted mb-1">
              <Calendar size={14} />
              <span>Period</span>
            </div>
            <div className="text-foreground font-semibold">
              {formatDateShort(phase.startDate)}
              {phase.endDate
                ? ` - ${formatDateShort(phase.endDate)}`
                : ' - Ongoing'}
            </div>
            {isActive && metrics.totalDays > 0 && (
              <div className="text-muted text-xs mt-1">
                Day {currentDay} of {metrics.totalDays}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1 text-muted mb-1">
              <TrendingUp size={14} />
              <span>Weight</span>
            </div>
            <div className="text-foreground font-semibold">
              {weightChangeDisplay}
            </div>
            <div className="text-muted text-xs mt-1">{weeklyRateDisplay}</div>
          </div>

          <div>
            <div className="flex items-center gap-1 text-muted mb-1">
              <Target size={14} />
              <span>Progress</span>
            </div>
            <div className="text-foreground font-semibold">
              {metrics.activeDays} / {metrics.totalDays} days
            </div>
            <div className="text-muted text-xs mt-1">
              {metrics.completionRate}% logged
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 text-muted mb-1">
              <Zap size={14} />
              <span>Avg Calories</span>
            </div>
            <div className="text-foreground font-semibold">
              {metrics.avgCalories > 0
                ? metrics.avgCalories.toLocaleString()
                : '—'}
            </div>
            {metrics.nutritionDays > 0 && (
              <div className="text-muted text-xs mt-1">
                P {Math.round(metrics.avgProtein)}g · C{' '}
                {Math.round(metrics.avgCarbs)}g · F{' '}
                {Math.round(metrics.avgFats)}g
              </div>
            )}
            {metrics.avgSteps > 0 && (
              <div className="text-muted text-xs mt-1">
                {metrics.avgSteps.toLocaleString()} steps
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onAddLog()}
          className="px-6 py-4 bg-primary text-primary-foreground rounded-xl font-semibold transition-all flex items-center justify-center gap-2 press-feedback focus-ring md:hover:brightness-110"
        >
          <Plus size={20} />
          Log Today
        </button>
      </div>

      {/* Calendar */}
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <h2 className="text-foreground font-bold text-lg mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-accent-blue" />
          Daily Log Calendar
        </h2>
        <CalendarHeatmap
          calendarData={calendarData}
          onDateClick={handleCalendarDateClick}
        />
      </div>

      {/* Recent Logs */}
      {recentLogs.length > 0 && (
        <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
          <h2 className="text-foreground font-bold text-lg mb-4">
            Recent Logs
          </h2>
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <DailyLogCard
                key={log.date}
                log={log}
                nutritionTotals={log.nutritionTotals}
                onEdit={onEditLog}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State for Logs */}
      {recentLogs.length === 0 && (
        <div className="bg-surface rounded-2xl p-8 border border-border text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-surface-highlight rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="text-muted" size={32} />
            </div>
            <h3 className="text-foreground font-bold text-xl mb-2">
              No Logs Yet
            </h3>
            <p className="text-muted text-sm mb-6">
              Start tracking your progress by adding your first daily log.
            </p>
            <button
              type="button"
              onClick={() => onAddLog()}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold transition-all inline-flex items-center gap-2 press-feedback focus-ring md:hover:brightness-110"
            >
              <Plus size={20} />
              Add First Log
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
