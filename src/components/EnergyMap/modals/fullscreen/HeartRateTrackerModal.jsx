import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  HeartPulse,
  Info,
  Plus,
  RefreshCw,
  Watch,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import {
  TrackerCardMetric,
  TrackerSelectionCard,
} from '../../common/TrackerSelectionCard';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  getTodayDateKey,
  getWindowDateKeys,
} from '../../../../utils/data/dateKeys';
import {
  formatDateLabel,
  getPreviousEntryDelta,
  getWindowAverageDeviation,
} from '../../../../utils/measurements/weight';
import {
  getRestingHrSeries,
  resolveRestingHrTrendFamily,
} from '../../../../utils/measurements/heartRate';
import {
  calculateRestingHrTrend,
  resolveHeartRateZones,
} from '../../../../utils/calculations/heartRate';
import { buildTaggedChartSlots } from '../../../../utils/visuals/trackerHelpers';
import {
  buildBezierPaths,
  buildGapAwarePathRuns,
} from '../../../../utils/visuals/bezierPath';
import {
  describeMaxHrSource,
  describeRestingHrMethod,
  formatSignedBpm,
} from '../../../../utils/formatting/heartRate';
import { HEART_RATE_ZONE_CLASSES } from '../../../../constants/health/heartRate';
import {
  HealthConnectStatus,
  getHealthSourceName,
} from '../../../../constants/health/healthSources';
import {
  connectHeartRateSync,
  refreshHeartRateSync,
  useHeartRateSyncState,
} from '../../../../services/heartRateSync';

const VIEW_MODES = [
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '12m', label: '12 months', months: 12 },
];
const CHART_HEIGHT = 180;
const PLOT_TOP_PX = 8;
const Y_TICK_COUNT = 4;
const POINT_RADIUS = 3;

const formatShortDate = (dateKey) =>
  formatDateLabel(dateKey, { month: 'short', day: 'numeric' });

const monthKeyOf = (dateKey) => dateKey.slice(0, 7);

const buildLastMonthKeys = (todayKey, count) => {
  const [year, month] = todayKey.split('-').map(Number);
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    keys.push(date.toISOString().slice(0, 7));
  }
  return keys;
};

const formatMonthLabel = (monthKey) =>
  new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

/**
 * Resting heart-rate tracker (fullscreen, lazy). Mirrors the Weight tracker
 * contract: gap-aware runs (solid <= 7 days, dashed <= 14, broken beyond),
 * the shared fixed-slot TrackerSelectionCard + an in-SVG guide line, honest
 * "no data" (never zero-filled), uncoloured deltas. One method family per
 * window (measured vs estimated never share a line).
 */
export const HeartRateTrackerModal = ({
  isOpen,
  isClosing,
  onClose,
  onAddReading,
  onOpenZonesInfo,
}) => {
  const { heartRateEntries, heartRateProfile } = useEnergyMapStore(
    (state) => ({
      heartRateEntries: state.heartRateEntries ?? [],
      heartRateProfile: state.heartRateProfile,
    }),
    shallow
  );
  const sync = useHeartRateSyncState();
  const todayKey = getTodayDateKey();

  const [viewMode, setViewMode] = useState('30d');
  const [zonesOpen, setZonesOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [lastSelectedKey, setLastSelectedKey] = useState(null);
  if (selectedKey != null && selectedKey !== lastSelectedKey) {
    setLastSelectedKey(selectedKey);
  }

  const [chartWidth, setChartWidth] = useState(320);
  const observerRef = useRef(null);
  const chartContainerRef = useCallback((node) => {
    observerRef.current?.disconnect();
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width > 0) {
        setChartWidth((previous) => (previous === width ? previous : width));
      }
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const mode =
    VIEW_MODES.find((item) => item.key === viewMode) ?? VIEW_MODES[0];

  const { slots, family, series } = useMemo(() => {
    if (mode.months) {
      const monthKeys = buildLastMonthKeys(todayKey, mode.months);
      const windowStart = `${monthKeys[0]}-01`;
      const resolvedFamily = resolveRestingHrTrendFamily(heartRateEntries, {
        startDateKey: windowStart,
        endDateKey: todayKey,
      });
      const familySeries = resolvedFamily
        ? getRestingHrSeries(heartRateEntries, { family: resolvedFamily })
        : [];
      const byMonth = new Map();
      familySeries.forEach((entry) => {
        const key = monthKeyOf(entry.date);
        if (!byMonth.has(key)) {
          byMonth.set(key, []);
        }
        byMonth.get(key).push(entry.restingHr);
      });
      return {
        family: resolvedFamily,
        series: familySeries,
        slots: monthKeys.map((key) => {
          const values = byMonth.get(key);
          return {
            date: key,
            entry: values?.length
              ? {
                  restingHr:
                    Math.round(
                      (values.reduce((sum, value) => sum + value, 0) /
                        values.length) *
                        10
                    ) / 10,
                  count: values.length,
                }
              : null,
          };
        }),
      };
    }

    const dateKeys = getWindowDateKeys(todayKey, mode.days);
    const resolvedFamily = resolveRestingHrTrendFamily(heartRateEntries, {
      startDateKey: dateKeys[0],
      endDateKey: todayKey,
    });
    const familySeries = resolvedFamily
      ? getRestingHrSeries(heartRateEntries, { family: resolvedFamily })
      : [];
    const byDate = new Map(familySeries.map((entry) => [entry.date, entry]));
    return {
      family: resolvedFamily,
      series: familySeries,
      slots: dateKeys.map((date) => ({
        date,
        entry: byDate.get(date) ?? null,
      })),
    };
  }, [heartRateEntries, mode, todayKey]);

  const chart = useMemo(() => {
    const values = slots
      .map((slot) => slot.entry?.restingHr)
      .filter((value) => Number.isFinite(value));
    if (!values.length) {
      return null;
    }
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = Math.max(3, (rawMax - rawMin) * 0.15);
    const minValue = Math.floor(rawMin - pad);
    const maxValue = Math.ceil(rawMax + pad);
    const range = Math.max(1, maxValue - minValue);
    const tagged = buildTaggedChartSlots({
      days: slots,
      getValue: (entry) => entry.restingHr,
      minValue,
      range,
      chartWidth,
      windowSize: slots.length,
      chartHeight: CHART_HEIGHT,
    });
    const runs = buildGapAwarePathRuns(tagged).map((run) => ({
      ...run,
      pathData: buildBezierPaths(run.points, {
        chartWidth,
        chartHeight: CHART_HEIGHT,
      }).pathData,
    }));
    const ticks = Array.from({ length: Y_TICK_COUNT }, (_, index) => {
      const value = maxValue - (range * index) / (Y_TICK_COUNT - 1);
      return {
        value: Math.round(value),
        y: (index / (Y_TICK_COUNT - 1)) * CHART_HEIGHT,
      };
    });
    return { tagged, runs, ticks };
  }, [chartWidth, slots]);

  const zoneModel = useMemo(
    () => resolveHeartRateZones(heartRateProfile),
    [heartRateProfile]
  );
  const trend = useMemo(
    () => calculateRestingHrTrend(heartRateEntries, todayKey),
    [heartRateEntries, todayKey]
  );
  const latest = series.length ? series[series.length - 1] : null;
  const todayEntry = heartRateEntries.find((entry) => entry.date === todayKey);

  const isMonthMode = Boolean(mode.months);
  const retainedKey = selectedKey ?? lastSelectedKey;
  const retainedSlot = chart?.tagged.find(
    (slot) => slot && !slot.isInterpolated && slot.date === retainedKey
  );
  const retainedEntry = slots.find((slot) => slot.date === retainedKey)?.entry;
  const rawEntry = !isMonthMode
    ? heartRateEntries.find((entry) => entry.date === retainedKey)
    : null;
  const previousDelta =
    !isMonthMode && retainedKey
      ? getPreviousEntryDelta(series, retainedKey, 'restingHr')
      : null;
  const weekDeviation =
    !isMonthMode && retainedKey
      ? getWindowAverageDeviation(series, retainedKey, 7, 'restingHr')
      : null;

  const dismissSelection = useCallback(() => setSelectedKey(null), []);

  const handleSlotTap = useCallback(
    (event, slot) => {
      if (!slot) {
        return;
      }
      event.stopPropagation();
      if (selectedKey === slot.date && !isMonthMode) {
        onAddReading?.(slot.date);
        return;
      }
      setSelectedKey(slot.date);
    },
    [isMonthMode, onAddReading, selectedKey]
  );

  const handleViewModeChange = useCallback((nextMode) => {
    setViewMode(nextMode);
    setSelectedKey(null);
  }, []);

  const modeIndex = VIEW_MODES.findIndex((item) => item.key === viewMode);
  const healthSourceName = getHealthSourceName();
  const step = slots.length ? chartWidth / slots.length : 0;
  // Nothing heart-rate related has ever been recorded. The stat strip (all
  // dashes), the window toggle and the chart placeholder would all be noise —
  // one guided empty state owns the surface instead.
  const hasAnyData =
    heartRateEntries.length > 0 || heartRateProfile?.restingHr != null;
  const canConnectHeartRate =
    sync.status === HealthConnectStatus.DISCONNECTED ||
    sync.status === HealthConnectStatus.ERROR;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      overlayClassName="fixed inset-0 bg-surface/70 p-0! flex-none! items-stretch! justify-stretch!"
      contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none max-h-none! flex flex-col pt-[env(safe-area-inset-top)] keyboard-bottom-inset pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="flex items-center justify-between px-4 py-3 fullscreen-header bg-background border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Back"
            className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
          >
            <ChevronLeft size={24} />
          </button>
          <h3 className="text-foreground font-bold text-xl">Heart Rate</h3>
        </div>
      </div>

      <div className="flex-1 fullscreen-body bg-surface border-t border-border overflow-y-auto flex flex-col">
        {sync.status !== HealthConnectStatus.UNAVAILABLE && (
          <div className="px-4 pt-3 flex items-center justify-between gap-3 text-xs text-muted">
            {sync.status === HealthConnectStatus.CONNECTED ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Watch size={14} className="text-accent-green" />
                  Synced from {healthSourceName}
                  {sync.lastSynced &&
                    ` · ${sync.lastSynced.toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}`}
                </span>
                <button
                  type="button"
                  onClick={() => refreshHeartRateSync()}
                  aria-label="Refresh heart rate"
                  className="p-1.5 rounded-md text-muted md:hover:text-foreground focus-ring pressable-inline"
                >
                  <RefreshCw
                    size={14}
                    className={sync.isLoading ? 'animate-spin' : ''}
                  />
                </button>
              </>
            ) : sync.status === HealthConnectStatus.NOT_INSTALLED ? (
              <span>
                Install Health Connect to sync heart rate from your watch.
              </span>
            ) : (
              <>
                <span>
                  {sync.error ??
                    `Sync resting heart rate from ${healthSourceName}.`}
                </span>
                <button
                  type="button"
                  onClick={() => connectHeartRateSync()}
                  disabled={sync.status === HealthConnectStatus.CONNECTING}
                  className="shrink-0 rounded-md bg-accent-blue/15 px-3 py-1.5 font-medium text-accent-blue focus-ring pressable-inline disabled:opacity-60"
                >
                  {sync.status === HealthConnectStatus.CONNECTING
                    ? 'Connecting…'
                    : 'Connect'}
                </button>
              </>
            )}
          </div>
        )}

        {!hasAnyData ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-highlight border border-border/60 shadow-sm">
              <HeartPulse size={30} className="text-accent-blue" />
            </div>
            <h4 className="mt-5 text-xl font-bold text-foreground">
              No resting heart rate yet
            </h4>
            <p className="mt-2 max-w-xs text-sm text-muted">
              Log a morning reading
              {canConnectHeartRate ? ` or connect ${healthSourceName}` : ''} to
              start your trend.
            </p>
            <button
              type="button"
              onClick={() => onAddReading?.(todayKey)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-blue px-5 py-3 text-sm font-semibold text-primary-foreground transition-all press-feedback focus-ring md:hover:brightness-110"
            >
              <Plus size={18} />
              Log a resting reading
            </button>
            <p className="mt-3 text-xs text-muted">
              Three readings unlock personal heart-rate zones.
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 pt-3 pb-1 shrink-0">
              <div className="relative flex items-center gap-2 p-1 bg-surface-highlight rounded-lg">
                <div
                  className="absolute inset-y-1 rounded-md shadow-md bg-accent-blue"
                  style={{
                    width: 'calc((100% - 24px) / 3)',
                    left: `calc((100% - 24px) / 3 * ${modeIndex} + ${4 + modeIndex * 8}px)`,
                    transition: 'left 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
                  }}
                />
                {VIEW_MODES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleViewModeChange(item.key)}
                    className={`relative z-10 flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      viewMode === item.key
                        ? 'text-primary-foreground'
                        : 'text-muted md:hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 pt-3 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
              <div>
                <p className="text-muted text-xs uppercase tracking-wide mb-1">
                  Resting
                </p>
                <p className="text-foreground text-2xl font-bold">
                  {heartRateProfile?.restingHr != null
                    ? heartRateProfile.restingHr
                    : '—'}
                  <span className="text-sm font-medium text-muted"> bpm</span>
                </p>
                <p className="text-muted text-[11px] mt-1">7-day average</p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wide mb-1">
                  Latest
                </p>
                <p className="text-foreground text-2xl font-bold">
                  {latest ? latest.restingHr : '—'}
                  <span className="text-sm font-medium text-muted"> bpm</span>
                </p>
                <p className="text-muted text-[11px] mt-1">
                  {latest
                    ? `${formatShortDate(latest.date)} · ${describeRestingHrMethod(latest.restingHrMethod)}`
                    : 'No readings yet'}
                </p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wide mb-1">
                  28-day change
                </p>
                <p className="text-foreground text-2xl font-bold">
                  {trend ? formatSignedBpm(trend.deltaBpm) : '—'}
                </p>
                <p className="text-muted text-[11px] mt-1">
                  {trend ? `${trend.readings} readings` : 'Needs 7 readings'}
                </p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wide mb-1">
                  Max HR
                </p>
                <p className="text-foreground text-2xl font-bold">
                  {heartRateProfile?.maxHr ?? '—'}
                  <span className="text-sm font-medium text-muted"> bpm</span>
                </p>
                <p className="text-muted text-[11px] mt-1">
                  {describeMaxHrSource(heartRateProfile?.maxHrSource)}
                </p>
              </div>
            </div>

            {/* Log resting button (hidden in 12m mode, like the other trackers) */}
            {!isMonthMode ? (
              <div className="sticky top-0 z-10 px-4 py-2 bg-surface/95 backdrop-blur-sm border-b border-border shrink-0">
                <button
                  type="button"
                  onClick={() => onAddReading?.(todayKey)}
                  className="px-4 py-1.5 md:px-4 md:py-2.5 rounded-lg border-2 bg-accent-blue border-accent-blue/70 text-primary-foreground transition-all font-semibold text-sm md:hover:brightness-110 press-feedback focus-ring flex justify-center items-center"
                >
                  <Plus size={16} className="mr-1" />
                  Log resting
                </button>
              </div>
            ) : (
              <div className="border-b border-border shrink-0" />
            )}

            {zoneModel && (
              <div className="border-b border-border/60 shrink-0">
                <div className="flex items-center gap-1 px-4 py-1.5">
                  <button
                    type="button"
                    onClick={() => setZonesOpen((open) => !open)}
                    aria-expanded={zonesOpen}
                    aria-controls="heart-rate-zones-list"
                    className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left rounded-md focus-ring pressable-inline"
                  >
                    <span className="text-foreground text-sm font-semibold shrink-0">
                      Your zones
                    </span>
                    <span className="text-muted text-[11px] truncate">
                      {zoneModel.model === 'hrr'
                        ? `Reserve ${heartRateProfile.restingHr} → ${heartRateProfile.maxHr} bpm`
                        : `% of max ${heartRateProfile.maxHr} bpm`}
                    </span>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={`ml-auto shrink-0 text-muted transition-transform duration-200 ${
                        zonesOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenZonesInfo?.()}
                    aria-label="About heart-rate zones"
                    className="p-1.5 rounded-md text-muted md:hover:text-foreground focus-ring pressable-inline"
                  >
                    <Info size={16} />
                  </button>
                </div>
                <div
                  id="heart-rate-zones-list"
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: zonesOpen ? '1fr' : '0fr' }}
                  aria-hidden={!zonesOpen}
                  inert={zonesOpen ? undefined : ''}
                >
                  <div className="overflow-hidden min-h-0">
                    <ul className="space-y-1.5 px-4 pb-3 pt-1">
                      {zoneModel.zones.map((zone) => (
                        <li
                          key={zone.key}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${HEART_RATE_ZONE_CLASSES[zone.key].bg}`}
                            />
                            <span className="text-foreground font-medium">
                              {zone.label}
                            </span>
                            <span className="text-muted text-xs">
                              {zone.name}
                            </span>
                          </span>
                          <span className="text-foreground tabular-nums">
                            {zone.lowerBpm}–{zone.upperBpm} bpm
                          </span>
                        </li>
                      ))}
                    </ul>
                    {zoneModel.model !== 'hrr' && (
                      <p className="px-4 pb-3 text-muted text-[11px]">
                        Log 3 resting readings for personal zones.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="relative px-2 pt-3" onClick={dismissSelection}>
              {chart ? (
                <div className="flex">
                  <div
                    className="relative flex-1 min-w-0"
                    ref={chartContainerRef}
                  >
                    <svg
                      width={chartWidth}
                      height={CHART_HEIGHT + PLOT_TOP_PX * 2}
                      className="block overflow-visible"
                      role="img"
                      aria-label="Resting heart rate chart"
                    >
                      <g transform={`translate(0 ${PLOT_TOP_PX})`}>
                        {chart.ticks.map((tick) => (
                          <line
                            key={tick.y}
                            x1={0}
                            x2={chartWidth}
                            y1={tick.y}
                            y2={tick.y}
                            stroke="rgb(var(--border) / 0.5)"
                            strokeDasharray="2 4"
                          />
                        ))}
                        {retainedSlot && selectedKey && (
                          <line
                            x1={retainedSlot.x}
                            x2={retainedSlot.x}
                            y1={0}
                            y2={CHART_HEIGHT}
                            stroke="rgb(var(--accent-blue) / 0.45)"
                            strokeDasharray="3 4"
                            pointerEvents="none"
                          />
                        )}
                        {chart.runs.map((run, index) => (
                          <path
                            key={`${index}-${run.dashArray ?? 'solid'}`}
                            d={run.pathData}
                            fill="none"
                            stroke="rgb(var(--accent-red) / 1)"
                            strokeWidth={2}
                            strokeDasharray={run.dashArray ?? undefined}
                            strokeLinecap="round"
                          />
                        ))}
                        {chart.tagged.map((slot) =>
                          slot && !slot.isInterpolated ? (
                            <circle
                              key={slot.date}
                              cx={slot.x}
                              cy={slot.y}
                              r={
                                selectedKey === slot.date
                                  ? POINT_RADIUS + 2
                                  : POINT_RADIUS
                              }
                              fill={
                                selectedKey === slot.date
                                  ? 'rgb(var(--accent-blue) / 1)'
                                  : 'rgb(var(--accent-red) / 1)'
                              }
                              stroke="rgb(var(--surface) / 1)"
                              strokeWidth={1.5}
                            />
                          ) : null
                        )}
                        {slots.map((slot, index) =>
                          chart.tagged[index] &&
                          !chart.tagged[index].isInterpolated ? (
                            <rect
                              key={`hit-${slot.date}`}
                              x={index * step}
                              y={0}
                              width={step}
                              height={CHART_HEIGHT}
                              fill="transparent"
                              className="cursor-pointer"
                              onClick={(event) =>
                                handleSlotTap(event, chart.tagged[index])
                              }
                            />
                          ) : null
                        )}
                      </g>
                    </svg>
                    <TrackerSelectionCard
                      isOpen={Boolean(selectedKey && retainedEntry)}
                      topPx={PLOT_TOP_PX}
                      actionLabel={isMonthMode ? null : 'Tap to edit reading'}
                      onAction={
                        isMonthMode
                          ? undefined
                          : () => onAddReading?.(retainedKey)
                      }
                      ariaLabel="Selected resting heart rate"
                    >
                      <p className="text-muted text-[11px]">
                        {retainedKey
                          ? isMonthMode
                            ? formatMonthLabel(retainedKey)
                            : formatDateLabel(retainedKey, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })
                          : ''}
                      </p>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-foreground text-xl font-bold">
                          {retainedEntry?.restingHr ?? '—'}
                          <span className="text-xs font-medium text-muted">
                            {' '}
                            bpm
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {isMonthMode && retainedEntry?.count != null && (
                            <TrackerCardMetric
                              label="Readings"
                              value={retainedEntry.count}
                            />
                          )}
                          {previousDelta && (
                            <TrackerCardMetric
                              label={
                                previousDelta.spanDays > 1
                                  ? `vs prev (${previousDelta.spanDays}d)`
                                  : 'vs prev'
                              }
                              value={formatSignedBpm(previousDelta.delta)}
                            />
                          )}
                          {weekDeviation != null && (
                            <TrackerCardMetric
                              label="vs 7d avg"
                              value={formatSignedBpm(weekDeviation)}
                            />
                          )}
                          {rawEntry?.avgHr != null && (
                            <TrackerCardMetric
                              label="Day avg"
                              value={`${rawEntry.avgHr}`}
                            />
                          )}
                          {rawEntry?.maxHr != null && (
                            <TrackerCardMetric
                              label="Max"
                              value={`${rawEntry.maxHr}`}
                            />
                          )}
                        </div>
                      </div>
                    </TrackerSelectionCard>
                  </div>
                  <div
                    className="relative w-10 shrink-0 pr-2 text-right text-[10px] text-muted"
                    style={{ height: CHART_HEIGHT + PLOT_TOP_PX * 2 }}
                  >
                    {chart.ticks.map((tick) => (
                      <span
                        key={tick.y}
                        className="absolute right-2 -translate-y-1/2"
                        style={{ top: tick.y + PLOT_TOP_PX }}
                      >
                        {tick.value}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-2 mb-2 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
                  <HeartPulse size={28} className="text-muted" />
                  <p className="text-foreground text-sm font-medium">
                    No resting heart rate yet
                  </p>
                  <p className="text-muted text-xs max-w-xs">
                    Log a morning reading
                    {sync.status !== HealthConnectStatus.UNAVAILABLE
                      ? ` or connect ${healthSourceName}`
                      : ''}{' '}
                    to start a trend.
                  </p>
                </div>
              )}
              {family === 'estimated' && chart && (
                <p className="px-2 pb-2 text-[11px] text-muted">
                  Estimated from your watch&apos;s lowest hourly average — it
                  reads a few beats above a true resting measurement, so compare
                  it only with itself.
                </p>
              )}
            </div>

            {todayEntry &&
              (todayEntry.avgHr != null || todayEntry.maxHr != null) && (
                <div className="mx-4 mt-2 grid grid-cols-3 gap-3 rounded-xl bg-surface-highlight/50 p-3 text-center">
                  <div>
                    <p className="text-muted text-[11px] uppercase tracking-wide">
                      Today avg
                    </p>
                    <p className="text-foreground font-semibold">
                      {todayEntry.avgHr ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted text-[11px] uppercase tracking-wide">
                      Min
                    </p>
                    <p className="text-foreground font-semibold">
                      {todayEntry.minHr ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted text-[11px] uppercase tracking-wide">
                      Max
                    </p>
                    <p className="text-foreground font-semibold">
                      {todayEntry.maxHr ?? '—'}
                    </p>
                  </div>
                </div>
              )}
          </>
        )}
      </div>
    </ModalShell>
  );
};

export default HeartRateTrackerModal;
