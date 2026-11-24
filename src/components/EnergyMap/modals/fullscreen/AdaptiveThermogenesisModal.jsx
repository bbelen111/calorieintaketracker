import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Gauge,
  HeartPulse,
  HelpCircle,
  Info,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { assessAdaptiveThermogenesisPhysiology } from '../../../../utils/calculations/heartRate';
import { formatSignedBpm } from '../../../../utils/formatting/heartRate';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import {
  computeAdaptiveThermogenesis,
  resolveAdaptiveThermogenesisMode,
  CRUDE_CUT_STAGES,
  CRUDE_SURPLUS_STAGES,
} from '../../../../utils/calculations/adaptiveThermogenesis';

const TABS = [
  { key: 'crude', label: 'Crude', icon: Flame },
  { key: 'smart', label: 'Smart', icon: Activity },
];
const REASONS = {
  'insufficient-intake-days': 'Keep logging meals to build this signal.',
  'insufficient-weight-entries': 'Add more weigh-ins to establish your trend.',
  'weight-data-stale':
    'Your latest weigh-in is too old to describe current behaviour — log a recent weight.',
  'weight-slope-unavailable': "Your weigh-ins don't form a reliable trend yet.",
  'invalid-date': 'The selected reference date is invalid.',
  'maintenance-goal': 'Corrections are only used for cut and surplus goals.',
  'insufficient-data': 'Smart mode needs more data before it can adjust.',
};
const signed = (value, unit = '') => {
  const number = Number(value) || 0;
  return (number > 0 ? '+' : '') + number + unit;
};
const goalLabel = (goal) =>
  goal ? goal.charAt(0).toUpperCase() + goal.slice(1) : 'No goal';

export const AdaptiveThermogenesisModal = ({
  isOpen,
  isClosing,
  onClose,
  onOpenInfo,
  onOpenRollingBalance,
}) => {
  const [tab, setTab] = useState('smart');
  const store = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      weightEntries: state.weightEntries ?? [],
      goalDurationDays: state.goalDurationDays,
    }),
    shallow
  );

  const data = useMemo(() => {
    const userData = store.userData;
    if (!userData) return null;
    const base = {
      selectedGoal: userData.selectedGoal,
      goalDurationDays: store.goalDurationDays ?? 0,
      goalChangedAt: userData.goalChangedAt,
      dateKey: getTodayDateKey(),
      dailySnapshots: userData.dailySnapshots,
      weightEntries: store.weightEntries,
      adaptiveSmoothingEnabled: userData.adaptiveThermogenesisSmoothingEnabled,
      adaptiveSmoothingMethod: userData.adaptiveThermogenesisSmoothingMethod,
      adaptiveSmoothingWindowDays:
        userData.adaptiveThermogenesisSmoothingWindowDays,
    };
    const smart = computeAdaptiveThermogenesis({ ...base, mode: 'smart' });
    return {
      enabled: Boolean(userData.adaptiveThermogenesisEnabled),
      activeMode: resolveAdaptiveThermogenesisMode({ userData }),
      days: base.goalDurationDays,
      crude: computeAdaptiveThermogenesis({ ...base, mode: 'crude' }),
      smart,
      physiology:
        smart?.insufficientData || smart?.details?.reason === 'maintenance-goal'
          ? null
          : assessAdaptiveThermogenesisPhysiology({
              correction: smart?.correction,
              heartRateEntries: userData.heartRateEntries,
              dateKey: base.dateKey,
            }),
      stages: { cut: CRUDE_CUT_STAGES, surplus: CRUDE_SURPLUS_STAGES },
    };
  }, [store.goalDurationDays, store.userData, store.weightEntries]);

  const result = tab === 'smart' ? data?.smart : data?.crude;
  const correction = result?.correction ?? 0;
  const correctionTone =
    correction < 0
      ? 'text-accent-orange'
      : correction > 0
        ? 'text-accent-blue'
        : 'text-foreground';
  const preview = data && !data.enabled;
  const crudeDetails = data?.crude?.details ?? null;
  const crudeMilestone = crudeDetails?.milestone ?? null;
  const crudePressure = Number(crudeDetails?.balancePressure) || 0;
  const nextDirection = crudeMilestone
    ? crudeMilestone.kcal < 0
      ? 'cut'
      : 'surplus'
    : crudeDetails?.goalType === 'cut' || crudeDetails?.goalType === 'surplus'
      ? crudeDetails.goalType
      : null;
  const next = getNextMilestone(crudePressure, nextDirection);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="fixed inset-0 bg-surface/70 p-0! flex-none! items-stretch! justify-stretch! z-1000"
      contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none max-h-none! flex flex-col pt-[env(safe-area-inset-top)] keyboard-bottom-inset pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] z-1001"
    >
      <header className="flex items-center justify-between px-4 py-3 fullscreen-header bg-background border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Back"
            className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h3 className="text-foreground font-bold text-xl leading-tight">
              Adaptive Thermogenesis
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => onOpenRollingBalance?.()}
            aria-label="View Smart analysis in Rolling Energy Balance"
            title="View in Rolling Energy Balance"
            className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
          >
            <BarChart3 size={20} />
          </button>
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="Adaptive Thermogenesis info"
            className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 fullscreen-body bg-surface border-t border-border overflow-y-auto flex flex-col">
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative flex items-center gap-2 p-1 bg-surface-highlight rounded-lg">
            <div
              className="absolute inset-y-1 rounded-md shadow-md bg-accent-blue"
              style={{
                width: 'calc((100% - 16px) / 2)',
                left:
                  tab === 'crude' ? '4px' : 'calc((100% - 16px) / 2 + 12px)',
                transition:
                  'left 0.28s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.28s ease-out, box-shadow 0.28s ease-out',
              }}
            />
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={
                  'relative z-10 flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ' +
                  (tab === key
                    ? 'text-primary-foreground'
                    : 'text-muted md:hover:text-foreground')
                }
              >
                <Icon size={16} className="mr-1.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {tab === 'smart'
                ? 'Compares logged balance with your weight trend.'
                : 'A rolling adjustment built from your daily goal history.'}
            </p>
            <ActiveModeBadge enabled={data?.enabled} mode={data?.activeMode} />
          </div>
        </div>

        {!data ? (
          <EmptyState message="No energy data is available yet." />
        ) : (
          <>
            <section className="px-4 pt-2 pb-3 grid grid-cols-2 gap-x-4 gap-y-3 shrink-0">
              <Metric
                label={preview ? 'Preview correction' : 'Applied correction'}
                value={signed(correction)}
                tone={correctionTone}
                detail="kcal per day"
              />
              <Metric
                label="Status"
                value={
                  preview ? 'Preview' : result?.active ? 'Active' : 'Waiting'
                }
                tone={
                  preview
                    ? 'text-accent-yellow'
                    : result?.active
                      ? 'text-accent-green'
                      : 'text-muted'
                }
                detail={
                  preview
                    ? 'turn it on in Settings'
                    : result?.active
                      ? 'included in your target'
                      : 'no adjustment today'
                }
              />
              <Metric
                label="Goal"
                value={goalLabel(
                  result?.details?.goalType ?? store.userData?.selectedGoal
                )}
                detail={
                  tab === 'crude'
                    ? String(crudeDetails?.windowDays ?? 0) + ' snapshot days'
                    : String(data.days) + ' days in goal'
                }
              />
              <Metric
                label={tab === 'smart' ? 'Confidence' : 'Next change'}
                value={
                  tab === 'smart'
                    ? String(Math.round((result?.confidence ?? 0) * 100)) + '%'
                    : next
                      ? (nextDirection === 'cut' ? '≤ -' : '≥ ') +
                        next.minPressure
                      : crudeMilestone
                        ? 'Complete'
                        : '—'
                }
                detail={
                  tab === 'smart'
                    ? 'signal quality'
                    : next
                      ? signed(next.kcal) + ' kcal/day'
                      : crudeMilestone
                        ? 'final stage reached'
                        : 'no adaptation pressure yet'
                }
              />
            </section>
            <div className="border-b border-border shrink-0" />
            {preview && <PreviewNote />}
            <div key={tab} className="tracker-graph-switch px-4 py-4 flex-1">
              {tab === 'smart' ? (
                <SmartView
                  result={data.smart}
                  physiology={data.physiology}
                  onOpenRollingBalance={onOpenRollingBalance}
                />
              ) : (
                <TimelineView
                  result={data.crude}
                  stages={data.stages}
                  onOpenRollingBalance={onOpenRollingBalance}
                />
              )}
            </div>
          </>
        )}
      </main>
    </ModalShell>
  );
};

function ActiveModeBadge({ enabled, mode }) {
  const label = mode === 'smart' ? 'Smart' : mode === 'crude' ? 'Crude' : null;
  return (
    <span
      className={
        'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ' +
        (enabled && label
          ? 'bg-accent-green/15 text-accent-green'
          : 'bg-surface-highlight text-muted')
      }
    >
      <span
        className={
          'h-1.5 w-1.5 rounded-full ' +
          (enabled && label ? 'bg-accent-green' : 'bg-muted')
        }
      />
      {enabled && label ? 'Using ' + label : 'Currently off'}
    </span>
  );
}

function Metric({ label, value, detail, tone = 'text-foreground' }) {
  return (
    <div>
      <p className="text-muted text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={'text-2xl font-bold leading-tight ' + tone}>{value}</p>
      <p className="text-muted text-[11px] mt-1">{detail}</p>
    </div>
  );
}

function getDivergenceExplanation(signal) {
  if (signal?.noiseSuppressed) {
    return 'Divergence is within the ±0.15 kg noise floor, so no correction is needed.';
  }
  const divergence = Number(signal?.divergenceKg) || 0;
  if (divergence > 0) {
    return 'Scale trend is higher than energy balance predicted, indicating lower real-world expenditure.';
  }
  if (divergence < 0) {
    return 'Scale trend is lower than energy balance predicted, indicating higher real-world expenditure.';
  }
  return 'Scale trend matches your logged energy balance.';
}

function SmartView({ result, physiology, onOpenRollingBalance }) {
  if (!result)
    return <EmptyState message="No smart-mode result was provided." />;
  if (result.details?.reason === 'maintenance-goal') {
    return <SmartMaintenanceView onOpenRollingBalance={onOpenRollingBalance} />;
  }
  if (result.insufficientData) {
    return (
      <SmartSetup
        details={result.details}
        onOpenRollingBalance={onOpenRollingBalance}
      />
    );
  }
  const signal = result.signal ?? {};
  const details = result.details ?? {};
  const divergence = Number(signal.divergenceKg) || 0;
  const positive = divergence >= 0;
  const Direction = positive ? TrendingUp : TrendingDown;
  const divergenceBadgeClass = signal.noiseSuppressed
    ? 'bg-accent-green/15 text-accent-green'
    : positive
      ? 'bg-accent-amber/15 text-accent-amber'
      : 'bg-accent-blue/15 text-accent-blue';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-highlight/40 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <span className="text-base font-semibold text-foreground flex items-center gap-2">
              <Activity size={17} className="text-accent-blue shrink-0" />
              Balance vs. scale trend
            </span>
          </div>
          <span
            className={
              'shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ' +
              divergenceBadgeClass
            }
          >
            <Direction size={14} />
            {signed(signal.divergenceKg, ' kg')}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Comparison
              label="Expected"
              value={signed(signal.expectedWeightDeltaKg, ' kg')}
              caption="from energy balance"
              onClick={
                typeof onOpenRollingBalance === 'function'
                  ? () => onOpenRollingBalance(details)
                  : undefined
              }
            />
            <Comparison
              label="Observed"
              value={signed(signal.observedWeightDeltaKg, ' kg')}
              caption="from weight trend"
              onClick={
                typeof onOpenRollingBalance === 'function'
                  ? () => onOpenRollingBalance(details)
                  : undefined
              }
            />
          </div>
          <p className="text-sm text-muted leading-relaxed">
            {getDivergenceExplanation(signal)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-highlight/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-base font-semibold text-foreground flex items-center gap-2">
            <Gauge size={17} className="text-accent-blue" />
            Signal confidence
          </span>
          <span className="text-base font-bold tabular-nums text-foreground">
            {Math.round((result.confidence ?? 0) * 100)}%
          </span>
        </div>
        <div className="p-4">
          <Rail value={result.confidence} tone="bg-accent-emerald" />
          <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/60">
            <MiniFact
              label="Expected rate"
              value={signed(details.expectedRateKgPerWeek, ' kg/wk')}
            />
            <MiniFact
              label="Observed rate"
              value={signed(details.observedRateKgPerWeek, ' kg/wk')}
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-border/60 bg-surface-highlight/20 flex flex-wrap gap-1.5">
          <Pill>{signal.validDays ?? 0} logged days</Pill>
          <Pill>{signal.weightEntriesUsed ?? 0} weigh-ins</Pill>
          {signal.smoothingEnabled && (
            <Pill>
              {String(signal.smoothingMethod || 'trend').toUpperCase()} ·{' '}
              {signal.smoothingWindowDays}d
            </Pill>
          )}
          {details.windowStart && details.windowEnd && (
            <Pill>
              {details.windowStart} to {details.windowEnd}
            </Pill>
          )}
          {signal.noiseSuppressed && (
            <Pill
              icon={<CheckCircle2 size={12} className="text-accent-green" />}
            >
              within noise floor
            </Pill>
          )}
        </div>
      </div>

      {physiology && <PhysiologyCheck physiology={physiology} />}
    </div>
  );
}

function SmartMaintenanceView({ onOpenRollingBalance }) {
  return (
    <div className="space-y-4">
      <InfoCallout
        title="Why Smart mode pauses at maintenance"
        body="Smart mode calibrates TDEE when a sustained cut or surplus drifts from your logged energy balance. At maintenance, expected weight change is near zero, so day-to-day water and glycogen swings would look like noise instead of metabolic adaptation."
      />

      <div className="rounded-xl border border-border bg-surface-highlight/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-base font-semibold text-foreground">
            How Smart mode works on a cut or bulk
          </p>
        </div>
        <div className="divide-y divide-border/60">
          <GoalBehaviorRow
            icon={Activity}
            iconClass="text-accent-blue"
            title="28-day balance vs. scale"
            range="up to ±300 kcal/day"
            description="Compares cumulative energy balance against your real weight trend to estimate how much expenditure has shifted."
          />
          <GoalBehaviorRow
            icon={Gauge}
            iconClass="text-accent-emerald"
            title="Noise floor & freshness"
            range="±0.15 kg floor"
            description="Ignores minor scale fluctuations and requires recent weigh-ins plus consistent food logs before applying a change."
          />
          <GoalBehaviorRow
            icon={CheckCircle2}
            iconClass="text-accent-green"
            title="Optional smoothing"
            range="EMA / SMA"
            description="Enable weight smoothing in Settings (3–14 day window) to steady noisy daily weigh-ins."
          />
        </div>
      </div>

      <RollingBalanceShortcut
        onOpenRollingBalance={onOpenRollingBalance}
        subtitle="Track how closely your logged intake matches maintenance TDEE over time."
      />
    </div>
  );
}

const PHYSIOLOGY_COPY = {
  agrees: 'Your resting heart rate is moving the same way as this correction.',
  disagrees:
    'Your resting heart rate is moving the other way. Worth a second look — illness, sleep, alcohol and training load move it too.',
  neutral: 'Your resting heart rate is roughly steady.',
};

/** Display-only resting-HR corroboration (never changes the correction). */
function PhysiologyCheck({ physiology }) {
  const tone =
    physiology.agreement === 'agrees'
      ? 'bg-accent-green/15 text-accent-green'
      : physiology.agreement === 'disagrees'
        ? 'bg-accent-amber/15 text-accent-amber'
        : 'bg-surface-highlight text-muted';
  return (
    <div className="rounded-xl border border-border bg-surface-highlight/40 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <span className="text-base font-semibold text-foreground flex items-center gap-2">
          <HeartPulse size={17} className="text-accent-red" />
          Physiology check
        </span>
        <span
          className={
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ' +
            tone
          }
        >
          {formatSignedBpm(physiology.restingHrDeltaBpm)} / 28d
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-muted text-sm leading-relaxed">
          {PHYSIOLOGY_COPY[physiology.agreement]} Based on {physiology.readings}{' '}
          resting readings. Shown for context only — it does not change the
          number.
        </p>
      </div>
    </div>
  );
}

function TimelineView({ result, stages, onOpenRollingBalance }) {
  if (!result) return <EmptyState message="No timeline result was provided." />;
  const goal = result.details?.goalType;
  const milestone = result.details?.milestone ?? null;
  const timelineGoal = milestone
    ? milestone.kcal < 0
      ? 'cut'
      : 'surplus'
    : goal;
  const timeline = timelineGoal ? stages?.[timelineGoal] : null;
  if (!timeline) {
    if (goal === 'maintenance') {
      return (
        <CrudeMaintenanceView
          result={result}
          stages={stages}
          onOpenRollingBalance={onOpenRollingBalance}
        />
      );
    }
    return (
      <EmptyState message="Choose a cut or surplus goal to see an adaptation timeline." />
    );
  }
  const isCut = timelineGoal === 'cut';
  const isDecayingOnMaintenance = goal === 'maintenance' && Boolean(milestone);
  const pressure = Number(result.details?.balancePressure) || 0;
  const windowDays = Number(result.details?.windowDays) || 0;
  const max = Math.max(...timeline.map((stage) => Math.abs(stage.kcal)), 1);
  const DirectionIcon = isCut ? TrendingDown : TrendingUp;
  const iconTone = isCut ? 'text-accent-orange' : 'text-accent-blue';
  const badgeTone =
    result.correction < 0
      ? 'bg-accent-orange/15 text-accent-orange'
      : result.correction > 0
        ? 'bg-accent-blue/15 text-accent-blue'
        : 'bg-surface-highlight text-muted';

  return (
    <div className="space-y-4">
      {isDecayingOnMaintenance && (
        <InfoCallout
          title="Unwinding on maintenance"
          body="Your current goal is Maintenance, so accumulated pressure from your recent phase is decaying gradually back toward 0 instead of resetting overnight."
        />
      )}

      <div className="rounded-xl border border-border bg-surface-highlight/40 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <span className="text-base font-semibold text-foreground flex items-center gap-2">
              <DirectionIcon size={17} className={'shrink-0 ' + iconTone} />
              {goalLabel(timelineGoal)} milestones
            </span>
            <p className="text-sm text-muted mt-0.5 tabular-nums">
              Pressure {signed(pressure)}
              {windowDays
                ? ` · ${windowDays} snapshot day${windowDays === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
          <span
            className={
              'shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ' +
              badgeTone
            }
          >
            {signed(result.correction)} kcal/day
          </span>
        </div>

        <div className="p-4 space-y-2.5">
          {timeline.map((stage) => {
            const reached = isCut
              ? pressure <= -stage.minPressure
              : pressure >= stage.minPressure;
            const active = milestone?.minPressure === stage.minPressure;
            const width =
              Math.max(14, (Math.abs(stage.kcal) / max) * 100) + '%';
            const barTone = active
              ? isCut
                ? 'bg-accent-orange'
                : 'bg-accent-blue'
              : reached
                ? isCut
                  ? 'bg-accent-orange/45'
                  : 'bg-accent-blue/45'
                : 'bg-surface-highlight';
            const textTone = active
              ? iconTone
              : reached
                ? 'text-foreground'
                : 'text-muted';
            const rowFrame = active
              ? isCut
                ? 'border-accent-orange/40 bg-accent-orange/10'
                : 'border-accent-blue/40 bg-accent-blue/10'
              : 'border-transparent bg-transparent';

            return (
              <div
                key={stage.minPressure}
                className={
                  'grid grid-cols-[64px_1fr_auto] items-center gap-3 rounded-lg border px-2 py-1.5 transition-colors ' +
                  rowFrame
                }
              >
                <span
                  className={'text-sm font-semibold tabular-nums ' + textTone}
                >
                  {isCut ? `≤ -${stage.minPressure}` : `≥ ${stage.minPressure}`}
                </span>
                <div className="h-7 flex items-center rounded-md bg-surface-highlight/60 overflow-hidden">
                  <div
                    className={
                      'h-full rounded-md transition-[width] duration-500 ' +
                      barTone
                    }
                    style={{ width }}
                  />
                </div>
                <span
                  className={
                    'text-sm font-semibold tabular-nums min-w-[48px] text-right ' +
                    textTone
                  }
                >
                  {signed(stage.kcal)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-border/60 bg-surface-highlight/20 flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-accent-blue" />
          <p className="text-xs text-muted leading-relaxed">
            Pressure builds from up to 28 days of goal history: cut days push it
            down, surplus days unwind it fastest, and maintenance days slowly
            decay it. The highlighted stage is today&apos;s correction.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatStageRange(stageList) {
  if (!Array.isArray(stageList) || stageList.length === 0) return '—';
  const first = stageList[0].kcal;
  const last = stageList[stageList.length - 1].kcal;
  return `${signed(first)} to ${signed(last)} kcal/day`;
}

function CrudeMaintenanceView({ result, stages, onOpenRollingBalance }) {
  const pressure = Number(result?.details?.balancePressure) || 0;
  const hasResidualPressure = pressure !== 0;
  const cutRange = formatStageRange(stages?.cut);
  const surplusRange = formatStageRange(stages?.surplus);

  return (
    <div className="space-y-4">
      <InfoCallout
        title="Why maintenance stays at 0 kcal"
        body="Adaptive thermogenesis is your metabolism shifting in response to a sustained calorie deficit or surplus. Eating at maintenance keeps energy balance neutral, so your baseline TDEE does not need an adaptation correction."
      />

      {hasResidualPressure && (
        <div className="rounded-xl border border-border bg-surface-highlight/40 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-base font-semibold text-foreground">
              Residual pressure
            </span>
            <span className="text-base font-bold tabular-nums text-accent-blue">
              {signed(pressure)}
            </span>
          </div>
          <p className="text-sm text-muted mt-1 leading-relaxed">
            Leftover adaptation from a recent cut or surplus has dropped below
            the first correction threshold and keeps decaying back toward 0 each
            maintenance day.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-highlight/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-base font-semibold text-foreground">
            How Crude mode responds by goal
          </p>
        </div>
        <div className="divide-y divide-border/60">
          <GoalBehaviorRow
            icon={TrendingDown}
            iconClass="text-accent-orange"
            title="Cut"
            range={cutRange}
            description="Sustained deficit days build negative pressure and gradually lower your TDEE target."
          />
          <GoalBehaviorRow
            icon={TrendingUp}
            iconClass="text-accent-blue"
            title="Surplus"
            range={surplusRange}
            description="Clears prior cut pressure quickly, then adds a small upward TDEE adjustment."
          />
          <GoalBehaviorRow
            icon={CheckCircle2}
            iconClass="text-accent-green"
            title="Maintenance"
            range="0 kcal/day"
            description="Adds no new pressure. After a cut or bulk, maintenance days gradually decay leftover adaptation back to baseline."
          />
        </div>
      </div>

      <RollingBalanceShortcut
        onOpenRollingBalance={onOpenRollingBalance}
        subtitle="Track how closely your logged intake matches maintenance TDEE over time."
      />
    </div>
  );
}

function InfoCallout({ title, body }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent-blue/30 bg-accent-blue/10 p-4">
      <Info size={20} className="mt-0.5 shrink-0 text-accent-blue" />
      <div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function RollingBalanceShortcut({ onOpenRollingBalance, subtitle }) {
  if (typeof onOpenRollingBalance !== 'function') return null;
  return (
    <button
      type="button"
      onClick={() => onOpenRollingBalance()}
      className="w-full rounded-xl border border-border bg-surface-highlight/40 px-4 py-3 text-left flex items-center justify-between gap-3 md:hover:bg-surface-highlight/70 transition-colors pressable-card focus-ring"
    >
      <div className="flex items-start gap-3 min-w-0">
        <BarChart3 size={19} className="mt-0.5 shrink-0 text-accent-blue" />
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">
            Check Rolling Energy Balance
          </p>
          <p className="text-sm text-muted mt-0.5">{subtitle}</p>
        </div>
      </div>
      <ChevronRight size={17} className="shrink-0 text-muted" />
    </button>
  );
}

function GoalBehaviorRow({ icon: Icon, iconClass, title, range, description }) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <Icon size={17} className={'mt-0.5 shrink-0 ' + iconClass} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-foreground">
            {title}
          </span>
          <span className="text-sm font-semibold tabular-nums text-muted">
            {range}
          </span>
        </div>
        <p className="text-sm text-muted mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function SmartSetup({ details, onOpenRollingBalance }) {
  const days = Number(details?.validDays) || 0;
  const dayTarget = Math.max(1, Number(details?.minValidDays) || 1);
  const entries = Number(details?.weightEntriesUsed) || 0;
  const entryTarget = Math.max(1, Number(details?.minWeightEntries) || 1);
  const isStale = details?.reason === 'weight-data-stale';
  const readyCount =
    (days >= dayTarget ? 1 : 0) + (entries >= entryTarget ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-accent-yellow/35 bg-accent-yellow/10 p-4">
        <AlertTriangle
          size={20}
          className="mt-0.5 shrink-0 text-accent-yellow"
        />
        <div>
          <p className="text-base font-semibold text-foreground">
            {isStale ? 'Recent weigh-in needed' : 'Building your baseline'}
          </p>
          <p className="text-sm text-muted mt-1 leading-relaxed">
            {REASONS[details?.reason] ?? REASONS['insufficient-data']}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-highlight/40 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <span className="text-base font-semibold text-foreground flex items-center gap-2">
            <Gauge size={17} className="text-accent-blue" />
            Smart mode readiness
          </span>
          <span className="text-sm font-semibold tabular-nums text-muted">
            {readyCount} / 2 met
          </span>
        </div>
        <div className="p-4 space-y-4">
          <Readiness label="Logged days" current={days} target={dayTarget} />
          <Readiness label="Weigh-ins" current={entries} target={entryTarget} />
        </div>
        <div className="px-4 py-3 border-t border-border/60 bg-surface-highlight/20 flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-accent-blue" />
          <p className="text-xs text-muted leading-relaxed">
            Smart mode analyzes up to 28 days of food logs and weigh-ins (with a
            weigh-in within the last {details?.stalenessMaxAgeDays ?? 3} days)
            before adjusting your TDEE.
          </p>
        </div>
      </div>

      <RollingBalanceShortcut
        onOpenRollingBalance={onOpenRollingBalance}
        subtitle="Review your recent intake and daily balance while Smart mode builds your baseline."
      />
    </div>
  );
}

function Readiness({ label, current, target }) {
  const complete = current >= target;
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-base">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          {complete && (
            <CheckCircle2 size={15} className="text-accent-green shrink-0" />
          )}
          {label}
        </span>
        <span
          className={
            'text-sm font-semibold tabular-nums ' +
            (complete ? 'text-accent-green' : 'text-muted')
          }
        >
          {current} / {target}
        </span>
      </div>
      <Rail
        value={current / target}
        tone={complete ? 'bg-accent-green' : 'bg-accent-blue'}
      />
    </div>
  );
}

function Rail({ value, tone }) {
  const width =
    Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100) + '%';
  return (
    <div className="h-2 rounded-full bg-surface-highlight overflow-hidden">
      <div
        className={
          'h-full rounded-full transition-[width] duration-500 ' + tone
        }
        style={{ width }}
      />
    </div>
  );
}

function Comparison({ label, value, caption, onClick }) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        {typeof onClick === 'function' && (
          <ChevronRight size={15} className="text-muted shrink-0" />
        )}
      </div>
      <p className="text-foreground text-2xl font-bold tabular-nums mt-1">
        {value}
      </p>
      <p className="text-muted text-xs mt-1">{caption}</p>
    </>
  );
  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`View ${label.toLowerCase()} analysis in Rolling Energy Balance`}
        className="rounded-xl border border-border/70 bg-surface/60 p-3 text-left md:hover:bg-surface-highlight/70 transition-colors pressable-card focus-ring"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-border/70 bg-surface/60 p-3">
      {content}
    </div>
  );
}

function MiniFact({ label, value }) {
  return (
    <div>
      <p className="text-muted text-xs uppercase tracking-wide">{label}</p>
      <p className="text-foreground text-base font-semibold tabular-nums mt-1">
        {value}
      </p>
    </div>
  );
}

function Pill({ children, icon }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/60 px-2.5 py-1 text-[11px] font-medium text-muted">
      {icon}
      {children}
    </span>
  );
}

function PreviewNote() {
  return (
    <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl border border-accent-yellow/35 bg-accent-yellow/10 px-3.5 py-2.5 text-xs text-muted">
      <Info size={14} className="mt-0.5 shrink-0 text-accent-yellow" />
      <span>
        Adaptive thermogenesis is off in Settings. These values show what would
        be applied if you enable it.
      </span>
    </div>
  );
}

function getNextMilestone(pressure, goalType) {
  if (goalType === 'cut') {
    return (
      CRUDE_CUT_STAGES.find((stage) => stage.minPressure > -pressure) ?? null
    );
  }
  if (goalType === 'surplus') {
    return (
      CRUDE_SURPLUS_STAGES.find((stage) => stage.minPressure > pressure) ?? null
    );
  }
  return null;
}

function EmptyState({ message }) {
  return (
    <div className="m-4 rounded-xl border border-dashed border-border bg-surface-highlight/30 p-5 text-sm text-muted">
      {message}
    </div>
  );
}
