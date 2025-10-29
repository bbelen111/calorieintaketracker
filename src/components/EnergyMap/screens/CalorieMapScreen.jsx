import React from 'react';
import { Info, ListChecks, Map } from 'lucide-react';

export const CalorieMapScreen = ({
  stepRanges,
  selectedGoal,
  selectedDay,
  goals,
  onManageStepRanges,
  onOpenBreakdown,
  getRangeDetails,
  isSelectedRange
}) => (
  <div className="space-y-6 pb-10">
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-start gap-3">
            <Map className="text-blue-400" size={32} />
            <h1 className="text-2xl font-bold text-white">Calorie Map</h1>
          </div>
          <div className="mt-1">
            <span className="text-blue-300 text-sm tracking-widest font-semibold uppercase">
              {goals[selectedGoal].label}
            </span>
            <span className="text-slate-400 text-base font-normal ml-2">
              ({selectedDay === 'training' ? 'Training Day' : 'Rest Day'})
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onManageStepRanges}
          className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-all"
        >
          <ListChecks size={16} />
          Manage Step Ranges
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stepRanges.map((steps) => {
          const { breakdown, targetCalories, difference } = getRangeDetails(steps);
          const isActive = isSelectedRange(steps);

          return (
            <button
              key={steps}
              type="button"
              onClick={() => onOpenBreakdown(steps)}
              className={`group relative w-full text-left bg-slate-700 rounded-xl p-4 transition-all ${
                isActive ? 'ring-2 ring-blue-400 bg-slate-700/90' : 'hover:bg-slate-600'
              }`}
              aria-expanded={isActive}
              aria-label={`View calorie breakdown for ${steps} steps`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-slate-400 text-sm">Steps</p>
                  <p className="text-white font-bold text-lg">{steps}</p>
                </div>
                <Info
                  size={18}
                  className={`mt-1 ${isActive ? 'text-blue-300' : 'text-slate-400 group-hover:text-blue-300'}`}
                />
              </div>
              <div className={`${goals[selectedGoal].color} rounded-lg p-3 mb-2 text-center`}>
                <p className="text-white text-2xl font-bold">{targetCalories.toLocaleString()}</p>
                <p className="text-white text-xs opacity-90">calories</p>
              </div>
              <p className="text-slate-400 text-xs">TDEE: {breakdown.total.toLocaleString()}</p>
              {difference !== 0 && (
                <p className={`text-xs font-semibold mt-1 ${difference > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {difference > 0 ? '+' : ''}
                  {difference.toLocaleString()} cal
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
