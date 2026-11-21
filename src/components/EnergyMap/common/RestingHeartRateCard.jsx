import React, { memo, useMemo } from 'react';
import { ChevronRight, HeartPulse, Plus, Watch } from 'lucide-react';
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

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 36;
const SPARK_DAYS = 28;

/**
 * Insights card: resting heart rate (7-day baseline), today's reading and its
 * method, the 28-day change (uncoloured — a lower resting HR is not
 * automatically good news), a sparkline, and the Zone 2 band. Opens the HR
 * tracker; the empty state offers a manual reading or a watch connection.
 */
export const RestingHeartRateCard = memo(function RestingHeartRateCard({
  onOpen,
  onLogReading,
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

  const { sparkPoints, latest } = useMemo(() => {
    const windowKeys = getWindowDateKeys(todayKey, SPARK_DAYS);
    const family = resolveRestingHrTrendFamily(heartRateEntries, {
      startDateKey: windowKeys[0],
      endDateKey: todayKey,
    });
    const series = family
      ? getRestingHrSeries(heartRateEntries, { family }).filter(
          (entry) => entry.date >= windowKeys[0] && entry.date <= todayKey
        )
      : [];
    if (series.length < 2) {
      return { sparkPoints: '', latest: series[series.length - 1] ?? null };
    }
    const values = series.map((entry) => entry.restingHr);
    const min = Math.min(...values) - 1;
    const max = Math.max(...values) + 1;
    const startMs = new Date(`${windowKeys[0]}T00:00:00Z`).getTime();
    const spanMs = SPARK_DAYS * 86_400_000;
    const points = series
      .map((entry) => {
        const x =
          ((new Date(`${entry.date}T00:00:00Z`).getTime() - startMs) / spanMs) *
          SPARK_WIDTH;
        const y =
          SPARK_HEIGHT - ((entry.restingHr - min) / (max - min)) * SPARK_HEIGHT;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return { sparkPoints: points, latest: series[series.length - 1] };
  }, [heartRateEntries, todayKey]);

  const trend = useMemo(
    () => calculateRestingHrTrend(heartRateEntries, todayKey),
    [heartRateEntries, todayKey]
  );
  const zone2 = useMemo(
    () => resolveHeartRateZones(heartRateProfile)?.zones?.[1] ?? null,
    [heartRateProfile]
  );

  const hasData = heartRateProfile?.restingHr != null || latest != null;
  const canConnect =
    sync.status === HealthConnectStatus.DISCONNECTED ||
    sync.status === HealthConnectStatus.ERROR;

  return (
    <div className="bg-surface rounded-2xl p-4 border border-border shadow-lg">
      {hasData ? (
        <button
          type="button"
          onClick={() => onOpen?.()}
          className="w-full text-left rounded-xl p-2 -m-2 pressable-card focus-ring group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-foreground font-semibold">
                <HeartPulse size={20} className="text-accent-red" />
                Resting Heart Rate
              </p>
              <p className="mt-2 text-foreground text-3xl font-bold leading-none">
                {heartRateProfile?.restingHr ?? latest?.restingHr ?? '—'}
                <span className="text-base font-medium text-muted"> bpm</span>
              </p>
              <p className="mt-1 text-muted text-xs">
                {heartRateProfile?.restingHr != null
                  ? '7-day average'
                  : 'Latest'}
                {latest && (
                  <>
                    {' · '}
                    {latest.date === todayKey ? 'today' : 'last'}{' '}
                    {latest.restingHr} (
                    {describeRestingHrMethod(latest.restingHrMethod)})
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {sparkPoints && (
                <svg
                  width={SPARK_WIDTH}
                  height={SPARK_HEIGHT}
                  aria-hidden="true"
                  className="overflow-visible"
                >
                  <polyline
                    points={sparkPoints}
                    fill="none"
                    stroke="rgb(var(--accent-red) / 0.9)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              <span className="text-xs text-muted">
                {trend
                  ? `${formatSignedBpm(trend.deltaBpm)} / 28d`
                  : 'Trend after 7 readings'}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-2 text-xs text-muted">
            <span>
              {heartRateProfile?.maxHr != null &&
                `Max ${heartRateProfile.maxHr}`}
              {zone2 && ` · Zone 2 ${zone2.lowerBpm}–${zone2.upperBpm}`}
            </span>
            <ChevronRight
              size={16}
              className="text-muted md:group-hover:text-foreground transition-colors"
            />
          </div>
        </button>
      ) : (
        <div>
          <p className="flex items-center gap-2 text-foreground font-semibold">
            <HeartPulse size={20} className="text-accent-red" />
            Resting Heart Rate
          </p>
          <p className="mt-2 text-muted text-sm">
            Track your resting heart rate to unlock personal training zones and
            sharper after-burn (EPOC) estimates.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onLogReading?.()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-ring press-feedback"
            >
              <Plus size={16} /> Log a reading
            </button>
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
          {sync.error && (
            <p className="mt-2 text-xs text-accent-orange">{sync.error}</p>
          )}
        </div>
      )}
    </div>
  );
});
