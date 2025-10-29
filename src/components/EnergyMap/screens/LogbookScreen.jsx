import React, { useMemo } from 'react';
import { ClipboardList, Plus, Calendar, TrendingUp, Target, Archive } from 'lucide-react';
import { goals } from '../../../constants/goals';
import { formatWeight } from '../../../utils/weight';

const getPhaseStatusBadge = (status) => {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/30 border border-green-700 rounded-md text-green-300 text-xs font-semibold">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          ACTIVE
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded-md text-slate-400 text-xs font-semibold">
          <Archive size={12} />
          COMPLETED
        </span>
      );
    case 'paused':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-900/30 border border-yellow-700 rounded-md text-yellow-300 text-xs font-semibold">
          PAUSED
        </span>
      );
    default:
      return null;
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const calculatePhaseDays = (startDate, endDate) => {
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : new Date();
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const calculateCurrentDay = (startDate) => {
  const start = new Date(startDate + 'T00:00:00');
  const now = new Date();
  const diffTime = Math.abs(now - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const PhaseCard = ({ phase, onPhaseClick }) => {
  const goal = goals[phase.goalType] || goals.maintenance;
  // Helper for goal badge color classes
  const getGoalBadgeClass = () => {
    if (!goal || !goal.color) return 'bg-slate-700 text-slate-300 border-slate-600';
    return `${goal.color} text-white border-2 ${goal.color.replace('bg-', 'border-')}`;
  };
  const isActive = phase.status === 'active';
  const totalDays = phase.endDate ? calculatePhaseDays(phase.startDate, phase.endDate) : null;
  const currentDay = calculateCurrentDay(phase.startDate);
  
  const weightChange = phase.metrics?.weightChange || 0;
  const weightChangeDisplay = weightChange === 0 
    ? '—' 
    : `${weightChange > 0 ? '+' : ''}${formatWeight(weightChange)} kg`;

  return (
    <button
      type="button"
      onClick={() => onPhaseClick(phase)}
      className={`w-full text-left p-5 rounded-xl border-2 transition-all hover:scale-[1.02] ${
        isActive
          ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-blue-500 shadow-lg shadow-blue-900/20'
          : 'bg-slate-800 border-slate-700 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg mb-1">{phase.name}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {getPhaseStatusBadge(phase.status)}
            <span className={`px-2 py-1 rounded-md text-xs font-semibold ${getGoalBadgeClass()}`}>{goal.label}</span>
          </div>
        </div>
        <ClipboardList className={isActive ? 'text-blue-400' : 'text-slate-500'} size={24} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Calendar size={14} className="text-slate-500" />
          <span>
            {formatDate(phase.startDate)}
            {phase.endDate && ` - ${formatDate(phase.endDate)}`}
            {!phase.endDate && ' - Ongoing'}
          </span>
        </div>

        {isActive && totalDays && (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Target size={14} className="text-slate-500" />
            <span>Day {currentDay} of {totalDays}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-slate-300">
          <TrendingUp size={14} className="text-slate-500" />
          <span>
            {formatWeight(phase.startingWeight)} kg → {weightChangeDisplay}
            {phase.targetWeight && ` (Target: ${formatWeight(phase.targetWeight)} kg)`}
          </span>
        </div>

        {phase.metrics?.activeDays > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Logged Days:</span>
                <span className="ml-1 text-white font-semibold">{phase.metrics.activeDays}</span>
              </div>
              {phase.metrics.avgCalories > 0 && (
                <div>
                  <span className="text-slate-500">Avg Calories:</span>
                  <span className="ml-1 text-white font-semibold">{Math.round(phase.metrics.avgCalories)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </button>
  );
};

export const LogbookScreen = ({ phases = [], onCreatePhase, onPhaseClick }) => {
  const activePhases = useMemo(
    () => phases.filter((phase) => phase.status === 'active'),
    [phases]
  );
  
  const completedPhases = useMemo(
    () => phases.filter((phase) => phase.status === 'completed'),
    [phases]
  );

  const hasPhases = phases.length > 0;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="text-blue-400" size={32} />
            <h1 className="text-2xl md:text-3xl font-bold text-white">Logbook</h1>
          </div>
          <button
            type="button"
            onClick={onCreatePhase}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all flex items-center gap-2"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">New Phase</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {!hasPhases && (
        <div className="bg-slate-800 rounded-2xl p-8 md:p-12 border border-slate-700 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="text-slate-400" size={32} />
            </div>
            <h3 className="text-white font-bold text-xl mb-2">No Phases Yet</h3>
            <p className="text-slate-400 text-sm mb-6">
              Create your first phase to start organizing your fitness journey. Phases help you track specific goals like bulking, cutting, or maintaining over time.
            </p>
            <button
              type="button"
              onClick={onCreatePhase}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all inline-flex items-center gap-2"
            >
              <Plus size={20} />
              Create Your First Phase
            </button>
          </div>
        </div>
      )}

      {/* Active Phases */}
      {activePhases.length > 0 && (
        <div>
          <h2 className="text-white font-bold text-lg mb-3 px-1">Active Phases</h2>
          <div className="space-y-3">
            {activePhases.map((phase) => (
              <PhaseCard key={phase.id} phase={phase} onPhaseClick={onPhaseClick} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Phases */}
      {completedPhases.length > 0 && (
        <div>
          <h2 className="text-slate-400 font-bold text-lg mb-3 px-1 flex items-center gap-2">
            <Archive size={18} />
            Completed Phases
          </h2>
          <div className="space-y-3">
            {completedPhases.map((phase) => (
              <PhaseCard key={phase.id} phase={phase} onPhaseClick={onPhaseClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
