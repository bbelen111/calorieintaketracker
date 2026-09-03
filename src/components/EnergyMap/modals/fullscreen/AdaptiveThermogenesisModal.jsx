import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  Flame,
  Gauge,
  HelpCircle,
  Info,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
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
    return {
      enabled: Boolean(userData.adaptiveThermogenesisEnabled),
      activeMode: resolveAdaptiveThermogenesisMode({ userData }),
      days: base.goalDurationDays,
      crude: computeAdaptiveThermogenesis({ ...base, mode: 'crude' }),
      smart: computeAdaptiveThermogenesis({ ...base, mode: 'smart' }),
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
      overlayClassName="fixed inset-0 bg-surface/70 !p-0 !flex-none !items-stretch !justify-stretch z-[1000]"
      contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none !max-h-none flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] z-[1001]"
    >
      <header className="flex items-center justify-between px-4 py-3 bg-background border-b border-border flex-shrink-0">
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

      <main className="flex-1 bg-surface border-t border-border overflow-y-auto flex flex-col">
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
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
            <section className="px-4 pt-2 pb-3 grid grid-cols-2 gap-x-4 gap-y-3 flex-shrink-0">
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
            <div className="border-b border-border flex-shrink-0" />
            {preview && <PreviewNote />}
            <div key={tab} className="tracker-graph-switch px-4 py-4 flex-1">
              {tab === 'smart' ? (
                <SmartView
                  result={data.smart}
                  onOpenRollingBalance={onOpenRollingBalance}
                />
              ) : (
                <TimelineView result={data.crude} stages={data.stages} />
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

function SmartView({ result, onOpenRollingBalance }) {
  if (!result)
    return <EmptyState message="No smart-mode result was provided." />;
  if (result.insufficientData) return <SmartSetup details={result.details} />;
  const signal = result.signal ?? {};
  const details = result.details ?? {};
  const positive = Number(signal.divergenceKg) >= 0;
  const Direction = positive ? TrendingUp : TrendingDown;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-muted text-xs uppercase tracking-wide">
            Balance vs. scale trend
          </p>
          <p className="text-foreground text-lg font-semibold mt-1">
            How your body is responding
          </p>
        </div>
        <div
          className={
            'flex items-center gap-1 text-sm font-semibold ' +
            (positive ? 'text-accent-amber' : 'text-accent-blue')
          }
        >
          <Direction size={16} />
          {signed(signal.divergenceKg, ' kg')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Comparison
          label="Expected"
          value={signed(signal.expectedWeightDeltaKg, ' kg')}
          caption="from energy balance"
          onClick={() => onOpenRollingBalance?.(details)}
        />
        <Comparison
          label="Observed"
          value={signed(signal.observedWeightDeltaKg, ' kg')}
          caption="from weight trend"
          onClick={() => onOpenRollingBalance?.(details)}
        />
      </div>
      <div className="rounded-xl border border-border bg-surface-highlight/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Gauge size={16} className="text-accent-blue" />
            Signal confidence
          </span>
          <span className="text-sm font-bold text-foreground">
            {Math.round((result.confidence ?? 0) * 100)}%
          </span>
        </div>
        <div className="p-4">
          <Rail value={result.confidence} tone="bg-accent-emerald" />
          <div className="grid grid-cols-2 gap-3 mt-4">
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
      </div>
      <div className="flex flex-wrap gap-2">
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
          <Pill icon={<CheckCircle2 size={13} className="text-accent-green" />}>
            within noise floor
          </Pill>
        )}
      </div>
    </div>
  );
}

function TimelineView({ result, stages }) {
  if (!result) return <EmptyState message="No timeline result was provided." />;
  const goal = result.details?.goalType;
  const milestone = result.details?.milestone ?? null;
  const timelineGoal = milestone
    ? milestone.kcal < 0
      ? 'cut'
      : 'surplus'
    : goal;
  const timeline = timelineGoal ? stages?.[timelineGoal] : null;
  if (!timeline)
    return (
      <EmptyState message="Choose a cut or surplus goal to see an adaptation timeline." />
    );
  const isCut = timelineGoal === 'cut';
  const pressure = Number(result.details?.balancePressure) || 0;
  const windowDays = Number(result.details?.windowDays) || 0;
  const max = Math.max(...timeline.map((stage) => Math.abs(stage.kcal)), 1);
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-muted text-xs uppercase tracking-wide">
            {goalLabel(timelineGoal)} milestones
          </p>
          <p className="text-foreground text-lg font-semibold mt-1">
            Pressure <span className="tabular-nums">{signed(pressure)}</span>
            {windowDays
              ? ` · ${windowDays} snapshot day${windowDays === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        <span className="text-sm font-semibold text-accent-blue">
          {signed(result.correction)} kcal/day
        </span>
      </div>
      <div className="space-y-3">
        {timeline.map((stage) => {
          const reached = isCut
            ? pressure <= -stage.minPressure
            : pressure >= stage.minPressure;
          const active = milestone?.minPressure === stage.minPressure;
          const width = Math.max(10, (Math.abs(stage.kcal) / max) * 100) + '%';
          const tone = active
            ? 'bg-accent-blue'
            : reached
              ? 'bg-accent-blue/45'
              : 'bg-surface-highlight';
          const textTone = active
            ? 'text-accent-blue'
            : reached
              ? 'text-foreground'
              : 'text-muted';
          return (
            <div
              key={stage.minPressure}
              className="grid grid-cols-[64px_1fr_auto] items-center gap-3"
            >
              <span className={'text-xs font-semibold ' + textTone}>
                {isCut ? `≤ -${stage.minPressure}` : `≥ ${stage.minPressure}`}
              </span>
              <div className="h-8 flex items-center rounded-r-lg bg-surface-highlight/55 overflow-hidden">
                <div
                  className={
                    'h-full rounded-r-lg transition-[width] duration-500 ' +
                    tone
                  }
                  style={{ width }}
                />
              </div>
              <span
                className={'text-sm font-semibold tabular-nums ' + textTone}
              >
                {signed(stage.kcal)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        Pressure accumulates from your daily goal history (up to 28 days): cut
        days push it down, surplus days unwind it fastest, and maintenance days
        slowly decay it. The highlighted stage is the correction applied today.
      </p>
    </div>
  );
}

function SmartSetup({ details }) {
  const days = Number(details?.validDays) || 0;
  const dayTarget = Math.max(1, Number(details?.minValidDays) || 1);
  const entries = Number(details?.weightEntriesUsed) || 0;
  const entryTarget = Math.max(1, Number(details?.minWeightEntries) || 1);
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-accent-yellow/40 bg-accent-yellow/10 p-4">
        <AlertTriangle
          size={19}
          className="mt-0.5 shrink-0 text-accent-yellow"
        />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Building your baseline
          </p>
          <p className="text-sm text-muted mt-1">
            {REASONS[details?.reason] ?? REASONS['insufficient-data']}
          </p>
        </div>
      </div>
      <p className="text-muted text-xs uppercase tracking-wide">
        Smart mode readiness
      </p>
      <Readiness label="Logged days" current={days} target={dayTarget} />
      <Readiness label="Weigh-ins" current={entries} target={entryTarget} />
    </div>
  );
}

function Readiness({ label, current, target }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-sm">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted">
          {current} / {target}
        </span>
      </div>
      <Rail value={current / target} tone="bg-accent-blue" />
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
      <p className="text-xs text-muted">{label}</p>
      <p className="text-foreground text-xl font-bold mt-1">{value}</p>
      <p className="text-muted text-[11px] mt-1">{caption}</p>
    </>
  );
  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`View ${label.toLowerCase()} analysis in Rolling Energy Balance`}
        className="rounded-xl border border-border bg-surface-highlight/40 p-3 text-left md:hover:bg-surface-highlight/70 transition-colors pressable-card focus-ring"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface-highlight/40 p-3">
      {content}
    </div>
  );
}
function MiniFact({ label, value }) {
  return (
    <div>
      <p className="text-muted text-[11px] uppercase tracking-wide">{label}</p>
      <p className="text-foreground font-semibold mt-1">{value}</p>
    </div>
  );
}
function Pill({ children, icon }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-highlight px-2.5 py-1 text-xs text-muted">
      {icon}
      {children}
    </span>
  );
}
function PreviewNote() {
  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface-highlight/40 p-3 text-xs text-muted">
      <Info size={14} className="mt-0.5 shrink-0 text-accent-blue" />
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
