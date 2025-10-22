import React from 'react';
import { Info } from 'lucide-react';

export const InsightsScreen = ({ userData, selectedGoal }) => (
  <div className="space-y-6 pb-10">
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
      <h2 className="text-xl font-bold text-white mb-4">Macro Recommendations</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4">
          <p className="text-red-400 font-bold mb-2">Protein</p>
          <p className="text-white text-2xl font-bold">
            {Math.round(userData.weight * 2.0)}-{Math.round(userData.weight * 2.4)}g
          </p>
          <p className="text-slate-400 text-sm">2.0-2.4g per kg bodyweight</p>
        </div>
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
          <p className="text-yellow-400 font-bold mb-2">Fats</p>
          <p className="text-white text-2xl font-bold">
            {Math.round(userData.weight * 0.8)}-{Math.round(userData.weight * 1.0)}g
          </p>
          <p className="text-slate-400 text-sm">0.8-1.0g per kg bodyweight</p>
        </div>
        <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4">
          <p className="text-blue-400 font-bold mb-2">Carbs</p>
          <p className="text-white text-lg font-bold">Remaining calories</p>
          <p className="text-slate-400 text-sm">Adjust based on energy needs</p>
        </div>
      </div>
      {selectedGoal === 'aggressive_cut' && (
        <div className="mt-4 bg-red-900/40 border border-red-600/80 rounded-xl p-4 flex items-start gap-3">
          <Info size={20} className="text-red-300 flex-shrink-0 mt-0.5" />
          <p className="text-red-100 text-sm">
            During an aggressive cut, push protein to the upper end of the {Math.round(userData.weight * 2.4)}g+ range to help preserve lean mass. Consider exceeding this slightly if recovery or satiety suffer.
          </p>
        </div>
      )}
    </div>

    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
      <h2 className="text-xl font-bold text-white mb-4">Tips</h2>
      <ul className="space-y-2 text-slate-300">
        <li className="flex items-start gap-2">
          <span className="text-blue-400 mt-1">•</span>
          <span>Track your steps daily to use the accurate calorie target</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-blue-400 mt-1">•</span>
          <span>On training days, fuel your sessions properly with higher carbs pre-workout</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-blue-400 mt-1">•</span>
          <span>Cardio burns are calculated using MET values based on your weight</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-blue-400 mt-1">•</span>
          <span>Different training types burn calories at different rates - adjust accordingly</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-blue-400 mt-1">•</span>
          <span>Weigh yourself weekly and adjust if progress stalls for 2+ weeks</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-blue-400 mt-1">•</span>
          <span>For lean bulk: aim for 0.25-0.5kg gain per week. For aggressive bulk: 0.5-1kg per week</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-blue-400 mt-1">•</span>
          <span>For moderate cut: aim for 0.5kg loss per week. For aggressive cut: 0.75-1kg per week</span>
        </li>
      </ul>
    </div>
  </div>
);
