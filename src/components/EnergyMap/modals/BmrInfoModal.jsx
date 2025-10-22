import React from 'react';
import { Info } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const BmrInfoModal = ({ isOpen, isClosing, userData, bmr, onClose }) => (
  <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="p-6 max-w-lg w-full">
    <div className="flex items-center gap-3 mb-4">
      <Info size={28} className="text-blue-400" />
      <h3 className="text-white font-bold text-xl">What is BMR?</h3>
    </div>

    <div className="space-y-4 text-slate-300">
      <p>
        <span className="font-bold text-white">BMR (Basal Metabolic Rate)</span> is the number of calories your body burns at complete rest to maintain basic life functions like breathing, circulation, and cell production.
      </p>

      <div className="bg-slate-700/50 rounded-lg p-4">
        <p className="font-bold text-white mb-2">How We Calculate Your BMR:</p>
        <p className="text-sm">
          We use the <span className="text-blue-400 font-semibold">Mifflin-St Jeor Equation</span>, one of the most accurate formulas:
        </p>
        <div className="mt-3 p-3 bg-slate-900/50 rounded font-mono text-xs md:text-sm overflow-x-auto">
          {userData.gender === 'male' ? (
            <div>
              <p className="text-green-400">For Men:</p>
              <p className="mt-1">BMR = (10 × weight) + (6.25 × height) - (5 × age) + 5</p>
            </div>
          ) : (
            <div>
              <p className="text-pink-400">For Women:</p>
              <p className="mt-1">BMR = (10 × weight) + (6.25 × height) - (5 × age) - 161</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
        <p className="font-bold text-blue-300 mb-2">Your Current Calculation:</p>
        <div className="text-sm space-y-1">
          <p>
            Weight: <span className="text-white font-semibold">{userData.weight} kg</span>
          </p>
          <p>
            Height: <span className="text-white font-semibold">{userData.height} cm</span>
          </p>
          <p>
            Age: <span className="text-white font-semibold">{userData.age} years</span>
          </p>
          <p>
            Gender: <span className="text-white font-semibold capitalize">{userData.gender}</span>
          </p>
          <div className="border-t border-blue-700/50 mt-2 pt-2">
            <p className="text-lg">
              Your BMR: <span className="text-white font-bold">{bmr} calories/day</span>
            </p>
          </div>
        </div>
      </div>

      <p className="text-sm italic text-slate-400">
        Note: Your actual daily calorie needs (TDEE) are higher because they include activity, training, and movement throughout the day.
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
