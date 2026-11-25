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
import { useCarouselDragVarSink } from '../../../hooks/useCarouselDragVarSink';
import { useUnits } from '../../../hooks/useUnits';
import {
  calculateWeightTrend,
  sortWeightEntries,
} from '../../../utils/measurements/weight';
import { formatOne } from '../../../utils/formatting/format';
import { LiveHeartRatePill } from './LiveHeartRatePill';
import {
  SCREEN_DRAG_DURATION_VAR,
  SCREEN_DRAG_PROGRESS_VAR,
  getRingCopyOffsets,
} from '../../../utils/visuals/carouselLoop';
import { SCREEN_KEYS } from '../../../constants/navigation/screens';

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

const SwipeDots = ({ count, activeScreen, loop }) => {
  // The dots row (and its ring copies) reads the live drag variables; they are
  // written onto this element instead of `:root` so a drag frame only invalidates
  // this tiny subtree — see utils/visuals/carouselDragVars.js.
  const dragVarSinkRef = useCarouselDragVarSink();

  return (
    <div
      ref={dragVarSinkRef}
      className="relative overflow-hidden"
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
      {/* Same ring trick as the tab-bar circle: three copies one track apart, so a
          loop-seam crossing glides the moving dot off one end and the next copy in
          at the other (clipped by this row) instead of snapping back. */}
      {getRingCopyOffsets(loop).map((copy) => (
        <span
          key={copy}
          className="carousel-drag-sync absolute left-0 top-0 rounded-full bg-primary"
          style={{
            width: DOT_SIZE_PX,
            height: DOT_SIZE_PX,
            transform: `translateX(calc((var(${SCREEN_DRAG_PROGRESS_VAR}, ${activeScreen + 1}) - 1 + ${copy * count}) * ${DOT_STEP_PX}px))`,
            // Duration is owned by the hook (0s while dragging or when a wrap
            // normalizes, the settle duration otherwise) so the dot can never be
            // re-targeted on every settle frame.
            transition: `transform var(${SCREEN_DRAG_DURATION_VAR}, 0.35s) cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        />
      ))}
    </div>
  );
};

/**
 * Top header zone: ambient greeting/date context plus a per-screen glanceable
 * stat line, drag-linked swipe dots and a one-time swipe coach mark.
 *
 * This is a thin display component — all aggregations below reuse the
 * canonical helpers (`getNutritionTotalsForDate`, `calculateWeightTrend`,
 * derived daily snapshot fields); no calculation logic is duplicated here.
 */
export const AppHeader = ({
  activeScreen,
  activeScreenKey,
  screenCount,
  loopScreens = true,
  nutritionData,
  trackerSelectedDate,
  calorieTargetCalories,
  phases,
  weightEntries,
  todaySnapshot,
  showSwipeHint,
  onDismissSwipeHint,
  onOpenSettings,
  onOpenLiveHeartRate,
}) => {
  const [now, setNow] = useState(() => new Date());
  const units = useUnits();

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

    // Keyed on the screen, not its slot: the user can re-order the screens.
    switch (activeScreenKey) {
      case SCREEN_KEYS.LOGBOOK: {
        const phaseCount = activePhases + completedPhases;
        return {
          key: 'logbook',
          icon: ClipboardList,
          iconClass: 'text-accent-blue',
          text: `${activePhases} active · ${completedPhases} completed phase${phaseCount === 1 ? '' : 's'}`,
        };
      }
      case SCREEN_KEYS.TRACKER: {
        const intake = units.energy.value(trackerTotals.calories);
        const target = units.energy.value(calorieTargetCalories ?? 0);
        return {
          key: 'tracker',
          icon: Flame,
          iconClass: 'text-accent-amber',
          text: `${intake} / ${target} ${units.energy.unit}`,
        };
      }
      case SCREEN_KEYS.HOME: {
        const isTrainingDay = todaySnapshot?.isTrainingDay === true;
        const tdee = units.energy.value(todaySnapshot?.tdee ?? 0);
        return {
          key: 'home',
          icon: isTrainingDay ? Dumbbell : BedDouble,
          iconClass: isTrainingDay ? 'text-accent-blue' : 'text-accent-indigo',
          text: `${isTrainingDay ? 'Training day' : 'Rest day'} · ≈${tdee} ${units.energy.unit} TDEE`,
        };
      }
      case SCREEN_KEYS.CALORIE_MAP: {
        const steps = Math.round(todaySnapshot?.stepCount ?? 0);
        return {
          key: 'calorie-map',
          icon: Footprints,
          iconClass: 'text-accent-green',
          text: `${steps.toLocaleString()} steps today`,
        };
      }
      case SCREEN_KEYS.INSIGHTS: {
        // Data-honest: fall back to the trend label verbatim
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
            ? `${weightTrend.label} · ${formatOne(units.bodyWeight.toNumber(Math.abs(rate)))} ${units.bodyWeight.linearUnit}/wk`
            : (weightTrend?.label ?? 'No data yet'),
        };
      }
      default:
        return null;
    }
  }, [
    activeScreenKey,
    calorieTargetCalories,
    phases,
    todaySnapshot,
    trackerTotals.calories,
    units,
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

        {/* Row-1 right slot: live-recording pill (only while recording), then
            the swipe coach mark first, settings gear afterwards */}
        <div className="flex items-center gap-2 shrink-0">
          <LiveHeartRatePill onOpen={onOpenLiveHeartRate} />
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
                className="rounded-full border border-border/50 bg-surface/60 p-2 text-muted shadow-sm md:hover:bg-surface-highlight/60 md:hover:text-foreground pressable-inline focus-ring"
              >
                <Settings size={20} className="shrink-0" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* `flex-1 min-w-0` pins the dots to the right so a longer/shorter stat
            string can never shuffle them. */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {stat ? (
            <div
              // Re-keyed on the screen: the text swaps instantly (no
              // `AnimatePresence mode="wait"` exit-then-enter latency) and plays a
              // short fade/rise-in, the app's usual swap convention.
              key={stat.key}
              className="header-stat-in flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/40 bg-surface/50 px-2.5 py-1 shadow-xs"
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
            </div>
          ) : null}
        </div>

        <SwipeDots
          count={screenCount}
          activeScreen={activeScreen}
          loop={loopScreens}
        />
      </div>
    </header>
  );
};
