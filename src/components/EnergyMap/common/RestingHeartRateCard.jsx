import React, { memo, useMemo } from 'react';
import { ChevronRight, HeartPulse, Watch } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import {
  getTodayDateKey,
  getWindowDateKeys,
} from '../../../utils/data/dateKeys';
import {
  getRestingHrSeries,
  resolveRestingHrTrendFamily,
} from '../../../utils/measurements/heartRate';
import {
  calculateRestingHrTrend,
  resolveHeartRateZones,
} from '../../../utils/calculations/heartRate';
import {
  describeRestingHrMethod,
  formatSignedBpm,
} from '../../../utils/formatting/heartRate';
import {
  HealthConnectStatus,
  getHealthSourceName,
} from '../../../constants/health/healthSources';
import {
  connectHeartRateSync,
  useHeartRateSyncState,
} from '../../../services/heartRateSync';
import { InsightHeadline } from './InsightHeadline';

const LATEST_LOOKBACK_DAYS = 28;

const StatTile = ({ label, value }) => (
  <div className="rounded-xl bg-surface-highlight/50 border border-border/50 px-3 py-2">
    <p className="text-xs text-muted">{label}</p>
    <p className="mt-0.5 text-base font-bold text-foreground truncate">
      {value}
    </p>
  </div>
);

/**
 * Insights card: resting heart rate (7-day baseline) as the headline, the
 * latest reading and how it was obtained, max HR and the Zone 2 band as stat
 * tiles, and the 28-day change in the footer (uncoloured — a lower resting HR
 * is not automatically good news). Same card grammar as the Adaptive
 * Thermogenesis and Rolling Energy Balance cards. Opens the HR tracker (the
 * empty state too, where readings are logged); the empty state also offers a
 * watch connection.
 */
export const RestingHeartRateCard = memo(function RestingHeartRateCard({
  onOpen,
}) {
  const { heartRateEntries, heartRateProfile } = useEnergyMapStore(
    (state) => ({
      heartRateEntries: state.heartRateEntries ?? [],
      heartRateProfile: state.heartRateProfile,
    }),
    shallow
  );
  const sync = useHeartRateSyncState();
  const todayKey = getTodayDateKey();

  // Newest reading inside the window, from ONE method family (measured and
  // estimated readings never mix).
  const latest = useMemo(() => {
    const windowKeys = getWindowDateKeys(todayKey, LATEST_LOOKBACK_DAYS);
    const family = resolveRestingHrTrendFamily(heartRateEntries, {
      startDateKey: windowKeys[0],
      endDateKey: todayKey,
    });
    if (!family) {
      return null;
    }
    const series = getRestingHrSeries(heartRateEntries, { family }).filter(
      (entry) => entry.date >= windowKeys[0] && entry.date <= todayKey
    );
    return series[series.length - 1] ?? null;
  }, [heartRateEntries, todayKey]);

  const trend = useMemo(
    () => calculateRestingHrTrend(heartRateEntries, todayKey),
    [heartRateEntries, todayKey]
  );
  const zone2 = useMemo(
    () => resolveHeartRateZones(heartRateProfile)?.zones?.[1] ?? null,
    [heartRateProfile]
  );

  const baseline = heartRateProfile?.restingHr ?? null;
  const hasData = baseline != null || latest != null;
  const canConnect =
    sync.status === HealthConnectStatus.DISCONNECTED ||
    sync.status === HealthConnectStatus.ERROR;

  const subtitle = hasData
    ? `${baseline != null ? '7-day average' : 'Latest'}${
        latest
          ? ` · ${latest.date === todayKey ? 'today' : 'last'} ${
              latest.restingHr
            } (${describeRestingHrMethod(latest.restingHrMethod)})`
          : ''
      }`
    : 'Not tracked yet';

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-lg p-5 md:p-6">
      {hasData ? (
        <button
          type="button"
          onClick={() => onOpen?.()}
          className="w-full text-left rounded-xl transition-all group pressable-card focus-ring"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <HeartPulse className="text-accent-blue" size={30} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-foreground">
                Resting Heart Rate
              </h2>
              <p className="text-muted text-sm leading-snug">{subtitle}</p>
            </div>
            <div className="shrink-0 text-right">
              <InsightHeadline
                testId="resting-hr-headline"
                value={baseline ?? latest?.restingHr ?? '—'}
                unit="bpm"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatTile
              label="Max HR"
              value={
                heartRateProfile?.maxHr != null
                  ? `${heartRateProfile.maxHr} bpm`
                  : '—'
              }
            />
            <StatTile
              label="Zone 2"
              value={zone2 ? `${zone2.lowerBpm}–${zone2.upperBpm} bpm` : '—'}
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-accent-blue/80">
              {trend
                ? `${formatSignedBpm(trend.deltaBpm)} over 28 days — tap for details`
                : 'Trend after 7 readings — tap for details'}
            </span>
            <ChevronRight size={16} className="text-muted" />
          </div>
        </button>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => onOpen?.()}
            className="w-full text-left rounded-xl transition-all group pressable-card focus-ring"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <HeartPulse className="text-accent-blue" size={30} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-foreground">
                  Resting Heart Rate
                </h2>
                <p className="text-muted text-sm leading-snug">{subtitle}</p>
              </div>
            </div>
            <p className="mt-3 text-muted text-sm">
              Track your resting heart rate to unlock personal training zones
              and sharper after-burn (EPOC) estimates.
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-accent-blue/80">
                Tap to open the tracker
              </span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
          {(canConnect || sync.status === HealthConnectStatus.CONNECTING) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canConnect && (
                <button
                  type="button"
                  onClick={() => connectHeartRateSync()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface-highlight px-3 py-2 text-sm font-medium text-foreground focus-ring pressable-inline"
                >
                  <Watch size={16} /> Connect {getHealthSourceName()}
                </button>
              )}
              {sync.status === HealthConnectStatus.CONNECTING && (
                <span className="self-center text-xs text-muted">
                  Connecting…
                </span>
              )}
            </div>
          )}
          {sync.error && (
            <p className="mt-2 text-xs text-accent-orange">{sync.error}</p>
          )}
        </div>
      )}
    </div>
  );
});
