import React from 'react';
import { Info } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const CaloriesPerHourGuideModal = ({ isOpen, isClosing, onClose }) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    overlayClassName="bg-black/90 z-[75]"
    contentClassName="p-6 max-w-lg w-full"
  >
    <div className="flex items-center gap-3 mb-4">
      <Info size={28} className="text-orange-300" />
      <h3 className="text-white font-bold text-xl">Choosing Calories Per Hour</h3>
    </div>

    <div className="space-y-4 text-slate-300 text-sm md:text-base">
      <p>
        Calories-per-hour for resistance work balances load moved, pace, and how gassed you feel. Pick the number that
        mirrors a typical session so recovery and nutrition stay on target.
      </p>

      <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4 space-y-2">
        <p className="text-white font-semibold text-sm uppercase tracking-wide">Quick Ladder</p>
        <div className="grid gap-2">
          <div className="flex justify-between text-xs md:text-sm">
            <span className="text-slate-400">Heavy strength, long rest</span>
            <span className="text-white font-semibold">~180-240 kcal</span>
          </div>
          <div className="flex justify-between text-xs md:text-sm">
            <span className="text-slate-400">Hypertrophy / accessories</span>
            <span className="text-white font-semibold">~240-320 kcal</span>
          </div>
          <div className="flex justify-between text-xs md:text-sm">
            <span className="text-slate-400">CrossFit / metcon density</span>
            <span className="text-white font-semibold">~320-420 kcal</span>
          </div>
          <div className="flex justify-between text-xs md:text-sm">
            <span className="text-slate-400">Olympic lifting + accessory work</span>
            <span className="text-white font-semibold">~260-360 kcal</span>
          </div>
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 space-y-2 text-xs md:text-sm">
        <p className="text-blue-200 font-semibold">Fine Tune It</p>
        <p><span className="text-white font-semibold">Body weight:</span> scale the range by your weight ÷ 75 kg.</p>
        <p><span className="text-white font-semibold">Pace:</span> work:rest 1:1 or faster? nudge the number up 10-20%.</p>
        <p><span className="text-white font-semibold">RPE guide:</span> RPE 5 feels easy → lower bound; RPE 8-9 → upper bound.</p>
      </div>

      <p className="text-xs md:text-sm text-slate-400 italic">
        Not sure? Start at the middle value, log a week, then adjust if you consistently feel over- or under-fueled.
      </p>
    </div>

    <div className="mt-6">
      <button
        onClick={onClose}
        type="button"
        className="w-full bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
      >
        Got it!
      </button>
    </div>
  </ModalShell>
);
