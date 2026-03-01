import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, Footprints, Target } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getStepCaloriesDetails } from '../../../../utils/steps';

// ---------------------------------------------------------------------------
// Helper components & functions
// ---------------------------------------------------------------------------

const calculateNDayStepAverage = (sortedEntries, n) => {
  if (!sortedEntries.length) return null;
  const slice = sortedEntries.slice(-n);
  if (!slice.length) return null;
  const sum = slice.reduce((acc, e) => acc + (e.steps || 0), 0);
  return Math.round(sum / slice.length);
};

const groupStepEntriesByMonth = (sortedEntries) => {
  if (!sortedEntries.length) return [];
  const buckets = new Map();
  for (const entry of sortedEntries) {
    const d = new Date(entry.date + 'T00:00:00Z');
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: d.toLocaleDateString('en-US', {
          month: 'short',
          timeZone: 'UTC',
        }),
        year,
        month,
        entries: [],
        avg: null,
      });
    }
    buckets.get(key).entries.push(entry);
  }
  const groups = [...buckets.values()];
  for (const g of groups) {
    const sum = g.entries.reduce((acc, e) => acc + (e.steps || 0), 0);
    g.avg = Math.round(sum / g.entries.length);
  }
  return groups;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const Y_TICK_COUNT = 7;
const MIN_VISIBLE_STEP_RANGE = 5000;
const MIN_RANGE_PADDING = 500;
const BASELINE_Y_OFFSET = 0;
const TOOLTIP_WIDTH = 144;
const TOOLTIP_VERTICAL_OFFSET = 27;
const BAR_WIDTH = 28;
const BAR_RADIUS = 6;
const BAR_WIDTH_30D = 6;
const BAR_RADIUS_30D = 3;
const BAR_WIDTH_12M = 22;
const BAR_RADIUS_12M = 4;
const WEEK_BRACKET_HEIGHT = 32;
const WEEK_BRACKET_TOP_PADDING = 8;

const VIEW_MODES = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '12m', label: '12 Months' },
];

const TIMELINE_TRACK_HEIGHT = 36;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const getBaselineY = (defaultY) => defaultY - BASELINE_Y_OFFSET;

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const formatTimelineLabel = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
  });
};

const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00Z');
  const parts = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return parts.replace(/^[A-Za-z]{3}/, (m) => m.toUpperCase());
};

const formatTooltipDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getWeekday = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const formatStepCount = (steps) => {
  if (steps >= 1000) {
    return `${(steps / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return steps.toLocaleString();
};

/** Produce a YYYY-MM-DD string from a Date in UTC */
const toDateKey = (d) => d.toISOString().slice(0, 10);

const getBarColor = (steps, goal) => {
  if (steps >= goal) return 'rgb(var(--accent-green) / 1)';
  return 'rgb(var(--accent-blue) / 1)';
};

const getBarGlow = (steps, goal) => {
  if (steps >= goal) return 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.5))';
  return 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.5))';
};

// ---------------------------------------------------------------------------
// Page generation helpers
// ---------------------------------------------------------------------------

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

const build30DayPages = (sortedEntries) => {
  if (!sortedEntries.length) return [];
  const earliest = new Date(sortedEntries[0].date + 'T00:00:00Z');
  const latest = new Date(
    sortedEntries[sortedEntries.length - 1].date + 'T00:00:00Z'
  );
  const pages = [];
  let windowEnd = new Date(latest);
  while (windowEnd >= earliest) {
    const windowStart = new Date(windowEnd);
    windowStart.setUTCDate(windowStart.getUTCDate() - 29);
    const startMs = windowStart.getTime();
    const endMs = windowEnd.getTime();
    const entries = sortedEntries.filter((e) => {
      const ms = new Date(e.date + 'T00:00:00Z').getTime();
      return ms >= startMs && ms <= endMs;
    });
    if (entries.length > 0) {
      pages.unshift({
        entries,
        startDate: toDateKey(windowStart),
        endDate: toDateKey(windowEnd),
        pageIndex: 0,
      });
    }
    windowEnd.setUTCDate(windowEnd.getUTCDate() - 30);
  }
  pages.forEach((p, i) => {
    p.pageIndex = i;
  });
  return pages;
};

const build12MonthPages = (monthGroups) => {
  if (!monthGroups.length) return [];
  const chunks = chunk(monthGroups, 12);
  return chunks.map((months, idx) => ({
    months,
    startDate: months[0].key + '-01',
    endDate: months[months.length - 1].key + '-28',
    pageIndex: idx,
  }));
};

// ---------------------------------------------------------------------------
// Chart data helpers
// ---------------------------------------------------------------------------

const computeChartData = (values, goalValue = 0) => {
  if (!values.length) return null;
  let maxVal = Math.max(...values, goalValue);
  let range = maxVal;
  const minVal = 0;
  if (range === 0) {
    range = Math.max(MIN_VISIBLE_STEP_RANGE, MIN_RANGE_PADDING * 2);
    maxVal = range;
  } else {
    const padding = Math.max(range * 0.1, MIN_RANGE_PADDING);
    maxVal += padding;
    range = maxVal;
    if (range < MIN_VISIBLE_STEP_RANGE) {
      maxVal = MIN_VISIBLE_STEP_RANGE;
      range = MIN_VISIBLE_STEP_RANGE;
    }
  }
  return { minSteps: minVal, maxSteps: maxVal, range };
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export const StepTrackerModal = ({
  isOpen,
  isClosing,
  entries,
  todaySteps,
  stepGoal,
  onClose,
  onSetGoal,
}) => {
  // Store fallback
  const store = useEnergyMapStore(
    (state) => ({
      stepEntries: state.stepEntries ?? [],
      stepGoal: state.stepGoal ?? 10000,
      userData: state.userData ?? {},
    }),
    shallow
  );
  const resolvedEntries = entries ?? store.stepEntries;
  const resolvedStepGoal = stepGoal ?? store.stepGoal;
  const { weight, height, gender } = store.userData;

  // --- State ---
  const [viewMode, setViewMode] = useState('7d');
  const [activePageIndex, setActivePageIndex] = useState(-1);
  const [selectedDate, setSelectedDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [graphViewportWidth, setGraphViewportWidth] = useState(0);
  const [graphViewportHeight, setGraphViewportHeight] = useState(0);

  const carouselRef = useRef(null);
  const tooltipRef = useRef(null);
  const scrollCloseTimeoutRef = useRef(null);
  const prevEntriesLengthRef = useRef(resolvedEntries?.length ?? 0);

  // --- Derived data ---
  const sortedEntries = useMemo(
    () =>
      [...(resolvedEntries ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [resolvedEntries]
  );

  // Rolling averages
  const avg7 = useMemo(
    () => calculateNDayStepAverage(sortedEntries, 7),
    [sortedEntries]
  );
  const avg14 = useMemo(
    () => calculateNDayStepAverage(sortedEntries, 14),
    [sortedEntries]
  );

  // Monthly groups for 12m mode
  const monthGroups = useMemo(
    () => groupStepEntriesByMonth(sortedEntries),
    [sortedEntries]
  );

  // Fill month groups to always span at least 12 months
  const filledMonthGroups = useMemo(() => {
    if (!monthGroups.length) return [];
    const last = monthGroups[monthGroups.length - 1];
    const monthMap = new Map(monthGroups.map((m) => [m.key, m]));
    const filled = [];
    const first = monthGroups[0];
    const spanStart = new Date(Date.UTC(last.year, last.month - 11, 1));
    const dataStart = new Date(Date.UTC(first.year, first.month, 1));
    const d = spanStart < dataStart ? spanStart : dataStart;
    const endD = new Date(Date.UTC(last.year, last.month, 1));
    while (d <= endD) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (monthMap.has(key)) {
        filled.push(monthMap.get(key));
      } else {
        filled.push({
          key,
          label: d.toLocaleDateString('en-US', {
            month: 'short',
            timeZone: 'UTC',
          }),
          year: d.getUTCFullYear(),
          month: d.getUTCMonth(),
          entries: [],
          avg: null,
          isEmpty: true,
        });
      }
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return filled;
  }, [monthGroups]);

  // --- Pages ---
  const pages = useMemo(() => {
    if (viewMode === '7d') return [];
    if (viewMode === '30d') return build30DayPages(sortedEntries);
    if (viewMode === '12m') return build12MonthPages(filledMonthGroups);
    return [];
  }, [viewMode, sortedEntries, filledMonthGroups]);

  const pageCount = viewMode === '7d' ? 0 : pages.length;
  const resolvedPageIndex = useMemo(() => {
    if (viewMode === '7d') return 0;
    if (pageCount === 0) return 0;
    if (activePageIndex < 0 || activePageIndex >= pageCount)
      return pageCount - 1;
    return activePageIndex;
  }, [viewMode, activePageIndex, pageCount]);

  const activePage =
    viewMode === '7d' ? null : (pages[resolvedPageIndex] ?? null);

  // --- Viewport dimensions ---
  useIsomorphicLayoutEffect(() => {
    const node = carouselRef.current;
    if (!node) return undefined;

    const updateDimensions = () => {
      setGraphViewportWidth(node.clientWidth);
      setGraphViewportHeight(node.clientHeight);
    };
    updateDimensions();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }

    const observer = new ResizeObserver((resizeEntries) => {
      const entry = resizeEntries[0];
      if (entry) {
        setGraphViewportWidth(entry.contentRect.width);
        setGraphViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isOpen]);

  const chartHeight = useMemo(
    () =>
      graphViewportHeight > 0
        ? Math.max(
            graphViewportHeight -
              TIMELINE_TRACK_HEIGHT -
              24 -
              (viewMode === '7d'
                ? WEEK_BRACKET_HEIGHT + WEEK_BRACKET_TOP_PADDING
                : 0),
            100
          )
        : 200,
    [graphViewportHeight, viewMode]
  );

  // --- Scroll to last page on open ---
  useEffect(() => {
    if (!isOpen) return;
    setActivePageIndex(-1);
    const frame = requestAnimationFrame(() => {
      const node = carouselRef.current;
      if (node) {
        node.scrollTo({
          left: node.scrollWidth - node.clientWidth,
          behavior: 'instant',
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Scroll to last page when new entry is added
  useEffect(() => {
    const currentLen = resolvedEntries?.length ?? 0;
    const prevLen = prevEntriesLengthRef.current;
    if (isOpen && currentLen > prevLen && currentLen > 0) {
      setActivePageIndex(-1);
      const timeout = setTimeout(() => {
        const node = carouselRef.current;
        if (node) {
          node.scrollTo({
            left: node.scrollWidth - node.clientWidth,
            behavior: 'smooth',
          });
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
    prevEntriesLengthRef.current = currentLen;
  }, [isOpen, resolvedEntries?.length]);

  // Scroll to last page on view mode change
  useEffect(() => {
    if (!isOpen) return;
    setActivePageIndex(-1);
    const timeout = setTimeout(() => {
      const node = carouselRef.current;
      if (node) {
        node.scrollTo({
          left: node.scrollWidth - node.clientWidth,
          behavior: 'instant',
        });
      }
    }, 50);
    return () => clearTimeout(timeout);
  }, [viewMode, isOpen]);

  // --- Snap detection via scroll ---
  const handleCarouselScroll = useCallback(() => {
    const node = carouselRef.current;
    if (!node || !node.clientWidth) return;
    const idx = Math.round(node.scrollLeft / node.clientWidth);
    setActivePageIndex(idx);
    if (selectedDate) {
      setTooltipClosing(true);
      setTimeout(() => {
        setSelectedDate(null);
        setTooltipClosing(false);
      }, 150);
    }
  }, [selectedDate]);

  // --- Chart-wide computed data ---
  const chartWidth = graphViewportWidth || 300;

  // 7d continuous: calendar-based timeline
  const timeline7d = useMemo(() => {
    if (viewMode !== '7d' || !sortedEntries.length)
      return { days: [], snapPageCount: 1 };
    const firstDate = new Date(sortedEntries[0].date + 'T00:00:00Z');
    const lastDate = new Date(
      sortedEntries[sortedEntries.length - 1].date + 'T00:00:00Z'
    );
    const calendarDays = Math.round((lastDate - firstDate) / 86400000) + 1;
    const snapPages = Math.max(1, Math.ceil(calendarDays / 7));
    const totalSlots = snapPages * 7;
    const emptyPadding = totalSlots - calendarDays;
    const entryMap = new Map(sortedEntries.map((e) => [e.date, e]));
    const days = [];
    for (let i = 0; i < emptyPadding; i++) {
      const d = new Date(firstDate);
      d.setUTCDate(d.getUTCDate() - (emptyPadding - i));
      days.push({ date: toDateKey(d), entry: null, isPadding: true });
    }
    for (let i = 0; i < calendarDays; i++) {
      const d = new Date(firstDate);
      d.setUTCDate(d.getUTCDate() + i);
      const key = toDateKey(d);
      days.push({
        date: key,
        entry: entryMap.get(key) || null,
        isPadding: false,
      });
    }
    return { days, snapPageCount: snapPages };
  }, [viewMode, sortedEntries]);

  // Global chart data for 7d
  const globalChartData = useMemo(() => {
    if (viewMode !== '7d' || !sortedEntries.length) return null;
    return computeChartData(
      sortedEntries.map((e) => e.steps || 0),
      resolvedStepGoal
    );
  }, [viewMode, sortedEntries, resolvedStepGoal]);

  // Per-page chart data for 30d/12m
  const pageChartData = useMemo(() => {
    if (viewMode === '7d') return globalChartData;
    if (!activePage) return null;
    let values = [];
    if (viewMode === '30d') {
      values = activePage.entries.map((e) => e.steps || 0);
    } else if (viewMode === '12m') {
      values = activePage.months
        .filter((m) => !m.isEmpty && m.avg != null)
        .map((m) => m.avg);
    }
    return computeChartData(values, resolvedStepGoal);
  }, [viewMode, activePage, globalChartData, resolvedStepGoal]);

  const effectiveChartData =
    viewMode === '7d' ? globalChartData : pageChartData;

  // 7d continuous: all bars
  const allBars7d = useMemo(() => {
    if (viewMode !== '7d' || !sortedEntries.length || !globalChartData)
      return [];
    const { days } = timeline7d;
    const STEP = chartWidth / 7;
    const PAD = STEP / 2;
    return days.map((slot, i) => {
      const x = PAD + i * STEP;
      const steps = slot.entry?.steps || 0;
      const norm =
        globalChartData.range > 0 ? steps / globalChartData.range : 0;
      const bounded = Math.min(Math.max(norm, 0), 1);
      const barHeight = bounded * chartHeight;
      const y = chartHeight - barHeight;
      return {
        date: slot.date,
        steps,
        source: slot.entry?.source,
        x,
        y,
        height: barHeight,
        hasEntry: !!slot.entry,
        isPadding: slot.isPadding,
      };
    });
  }, [
    viewMode,
    sortedEntries,
    globalChartData,
    chartWidth,
    chartHeight,
    timeline7d,
  ]);

  // 30d/12m: bars for the active page
  const chartBars = useMemo(() => {
    if (viewMode === '7d') return [];
    if (!pageChartData || !activePage) return [];
    const pad = viewMode === '30d' ? 12 : 24;
    const usable = Math.max(chartWidth - pad * 2, 0);

    if (viewMode === '30d') {
      const startMs = new Date(activePage.startDate + 'T00:00:00Z').getTime();
      const endMs = new Date(activePage.endDate + 'T00:00:00Z').getTime();
      const rangeMs = endMs - startMs || 1;
      return activePage.entries.map((e) => {
        const ms = new Date(e.date + 'T00:00:00Z').getTime();
        const fraction = (ms - startMs) / rangeMs;
        const x = pad + fraction * usable;
        const steps = e.steps || 0;
        const norm = pageChartData.range > 0 ? steps / pageChartData.range : 0;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const barHeight = bounded * chartHeight;
        const y = chartHeight - barHeight;
        return {
          date: e.date,
          steps,
          source: e.source,
          x,
          y,
          height: barHeight,
        };
      });
    }

    if (viewMode === '12m') {
      const count = activePage.months.length;
      const step = count > 1 ? usable / (count - 1) : 0;
      return activePage.months.map((m, i) => {
        const x = pad + step * i;
        if (m.isEmpty || m.avg == null) {
          return {
            date: m.key,
            steps: 0,
            x,
            y: chartHeight,
            height: 0,
            label: m.label,
            isEmpty: true,
          };
        }
        const norm = pageChartData.range > 0 ? m.avg / pageChartData.range : 0;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const barHeight = bounded * chartHeight;
        const y = chartHeight - barHeight;
        return {
          date: m.key,
          steps: m.avg,
          x,
          y,
          height: barHeight,
          label: m.label,
          entryCount: m.entries.length,
        };
      });
    }

    return [];
  }, [pageChartData, activePage, viewMode, chartWidth, chartHeight]);

  // Y ticks
  const yTicks = useMemo(() => {
    if (!effectiveChartData) return [];
    const steps = Math.max(Y_TICK_COUNT - 1, 1);
    return Array.from(
      { length: Y_TICK_COUNT },
      (_, i) =>
        effectiveChartData.maxSteps - (effectiveChartData.range / steps) * i
    );
  }, [effectiveChartData]);

  const yTickPositions = useMemo(() => {
    if (!effectiveChartData || chartHeight <= 0) return [];
    return yTicks.map((val, index) => {
      const norm =
        effectiveChartData.range > 0 ? val / effectiveChartData.range : 0;
      const bounded = Math.min(Math.max(norm, 0), 1);
      const y = (1 - bounded) * chartHeight;
      const isTop = index === 0;
      const isBottom = index === yTicks.length - 1;
      const lineY = isTop ? 0 : isBottom ? chartHeight : y;
      return { value: val, index, lineY };
    });
  }, [effectiveChartData, chartHeight, yTicks]);

  // Goal line position on y-axis
  const goalLineY = useMemo(() => {
    if (!effectiveChartData || !resolvedStepGoal) return null;
    const norm =
      effectiveChartData.range > 0
        ? resolvedStepGoal / effectiveChartData.range
        : 0;
    const bounded = Math.min(Math.max(norm, 0), 1);
    return (1 - bounded) * chartHeight;
  }, [effectiveChartData, chartHeight, resolvedStepGoal]);

  // Current steps tick on y-axis
  const latestSteps = sortedEntries.length
    ? sortedEntries[sortedEntries.length - 1].steps
    : 0;
  const currentStepsValue = todaySteps ?? latestSteps;

  const currentStepsTick = useMemo(() => {
    if (
      !effectiveChartData ||
      !Number.isFinite(currentStepsValue) ||
      currentStepsValue <= 0
    )
      return null;
    const norm =
      effectiveChartData.range > 0
        ? currentStepsValue / effectiveChartData.range
        : 0;
    const bounded = Math.min(Math.max(norm, 0), 1);
    const y = (1 - bounded) * chartHeight;
    return { yPx: y, steps: currentStepsValue };
  }, [effectiveChartData, chartHeight, currentStepsValue]);

  // Week brackets for 7d mode
  const weekBrackets = useMemo(() => {
    if (viewMode !== '7d' || !allBars7d.length) return [];

    const brackets = [];
    let currentWeek = [];
    let currentWeekStart = null;

    const barsWithEntries = allBars7d.filter((b) => b.hasEntry && b.steps > 0);

    barsWithEntries.forEach((bar, index) => {
      const date = new Date(bar.date + 'T00:00:00Z');
      const dayOfWeek = date.getUTCDay();

      if (currentWeekStart === null) {
        currentWeekStart = date;
        currentWeek = [bar];
      } else {
        const prevDate = new Date(
          barsWithEntries[index - 1].date + 'T00:00:00Z'
        );
        const daysSince = Math.floor((date - prevDate) / (1000 * 60 * 60 * 24));
        const crossedSunday =
          dayOfWeek < prevDate.getUTCDay() || daysSince >= 7;

        if (crossedSunday) {
          if (currentWeek.length > 2) {
            const avgSteps = Math.round(
              currentWeek.reduce((sum, b) => sum + b.steps, 0) /
                currentWeek.length
            );
            brackets.push({
              startX: currentWeek[0].x,
              endX: currentWeek[currentWeek.length - 1].x,
              avgSteps,
              entryCount: currentWeek.length,
            });
          }
          currentWeekStart = date;
          currentWeek = [bar];
        } else {
          currentWeek.push(bar);
        }
      }
    });

    if (currentWeek.length > 2) {
      const avgSteps = Math.round(
        currentWeek.reduce((sum, b) => sum + b.steps, 0) / currentWeek.length
      );
      brackets.push({
        startX: currentWeek[0].x,
        endX: currentWeek[currentWeek.length - 1].x,
        avgSteps,
        entryCount: currentWeek.length,
        isCurrentWeek: true,
      });
    }

    return brackets;
  }, [viewMode, allBars7d]);

  // Entries map for tooltip
  const entriesMap = useMemo(() => {
    const map = {};
    sortedEntries.forEach((entry) => {
      map[entry.date] = entry;
    });
    return map;
  }, [sortedEntries]);

  // Months map for 12m tooltip
  const monthsMap = useMemo(() => {
    const map = {};
    filledMonthGroups.forEach((m) => {
      map[m.key] = m;
    });
    return map;
  }, [filledMonthGroups]);

  // --- Latest data for header ---
  const latestDate = sortedEntries.length
    ? sortedEntries[sortedEntries.length - 1].date
    : null;

  const currentStepsDisplay =
    currentStepsValue > 0 ? currentStepsValue.toLocaleString() : '\u2014';

  const todayStepDetails = useMemo(() => {
    if (!currentStepsValue || !weight || !height) {
      return { distanceKm: 0, calories: 0 };
    }
    return getStepCaloriesDetails(currentStepsValue, {
      weight,
      height,
      gender: gender || 'male',
    });
  }, [currentStepsValue, weight, height, gender]);

  // Per-page dynamic stat for 30d and 12m
  const pageAverage = useMemo(() => {
    if (!activePage) return null;
    if (viewMode === '30d') {
      const vals = activePage.entries.map((e) => e.steps || 0);
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    if (viewMode === '12m') {
      const vals = activePage.months
        .filter((m) => m.avg != null)
        .map((m) => m.avg);
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    return null;
  }, [activePage, viewMode]);

  const pageTimeframeRange = useMemo(() => {
    if (!activePage) return '';
    return `${formatShortDate(activePage.startDate)} - ${formatShortDate(activePage.endDate)}`;
  }, [activePage]);

  // Aggregated distance & calories for 30d/12m pages
  const pageStepDetails = useMemo(() => {
    if (!activePage || !weight || !height)
      return { distanceKm: 0, calories: 0, totalSteps: 0 };
    let allEntries = [];
    if (viewMode === '30d') {
      allEntries = activePage.entries;
    } else if (viewMode === '12m') {
      allEntries = activePage.months.flatMap((m) => m.entries || []);
    }
    let totalSteps = 0;
    let totalDistance = 0;
    let totalCalories = 0;
    for (const e of allEntries) {
      const steps = e.steps || 0;
      totalSteps += steps;
      const details = getStepCaloriesDetails(steps, {
        weight,
        height,
        gender: gender || 'male',
      });
      totalDistance += details.distanceKm;
      totalCalories += details.calories;
    }
    return { distanceKm: totalDistance, calories: totalCalories, totalSteps };
  }, [activePage, viewMode, weight, height, gender]);

  // --- Tooltip ---
  const selectedBar = useMemo(() => {
    if (!selectedDate) return null;
    if (viewMode === '7d') {
      return allBars7d.find((b) => b.date === selectedDate) ?? null;
    }
    return chartBars.find((b) => b.date === selectedDate) ?? null;
  }, [selectedDate, viewMode, allBars7d, chartBars]);

  const closeTooltip = useCallback(() => {
    setTooltipClosing(true);
    setTimeout(() => {
      setSelectedDate(null);
      setTooltipClosing(false);
    }, 150);
  }, []);

  useEffect(() => {
    const timeoutId = scrollCloseTimeoutRef.current;
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleDateClick = useCallback(
    (date, event) => {
      if (!date) return;
      event?.stopPropagation();
      if (selectedDate === date) {
        closeTooltip();
      } else {
        if (selectedDate) {
          setTooltipClosing(true);
          setTooltipEntered(false);
        }
        setSelectedDate(date);
        setTooltipClosing(false);
      }
    },
    [selectedDate, closeTooltip]
  );

  const handleLabelClick = useCallback(
    (date, event) => {
      if (!date) return;
      event?.stopPropagation();
      if (selectedDate === date) {
        closeTooltip();
      } else {
        if (selectedDate) {
          setTooltipClosing(true);
          setTooltipEntered(false);
        }
        setSelectedDate(date);
        setTooltipClosing(false);
      }
    },
    [selectedDate, closeTooltip]
  );

  // Close tooltip on outside click
  useEffect(() => {
    if (!selectedDate) return undefined;
    const handlePointerDown = (event) => {
      if (tooltipRef.current?.contains(event.target)) return;
      const target = event.target;
      if (target.tagName === 'rect' || target.tagName === 'g') return;
      if (target.closest('[data-date-label]')) return;
      closeTooltip();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [closeTooltip, selectedDate]);

  // Tooltip enter animation
  useEffect(() => {
    if (selectedDate && !tooltipClosing) {
      const frame = requestAnimationFrame(() => setTooltipEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    if (!selectedDate) {
      Promise.resolve().then(() => setTooltipEntered(false));
    }
    return undefined;
  }, [selectedDate, tooltipClosing]);

  const updateTooltipPosition = useCallback(() => {
    if (!selectedBar) return;
    const node = carouselRef.current;
    if (!node) return;

    if (viewMode === '7d') {
      const rect = node.getBoundingClientRect();
      const rawX = rect.left + selectedBar.x - node.scrollLeft;
      const rawY = rect.top + 16 + selectedBar.y;
      setTooltipPosition({ x: rawX, y: rawY });
    } else {
      const svgNodes = node.querySelectorAll('svg');
      const svg = svgNodes[resolvedPageIndex];
      if (!svg) return;
      const svgRect = svg.getBoundingClientRect();
      const rawX = svgRect.left + selectedBar.x;
      const rawY = svgRect.top + selectedBar.y;
      setTooltipPosition({ x: rawX, y: rawY });
    }
  }, [selectedBar, resolvedPageIndex, viewMode]);

  useIsomorphicLayoutEffect(() => {
    if (!selectedBar) return undefined;
    updateTooltipPosition();
    const handleResize = () => updateTooltipPosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedBar, updateTooltipPosition]);

  // --- Render goal line ---
  const renderGoalLine = (width, yGoal) => {
    if (yGoal == null) return null;
    return (
      <g>
        <line
          x1="0"
          y1={yGoal}
          x2={width}
          y2={yGoal}
          stroke="rgb(var(--accent-green) / 0.5)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
      </g>
    );
  };

  // --- Render bar helper ---
  const renderBar = (bar, barW, barR, onClickDate, isSelected) => {
    const barColor = getBarColor(bar.steps, resolvedStepGoal);
    return (
      <g
        key={bar.date}
        onClick={(e) => onClickDate(bar.date, e)}
        className="cursor-pointer"
      >
        <rect
          x={bar.x - barW}
          y={0}
          width={barW * 2}
          height={chartHeight}
          fill="transparent"
        />
        {bar.steps > 0 && (
          <rect
            x={bar.x - barW / 2}
            y={bar.y}
            width={barW}
            height={Math.max(bar.height, 2)}
            rx={barR}
            ry={barR}
            fill={barColor}
            className={`transition-opacity ${isSelected ? 'opacity-100' : 'md:hover:opacity-90'}`}
            style={{ filter: getBarGlow(bar.steps, resolvedStepGoal) }}
          />
        )}
        {isSelected && bar.steps > 0 && (
          <rect
            x={bar.x - barW / 2 - 2}
            y={bar.y - 2}
            width={barW + 4}
            height={Math.max(bar.height, 2) + 4}
            rx={barR + 1}
            ry={barR + 1}
            fill="none"
            stroke="rgb(var(--accent-blue) / 1)"
            strokeWidth="2"
          />
        )}
      </g>
    );
  };

  // --- Render page graph (30d / 12m only) ---
  const renderPageGraph = (page, idx) => {
    let values = [];
    if (viewMode === '30d') values = page.entries.map((e) => e.steps || 0);
    else if (viewMode === '12m')
      values = page.months
        .filter((m) => !m.isEmpty && m.avg != null)
        .map((m) => m.avg);

    const pcd = computeChartData(values, resolvedStepGoal);
    if (!pcd) {
      return (
        <div
          key={idx}
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: `${chartWidth}px`, scrollSnapAlign: 'start' }}
        >
          <p className="text-muted text-lg">No data for this period.</p>
        </div>
      );
    }

    const pad = viewMode === '30d' ? 12 : 24;
    const usable = Math.max(chartWidth - pad * 2, 0);
    const curBarW =
      viewMode === '12m'
        ? BAR_WIDTH_12M
        : viewMode === '30d'
          ? BAR_WIDTH_30D
          : BAR_WIDTH;
    const curBarR =
      viewMode === '12m'
        ? BAR_RADIUS_12M
        : viewMode === '30d'
          ? BAR_RADIUS_30D
          : BAR_RADIUS;

    let bars = [];
    if (viewMode === '30d') {
      const startMs = new Date(page.startDate + 'T00:00:00Z').getTime();
      const endMs = new Date(page.endDate + 'T00:00:00Z').getTime();
      const rangeMs = endMs - startMs || 1;
      bars = page.entries.map((e) => {
        const ms = new Date(e.date + 'T00:00:00Z').getTime();
        const fraction = (ms - startMs) / rangeMs;
        const x = pad + fraction * usable;
        const steps = e.steps || 0;
        const norm = pcd.range > 0 ? steps / pcd.range : 0;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const barHeight = bounded * chartHeight;
        const y = chartHeight - barHeight;
        return { date: e.date, steps, x, y, height: barHeight };
      });
    } else if (viewMode === '12m') {
      const count = page.months.length;
      const step = count > 1 ? usable / (count - 1) : 0;
      bars = page.months.map((m, i) => {
        const x = pad + step * i;
        if (m.isEmpty || m.avg == null) {
          return {
            date: m.key,
            steps: 0,
            x,
            y: chartHeight,
            height: 0,
            label: m.label,
            isEmpty: true,
          };
        }
        const norm = pcd.range > 0 ? m.avg / pcd.range : 0;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const barHeight = bounded * chartHeight;
        const y = chartHeight - barHeight;
        return {
          date: m.key,
          steps: m.avg,
          x,
          y,
          height: barHeight,
          label: m.label,
          entryCount: m.entries.length,
        };
      });
    }

    // Goal line y for this page
    const pageGoalY =
      pcd.range > 0
        ? (1 - Math.min(Math.max(resolvedStepGoal / pcd.range, 0), 1)) *
          chartHeight
        : null;

    // Y ticks for this page
    const ySteps = Math.max(Y_TICK_COUNT - 1, 1);
    const pageTicks = Array.from(
      { length: Y_TICK_COUNT },
      (_, i) => pcd.maxSteps - (pcd.range / ySteps) * i
    );
    const pageTickPositions = pageTicks.map((v, i) => {
      const norm = pcd.range > 0 ? v / pcd.range : 0;
      const bounded = Math.min(Math.max(norm, 0), 1);
      const y = (1 - bounded) * chartHeight;
      const isTop = i === 0;
      const isBottom = i === pageTicks.length - 1;
      const lineY = isTop ? 0 : isBottom ? chartHeight : y;
      return { value: v, index: i, lineY };
    });

    // Timeline labels
    let timelineLabels = [];
    if (viewMode === '30d') {
      const startDate = new Date(page.startDate + 'T00:00:00Z');
      const startMs = startDate.getTime();
      const endMs = new Date(page.endDate + 'T00:00:00Z').getTime();
      const rangeMs = endMs - startMs || 1;
      for (let i = 0; i <= 30; i += 5) {
        const d = new Date(startDate);
        d.setUTCDate(d.getUTCDate() + Math.min(i, 29));
        const fraction = (d.getTime() - startMs) / rangeMs;
        timelineLabels.push({
          x: pad + Math.min(fraction, 1) * usable,
          label: formatTimelineLabel(toDateKey(d)),
          date: toDateKey(d),
        });
      }
    } else if (viewMode === '12m') {
      const count = page.months.length;
      const step = count > 1 ? usable / (count - 1) : 0;
      timelineLabels = page.months.map((m, i) => ({
        x: pad + step * i,
        label: m.label,
        date: m.key,
        isEmpty: !!m.isEmpty,
      }));
    }

    return (
      <div
        key={idx}
        className="flex-shrink-0 flex flex-col"
        style={{ width: `${chartWidth}px`, scrollSnapAlign: 'start' }}
      >
        <div className="flex-1 py-[8px]">
          <svg
            width={chartWidth}
            height={chartHeight}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            <g>
              {pageTickPositions.map(({ index: gi, lineY }) => {
                const isBaseline = gi === pageTickPositions.length - 1;
                const yVal = isBaseline ? getBaselineY(lineY) : lineY;
                return (
                  <line
                    key={`grid-${gi}`}
                    x1="0"
                    y1={yVal}
                    x2={chartWidth}
                    y2={yVal}
                    stroke={
                      isBaseline
                        ? 'rgb(var(--foreground) / 0.6)'
                        : 'currentColor'
                    }
                    strokeWidth={isBaseline ? 2 : 1}
                    strokeDasharray={isBaseline ? 'none' : '4 6'}
                    className={
                      isBaseline ? 'opacity-80' : 'text-muted opacity-60'
                    }
                  />
                );
              })}
            </g>
            {renderGoalLine(chartWidth, pageGoalY)}
            {bars.map((bar) =>
              renderBar(
                bar,
                curBarW,
                curBarR,
                (date, e) =>
                  idx === resolvedPageIndex && handleDateClick(date, e),
                selectedDate === bar.date
              )
            )}
          </svg>
        </div>
        <div className="flex-shrink-0 pb-2">
          <div
            className="relative"
            style={{ height: `${TIMELINE_TRACK_HEIGHT}px` }}
          >
            {timelineLabels.map((l) => (
              <div
                key={l.date}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                style={{ left: `${l.x}px` }}
              >
                <span
                  className={`text-[13px] font-semibold ${
                    l.isEmpty ? 'text-muted/30' : 'text-muted'
                  }`}
                >
                  {l.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // --- Render 7d continuous chart ---
  const render7dContinuous = () => {
    if (!globalChartData || !allBars7d.length) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-lg">No step data yet.</p>
        </div>
      );
    }

    const snapPageCount = timeline7d.snapPageCount;
    const totalWidth = snapPageCount * chartWidth;
    const bracketAreaHeight =
      weekBrackets.length > 0
        ? WEEK_BRACKET_HEIGHT + WEEK_BRACKET_TOP_PADDING
        : 0;

    return (
      <div
        style={{
          width: `${totalWidth}px`,
          height: '100%',
          position: 'relative',
        }}
      >
        {/* Week Brackets */}
        {weekBrackets.length > 0 && (
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              height: WEEK_BRACKET_HEIGHT,
              top: WEEK_BRACKET_TOP_PADDING,
              width: `${totalWidth}px`,
            }}
          >
            <svg
              width={totalWidth}
              height={WEEK_BRACKET_HEIGHT}
              viewBox={`0 0 ${totalWidth} ${WEEK_BRACKET_HEIGHT}`}
              preserveAspectRatio="none"
            >
              {weekBrackets.map((bracket, idx) => {
                const bracketWidth = bracket.endX - bracket.startX;
                const midX = bracket.startX + bracketWidth / 2;
                const legHeight = 8;
                const textY = 12;
                const lineY = WEEK_BRACKET_HEIGHT - 6;
                const meetsGoal =
                  resolvedStepGoal > 0 && bracket.avgSteps >= resolvedStepGoal;
                const bracketStroke = meetsGoal
                  ? 'rgb(var(--accent-green) / 1)'
                  : 'rgb(var(--border) / 1)';

                return (
                  <g key={idx}>
                    {/* Left leg */}
                    <line
                      x1={bracket.startX}
                      y1={lineY}
                      x2={bracket.startX}
                      y2={lineY - legHeight}
                      stroke={bracketStroke}
                      strokeWidth="1.5"
                    />
                    {/* Right leg */}
                    <line
                      x1={bracket.endX}
                      y1={lineY}
                      x2={bracket.endX}
                      y2={lineY - legHeight}
                      stroke={bracketStroke}
                      strokeWidth="1.5"
                    />
                    {/* Horizontal line - left half */}
                    <line
                      x1={bracket.startX}
                      y1={lineY - legHeight}
                      x2={midX - 28}
                      y2={lineY - legHeight}
                      stroke={bracketStroke}
                      strokeWidth="1.5"
                    />
                    {/* Horizontal line - right half */}
                    <line
                      x1={midX + 28}
                      y1={lineY - legHeight}
                      x2={bracket.endX}
                      y2={lineY - legHeight}
                      stroke={bracketStroke}
                      strokeWidth="1.5"
                    />
                    {/* Average text */}
                    <text
                      x={midX}
                      y={textY}
                      textAnchor="middle"
                      className={`text-[10px] font-semibold ${
                        meetsGoal
                          ? 'fill-[rgb(var(--accent-green)/1)]'
                          : 'fill-[rgb(var(--muted)/1)]'
                      }`}
                    >
                      {formatStepCount(bracket.avgSteps)}
                    </text>
                    <text
                      x={midX}
                      y={textY + 11}
                      textAnchor="middle"
                      className={`text-[8px] ${
                        meetsGoal
                          ? 'fill-[rgb(var(--accent-green)/0.7)]'
                          : 'fill-[rgb(var(--muted)/0.7)]'
                      }`}
                    >
                      avg
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        <div
          className="absolute left-0"
          style={{
            top: `${bracketAreaHeight + 8}px`,
            width: `${totalWidth}px`,
            height: `${chartHeight}px`,
          }}
        >
          <svg
            width={totalWidth}
            height={chartHeight}
            viewBox={`0 0 ${totalWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            {Array.from({ length: snapPageCount }, (_, pi) =>
              yTickPositions.map(({ index: gi, lineY }) => {
                const isBaseline = gi === yTickPositions.length - 1;
                const yVal = isBaseline ? getBaselineY(lineY) : lineY;
                return (
                  <line
                    key={`grid-${pi}-${gi}`}
                    x1={pi * chartWidth}
                    y1={yVal}
                    x2={(pi + 1) * chartWidth}
                    y2={yVal}
                    stroke={
                      isBaseline
                        ? 'rgb(var(--foreground) / 0.6)'
                        : 'currentColor'
                    }
                    strokeWidth={isBaseline ? 2 : 1}
                    strokeDasharray={isBaseline ? 'none' : '4 6'}
                    className={
                      isBaseline ? 'opacity-80' : 'text-muted opacity-60'
                    }
                  />
                );
              })
            )}
            {renderGoalLine(totalWidth, goalLineY)}
            {allBars7d.map((bar) =>
              renderBar(
                bar,
                BAR_WIDTH,
                BAR_RADIUS,
                handleDateClick,
                selectedDate === bar.date
              )
            )}
          </svg>
        </div>
        <div className="flex h-full">
          {Array.from({ length: snapPageCount }, (_, pi) => {
            const STEP = chartWidth / 7;
            const PAD = STEP / 2;
            const pageSlots = timeline7d.days.slice(pi * 7, pi * 7 + 7);

            return (
              <div
                key={pi}
                className="flex-shrink-0 flex flex-col justify-end"
                style={{
                  width: `${chartWidth}px`,
                  scrollSnapAlign: 'start',
                }}
              >
                <div className="pb-2">
                  <div
                    className="relative"
                    style={{ height: `${TIMELINE_TRACK_HEIGHT}px` }}
                  >
                    {pageSlots.map((s, si) => {
                      const localX = PAD + si * STEP;
                      const hasEntry = !!s.entry;
                      const isEmpty = !hasEntry;
                      return (
                        <div
                          key={s.date}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer"
                          data-date-label
                          style={{ left: `${localX}px` }}
                          onClick={(e) => handleLabelClick(s.date, e)}
                        >
                          <span
                            className={`text-[13px] font-semibold ${
                              isEmpty
                                ? getWeekday(s.date) === 'Sun'
                                  ? 'text-accent-red/40'
                                  : 'text-muted/30'
                                : s.date === latestDate
                                  ? 'text-accent-blue'
                                  : getWeekday(s.date) === 'Sun'
                                    ? 'text-accent-red'
                                    : 'text-muted'
                            }`}
                          >
                            {formatTimelineLabel(s.date)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch z-[1000]"
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
            <h3 className="text-foreground font-bold text-xl">Step Tracker</h3>
          </div>
          <button
            type="button"
            onClick={() => onSetGoal?.()}
            className="px-4 py-2 rounded-md bg-accent-blue text-white text-sm font-semibold md:hover:brightness-110 transition-colors flex items-center press-feedback focus-ring"
            aria-label="Set step goal"
          >
            <Target size={16} className="mr-2 opacity-90" />
            Set Goal
          </button>
        </div>

        {/* Main content area */}
        <div className="flex-1 bg-surface border-t border-border overflow-y-auto flex flex-col">
          {/* View mode toggle */}
          <div className="px-4 pt-3 pb-1 flex-shrink-0">
            <div className="relative flex items-center gap-2 p-1 bg-surface-highlight rounded-lg">
              <div
                className="absolute inset-y-1 rounded-md shadow-md bg-accent-blue"
                style={{
                  width: 'calc((100% - 24px) / 3)',
                  left:
                    viewMode === '7d'
                      ? '4px'
                      : viewMode === '30d'
                        ? 'calc((100% - 24px) / 3 + 12px)'
                        : 'calc((100% - 24px) / 3 * 2 + 20px)',
                  transition:
                    'left 0.2s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.2s ease-out',
                }}
              />
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setViewMode(mode.key)}
                  className={`relative z-10 flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === mode.key
                      ? 'text-white'
                      : 'text-muted md:hover:text-foreground'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic stat cards */}
          <div
            className={`px-4 pt-3 pb-3 grid gap-3 flex-shrink-0 ${
              viewMode === '7d' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'
            }`}
          >
            {viewMode === '7d' ? (
              <>
                {/* Today's Steps */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    {todaySteps != null ? "Today's Steps" : 'Latest'}
                  </p>
                  <p className="text-foreground text-2xl font-bold">
                    {currentStepsDisplay}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    {todaySteps != null
                      ? formatTooltipDate(new Date().toISOString().slice(0, 10))
                      : latestDate
                        ? formatTooltipDate(latestDate)
                        : 'steps'}
                  </p>
                </div>
                {/* 7-Day / 14-Day Averages */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    Averages
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px]">7d</span>
                      <span className="text-foreground text-lg font-semibold">
                        {avg7 != null ? formatStepCount(avg7) : '\u2014'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px]">14d</span>
                      <span className="text-foreground text-sm font-semibold">
                        {avg14 != null ? formatStepCount(avg14) : '\u2014'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Goal Progress */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    Goal Progress
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      currentStepsValue >= resolvedStepGoal
                        ? 'text-accent-green'
                        : 'text-accent-blue'
                    }`}
                  >
                    {resolvedStepGoal > 0
                      ? `${Math.round((currentStepsValue / resolvedStepGoal) * 100)}%`
                      : '\u2014'}
                  </p>
                  <p
                    className={`text-[11px] mt-1 ${
                      currentStepsValue >= resolvedStepGoal
                        ? 'text-accent-green'
                        : 'text-muted'
                    }`}
                  >
                    {currentStepsValue >= resolvedStepGoal
                      ? `${(currentStepsValue - resolvedStepGoal).toLocaleString()} over`
                      : `${Math.max(0, resolvedStepGoal - currentStepsValue).toLocaleString()} left`}
                  </p>
                </div>
                {/* Distance & Calories */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    Distance & Calories
                  </p>
                  <p className="text-foreground text-2xl font-bold">
                    {todayStepDetails.distanceKm > 0
                      ? `${todayStepDetails.distanceKm.toFixed(1)} km`
                      : '\u2014'}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    {todayStepDetails.calories > 0
                      ? `${Math.round(todayStepDetails.calories)} cal burned`
                      : 'from steps'}
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Period Average */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    {viewMode === '30d' ? '30-Day Avg' : '12-Month Avg'}
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      pageAverage != null && pageAverage >= resolvedStepGoal
                        ? 'text-accent-green'
                        : 'text-foreground'
                    }`}
                  >
                    {pageAverage != null
                      ? formatStepCount(pageAverage)
                      : '\u2014'}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    {pageTimeframeRange ||
                      `Goal: ${formatStepCount(resolvedStepGoal)}/day`}
                  </p>
                </div>
                {/* Total Distance & Calories */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    Total Distance & Calories
                  </p>
                  <p className="text-foreground text-2xl font-bold">
                    {pageStepDetails.distanceKm > 0
                      ? `${pageStepDetails.distanceKm.toFixed(1)} km`
                      : '\u2014'}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    {pageStepDetails.calories > 0
                      ? `${Math.round(pageStepDetails.calories)} kcal`
                      : 'from steps'}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Separator */}
          <div className="border-b border-border flex-shrink-0" />

          {/* Graph carousel + Y-axis */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 pr-2 pb-1 overflow-hidden flex">
              {/* Carousel */}
              <div className="relative rounded-l-lg flex-1 overflow-hidden">
                <div
                  ref={carouselRef}
                  className="overflow-x-auto overflow-y-hidden h-full flex"
                  style={{
                    scrollSnapType: 'x mandatory',
                    WebkitOverflowScrolling: 'touch',
                  }}
                  onScroll={handleCarouselScroll}
                >
                  {viewMode === '7d' ? (
                    render7dContinuous()
                  ) : pages.length > 0 ? (
                    pages.map((page, idx) => renderPageGraph(page, idx))
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <Footprints
                          size={48}
                          className="text-muted mx-auto mb-3"
                        />
                        <p className="text-muted text-lg">No step data yet</p>
                        <p className="text-muted text-sm mt-1">
                          Connect Health Connect to start tracking
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-surface/90 to-transparent" />
              </div>

              {/* Y-axis */}
              <div className="rounded-r-lg w-14 flex-shrink-0 relative">
                <div
                  className="absolute inset-x-0 px-1"
                  style={{
                    top: `${viewMode === '7d' && weekBrackets.length > 0 ? WEEK_BRACKET_HEIGHT + WEEK_BRACKET_TOP_PADDING + 8 : 8}px`,
                    height: `${chartHeight}px`,
                  }}
                >
                  {effectiveChartData
                    ? yTickPositions.map(({ value, index, lineY }) => (
                        <div
                          key={`tick-${index}`}
                          className="absolute right-2 text-xs font-semibold text-foreground/70 tracking-tight text-right"
                          style={{
                            top: `${lineY}px`,
                            transform: 'translateY(-50%)',
                            transition: 'top 0.3s ease-out',
                          }}
                        >
                          {formatStepCount(Math.round(value))}
                        </div>
                      ))
                    : null}
                  {/* Goal Y-axis label */}
                  {goalLineY != null && resolvedStepGoal > 0 && (
                    <div
                      className="absolute right-2 text-[11px] font-bold text-accent-green tracking-tight text-right"
                      style={{
                        top: `${goalLineY}px`,
                        transform: 'translateY(-50%)',
                        transition: 'top 0.3s ease-out',
                      }}
                    >
                      {formatStepCount(resolvedStepGoal)}
                    </div>
                  )}
                  {currentStepsTick &&
                    (viewMode === '7d' || viewMode === '30d') && (
                      <div
                        className="absolute right-0.5 px-2.5 py-1 rounded-lg text-[12px] font-bold text-white shadow-md flex items-center justify-center leading-none"
                        style={{
                          top: `${currentStepsTick.yPx}px`,
                          transform: 'translateY(-50%)',
                          transition: 'top 0.3s ease-out',
                          backgroundColor: getBarColor(
                            currentStepsTick.steps,
                            resolvedStepGoal
                          ).replace('/ 1)', '/ 0.8)'),
                          borderColor: getBarColor(
                            currentStepsTick.steps,
                            resolvedStepGoal
                          ),
                          borderWidth: '1px',
                        }}
                      >
                        {formatStepCount(Math.round(currentStepsTick.steps))}
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ModalShell>

      {/* Tooltip */}
      {selectedBar &&
        selectedDate &&
        (viewMode === '12m'
          ? !!monthsMap[selectedDate]
          : !!entriesMap[selectedDate] || selectedBar.hasEntry) && (
          <div
            ref={tooltipRef}
            className={`fixed z-[1200] bg-surface border border-border rounded-lg shadow-2xl p-4 transform -translate-x-1/2 -translate-y-full pointer-events-auto transition duration-150 ease-out ${
              tooltipEntered && !tooltipClosing
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-95'
            }`}
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y - TOOLTIP_VERTICAL_OFFSET}px`,
              width: `${TOOLTIP_WIDTH}px`,
            }}
            role="status"
            tabIndex={-1}
          >
            {viewMode === '12m' ? (
              <div className="rounded p-2">
                <p className="text-muted text-[11.5px] mb-1">
                  {(() => {
                    const m = monthsMap[selectedDate];
                    if (!m) return selectedDate;
                    const d = new Date(Date.UTC(m.year, m.month, 1));
                    return d.toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    });
                  })()}
                </p>
                {monthsMap[selectedDate]?.avg != null ? (
                  <>
                    <p className="text-foreground text-2xl font-bold">
                      {monthsMap[selectedDate].avg.toLocaleString()}
                      <span className="text-muted text-sm font-normal ml-1">
                        avg/day
                      </span>
                    </p>
                    <p className="text-muted text-[10px] mt-1 uppercase tracking-wide">
                      {monthsMap[selectedDate].entries
                        .reduce((s, e) => s + (e.steps || 0), 0)
                        .toLocaleString()}{' '}
                      total steps
                    </p>
                    {weight &&
                      height &&
                      (() => {
                        const totalSteps = monthsMap[
                          selectedDate
                        ].entries.reduce((s, e) => s + (e.steps || 0), 0);
                        const d = getStepCaloriesDetails(totalSteps, {
                          weight,
                          height,
                          gender: gender || 'male',
                        });
                        return (
                          <div className="mt-2 pt-2 border-t border-border flex justify-between text-sm">
                            <div>
                              <p className="text-muted text-[10px] uppercase">
                                Distance
                              </p>
                              <p className="text-foreground font-semibold">
                                {d.distanceKm.toFixed(1)} km
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-muted text-[10px] uppercase">
                                Calories
                              </p>
                              <p className="text-foreground font-semibold">
                                {Math.round(d.calories)} kcal
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                  </>
                ) : (
                  <p className="text-muted text-lg font-semibold">No entries</p>
                )}
              </div>
            ) : (
              <div className="rounded p-2">
                <p className="text-muted text-[11.5px] mb-1">
                  {formatTooltipDate(selectedDate)}
                </p>
                {entriesMap[selectedDate] ? (
                  <>
                    <p className="text-foreground text-2xl font-bold">
                      {entriesMap[selectedDate].steps.toLocaleString()}{' '}
                      <span className="text-muted text-sm font-normal">
                        steps
                      </span>
                    </p>
                    {weight && height && (
                      <div className="mt-2 pt-2 border-t border-border flex justify-between text-sm">
                        <div>
                          <p className="text-muted text-[10px] uppercase">
                            Distance
                          </p>
                          <p className="text-foreground font-semibold">
                            {getStepCaloriesDetails(
                              entriesMap[selectedDate].steps,
                              {
                                weight,
                                height,
                                gender: gender || 'male',
                              }
                            ).distanceKm.toFixed(2)}{' '}
                            km
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted text-[10px] uppercase">
                            Calories
                          </p>
                          <p className="text-foreground font-semibold">
                            {Math.round(
                              getStepCaloriesDetails(
                                entriesMap[selectedDate].steps,
                                {
                                  weight,
                                  height,
                                  gender: gender || 'male',
                                }
                              ).calories
                            )}{' '}
                            kcal
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted text-lg font-semibold">No entry</p>
                )}
              </div>
            )}
            <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-border" />
          </div>
        )}
    </>
  );
};
