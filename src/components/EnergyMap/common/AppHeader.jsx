import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BedDouble,
  ChevronsLeftRight,
  ClipboardList,
  Dumbbell,
  Flame,
  Footprints,
  Minus,
  Settings,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { getNutritionTotalsForDate } from '../../../utils/phases/phases';
import {
  calculateWeightTrend,
  sortWeightEntries,
} from '../../../utils/measurements/weight';
import { formatOne } from '../../../utils/formatting/format';

const MINUTE_MS = 60_000;

const getGreeting = (hour) => {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

// Dot geometry is px-only on purpose: rem-based Tailwind sizes scale with the
// app's root font-size (13px mobile / 17px desktop), which previously made the
// flex-gap dots drift out of alignment with the px-based moving dot.
const DOT_SIZE_PX = 6;
const DOT_STEP_PX = 12; // 6px dot + 6px spacing

const SwipeDots = ({ count, isSwiping }) => (
  <div
    className="relative"
    style={{
      width: (count - 1) * DOT_STEP_PX + DOT_SIZE_PX,
      height: DOT_SIZE_PX,
    }}
    aria-hidden="true"
  >
    {Array.from({ length: count }).map((_, index) => (
      <span
        key={index}
        className="absolute rounded-full bg-muted/40"
        style={{
          width: DOT_SIZE_PX,
          height: DOT_SIZE_PX,
          left: index * DOT_STEP_PX,
          top: 0,
        }}
      />
    ))}
    <span
      className="absolute left-0 top-0 rounded-full bg-primary"
      style={{
        width: DOT_SIZE_PX,
        height: DOT_SIZE_PX,
        transform: `translateX(calc(var(--screen-drag-progress, 0) * ${DOT_STEP_PX}px))`,
        transition: isSwiping
          ? 'none'
          : 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    />
  </div>
);

/**
 * Top header zone: ambient greeting/date context plus a per-screen glanceable
 * stat line, drag-linked swipe dots and a one-time swipe coach mark.
 *
 * This is a thin display component — all aggregations below reuse the
 * canonical helpers (`getNutritionTotalsForDate`, `calculateWeightTrend`,
 * derived daily snapshot fields); no calculation logic is duplicated here.
 */
export const AppHeader = ({
  currentScreen,
  isSwiping,
  screenCount,
  nutritionData,
  trackerSelectedDate,
  calorieTargetCalories,
  phases,
  weightEntries,
  todaySnapshot,
  showSwipeHint,
  onDismissSwipeHint,
  onOpenSettings,
}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  const greeting = getGreeting(now.getHours());
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const sortedWeightEntries = useMemo(
    () => sortWeightEntries(weightEntries ?? []),
    [weightEntries]
  );

  const weightTrend = useMemo(
    () => calculateWeightTrend(sortedWeightEntries, 7),
    [sortedWeightEntries]
  );

  const trackerTotals = useMemo(
    () => getNutritionTotalsForDate(nutritionData ?? {}, trackerSelectedDate),
    [nutritionData, trackerSelectedDate]
  );

  const stat = useMemo(() => {
    const activePhases = (phases ?? []).filter(
      (phase) => phase?.status === 'active'
    ).length;
    const completedPhases = (phases ?? []).filter(
      (phase) => phase?.status === 'completed'
    ).length;

    switch (currentScreen) {
      case 0: {
        // Logbook
        const phaseCount = activePhases + completedPhases;
        return {
          key: 'logbook',
          icon: ClipboardList,
          iconClass: 'text-accent-blue',
          text: `${activePhases} active · ${completedPhases} completed phase${phaseCount === 1 ? '' : 's'}`,
        };
      }
      case 1: {
        // Tracker
        const intake = Math.round(trackerTotals.calories);
        const target = Math.round(calorieTargetCalories ?? 0);
        return {
          key: 'tracker',
          icon: Flame,
          iconClass: 'text-accent-amber',
          text: `${intake.toLocaleString()} / ${target.toLocaleString()} kcal`,
        };
      }
      case 2: {
        // Home
        const isTrainingDay = todaySnapshot?.isTrainingDay === true;
        const tdee = Math.round(todaySnapshot?.tdee ?? 0);
        return {
          key: 'home',
          icon: isTrainingDay ? Dumbbell : BedDouble,
          iconClass: isTrainingDay ? 'text-accent-blue' : 'text-accent-indigo',
          text: `${isTrainingDay ? 'Training day' : 'Rest day'} · ≈${tdee.toLocaleString()} kcal TDEE`,
        };
      }
      case 3: {
        // Calorie Map
        const steps = Math.round(todaySnapshot?.stepCount ?? 0);
        return {
          key: 'calorie-map',
          icon: Footprints,
          iconClass: 'text-accent-green',
          text: `${steps.toLocaleString()} steps today`,
        };
      }
      case 4: {
        // Insights — data-honest: fall back to the trend label verbatim
        const rate = weightTrend?.weeklyRate ?? 0;
        const hasRate =
          weightTrend &&
          weightTrend.label !== 'Need more data' &&
          weightTrend.label !== 'No data yet';
        const direction =
          rate < -0.1 ? TrendingDown : rate > 0.1 ? TrendingUp : Minus;
        const directionClass =
          rate < -0.1
            ? 'text-accent-green'
            : rate > 0.1
              ? 'text-accent-orange'
              : 'text-accent-slate';
        return {
          key: 'insights',
          icon: direction,
          iconClass: directionClass,
          text: hasRate
            ? `${weightTrend.label} · ${formatOne(Math.abs(rate))} kg/wk`
            : (weightTrend?.label ?? 'No data yet'),
        };
      }
      default:
        return null;
    }
  }, [
    calorieTargetCalories,
    currentScreen,
    phases,
    todaySnapshot,
    trackerTotals.calories,
    weightTrend,
  ]);

  const StatIcon = stat?.icon;

  return (
    <header className="flex flex-col gap-4 pb-1">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight text-foreground">
            {greeting}
          </h1>
          <p className="text-xs text-muted">{dateLabel}</p>
        </div>

        {/* Row-1 right slot: swipe coach mark first, settings gear afterwards */}
        <AnimatePresence mode="wait" initial={false}>
          {showSwipeHint ? (
            <motion.button
              key="swipe-hint"
              type="button"
              onClick={onDismissSwipeHint}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary pressable-inline focus-ring"
            >
              <ChevronsLeftRight size={14} className="shrink-0" />
              Swipe between screens
            </motion.button>
          ) : (
            <motion.button
              key="settings"
              type="button"
              onClick={onOpenSettings}
              aria-label="Open settings"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="rounded-full p-2 text-muted md:hover:bg-surface-highlight/50 md:hover:text-foreground pressable-inline focus-ring"
            >
              <Settings size={20} className="shrink-0" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-3">
        <AnimatePresence mode="wait" initial={false}>
          {stat ? (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="flex min-w-0 items-center gap-1.5"
            >
              {StatIcon ? (
                <StatIcon
                  size={15}
                  className={`shrink-0 ${stat.iconClass ?? 'text-muted'}`}
                />
              ) : null}
              <span className="truncate text-xs font-medium text-muted">
                {stat.text}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <SwipeDots count={screenCount} isSwiping={isSwiping} />
      </div>
    </header>
  );
};
