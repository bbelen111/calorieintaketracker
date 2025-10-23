import React from 'react';
import { Plus } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { calculateCardioCalories } from '../../../utils/calculations';

export const CardioModal = ({
  isOpen,
  isClosing,
  cardioTypes,
  session,
  onChange,
  onCancel,
  onSave,
  userWeight,
  userAge,
  userGender
}) => {
  const effortType = session.effortType ?? 'intensity';
  const estimatedBurn = calculateCardioCalories(
    session,
    { weight: userWeight, age: userAge, gender: userGender },
    cardioTypes
  );
  const hasValidDuration = Number.isFinite(Number(session.duration)) && Number(session.duration) > 0;
  const hasValidHeartRate =
    effortType === 'heartRate'
      ? Number.isFinite(Number(session.averageHeartRate)) && Number(session.averageHeartRate) > 0
      : true;
  const canSave = hasValidDuration && hasValidHeartRate;
  const intensityValue = session.intensity ?? 'moderate';
  const heartRateValue =
    session.averageHeartRate === '' || session.averageHeartRate == null
      ? ''
      : session.averageHeartRate;

  const handleDurationChange = (event) => {
    const { value } = event.target;
    if (value === '') {
      onChange({ ...session, duration: '' });
      return;
    }

    const parsed = Number.parseInt(value, 10);
    const sanitized = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    onChange({ ...session, duration: sanitized });
  };

  const handleEffortTypeChange = (nextType) => {
    if (nextType === effortType) {
      return;
    }

    if (nextType === 'heartRate') {
      onChange({
        ...session,
        effortType: 'heartRate',
        averageHeartRate: session.averageHeartRate ?? ''
      });
      return;
    }

    onChange({
      ...session,
      effortType: 'intensity',
      intensity: session.intensity ?? 'moderate',
      averageHeartRate: ''
    });
  };

  const handleIntensityChange = (event) => {
    onChange({ ...session, intensity: event.target.value });
  };

  const handleHeartRateChange = (event) => {
    const { value } = event.target;
    if (value === '') {
      onChange({ ...session, averageHeartRate: '' });
      return;
    }

    const parsed = Number.parseInt(value, 10);
    const sanitized = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    onChange({ ...session, averageHeartRate: sanitized });
  };

  const effortButtonClass = (type) =>
    `w-full rounded-lg border px-4 py-2 transition-all ${
      effortType === type
        ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-900/30'
        : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-blue-400 hover:text-white'
    }`;

  return (
    <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="p-6 max-w-md w-full">
      <h3 className="text-white font-bold text-xl mb-4">Add Cardio Session</h3>

      <div className="space-y-4">
        <div>
          <label className="text-slate-300 text-sm block mb-2">Cardio Type</label>
          <select
            value={session.type}
            onChange={(event) => onChange({ ...session, type: event.target.value })}
            className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
          >
            {Object.entries(cardioTypes).map(([key, type]) => (
              <option key={key} value={key}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-slate-300 text-sm block mb-2">Duration (minutes)</label>
          <input
            type="number"
            min="0"
            value={session.duration === '' ? '' : session.duration}
            onChange={handleDurationChange}
            className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-slate-300 text-sm block mb-2">Effort Tracking</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={effortButtonClass('intensity')}
              onClick={() => handleEffortTypeChange('intensity')}
            >
              Intensity
            </button>
            <button
              type="button"
              className={effortButtonClass('heartRate')}
              onClick={() => handleEffortTypeChange('heartRate')}
            >
              Average Heart Rate
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Use heart rate for wearable-based estimates or intensity for quick selections.
          </p>
        </div>

        {effortType === 'intensity' ? (
          <div>
            <label className="text-slate-300 text-sm block mb-2">Intensity</label>
            <select
              value={intensityValue}
              onChange={handleIntensityChange}
              className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
            >
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="vigorous">Vigorous</option>
            </select>
          </div>
        ) : (
          <div>
            <label className="text-slate-300 text-sm block mb-2">Average Heart Rate (bpm)</label>
            <input
              type="number"
              min="0"
              value={heartRateValue}
              onChange={handleHeartRateChange}
              className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
            />
            <p className="text-xs text-slate-400 mt-2">
              Enter the average beats per minute recorded during this session.
            </p>
          </div>
        )}

        <div className="bg-slate-700/50 rounded-lg p-3">
          <p className="text-slate-300 text-sm">Estimated Burn:</p>
          <p className="text-white font-bold text-xl">~{estimatedBurn} calories</p>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          type="button"
          disabled={!canSave}
          className={`flex-1 text-white px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
            canSave ? 'bg-red-600 hover:bg-red-500' : 'bg-red-600/60 cursor-not-allowed opacity-70'
          }`}
        >
          <Plus size={20} />
          Add Session
        </button>
      </div>
    </ModalShell>
  );
};
