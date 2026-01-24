import React from 'react';
import { Info, X } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../common/ModalShell';
import { formatWeight } from '../../../utils/weight';
import { calculateBMI, getBMICategory } from '../../../utils/calculations';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

export const BmiInfoModal = ({ isOpen, isClosing, userData, onClose }) => {
  const { storeUserData } = useEnergyMapStore(
    (state) => ({ storeUserData: state.userData }),
    shallow
  );
  const resolvedUserData = userData ?? storeUserData;
  const weight = resolvedUserData?.weight;
  const height = resolvedUserData?.height;
  const bmi = calculateBMI(weight, height);
  const category = getBMICategory(bmi);

  const colorMap = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    slate: 'text-slate-400',
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="text-blue-400" />
          <h3 className="text-white font-bold text-xl">What is BMI?</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-slate-300">
        <p>
          <span className="font-bold text-white">BMI (Body Mass Index)</span> is
          a simple measure that uses your height and weight to estimate whether
          you&apos;re at a healthy weight. It&apos;s calculated by dividing your
          weight in kilograms by your height in meters squared.
        </p>

        <div className="bg-slate-700/50 rounded-lg p-4">
          <p className="font-bold text-white mb-2">Formula:</p>
          <div className="p-3 bg-slate-900/50 rounded font-mono text-sm">
            <p className="text-blue-400">BMI = weight (kg) ÷ height (m)²</p>
          </div>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-4">
          <p className="font-bold text-white mb-3">BMI Categories:</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-400">Underweight</span>
              <span>&lt; 18.5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-400">Normal</span>
              <span>18.5 - 24.9</span>
            </div>
            <div className="flex justify-between">
              <span className="text-yellow-400">Overweight</span>
              <span>25.0 - 29.9</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-400">Obese</span>
              <span>≥ 30.0</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
          <p className="font-bold text-blue-300 mb-2">Your Current BMI:</p>
          <div className="text-sm space-y-1">
            <p>
              Weight:{' '}
              <span className="text-white font-semibold">
                {formatWeight(weight)} kg
              </span>
            </p>
            <p>
              Height:{' '}
              <span className="text-white font-semibold">{height} cm</span>
            </p>
            <div className="border-t border-blue-700/50 mt-2 pt-2">
              <p className="text-lg">
                Your BMI:{' '}
                <span className="text-white font-bold">
                  {bmi ? bmi.toFixed(1) : '—'}
                </span>
                {category.label !== 'Unknown' && (
                  <span className={`ml-2 ${colorMap[category.color]}`}>
                    ({category.label})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4">
          <p className="font-bold text-amber-300 mb-2">⚠️ Important Note:</p>
          <p className="text-sm">
            BMI doesn&apos;t distinguish between muscle and fat. Athletes and
            muscular individuals may have a high BMI despite having low body
            fat. For a more accurate assessment of body composition, consider
            tracking body fat percentage and FFMI.
          </p>
        </div>
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
};
