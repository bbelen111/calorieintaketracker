import React, { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import {
  HeartRateSourceGlyph,
  HeartRateZoneBars,
  HeartRateZoneChip,
} from './HeartRateBadges';
import {
  describeHeartRateLoad,
  getHeartRateZone,
  resolveHeartRateProfile,
  resolveHeartRateZones,
} from '../../../utils/calculations/heartRate';
import { describeSessionHeartRateSource } from '../../../utils/formatting/heartRate';

/**
 * Read-only heart-rate context under a cardio / training form's average-HR
 * button: the zone chip ("Z3 · 68% HRR", from the HR profile AS OF the
 * session's date), where the value came from (entered / imported from a
 * watch), and — for imported sessions — the peak, coverage and time-in-zone.
 *
 * Sessions are entered by hand; there is nothing to press here. Importing a
 * workout lives in `ImportWorkoutButton`, in the form header.
 */
export const SessionHeartRatePanel = ({ session, dateKey }) => {
  const { userData } = useEnergyMapStore(
    (state) => ({ userData: state.userData }),
    shallow
  );

  const profile = useMemo(
    () => resolveHeartRateProfile(userData, dateKey),
    [userData, dateKey]
  );
  const zoneModel = useMemo(() => resolveHeartRateZones(profile), [profile]);
  const zone = getHeartRateZone(session?.averageHeartRate, zoneModel);
  const load = describeHeartRateLoad(session?.averageHeartRate, profile);
  const sourceLabel = describeSessionHeartRateSource(session?.heartRateSource);
  const coverage = Number(session?.heartRateCoverage);

  if (!zone && !load && !sourceLabel) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <HeartRateZoneChip zone={zone} load={load} />
        {sourceLabel && (
          <span className="inline-flex items-center gap-1">
            <HeartRateSourceGlyph source={session?.heartRateSource} />
            {sourceLabel}
          </span>
        )}
        {Number.isFinite(Number(session?.maxHeartRate)) && (
          <span>peak {session.maxHeartRate}</span>
        )}
        {Number.isFinite(coverage) && (
          <span>{Math.round(coverage * 100)}% covered</span>
        )}
      </div>
      <HeartRateZoneBars zoneSeconds={session?.heartRateZoneSeconds} />
    </div>
  );
};
