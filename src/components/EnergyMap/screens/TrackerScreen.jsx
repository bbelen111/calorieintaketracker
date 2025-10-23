import React from 'react';
import { Target } from 'lucide-react';

export const TrackerScreen = () => (
  <div className="space-y-6 pb-10">
    <div className="bg-slate-800 rounded-2xl p-6 md:p-8 border border-slate-700 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <Target className="text-emerald-400" size={32} />
        <h1 className="text-2xl md:text-3xl font-bold text-white">Tracker</h1>
      </div>
      <p className="text-slate-300 text-sm md:text-base">
        Build out real-time tracking widgets and progress summaries here when you are ready to flesh out the tracker experience.
      </p>
    </div>
  </div>
);
