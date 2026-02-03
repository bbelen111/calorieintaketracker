import React from 'react';
import {
  Info,
  ListChecks,
  Map,
  RefreshCw,
  Link2,
  Loader2,
  AlertCircle,
  Footprints,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { goals as baseGoals } from '../../../constants/goals';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

// Status constants imported from hook - duplicated here to avoid circular import
const HealthConnectStatus = {
  UNAVAILABLE: 'unavailable',
  NOT_INSTALLED: 'not_installed',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

const formatLastSynced = (date) => {
  if (!date) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
};

const formatStepCount = (count) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return count.toLocaleString();
};

/**
 * Live Steps Hero Card - shows current step data from Health Connect
 */
const LiveStepsCard = ({
  liveStepData,
  healthConnectStatus,
  healthConnectLoading,
  healthConnectError,
  onConnectHealth,
  onRefreshSteps,
  onOpenBreakdown,
  onOpenStepTracker,
  stepGoal = 10000,
}) => {
  const isConnected = healthConnectStatus === HealthConnectStatus.CONNECTED;
  const isUnavailable =
    healthConnectStatus === HealthConnectStatus.UNAVAILABLE ||
    healthConnectStatus === undefined;
  const isNotInstalled =
    healthConnectStatus === HealthConnectStatus.NOT_INSTALLED;
  const isDisconnected =
    healthConnectStatus === HealthConnectStatus.DISCONNECTED;
  const isConnecting = healthConnectStatus === HealthConnectStatus.CONNECTING;
  const hasError = healthConnectStatus === HealthConnectStatus.ERROR;

  // Don't show anything if Health Connect is unavailable (web platform)
  if (isUnavailable) {
    return null;
  }

  if (isNotInstalled) {
    return (
      <div className="bg-gradient-to-br from-surface-highlight/80 to-surface/80 rounded-2xl p-5 border border-border/50 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-amber-500/20 rounded-xl">
            <AlertCircle className="text-amber-400" size={24} />
          </div>
          <div>
            <h3 className="text-foreground font-semibold">
              Health Connect Required
            </h3>
            <p className="text-muted text-sm">
              Install Health Connect to track your steps
            </p>
          </div>
        </div>
        <p className="text-muted text-xs mb-3">
          Health Connect syncs steps from your phone, smartwatch, and fitness
          apps like Garmin, Fitbit, Samsung Health, and more.
        </p>
        <a
          href="https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm transition-all press-feedback focus-ring md:hover:bg-blue-500"
        >
          <Link2 size={16} />
          Get Health Connect
        </a>
      </div>
    );
  }

  // Disconnected - prompt to connect
  if (isDisconnected || hasError) {
    return (
      <div className="bg-gradient-to-br from-surface-highlight/80 to-surface/80 rounded-2xl p-5 border border-border/50 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-blue-500/20 rounded-xl">
            <Footprints className="text-blue-400" size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-foreground font-semibold">Track Your Steps</h3>
            <p className="text-muted text-sm">
              Connect to see your real step count
            </p>
          </div>
        </div>
        {hasError && healthConnectError && (
          <p className="text-red-400 text-xs mb-3 flex items-center gap-1">
            <AlertCircle size={12} />
            {healthConnectError}
          </p>
        )}
        <p className="text-muted text-xs mb-3">
          Sync steps from wearables and fitness apps via Health Connect.
        </p>
        <button
          type="button"
          onClick={onConnectHealth}
          disabled={healthConnectLoading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm transition-all press-feedback focus-ring md:hover:bg-blue-500"
        >
          {healthConnectLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Link2 size={16} />
          )}
          {healthConnectLoading ? 'Connecting...' : 'Connect Health Data'}
        </button>
      </div>
    );
  }

  // Connecting state
  if (isConnecting) {
    return (
      <div className="bg-gradient-to-br from-blue-900/30 to-surface/80 rounded-2xl p-5 border border-blue-500/30 mb-4">
        <div className="flex items-center gap-3">
          <Loader2 className="text-blue-400 animate-spin" size={24} />
          <span className="text-white font-medium">
            Connecting to Health Connect...
          </span>
        </div>
      </div>
    );
  }

  // Connected with live data
  if (isConnected && liveStepData) {
    const { stepCount, targetCalories, breakdown, difference, lastSynced } =
      liveStepData;

    const handleCardClick = () => {
      onOpenStepTracker?.();
    };

    return (
      <div
        onClick={handleCardClick}
        className="w-full bg-surface-highlight/60 rounded-2xl p-5 border border-border/50 mb-4 text-left md:hover:border-blue-400/40 transition-all focus-ring cursor-pointer active:scale-[0.99]"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-foreground font-bold text-lg">Today's Steps</h3>
            <p className="text-muted text-xs flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              Synced {formatLastSynced(lastSynced)}
            </p>
          </div>
          <div onClick={(e) => e.stopPropagation()} className="contents">
            <button
              type="button"
              onClick={onRefreshSteps}
              disabled={healthConnectLoading}
              className="p-2 text-muted rounded-lg border border-border/60 bg-surface-highlight/40 transition-colors focus-ring md:hover:text-foreground md:hover:bg-border/60 disabled:opacity-50 disabled:cursor-not-allowed active:!scale-100"
              aria-label="Refresh steps"
            >
              <RefreshCw
                size={18}
                className={healthConnectLoading ? 'animate-spin' : ''}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Step Count */}
          <div className="bg-border/50 rounded-xl p-3 text-center">
            <p className="text-white/80 text-xs mb-1">Steps</p>
            <p
              className={`font-bold text-2xl ${
                stepCount >= stepGoal ? 'text-green-400' : 'text-blue-400'
              }`}
            >
              {stepCount.toLocaleString()}
            </p>
            <p className="text-white/70 text-xs">
              ~{formatStepCount(stepCount)} steps
            </p>
          </div>

          {/* Target Calories */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenBreakdown?.(stepCount);
            }}
            className="bg-blue-600 rounded-xl p-3 text-center relative pressable-card focus-ring md:hover:bg-blue-500 transition-all"
          >
            <Info size={12} className="absolute top-2 right-2 text-white/60" />
            <p className="text-white/80 text-xs mb-1">Target</p>
            <p className="text-white font-bold text-2xl">
              {targetCalories.toLocaleString()}
            </p>
            <p className="text-white/70 text-xs">calories</p>
          </button>
        </div>

        {/* Step Goal Progress Bar */}
        {stepGoal > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-muted text-xs">
                Goal: {stepGoal.toLocaleString()} steps
              </p>
              <p
                className={`text-xs font-semibold ${
                  stepCount >= stepGoal ? 'text-green-400' : 'text-blue-400'
                }`}
              >
                {Math.round((stepCount / stepGoal) * 100)}%
              </p>
            </div>
            <div className="w-full bg-surface-highlight rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  stepCount >= stepGoal ? 'bg-green-500' : 'bg-blue-600'
                }`}
                style={{
                  width: `${Math.min(100, (stepCount / stepGoal) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-3 border-t border-border/50">
          <p className="text-muted text-xs">
            TDEE: {breakdown.total.toLocaleString()} cal
            {difference !== 0 && (
              <span
                className={`ml-2 font-semibold ${difference > 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {difference > 0 ? '+' : ''}
                {difference.toLocaleString()} cal
              </span>
            )}
          </p>
          <p className="text-blue-300 text-xs tracking-wide">
            Tap to open step tracker
          </p>
        </div>
      </div>
    );
  }

  // Fallback - loading initial state
  if (healthConnectLoading) {
    return (
      <div className="bg-gradient-to-br from-surface-highlight/80 to-surface/80 rounded-2xl p-5 border border-border/50 mb-4">
        <div className="flex items-center gap-3">
          <Loader2 className="text-blue-400 animate-spin" size={24} />
          <span className="text-white font-medium">Loading step data...</span>
        </div>
      </div>
    );
  }

  return null;
};

export const CalorieMapScreen = ({
  stepRanges,
  selectedGoal,
  selectedDay,
  goals,
  onManageStepRanges,
  onOpenBreakdown,
  getRangeDetails,
  isSelectedRange,
  // Health Connect props
  liveStepData,
  healthConnectStatus,
  healthConnectLoading,
  healthConnectError,
  onConnectHealth,
  onRefreshSteps,
  onOpenStepTracker,
  stepGoal,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      stepRanges: state.userData.stepRanges ?? [],
      stepGoal: state.stepGoal ?? 10000,
    }),
    shallow
  );
  const resolvedStepRanges = stepRanges ?? store.stepRanges;
  const resolvedStepGoal = stepGoal ?? store.stepGoal;
  const resolvedGoals = goals ?? baseGoals;
  const goalTextClasses = {
    aggressive_bulk: 'text-purple-400',
    bulking: 'text-green-400',
    maintenance: 'text-blue-300',
    cutting: 'text-yellow-400',
    aggressive_cut: 'text-orange-400',
  };
  const goalTextClass = goalTextClasses[selectedGoal] ?? 'text-blue-300';

  return (
    <div className="space-y-6 pb-10">
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <Map className="text-blue-400" size={32} />
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Calorie Map
              </h1>
            </div>
            <div className="mt-1">
              <span
                className={`${goalTextClass} text-sm tracking-widest font-semibold uppercase`}
              >
                {resolvedGoals[selectedGoal].label}
              </span>
              <span className="text-muted text-base font-normal ml-2">
                ({selectedDay === 'training' ? 'Training Day' : 'Rest Day'})
              </span>
            </div>
          </div>
          <div className="flex-1 flex justify-end items-start">
            <button
              type="button"
              onClick={onManageStepRanges}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold transition-all flex items-center gap-2 press-feedback focus-ring md:hover:bg-blue-500"
            >
              <ListChecks size={20} />
              <span className="hidden sm:inline">Manage Step Ranges</span>
            </button>
          </div>
        </div>

        {/* Live Steps Hero Card */}
        <LiveStepsCard
          liveStepData={liveStepData}
          healthConnectStatus={healthConnectStatus}
          healthConnectLoading={healthConnectLoading}
          healthConnectError={healthConnectError}
          onConnectHealth={onConnectHealth}
          onRefreshSteps={onRefreshSteps}
          onOpenBreakdown={onOpenBreakdown}
          onOpenStepTracker={onOpenStepTracker}
          stepGoal={resolvedStepGoal}
        />

        {/* Step Range Section Header */}
        {healthConnectStatus === HealthConnectStatus.CONNECTED && (
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-surface-highlight" />
            <span className="text-muted text-xs font-medium uppercase tracking-wider">
              Quick Estimates
            </span>
            <div className="h-px flex-1 bg-surface-highlight" />
          </div>
        )}

        {/* Step Range Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {resolvedStepRanges.map((steps) => {
            const { breakdown, targetCalories, difference } =
              getRangeDetails(steps);
            const isActive = isSelectedRange(steps);

            return (
              <button
                key={steps}
                type="button"
                onClick={() => onOpenBreakdown(steps)}
                className={`group relative w-full text-left bg-surface-highlight/50 rounded-xl p-4 transition-all border border-border/50 active:scale-[0.99] pressable-card focus-ring ${
                  isActive
                    ? 'ring-2 ring-blue-400 bg-surface-highlight/90'
                    : 'md:hover:bg-border'
                }`}
                aria-expanded={isActive}
                aria-label={`View calorie breakdown for ${steps} steps`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-muted text-sm">Steps</p>
                    <p className="text-foreground font-bold text-lg">{steps}</p>
                  </div>
                  <Info
                    size={18}
                    className={`mt-1 ${isActive ? 'text-blue-300' : 'text-muted md:group-hover:text-blue-300'}`}
                  />
                </div>
                <div className="bg-blue-600 rounded-lg p-3 mb-2 text-center">
                  <p className="text-white text-2xl font-bold">
                    {targetCalories.toLocaleString()}
                  </p>
                  <p className="text-white text-xs opacity-90">calories</p>
                </div>
                <p className="text-muted text-xs">
                  TDEE: {breakdown.total.toLocaleString()}
                  {difference !== 0 && (
                    <span
                      className={`ml-2 font-semibold ${difference > 0 ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {difference > 0 ? '+' : ''}
                      {difference.toLocaleString()} cal
                    </span>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
