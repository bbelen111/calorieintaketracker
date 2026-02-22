import React from 'react';
import { Info, X } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { formatWeight } from '../../../../utils/weight';
import { calculateBMI, getBMICategory } from '../../../../utils/calculations';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';

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
    blue: 'text-accent-blue',
    green: 'text-accent-green',
    yellow: 'text-accent-yellow',
    red: 'text-accent-red',
    slate: 'text-accent-slate',
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="text-accent-blue" />
          <h3 className="text-foreground font-bold text-xl">What is BMI?</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-muted">
        <p>
          <span className="font-bold text-foreground">
            BMI (Body Mass Index)
          </span>{' '}
          is a simple measure that uses your height and weight to estimate
          whether you&apos;re at a healthy weight. It&apos;s calculated by
          dividing your weight in kilograms by your height in meters squared.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4">
          <p className="font-bold text-foreground mb-2">Formula:</p>
          <div className="p-3 bg-background/50 rounded font-mono text-sm">
            <p className="text-accent-blue">BMI = weight (kg) ÷ height (m)²</p>
          </div>
        </div>

        <div className="bg-surface-highlight/50 rounded-lg p-4">
          <p className="font-bold text-foreground mb-3">BMI Categories:</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-accent-blue">Underweight</span>
              <span>&lt; 18.5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-accent-green">Normal</span>
              <span>18.5 - 24.9</span>
            </div>
            <div className="flex justify-between">
              <span className="text-accent-yellow">Overweight</span>
              <span>25.0 - 29.9</span>
            </div>
            <div className="flex justify-between">
              <span className="text-accent-red">Obese</span>
              <span>≥ 30.0</span>
            </div>
          </div>
        </div>

        <div className="bg-accent-blue/15 border border-accent-blue/50 rounded-lg p-4">
          <p className="font-bold text-accent-blue mb-2">Your Current BMI:</p>
          <div className="text-sm space-y-1">
            <p>
              Weight:{' '}
              <span className="text-foreground font-semibold">
                {formatWeight(weight)} kg
              </span>
            </p>
            <p>
              Height:{' '}
              <span className="text-foreground font-semibold">{height} cm</span>
            </p>
            <div className="border-t border-accent-blue/50 mt-2 pt-2">
              <p className="text-lg">
                Your BMI:{' '}
                <span className="text-foreground font-bold">
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

        <div className="bg-accent-amber/15 border border-accent-amber/50 rounded-lg p-4">
          <p className="font-bold text-accent-amber mb-2">⚠️ Important Note:</p>
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
