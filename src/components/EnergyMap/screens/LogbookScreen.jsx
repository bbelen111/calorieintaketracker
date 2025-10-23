import React from 'react';
import { ClipboardList } from 'lucide-react';

export const LogbookScreen = () => (
  <div className="space-y-6 pb-10">
    <div className="bg-slate-800 rounded-2xl p-6 md:p-8 border border-slate-700 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <ClipboardList className="text-blue-400" size={32} />
        <h1 className="text-2xl md:text-3xl font-bold text-white">Logbook</h1>
      </div>
      <p className="text-slate-300 text-sm md:text-base">
        This space is reserved for the future logbook experience. Start planning the layout, data summaries, and daily entries you would like to surface here.
      </p>
    </div>
  </div>
);
