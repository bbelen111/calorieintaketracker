import React from 'react';
import { useHeartRateSensorState } from '../../../services/heartRateSensor';

/**
 * Header pill shown only while a live heart-rate recording runs
 * ("● 142 bpm"). It subscribes to the sensor singleton itself, so a beat
 * re-renders this pill alone — never the header or the orchestrator.
 */
export const LiveHeartRatePill = ({ onOpen }) => {
  const { recording, currentBpm } = useHeartRateSensorState();
  if (!recording) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen?.(recording.kind)}
      aria-label="Open live heart-rate recording"
      className="inline-flex items-center gap-1.5 rounded-full border border-accent-red/40 bg-accent-red/10 px-2.5 py-1 text-xs font-semibold text-accent-red focus-ring pressable-inline"
    >
      <span className="h-2 w-2 rounded-full bg-accent-red animate-pulse" />
      {currentBpm ?? '—'} bpm
    </button>
  );
};
