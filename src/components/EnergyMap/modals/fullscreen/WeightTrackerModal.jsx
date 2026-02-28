import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Repeat,
  AlertCircle,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  calculateWeightTrend,
  formatWeight,
  sortWeightEntries,
  calculateNDayWeightAverage,
  groupWeightEntriesByMonth,
} from '../../../../utils/weight';
import {
  getGoalAlignedStyle,
  getGoalAlignedTextClass,
} from '../../../../utils/goalAlignment';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { WeightTrendInfoModal } from '../info/WeightTrendInfoModal';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { buildBezierPaths } from '../../../../utils/bezierPath';

// ---------------------------------------------------------------------------
// Helper components & functions
// ---------------------------------------------------------------------------

const TrendIcon = ({ direction }) => {
  if (direction === 'up') return <TrendingUp size={18} />;
  if (direction === 'down') return <TrendingDown size={18} />;
  return <Minus size={18} />;
};

const getTrendToneClass = (trend, selectedGoal) => {
  if (
    !trend ||
    trend.label === 'Need more data' ||
    trend.label === 'No data yet'
  ) {
    return 'text-foreground';
  }
  return getGoalAlignedTextClass(trend, selectedGoal, 'weight');
};

const getGoalAlignmentText = (weeklyRate, selectedGoal) => {
  const absRate = Math.abs(weeklyRate);
  const goalExpectations = {
    aggressive_bulk: { min: 0.5, max: 1.0, direction: 'up' },
    bulking: { min: 0.25, max: 0.5, direction: 'up' },
    maintenance: { min: -0.1, max: 0.1, direction: 'flat' },
    cutting: { min: 0.25, max: 0.5, direction: 'down' },
    aggressive_cut: { min: 0.5, max: 1.0, direction: 'down' },
  };
  const expectation = goalExpectations[selectedGoal];
  if (!expectation) return null;

  let actualDirection = 'flat';
  if (weeklyRate < -0.1) actualDirection = 'down';
  else if (weeklyRate > 0.1) actualDirection = 'up';

  if (
    actualDirection !== expectation.direction &&
    expectation.direction !== 'flat'
  ) {
    if (expectation.direction === 'up')
      return { text: 'Not gaining as expected', color: 'text-accent-yellow' };
    if (expectation.direction === 'down')
      return { text: 'Not losing as expected', color: 'text-accent-yellow' };
  }

  if (expectation.direction === 'flat') {
    if (absRate <= 0.1)
      return { text: 'On track with goal', color: 'text-accent-green' };
    return { text: 'Deviating from maintenance', color: 'text-accent-yellow' };
  }

  const expectedRate =
    expectation.direction === 'down' ? -weeklyRate : weeklyRate;
  if (expectedRate >= expectation.min && expectedRate <= expectation.max)
    return { text: 'On track with goal', color: 'text-accent-green' };
  if (expectedRate < expectation.min)
    return { text: 'Slower than goal target', color: 'text-accent-blue' };
  if (expectedRate > expectation.max)
    return { text: 'Faster than goal target', color: 'text-accent-yellow' };
  return null;
};

const getGoalWeeklyTarget = (selectedGoal) => {
  const goalTargets = {
    aggressive_bulk: '+0.5-1.0 kg/wk',
    bulking: '+0.25-0.5 kg/wk',
    maintenance: '0.0 kg/wk',
    cutting: '-0.25-0.5 kg/wk',
    aggressive_cut: '-0.5-1.0 kg/wk',
  };
  return goalTargets[selectedGoal] || '0.0 kg/wk';
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const Y_TICK_COUNT = 7;
const MIN_VISIBLE_WEIGHT_RANGE = 6;
const MIN_RANGE_PADDING = 0.5;
const BASELINE_Y_OFFSET = 0;
const TOOLTIP_WIDTH = 120;
const TOOLTIP_VERTICAL_OFFSET = 27;
const DATA_OLD_WARNING_DAYS = 1;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Per-mode point sizing
const MODE_POINT = {
  '7d': { radius: 6, hitRadius: 12 },
  '30d': { radius: 3, hitRadius: 8 },
  '12m': { radius: 6, hitRadius: 12 },
};

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

const getDataAgeInDays = (dateKey) => {
  if (!dateKey) return null;
  const entryDate = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(entryDate.getTime())) return null;
  const now = new Date();
  const utcToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const utcEntry = Date.UTC(
    entryDate.getUTCFullYear(),
    entryDate.getUTCMonth(),
    entryDate.getUTCDate()
  );
  return Math.max(0, Math.floor((utcToday - utcEntry) / MS_PER_DAY));
};

const getOldDataWarningText = (dateKey) => {
  const ageDays = getDataAgeInDays(dateKey);
  if (!Number.isFinite(ageDays) || ageDays < DATA_OLD_WARNING_DAYS) return null;
  const dayLabel = ageDays === 1 ? 'day' : 'days';
  return `${ageDays} ${dayLabel} old`;
};

/** Produce a YYYY-MM-DD string from a Date in UTC */
const toDateKey = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Page generation helpers
// ---------------------------------------------------------------------------

/** Chunk an array into groups of `size`. Last chunk may be smaller. */
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

/**
 * Build 7-day pages: chunk sorted entries into groups of 7.
 * Each page = { entries, startDate, endDate, pageIndex }.
 */
const build7DayPages = (sortedEntries) => {
  if (!sortedEntries.length) return [];
  const chunks = chunk(sortedEntries, 7);
  return chunks.map((entries, idx) => ({
    entries,
    startDate: entries[0].date,
    endDate: entries[entries.length - 1].date,
    pageIndex: idx,
  }));
};

/**
 * Build 30-day calendar pages working backwards from the latest entry.
 * For each 30-day window, produce 30 slots (Entry | null per calendar day).
 * Line breaks at gaps.
 */
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
    windowStart.setUTCDate(windowStart.getUTCDate() - 29); // 30 days inclusive

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

    // Move window back by 30 days
    windowEnd.setUTCDate(windowEnd.getUTCDate() - 30);
  }

  pages.forEach((p, i) => {
    p.pageIndex = i;
  });
  return pages;
};

/**
 * Build 12-month pages from monthly aggregates.
 * Each page = 12 monthly points (last page may have < 12).
 */
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
// Chart data helpers (per-page)
// ---------------------------------------------------------------------------

const computeChartData = (values, minRange = MIN_VISIBLE_WEIGHT_RANGE) => {
  if (!values.length) return null;

  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  let range = maxVal - minVal;

  if (range === 0) {
    range = Math.max(minRange, MIN_RANGE_PADDING * 2);
    const half = range / 2;
    minVal -= half;
    maxVal += half;
  } else {
    const padding = Math.max(range * 0.1, MIN_RANGE_PADDING);
    minVal -= padding;
    maxVal += padding;
    range = maxVal - minVal;
    if (range < minRange) {
      const mid = (maxVal + minVal) / 2;
      minVal = mid - minRange / 2;
      maxVal = mid + minRange / 2;
      range = minRange;
    }
  }

  return { minWeight: minVal, maxWeight: maxVal, range };
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export const WeightTrackerModal = ({
  isOpen,
  isClosing,
  entries,
  latestWeight,
  selectedGoal = 'maintenance',
  onClose,
  onAddEntry,
  onEditEntry,
  canSwitchToBodyFat = false,
  onSwitchToBodyFat,
}) => {
  // Store fallback
  const store = useEnergyMapStore(
    (state) => ({
      weightEntries: state.weightEntries ?? [],
      latestWeight: state.userData.weight,
    }),
    shallow
  );
  const resolvedEntries = entries ?? store.weightEntries;
  const resolvedLatestWeight = latestWeight ?? store.latestWeight;

  // --- State ---
  const [viewMode, setViewMode] = useState('7d'); // '7d' | '30d' | '12m'
  const [activePageIndex, setActivePageIndex] = useState(-1); // -1 = auto-last
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

  // Trend info modal
  const {
    isOpen: isTrendInfoOpen,
    isClosing: isTrendInfoClosing,
    open: openTrendInfo,
    requestClose: closeTrendInfo,
  } = useAnimatedModal();

  // --- Derived data ---
  const sortedEntries = useMemo(
    () => sortWeightEntries(resolvedEntries ?? []),
    [resolvedEntries]
  );

  const trend = useMemo(
    () => calculateWeightTrend(sortedEntries),
    [sortedEntries]
  );
  const trendVisual = useMemo(
    () => getGoalAlignedStyle(trend, selectedGoal, 'weight'),
    [trend, selectedGoal]
  );
  const goalAlignment = useMemo(
    () => getGoalAlignmentText(trend.weeklyRate, selectedGoal),
    [trend.weeklyRate, selectedGoal]
  );

  // Rolling averages (global, not per-page)
  const avg7 = useMemo(
    () => calculateNDayWeightAverage(sortedEntries, 7),
    [sortedEntries]
  );
  const avg14 = useMemo(
    () => calculateNDayWeightAverage(sortedEntries, 14),
    [sortedEntries]
  );

  // Monthly groups for 12m mode
  const monthGroups = useMemo(
    () => groupWeightEntriesByMonth(sortedEntries),
    [sortedEntries]
  );

  // Fill month groups to always span at least 12 months ending at the latest data month
  const filledMonthGroups = useMemo(() => {
    if (!monthGroups.length) return [];
    const last = monthGroups[monthGroups.length - 1];
    const monthMap = new Map(monthGroups.map((m) => [m.key, m]));
    const filled = [];
    // Start 11 months before the last data month (or at the first data month, whichever is earlier)
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
    if (viewMode === '7d') return build7DayPages(sortedEntries);
    if (viewMode === '30d') return build30DayPages(sortedEntries);
    if (viewMode === '12m') return build12MonthPages(filledMonthGroups);
    return [];
  }, [viewMode, sortedEntries, filledMonthGroups]);

  const pageCount = pages.length;
  const resolvedPageIndex = useMemo(() => {
    if (pageCount === 0) return 0;
    if (activePageIndex < 0 || activePageIndex >= pageCount)
      return pageCount - 1;
    return activePageIndex;
  }, [activePageIndex, pageCount]);

  const activePage = pages[resolvedPageIndex] ?? null;

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
        ? Math.max(graphViewportHeight - TIMELINE_TRACK_HEIGHT - 24, 100)
        : 200,
    [graphViewportHeight]
  );

  // --- Scroll to last page on open ---
  useEffect(() => {
    if (!isOpen) return;
    setActivePageIndex(-1); // auto-last
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
    // Close tooltip on scroll
    if (selectedDate) {
      setTooltipClosing(true);
      setTimeout(() => {
        setSelectedDate(null);
        setTooltipClosing(false);
      }, 150);
    }
  }, [selectedDate]);

  // --- Global chart data for 7d continuous ---
  const globalChartData = useMemo(() => {
    if (viewMode !== '7d' || !sortedEntries.length) return null;
    return computeChartData(sortedEntries.map((e) => e.weight));
  }, [viewMode, sortedEntries]);

  // --- Per-page chart data for 30d / 12m ---
  const pageChartData = useMemo(() => {
    if (viewMode === '7d') return globalChartData;
    if (!activePage) return null;
    let values = [];
    if (viewMode === '30d') {
      values = activePage.entries.map((e) => e.weight);
    } else if (viewMode === '12m') {
      values = activePage.months
        .filter((m) => !m.isEmpty && m.avg != null)
        .map((m) => m.avg);
    }

    return computeChartData(values);
  }, [viewMode, activePage, globalChartData]);

  // Chart data used for Y-axis display
  const effectiveChartData =
    viewMode === '7d' ? globalChartData : pageChartData;

  // Chart width = viewport width (one page fills the viewport)
  const chartWidth = graphViewportWidth || 300;

  // 7d continuous: all points in global coordinate space (right-aligned)
  // Build calendar-based timeline for 7d: includes all days from first to last entry
  const timeline7d = useMemo(() => {
    if (viewMode !== '7d' || !sortedEntries.length)
      return { days: [], snapPageCount: 1 };
    const firstDate = new Date(sortedEntries[0].date + 'T00:00:00Z');
    const lastDate7d = new Date(
      sortedEntries[sortedEntries.length - 1].date + 'T00:00:00Z'
    );
    const calendarDays = Math.round((lastDate7d - firstDate) / 86400000) + 1;
    const snapPages = Math.max(1, Math.ceil(calendarDays / 7));
    const totalSlots = snapPages * 7;
    const emptyPadding = totalSlots - calendarDays;
    const entryMap = new Map(sortedEntries.map((e) => [e.date, e]));
    const days = [];
    // Left padding (before first entry date)
    for (let i = 0; i < emptyPadding; i++) {
      const d = new Date(firstDate);
      d.setUTCDate(d.getUTCDate() - (emptyPadding - i));
      days.push({ date: toDateKey(d), entry: null, isPadding: true });
    }
    // Calendar days from first to last entry
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

  const allPoints7d = useMemo(() => {
    if (viewMode !== '7d' || !sortedEntries.length || !globalChartData)
      return [];
    const { days } = timeline7d;
    const STEP = chartWidth / 7;
    const PAD = STEP / 2;
    return days
      .map((slot, i) => {
        if (!slot.entry) return null;
        const x = PAD + i * STEP;
        const norm =
          (slot.entry.weight - globalChartData.minWeight) /
          globalChartData.range;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const y = (1 - bounded) * chartHeight;
        return { date: slot.date, weight: slot.entry.weight, x, y };
      })
      .filter(Boolean);
  }, [
    viewMode,
    sortedEntries,
    globalChartData,
    chartWidth,
    chartHeight,
    timeline7d,
  ]);

  // 30d/12m: chart points for the active page
  const chartPoints = useMemo(() => {
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
        const norm = (e.weight - pageChartData.minWeight) / pageChartData.range;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const y = (1 - bounded) * chartHeight;
        return { date: e.date, weight: e.weight, x, y, isGap: false };
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
            weight: null,
            x,
            y: 0,
            isGap: true,
            label: m.label,
            isEmpty: true,
          };
        }
        const norm = (m.avg - pageChartData.minWeight) / pageChartData.range;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const y = (1 - bounded) * chartHeight;
        return {
          date: m.key,
          weight: m.avg,
          x,
          y,
          isGap: false,
          label: m.label,
        };
      });
    }

    return [];
  }, [pageChartData, activePage, viewMode, chartWidth, chartHeight]);

  // Y ticks (use effectiveChartData — global for 7d, per-page for 30d/12m)
  const yTicks = useMemo(() => {
    if (!effectiveChartData) return [];
    const steps = Math.max(Y_TICK_COUNT - 1, 1);
    return Array.from(
      { length: Y_TICK_COUNT },
      (_, i) =>
        effectiveChartData.maxWeight - (effectiveChartData.range / steps) * i
    );
  }, [effectiveChartData]);

  const yTickPositions = useMemo(() => {
    if (!effectiveChartData || chartHeight <= 0) return [];
    return yTicks.map((weight, index) => {
      const norm =
        (weight - effectiveChartData.minWeight) / effectiveChartData.range;
      const bounded = Math.min(Math.max(norm, 0), 1);
      const y = (1 - bounded) * chartHeight;
      const isTop = index === 0;
      const isBottom = index === yTicks.length - 1;
      const lineY = isTop ? 0 : isBottom ? chartHeight : y;
      return { weight, index, lineY };
    });
  }, [effectiveChartData, chartHeight, yTicks]);

  // Current weight tick on y-axis
  const latestWeight_ = sortedEntries.length
    ? sortedEntries[sortedEntries.length - 1].weight
    : resolvedLatestWeight;

  const currentWeightTick = useMemo(() => {
    if (!effectiveChartData || !Number.isFinite(latestWeight_)) return null;
    const norm =
      (latestWeight_ - effectiveChartData.minWeight) / effectiveChartData.range;
    const bounded = Math.min(Math.max(norm, 0), 1);
    const y = (1 - bounded) * chartHeight;
    return { yPx: y, weight: latestWeight_ };
  }, [effectiveChartData, chartHeight, latestWeight_]);

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

  // --- Latest / oldest data for header ---
  const latestDate = sortedEntries.length
    ? sortedEntries[sortedEntries.length - 1].date
    : null;
  const oldDataWarningText = useMemo(
    () => getOldDataWarningText(latestDate),
    [latestDate]
  );

  const currentWeightDisplay = (() => {
    const formatted = formatWeight(latestWeight_);
    return formatted ? `${formatted} kg` : '—';
  })();

  const weeklyRateDisplay = (() => {
    if (!Number.isFinite(trend.weeklyRate) || trend.weeklyRate === 0)
      return '0.0 kg/wk';
    const sign = trend.weeklyRate > 0 ? '+' : '';
    return `${sign}${trend.weeklyRate.toFixed(2)} kg/wk`;
  })();

  // Per-page dynamic stat for 30d and 12m
  const pageAverage = useMemo(() => {
    if (!activePage) return null;
    if (viewMode === '30d') {
      const vals = activePage.entries.map((e) => e.weight);
      if (!vals.length) return null;
      return (
        Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      );
    }
    if (viewMode === '12m') {
      const vals = activePage.months
        .filter((m) => m.avg != null)
        .map((m) => m.avg);
      if (!vals.length) return null;
      return (
        Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      );
    }
    return null;
  }, [activePage, viewMode]);

  const pageTimeframeRange = useMemo(() => {
    if (!activePage) return '';
    return `${formatShortDate(activePage.startDate)} - ${formatShortDate(activePage.endDate)}`;
  }, [activePage]);

  // --- Tooltip ---
  const selectedPoint = useMemo(() => {
    if (!selectedDate) return null;
    if (viewMode === '7d') {
      // Check real points first
      const real = allPoints7d.find((p) => p.date === selectedDate);
      if (real) return real;
      // Ghost date — find slot x from timeline7d
      const slotIdx = timeline7d.days.findIndex((d) => d.date === selectedDate);
      if (slotIdx >= 0) {
        const STEP = chartWidth / 7;
        const PAD = STEP / 2;
        return {
          date: selectedDate,
          weight: null,
          x: PAD + slotIdx * STEP,
          y: chartHeight,
          isGhost: true,
        };
      }
      return null;
    }
    return chartPoints.find((p) => p.date === selectedDate) ?? null;
  }, [
    selectedDate,
    viewMode,
    allPoints7d,
    chartPoints,
    timeline7d,
    chartWidth,
    chartHeight,
  ]);

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
      const entry = entriesMap[date];
      if (selectedDate === date) {
        if (viewMode !== '12m') {
          if (entry) {
            onEditEntry?.(entry);
          } else {
            onAddEntry?.(date);
          }
        }
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
    [entriesMap, selectedDate, onEditEntry, onAddEntry, closeTooltip, viewMode]
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
      if (target.tagName === 'circle' || target.tagName === 'g') return;
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

  const handleTooltipClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (selectedDate) {
        if (viewMode !== '12m') {
          const entry = entriesMap[selectedDate];
          if (entry) {
            onEditEntry?.(entry);
          } else {
            onAddEntry?.(selectedDate);
          }
        }
        closeTooltip();
      }
    },
    [selectedDate, entriesMap, onEditEntry, onAddEntry, closeTooltip, viewMode]
  );

  const updateTooltipPosition = useCallback(() => {
    if (!selectedPoint) return;
    const node = carouselRef.current;
    if (!node) return;

    if (viewMode === '7d') {
      // Continuous chart: account for scroll offset
      const rect = node.getBoundingClientRect();
      const rawX = rect.left + selectedPoint.x - node.scrollLeft;
      const rawY = rect.top + 16 + selectedPoint.y;
      setTooltipPosition({ x: rawX, y: rawY });
    } else {
      const svgNodes = node.querySelectorAll('svg');
      const svg = svgNodes[resolvedPageIndex];
      if (!svg) return;
      const svgRect = svg.getBoundingClientRect();
      const rawX = svgRect.left + selectedPoint.x;
      const rawY = svgRect.top + selectedPoint.y;
      setTooltipPosition({ x: rawX, y: rawY });
    }
  }, [selectedPoint, resolvedPageIndex, viewMode]);

  useIsomorphicLayoutEffect(() => {
    if (!selectedPoint) return undefined;
    updateTooltipPosition();
    const handleResize = () => updateTooltipPosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedPoint, updateTooltipPosition]);

  // --- Mode-specific point sizing ---
  const pointRadius = MODE_POINT[viewMode]?.radius ?? 6;
  const pointHitRadius = MODE_POINT[viewMode]?.hitRadius ?? 12;

  // --- Render page graph (30d / 12m only) ---
  const renderPageGraph = (page, idx) => {
    let values = [];
    if (viewMode === '30d') values = page.entries.map((e) => e.weight);
    else if (viewMode === '12m')
      values = page.months
        .filter((m) => !m.isEmpty && m.avg != null)
        .map((m) => m.avg);

    const pcd = computeChartData(values);
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

    let pts = [];
    if (viewMode === '30d') {
      // Date-proportional x positions
      const startMs = new Date(page.startDate + 'T00:00:00Z').getTime();
      const endMs = new Date(page.endDate + 'T00:00:00Z').getTime();
      const rangeMs = endMs - startMs || 1;

      pts = page.entries.map((e) => {
        const ms = new Date(e.date + 'T00:00:00Z').getTime();
        const fraction = (ms - startMs) / rangeMs;
        const x = pad + fraction * usable;
        const norm = (e.weight - pcd.minWeight) / pcd.range;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const y = (1 - bounded) * chartHeight;
        return { date: e.date, weight: e.weight, x, y, isGap: false };
      });
    } else if (viewMode === '12m') {
      const count = page.months.length;
      const step = count > 1 ? usable / (count - 1) : 0;
      pts = page.months.map((m, i) => {
        const x = pad + step * i;
        if (m.isEmpty || m.avg == null) {
          return {
            date: m.key,
            weight: null,
            x,
            y: 0,
            isGap: true,
            label: m.label,
            isEmpty: true,
          };
        }
        const norm = (m.avg - pcd.minWeight) / pcd.range;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const y = (1 - bounded) * chartHeight;
        return {
          date: m.key,
          weight: m.avg,
          x,
          y,
          isGap: false,
          label: m.label,
        };
      });
    }

    // Build bezier paths (continuous line)
    const nonGap = pts.filter((p) => !p.isGap).map((p) => ({ x: p.x, y: p.y }));
    const { pathData, areaData } = buildBezierPaths(nonGap, {
      chartWidth,
      chartHeight,
      extendToEdges: true,
      singlePointStretch: nonGap.length === 1,
    });

    // Y ticks for this page
    const ySteps = Math.max(Y_TICK_COUNT - 1, 1);
    const pageTicks = Array.from(
      { length: Y_TICK_COUNT },
      (_, i) => pcd.maxWeight - (pcd.range / ySteps) * i
    );
    const pageTickPositions = pageTicks.map((w, i) => {
      const norm = (w - pcd.minWeight) / pcd.range;
      const bounded = Math.min(Math.max(norm, 0), 1);
      const y = (1 - bounded) * chartHeight;
      const isTop = i === 0;
      const isBottom = i === pageTicks.length - 1;
      const lineY = isTop ? 0 : isBottom ? chartHeight : y;
      return { weight: w, index: i, lineY };
    });

    const gradId = `areaGradient-w-${idx}`;

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
        {/* SVG Graph */}
        <div className="flex-1 py-[8px]">
          <svg
            width={chartWidth}
            height={chartHeight}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={trendVisual.color}
                  stopOpacity={trendVisual.topOpacity}
                />
                <stop
                  offset="100%"
                  stopColor={trendVisual.color}
                  stopOpacity={trendVisual.bottomOpacity}
                />
              </linearGradient>
            </defs>

            {/* Grid lines */}
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
                    stroke={isBaseline ? '#fff' : 'currentColor'}
                    strokeWidth={isBaseline ? 2 : 1}
                    strokeDasharray={isBaseline ? 'none' : '4 6'}
                    className={
                      isBaseline ? 'opacity-80' : 'text-muted opacity-60'
                    }
                  />
                );
              })}
            </g>

            {/* Area fill */}
            {areaData && <path d={areaData} fill={`url(#${gradId})`} />}

            {/* Line */}
            {pathData && (
              <path
                d={pathData}
                fill="none"
                stroke={trendVisual.color}
                strokeWidth={viewMode === '30d' ? '2' : '3'}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Points */}
            {pts
              .filter((p) => !p.isGap)
              .map((p) => (
                <g
                  key={p.date}
                  onClick={(e) =>
                    idx === resolvedPageIndex && handleDateClick(p.date, e)
                  }
                  className="cursor-pointer"
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={pointHitRadius}
                    fill="transparent"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={pointRadius}
                    fill="#1e293b"
                    stroke={trendVisual.color}
                    strokeWidth="2"
                    className="transition-all"
                  />
                </g>
              ))}
          </svg>
        </div>

        {/* Timeline labels */}
        <div className="flex-shrink-0 px-1 pb-2">
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
    if (!globalChartData || !allPoints7d.length) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-lg">No weight data yet.</p>
        </div>
      );
    }

    const snapPageCount = timeline7d.snapPageCount;
    const totalWidth = snapPageCount * chartWidth;

    // Build continuous bezier path through all points
    const pts = allPoints7d.map((p) => ({ x: p.x, y: p.y }));
    const { pathData, areaData } = buildBezierPaths(pts, {
      chartWidth: totalWidth,
      chartHeight,
      extendToEdges: true,
      singlePointStretch: pts.length === 1,
    });

    const gradId = 'areaGradient-w-cont';

    return (
      <div
        style={{
          width: `${totalWidth}px`,
          height: '100%',
          position: 'relative',
        }}
      >
        {/* SVG chart layer */}
        <div
          className="absolute left-0"
          style={{
            top: '8px',
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
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={trendVisual.color}
                  stopOpacity={trendVisual.topOpacity}
                />
                <stop
                  offset="100%"
                  stopColor={trendVisual.color}
                  stopOpacity={trendVisual.bottomOpacity}
                />
              </linearGradient>
            </defs>

            {/* Grid lines (repeating per snap page) */}
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
                    stroke={isBaseline ? '#fff' : 'currentColor'}
                    strokeWidth={isBaseline ? 2 : 1}
                    strokeDasharray={isBaseline ? 'none' : '4 6'}
                    className={
                      isBaseline ? 'opacity-80' : 'text-muted opacity-60'
                    }
                  />
                );
              })
            )}

            {/* Area fill */}
            {areaData && <path d={areaData} fill={`url(#${gradId})`} />}

            {/* Line */}
            {pathData && (
              <path
                d={pathData}
                fill="none"
                stroke={trendVisual.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Points */}
            {allPoints7d.map((p) => (
              <g
                key={p.date}
                onClick={(e) => handleDateClick(p.date, e)}
                className="cursor-pointer"
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={pointHitRadius}
                  fill="transparent"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={pointRadius}
                  fill="#1e293b"
                  stroke={trendVisual.color}
                  strokeWidth="2"
                  className="transition-all"
                />
              </g>
            ))}
          </svg>
        </div>

        {/* Snap targets + timeline labels */}
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
                <div className="px-1 pb-2">
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
            <h3 className="text-foreground font-bold text-xl">
              Weight Tracker
            </h3>
          </div>
          {canSwitchToBodyFat && (
            <button
              type="button"
              onClick={() => onSwitchToBodyFat?.()}
              className="px-4 py-2 rounded-md bg-accent-blue text-white text-sm font-semibold md:hover:brightness-110 transition-colors flex items-center press-feedback focus-ring"
              aria-label="Switch to body fat tracker"
            >
              <Repeat size={16} className="mr-2 opacity-90" />
              Body Fat
            </button>
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 bg-surface border-t border-border overflow-y-auto flex flex-col">
          {/* View mode toggle */}
          <div className="px-4 pt-3 pb-1 flex-shrink-0">
            <div className="relative flex items-center gap-2 p-1 bg-surface-highlight rounded-lg">
              {/* Sliding pill */}
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
                {/* Current Weight */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    Current Weight
                  </p>
                  <p className="text-foreground text-2xl font-bold">
                    {currentWeightDisplay}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    {latestDate ? (
                      <span className="inline-flex items-center gap-2">
                        <span>{formatTooltipDate(latestDate)}</span>
                        {oldDataWarningText && (
                          <span className="inline-flex items-center gap-1 text-accent-yellow">
                            <AlertCircle size={10} className="shrink-0" />
                            {oldDataWarningText}
                          </span>
                        )}
                      </span>
                    ) : (
                      ''
                    )}
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
                        {avg7 != null ? `${formatWeight(avg7)} kg` : '—'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px]">14d</span>
                      <span className="text-foreground text-sm font-semibold">
                        {avg14 != null ? `${formatWeight(avg14)} kg` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Trend */}
                <div>
                  <button
                    type="button"
                    onClick={openTrendInfo}
                    aria-label="Trend details"
                    className="text-muted text-xs uppercase tracking-wide mb-1 md:hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 group focus-ring"
                  >
                    Trend
                    <Info
                      size={14}
                      className="opacity-60 md:group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                  <p
                    className={`${getTrendToneClass(trend, selectedGoal)} font-semibold text-lg flex items-center gap-2`}
                  >
                    <TrendIcon direction={trend.direction} />
                    {trend.label}
                  </p>
                  {goalAlignment && (
                    <p
                      className={`${goalAlignment.color} text-xs mt-1 font-medium`}
                    >
                      {goalAlignment.text}
                    </p>
                  )}
                </div>
                {/* Weekly Rate */}
                <div>
                  <button
                    type="button"
                    onClick={openTrendInfo}
                    aria-label="Weekly rate details"
                    className="text-muted text-xs uppercase tracking-wide mb-1 md:hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 group focus-ring"
                  >
                    Weekly Rate
                    <Info
                      size={14}
                      className="opacity-60 md:group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                  <p className="text-foreground text-lg font-semibold">
                    {weeklyRateDisplay}
                  </p>
                  <p className="text-muted text-xs mt-1">
                    Goal: {getGoalWeeklyTarget(selectedGoal)}
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* 30-Day Avg or 12-Month Avg */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    {viewMode === '30d' ? '30 Day Avg' : '12 Month Avg'}
                  </p>
                  <p className="text-foreground text-2xl font-bold">
                    {pageAverage != null
                      ? `${formatWeight(pageAverage)} kg`
                      : '—'}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    Current: {currentWeightDisplay}
                  </p>
                </div>
                {/* Timeframe */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    Timeframe
                  </p>
                  <p className="text-foreground text-sm font-semibold">
                    {pageTimeframeRange}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    {activePage && viewMode === '30d'
                      ? `${activePage.entries.length} entries`
                      : activePage && viewMode === '12m'
                        ? `${activePage.months.reduce((sum, m) => sum + (m.entries?.length || 0), 0)} entries`
                        : ''}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Add Entry button (hidden in 12m mode) */}
          {viewMode !== '12m' ? (
            <div className="sticky top-0 z-10 px-4 py-2 bg-surface/95 backdrop-blur border-b border-border flex-shrink-0">
              <button
                type="button"
                onClick={() => onAddEntry?.()}
                className="px-4 py-1.5 md:px-4 md:py-2.5 rounded-lg border-2 bg-accent-blue border-accent-blue/70 text-white transition-all font-semibold text-sm md:hover:brightness-110 press-feedback focus-ring"
              >
                Add Entry
              </button>
            </div>
          ) : (
            <div className="border-b border-border flex-shrink-0" />
          )}

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
                      <p className="text-muted text-lg">No weight data yet.</p>
                    </div>
                  )}
                </div>
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-surface/90 to-transparent" />
              </div>

              {/* Y-axis — uses effective chart data with smooth transitions */}
              <div className="rounded-r-lg w-12 flex-shrink-0 relative">
                <div
                  className="absolute inset-x-0 px-1"
                  style={{ top: '8px', height: `${chartHeight}px` }}
                >
                  {effectiveChartData
                    ? yTickPositions.map(({ weight, index, lineY }) => (
                        <div
                          key={`tick-${index}`}
                          className="absolute right-2 text-sm font-semibold text-foreground/70 tracking-tight text-right"
                          style={{
                            top: `${lineY}px`,
                            transform: 'translateY(-50%)',
                            transition: 'top 0.3s ease-out',
                          }}
                        >
                          {formatWeight(weight)}
                        </div>
                      ))
                    : null}
                  {currentWeightTick &&
                    (viewMode === '7d' || viewMode === '30d') && (
                      <div
                        className="absolute right-0.5 px-2.5 py-1 rounded-lg text-[12px] font-bold text-white shadow-md flex items-center justify-center leading-none"
                        style={{
                          top: `${currentWeightTick.yPx}px`,
                          transform: 'translateY(-50%)',
                          transition: 'top 0.3s ease-out',
                          backgroundColor: `${trendVisual.color}cc`,
                          borderColor: trendVisual.color,
                          borderWidth: '1px',
                        }}
                      >
                        {formatWeight(currentWeightTick.weight)}
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ModalShell>

      {/* Tooltip */}
      {selectedPoint &&
        selectedDate &&
        (viewMode === '12m'
          ? !!monthsMap[selectedDate]
          : entriesMap[selectedDate] || selectedPoint.isGhost) && (
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
            role={viewMode === '12m' ? 'status' : 'button'}
            tabIndex={viewMode === '12m' ? -1 : 0}
            aria-label={
              viewMode === '12m'
                ? 'Month info'
                : entriesMap[selectedDate]
                  ? 'Edit weight entry'
                  : 'Add weight entry'
            }
            onClick={viewMode === '12m' ? undefined : handleTooltipClick}
            onKeyDown={
              viewMode === '12m'
                ? undefined
                : (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleTooltipClick(event);
                    }
                  }
            }
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
                      {formatWeight(monthsMap[selectedDate].avg)} kg
                    </p>
                    <p className="text-muted text-[10px] mt-2 uppercase tracking-wide">
                      {monthsMap[selectedDate].entries.length}{' '}
                      {monthsMap[selectedDate].entries.length === 1
                        ? 'entry'
                        : 'entries'}
                    </p>
                  </>
                ) : (
                  <p className="text-muted text-lg font-semibold">No entries</p>
                )}
              </div>
            ) : (
              <div className="cursor-pointer md:hover:bg-surface-highlight/50 rounded p-2 transition-all pressable focus-ring">
                <p className="text-muted text-[11.5px] mb-1">
                  {formatTooltipDate(selectedDate)}
                </p>
                {entriesMap[selectedDate] ? (
                  <>
                    <p className="text-foreground text-2xl font-bold">
                      {formatWeight(entriesMap[selectedDate].weight)} kg
                    </p>
                    <p className="text-muted text-[10px] mt-2 uppercase tracking-wide">
                      Tap to edit
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-muted text-lg font-semibold">No entry</p>
                    <p className="text-accent-blue text-[10px] mt-2 uppercase tracking-wide">
                      Tap to add
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-border" />
          </div>
        )}

      {/* Weight Trend Info Modal */}
      <WeightTrendInfoModal
        isOpen={isTrendInfoOpen}
        isClosing={isTrendInfoClosing}
        trend={trend}
        selectedGoal={selectedGoal}
        onClose={closeTrendInfo}
      />
    </>
  );
};
