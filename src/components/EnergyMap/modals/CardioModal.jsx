import React from 'react';
import { Plus } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

const getEstimatedBurn = (cardioTypes, session, weight) => {
  const type = cardioTypes[session.type];
  if (!type) return 0;
  const met = type.met[session.intensity];
  if (!met) return 0;
  const duration = Number(session.duration);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const hours = duration / 60;
  return Math.round(met * weight * hours);
};

export const CardioModal = ({
  isOpen,
  isClosing,
  cardioTypes,
  session,
  onChange,
  onCancel,
  onSave,
  userWeight
}) => {
  const estimatedBurn = getEstimatedBurn(cardioTypes, session, userWeight);
  const hasValidDuration = Number.isFinite(Number(session.duration)) && Number(session.duration) > 0;

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
          <label className="text-slate-300 text-sm block mb-2">Intensity</label>
          <select
            value={session.intensity}
            onChange={(event) => onChange({ ...session, intensity: event.target.value })}
            className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
          >
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
            <option value="vigorous">Vigorous</option>
          </select>
        </div>

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
          disabled={!hasValidDuration}
          className={`flex-1 text-white px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
            hasValidDuration
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-red-600/60 cursor-not-allowed opacity-70'
          }`}
        >
          <Plus size={20} />
          Add Session
        </button>
      </div>
    </ModalShell>
  );
};
