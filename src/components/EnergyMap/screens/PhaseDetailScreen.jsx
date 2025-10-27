import React, { useMemo } from 'react';
import { ChevronLeft, Plus, TrendingUp, Calendar, Target, Zap, Activity, BarChart3 } from 'lucide-react';
import { goals } from '../../../constants/goals';
import { formatWeight } from '../../../utils/weight';
import { calculatePhaseMetrics, getPhaseCalendarData, getRecentDailyLogs } from '../../../utils/phases';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const CalendarHeatmap = ({ calendarData, onDateClick }) => {
  // Group by weeks
  const weeks = useMemo(() => {
    const weekArray = [];
    let currentWeek = [];
    
    calendarData.forEach((day, index) => {
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
        return 'bg-green-600 border-green-500 hover:bg-green-500';
      case 'partial':
        return 'bg-yellow-600 border-yellow-500 hover:bg-yellow-500';
      case 'empty':
      default:
        return 'bg-slate-700 border-slate-600 hover:bg-slate-600';
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
      <div className="text-slate-400 text-sm text-center py-4">
        No calendar data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Day labels */}
      <div className="grid grid-cols-7 gap-2 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div key={i} className="text-slate-500 text-xs text-center font-semibold">
            {day}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7 gap-2">
          {/* Pad start of first week if doesn't start on Sunday */}
          {weekIndex === 0 && week[0].dayOfWeek !== 0 && 
            Array.from({ length: week[0].dayOfWeek }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))
          }
          
          {week.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => onDateClick(day.date, day.log)}
              className={`aspect-square rounded-md border-2 flex items-center justify-center text-xs font-bold transition-all ${getStatusColor(day.status)}`}
              title={`${formatDate(day.date)} - ${day.status}`}
            >
              <span className="text-white">{getStatusSymbol(day.status)}</span>
            </button>
          ))}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 pt-2 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-green-600 border border-green-500" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-yellow-600 border border-yellow-500" />
          <span>Partial</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-slate-700 border border-slate-600" />
          <span>Empty</span>
        </div>
      </div>
    </div>
  );
};

const DailyLogCard = ({ log, onEdit }) => {
  const hasMacros = log.protein || log.carbs || log.fats;
  
  return (
    <button
      type="button"
      onClick={() => onEdit(log)}
      className="w-full text-left bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-semibold">{formatDate(log.date)}</span>
            {log.completed && (
              <span className="px-2 py-0.5 bg-green-900/30 border border-green-700 rounded text-green-300 text-xs font-semibold">
                ✓ Complete
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
            {log.calories && (
              <div className="flex items-center gap-1">
                <Zap size={14} className="text-yellow-400" />
                <span>{log.calories} cal</span>
              </div>
            )}
            {log.steps && (
              <div className="flex items-center gap-1">
                <Activity size={14} className="text-blue-400" />
                <span>{log.steps.toLocaleString()} steps</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {hasMacros && (
        <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
          {log.protein > 0 && <span>P: {log.protein}g</span>}
          {log.carbs > 0 && <span>C: {log.carbs}g</span>}
          {log.fats > 0 && <span>F: {log.fats}g</span>}
        </div>
      )}

      {log.notes && (
        <div className="mt-2 text-xs text-slate-400 line-clamp-2">
          {log.notes}
        </div>
      )}
    </button>
  );
};

export const PhaseDetailScreen = ({ 
  phase, 
  weightEntries = [],
  onBack, 
  onAddLog, 
  onEditLog,
  onViewInsights
}) => {
  const metrics = useMemo(
    () => calculatePhaseMetrics(phase, weightEntries),
    [phase, weightEntries]
  );

  const calendarData = useMemo(
    () => getPhaseCalendarData(phase),
    [phase]
  );

  const recentLogs = useMemo(
    () => getRecentDailyLogs(phase, 7),
    [phase]
  );

  const goal = goals[phase.goalType] || goals.maintenance;
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
    const start = new Date(phase.startDate + 'T00:00:00');
    const now = new Date();
    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [phase.startDate]);

  const weightChangeDisplay = metrics.weightChange === 0 
    ? '—' 
    : `${metrics.weightChange > 0 ? '+' : ''}${formatWeight(Math.abs(metrics.weightChange))} kg`;

  const weeklyRateDisplay = metrics.avgWeeklyRate === 0
    ? '0.0 kg/wk'
    : `${metrics.avgWeeklyRate > 0 ? '+' : ''}${metrics.avgWeeklyRate.toFixed(2)} kg/wk`;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ChevronLeft size={20} />
          <span className="font-semibold">Back to Logbook</span>
        </button>

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{phase.name}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {isActive && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/30 border border-green-700 rounded-md text-green-300 text-xs font-semibold">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  ACTIVE
                </span>
              )}
              <span className={`px-2 py-1 rounded-md text-xs font-semibold ${goal.bgColor} ${goal.textColor} border ${goal.borderColor}`}>
                {goal.label}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="flex items-center gap-1 text-slate-400 mb-1">
              <Calendar size={14} />
              <span>Period</span>
            </div>
            <div className="text-white font-semibold">
              {formatDateShort(phase.startDate)}
              {phase.endDate ? ` - ${formatDateShort(phase.endDate)}` : ' - Ongoing'}
            </div>
            {isActive && metrics.totalDays > 0 && (
              <div className="text-slate-400 text-xs mt-1">
                Day {currentDay} of {metrics.totalDays}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1 text-slate-400 mb-1">
              <TrendingUp size={14} />
              <span>Weight</span>
            </div>
            <div className="text-white font-semibold">
              {weightChangeDisplay}
            </div>
            <div className="text-slate-400 text-xs mt-1">
              {weeklyRateDisplay}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 text-slate-400 mb-1">
              <Target size={14} />
              <span>Progress</span>
            </div>
            <div className="text-white font-semibold">
              {metrics.activeDays} / {metrics.totalDays} days
            </div>
            <div className="text-slate-400 text-xs mt-1">
              {metrics.completionRate}% logged
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 text-slate-400 mb-1">
              <Zap size={14} />
              <span>Avg Calories</span>
            </div>
            <div className="text-white font-semibold">
              {metrics.avgCalories > 0 ? metrics.avgCalories.toLocaleString() : '—'}
            </div>
            {metrics.avgSteps > 0 && (
              <div className="text-slate-400 text-xs mt-1">
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
          className="px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Log Today
        </button>
        <button
          type="button"
          onClick={onViewInsights}
          className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
        >
          <BarChart3 size={20} />
          View Insights
        </button>
      </div>

      {/* Calendar */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-blue-400" />
          Daily Log Calendar
        </h2>
        <CalendarHeatmap calendarData={calendarData} onDateClick={handleCalendarDateClick} />
      </div>

      {/* Recent Logs */}
      {recentLogs.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
          <h2 className="text-white font-bold text-lg mb-4">Recent Logs</h2>
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <DailyLogCard key={log.date} log={log} onEdit={onEditLog} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State for Logs */}
      {recentLogs.length === 0 && (
        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="text-slate-400" size={32} />
            </div>
            <h3 className="text-white font-bold text-xl mb-2">No Logs Yet</h3>
            <p className="text-slate-400 text-sm mb-6">
              Start tracking your progress by adding your first daily log.
            </p>
            <button
              type="button"
              onClick={() => onAddLog()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all inline-flex items-center gap-2"
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
