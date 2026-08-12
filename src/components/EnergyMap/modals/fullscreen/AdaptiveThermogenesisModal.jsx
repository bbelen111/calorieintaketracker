import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  Flame,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Info,
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

const REASON_COPY = {
  'insufficient-intake-days': 'Not enough logged days in the last window yet.',
  'insufficient-weight-entries': 'Not enough weigh-ins in the last window yet.',
  'weight-slope-unavailable': "Weigh-ins couldn't produce a reliable trend.",
  'invalid-date': 'The reference date is invalid.',
  'maintenance-goal':
    'Adaptive corrections only apply to cut or surplus goals.',
  'insufficient-data': 'Smart mode needs more data to run.',
};

const TABS = [
  { key: 'crude', label: 'Crude', icon: Flame },
  { key: 'smart', label: 'Smart', icon: Activity },
];

export const AdaptiveThermogenesisModal = ({ isOpen, isClosing, onClose }) => {
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

    const dateKey = getTodayDateKey();
    const goalDurationDays = store.goalDurationDays ?? 0;

    const baseProps = {
      selectedGoal: userData?.selectedGoal,
      goalDurationDays,
      goalChangedAt: userData?.goalChangedAt,
      dateKey,
      dailySnapshots: userData?.dailySnapshots,
      weightEntries: store.weightEntries,
      adaptiveSmoothingEnabled: userData?.adaptiveThermogenesisSmoothingEnabled,
      adaptiveSmoothingMethod: userData?.adaptiveThermogenesisSmoothingMethod,
      adaptiveSmoothingWindowDays:
        userData?.adaptiveThermogenesisSmoothingWindowDays,
    };

    const mode = resolveAdaptiveThermogenesisMode({ userData });

    return {
      mode,
      enabled: Boolean(userData?.adaptiveThermogenesisEnabled),
      goalDurationDays,
      crude: computeAdaptiveThermogenesis({ ...baseProps, mode: 'crude' }),
      smart: computeAdaptiveThermogenesis({ ...baseProps, mode: 'smart' }),
      stages: { cut: CRUDE_CUT_STAGES, surplus: CRUDE_SURPLUS_STAGES },
    };
  }, [store.userData, store.weightEntries, store.goalDurationDays]);

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="fixed inset-0 bg-surface/70 !p-0 !flex-none !items-stretch !justify-stretch z-[1000]"
        contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none !max-h-none flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] z-[1001]"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onClose?.()}
              aria-label="Back"
              className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
            >
              <ChevronLeft size={24} />
            </button>
            <h3 className="text-foreground font-bold text-xl">
              Adaptive Thermogenesis
            </h3>
          </div>
          {data?.enabled && data?.mode !== 'off' ? (
            <span className="text-xs text-muted inline-flex items-center gap-1.5">
              <Info size={13} className="text-accent-blue" />
              Live
            </span>
          ) : null}
        </div>

        {/* Main content area */}
        <div className="flex-1 bg-surface border-t border-border overflow-y-auto flex flex-col">
          {/* Mode toggle */}
          <div className="px-4 pt-3 pb-1 flex-shrink-0">
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
              {TABS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={`relative z-10 flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      tab === item.key
                        ? 'text-primary-foreground'
                        : 'text-muted md:hover:text-foreground'
                    }`}
                  >
                    <Icon size={16} className="mr-1.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panels */}
          <div className="px-4 pt-3 pb-8">
            {!data ? (
              <EmptyState message="No energy data available yet." />
            ) : tab === 'crude' ? (
              <CrudePanel
                result={data.crude}
                enabled={data.enabled}
                stages={data.stages}
                goalDurationDays={data.goalDurationDays}
              />
            ) : (
              <SmartPanel result={data.smart} enabled={data.enabled} />
            )}
          </div>
        </div>
      </ModalShell>
    </>
  );
};
function CrudePanel({ result, enabled, stages, goalDurationDays }) {
  if (!result)
    return <EmptyState message="No crude-mode result was provided." />;

  const { correction, active, details } = result;
  const goalType = details?.goalType;
  const currentStage = details?.stage;
  const timeline = goalType ? stages?.[goalType] : null;
  const nextStage = timeline?.find((s) => s.minDays > goalDurationDays) ?? null;
  const goalLabel = goalType
    ? goalType.charAt(0).toUpperCase() + goalType.slice(1)
    : '—';

  return (
    <div className="space-y-5">
      {!enabled && <DisabledNote />}
      <CorrectionHeadline correction={correction} active={active} />
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Goal type" value={goalLabel} />
        <StatCard label="Days on goal" value={goalDurationDays + 'd'} />
      </div>

      {currentStage ? (
        <div className="rounded-xl border border-border bg-surface-highlight/50 p-4 text-sm">
          <div className="mb-1 font-semibold text-foreground">Active stage</div>
          <div className="text-muted">
            Kicked in at day {currentStage.minDays} · applying{' '}
            <span className="font-semibold text-foreground">
              {currentStage.kcal > 0 ? '+' : ''}
              {currentStage.kcal} kcal/day
            </span>
          </div>
        </div>
      ) : (
        <EmptyState
          message={
            goalType === 'maintenance'
              ? 'Adaptive corrections only apply to cut or surplus goals.'
              : 'No stage threshold has been reached yet.'
          }
        />
      )}

      {timeline && (
        <div>
          <div className="mb-2 text-sm font-semibold text-foreground">
            Timeline
          </div>
          <ol className="space-y-1.5">
            {timeline.map((stage) => {
              const reached = goalDurationDays >= stage.minDays;
              const isCurrent = currentStage?.minDays === stage.minDays;
              return (
                <li
                  key={stage.minDays}
                  className={
                    'flex items-center justify-between rounded-lg px-3 py-2 text-sm ' +
                    (isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : reached
                        ? 'bg-surface-highlight text-muted'
                        : 'bg-surface-highlight/40 text-muted')
                  }
                >
                  <span>Day {stage.minDays}</span>
                  <span>
                    {stage.kcal > 0 ? '+' : ''}
                    {stage.kcal} kcal/day
                  </span>
                </li>
              );
            })}
          </ol>
          {nextStage && (
            <div className="mt-2 text-xs text-muted">
              Next adjustment in {nextStage.minDays - goalDurationDays} day
              {nextStage.minDays - goalDurationDays === 1 ? '' : 's'}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SmartPanel({ result, enabled }) {
  if (!result)
    return <EmptyState message="No smart-mode result was provided." />;

  const { correction, active, insufficientData, confidence, signal, details } =
    result;

  return (
    <div className="space-y-5">
      {!enabled && <DisabledNote />}
      {insufficientData ? (
        <InsufficientDataState details={details} />
      ) : (
        <>
          <CorrectionHeadline correction={correction} active={active} />
          {confidence > 0 && <ConfidenceBar confidence={confidence} />}

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Expected change"
              value={
                (signal.expectedWeightDeltaKg > 0 ? '+' : '') +
                signal.expectedWeightDeltaKg +
                ' kg'
              }
              hint="from logged calorie balance"
            />
            <StatCard
              label="Observed change"
              value={
                (signal.observedWeightDeltaKg > 0 ? '+' : '') +
                signal.observedWeightDeltaKg +
                ' kg'
              }
              hint="from weight-trend regression"
            />
          </div>

          <div className="rounded-xl border border-border bg-surface-highlight/40 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              {signal.divergenceKg >= 0 ? (
                <TrendingUp size={14} className="text-accent-amber" />
              ) : (
                <TrendingDown size={14} className="text-accent-blue" />
              )}
              Divergence: {signal.divergenceKg > 0 ? '+' : ''}
              {signal.divergenceKg} kg over the window
            </div>
            <div className="text-sm text-muted">
              {signal.noiseSuppressed ? (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 size={13} className="text-muted" />
                  Below the noise floor — no correction applied from this
                  signal.
                </span>
              ) : (
                <>
                  Raw signal: {signal.rawKcalPerDay > 0 ? '+' : ''}
                  {signal.rawKcalPerDay} kcal/day → applied{' '}
                  {signal.appliedKcalPerDay > 0 ? '+' : ''}
                  {signal.appliedKcalPerDay} kcal/day (clamped, then inverted
                  into the correction above).
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <StatCard
              label="Expected rate"
              value={
                (details.expectedRateKgPerWeek > 0 ? '+' : '') +
                details.expectedRateKgPerWeek +
                ' kg/wk'
              }
            />
            <StatCard
              label="Observed rate"
              value={
                (details.observedRateKgPerWeek > 0 ? '+' : '') +
                details.observedRateKgPerWeek +
                ' kg/wk'
              }
            />
          </div>

          {signal && (
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              <span className="rounded-full bg-surface-highlight px-2.5 py-1">
                {signal.validDays} logged days used
              </span>
              <span className="rounded-full bg-surface-highlight px-2.5 py-1">
                {signal.weightEntriesUsed} weigh-ins used
              </span>
              {signal.smoothingEnabled && (
                <span className="rounded-full bg-surface-highlight px-2.5 py-1">
                  {signal.smoothingMethod.toUpperCase()} smoothing ·{' '}
                  {signal.smoothingWindowDays}d
                </span>
              )}
              {details.windowStart && details.windowEnd && (
                <span className="rounded-full bg-surface-highlight px-2.5 py-1">
                  {details.windowStart} → {details.windowEnd}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InsufficientDataState({ details }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-accent-yellow/40 bg-accent-yellow/10 p-4">
        <AlertTriangle
          size={18}
          className="mt-0.5 shrink-0 text-accent-yellow"
        />
        <div>
          <div className="text-sm font-medium text-foreground">
            Not enough data yet
          </div>
          <div className="mt-0.5 text-sm text-muted">
            {REASON_COPY[details?.reason] ??
              'Smart mode needs more data to run.'}
          </div>
        </div>
      </div>

      {details?.minValidDays != null && (
        <div className="space-y-3">
          <ProgressRow
            label="Logged days"
            current={details.validDays}
            target={details.minValidDays}
          />
          <ProgressRow
            label="Weigh-ins"
            current={details.weightEntriesUsed}
            target={details.minWeightEntries}
          />
        </div>
      )}
    </div>
  );
}

function ProgressRow({ label, current, target }) {
  const safeTarget = Math.max(1, Number(target) || 1);
  const pct = Math.min(100, Math.round((Number(current) / safeTarget) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>
          {current} / {target}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-highlight">
        <div
          className="h-full rounded-full bg-accent-blue"
          style={{ width: pct + '%' }}
        />
      </div>
    </div>
  );
}

function CorrectionHeadline({ correction, active }) {
  const sign = correction > 0 ? '+' : '';
  const tone =
    correction < 0
      ? 'text-accent-orange'
      : correction > 0
        ? 'text-accent-blue'
        : 'text-muted';
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">
        Applied correction
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={'text-3xl font-semibold ' + tone}>
          {sign}
          {correction}
        </span>
        <span className="text-sm text-muted">kcal/day</span>
      </div>
      {!active && (
        <div className="mt-1 text-xs text-muted">Not currently active.</div>
      )}
    </div>
  );
}

function ConfidenceBar({ confidence }) {
  const pct = Math.round((confidence ?? 0) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1">
          <Gauge size={12} /> Confidence
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-highlight">
        <div
          className="h-full rounded-full bg-accent-emerald"
          style={{ width: pct + '%' }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-border bg-surface-highlight/40 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-base font-medium text-foreground">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function DisabledNote() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-highlight/40 p-3 text-xs text-muted">
      <Info size={14} className="mt-0.5 shrink-0 text-accent-blue" />
      <span>
        Adaptive thermogenesis is currently off in Settings — this is a live
        preview of what would be applied if it were enabled.
      </span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-highlight/30 p-4 text-sm text-muted">
      {message}
    </div>
  );
}
