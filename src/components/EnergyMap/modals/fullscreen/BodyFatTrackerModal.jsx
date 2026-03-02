import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, Info, Repeat, AlertCircle } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  calculateBodyFatTrend,
  formatBodyFat,
  sortBodyFatEntries,
  calculateNDayBodyFatAverage,
  groupBodyFatEntriesByMonth,
} from '../../../../utils/bodyFat';
import { getGoalAlignedStyle } from '../../../../utils/goalAlignment';
import {
  TrendIcon,
  getTrendToneClass,
  getGoalAlignmentText,
  getGoalWeeklyTarget,
  formatWeeklyRate,
  formatTooltipDate,
  getOldDataWarningText,
} from '../../../../utils/trackerHelpers';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { BodyFatTrendInfoModal } from '../info/BodyFatTrendInfoModal';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { buildBezierPaths } from '../../../../utils/bezierPath';

// Local helpers that remain specific to this modal are below.
// Shared helpers (TrendIcon, getTrendToneClass, getGoalAlignmentText,
// getGoalWeeklyTarget, formatWeeklyRate, formatTooltipDate,
// getOldDataWarningText) are imported from utils/trackerHelpers.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const Y_TICK_COUNT = 7;
const MIN_VISIBLE_BODY_FAT_RANGE = 4;
const MIN_RANGE_PADDING = 0.5;
const BASELINE_Y_OFFSET = 0;
const TOOLTIP_WIDTH = 120;
const TOOLTIP_VERTICAL_OFFSET = 27;
const SCROLL_SETTLE_DELAY_MS = 140;

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

// formatTooltipDate is now imported from utils/trackerHelpers

const getWeekday = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const isFirstDayOfYearUtc = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.getUTCMonth() === 0 && date.getUTCDate() === 1;
};

const getDaysInMonthUtc = (year, monthIndex) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const getTrackedDaysCount = (entries = []) => {
  if (!entries.length) return 0;
  return new Set(entries.map((entry) => entry?.date).filter(Boolean)).size;
};

// getDataAgeInDays + getOldDataWarningText are now imported from utils/trackerHelpers

/** Produce a YYYY-MM-DD string from a Date in UTC */
const toDateKey = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Chart data helpers (per-page)
// ---------------------------------------------------------------------------

const computeChartData = (values, minRange = MIN_VISIBLE_BODY_FAT_RANGE) => {
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

  return { minValue: minVal, maxValue: maxVal, range };
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export const BodyFatTrackerModal = ({
  isOpen,
  isClosing,
  entries,
  latestBodyFat,
  selectedGoal = 'maintenance',
  onClose,
  onAddEntry,
  onEditEntry,
  onSwitchToWeight,
}) => {
  // Store fallback
  const store = useEnergyMapStore(
    (state) => ({
      bodyFatEntries: state.bodyFatEntries ?? [],
      latestBodyFat: state.userData.bodyFatEntries?.at?.(-1)?.bodyFat ?? null,
    }),
    shallow
  );
  const resolvedEntries = entries ?? store.bodyFatEntries;
  const resolvedLatestBodyFat = latestBodyFat ?? store.latestBodyFat;

  // --- State ---
  const [viewMode, setViewMode] = useState('7d');
  const [, setActivePageIndex] = useState(-1);
  const [settledPageIndex, setSettledPageIndex] = useState(-1);
  const [selectedDate, setSelectedDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [graphViewportWidth, setGraphViewportWidth] = useState(0);
  const [graphViewportHeight, setGraphViewportHeight] = useState(0);

  const carouselRef = useRef(null);
  const tooltipRef = useRef(null);
  const scrollCloseTimeoutRef = useRef(null);
  const headerSettleTimeoutRef = useRef(null);
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
    () => sortBodyFatEntries(resolvedEntries ?? []),
    [resolvedEntries]
  );

  const trend = useMemo(
    () => calculateBodyFatTrend(sortedEntries),
    [sortedEntries]
  );
  const trend7d = useMemo(
    () => calculateBodyFatTrend(sortedEntries, 7),
    [sortedEntries]
  );
  const trendVisual30d = useMemo(
    () => getGoalAlignedStyle(trend, selectedGoal, 'bodyFat'),
    [trend, selectedGoal]
  );
  const trendVisual7d = useMemo(
    () => getGoalAlignedStyle(trend7d, selectedGoal, 'bodyFat'),
    [trend7d, selectedGoal]
  );
  const trendVisual = viewMode === '7d' ? trendVisual7d : trendVisual30d;
  const goalAlignment = useMemo(
    () => getGoalAlignmentText(trend.weeklyRate, selectedGoal, 'bodyFat'),
    [trend.weeklyRate, selectedGoal]
  );
  const goalAlignment7d = useMemo(
    () => getGoalAlignmentText(trend7d.weeklyRate, selectedGoal, 'bodyFat'),
    [trend7d.weeklyRate, selectedGoal]
  );

  // Rolling averages
  const avg7 = useMemo(
    () => calculateNDayBodyFatAverage(sortedEntries, 7),
    [sortedEntries]
  );
  const avg14 = useMemo(
    () => calculateNDayBodyFatAverage(sortedEntries, 14),
    [sortedEntries]
  );

  // Monthly groups for 12m mode
  const monthGroups = useMemo(
    () => groupBodyFatEntriesByMonth(sortedEntries),
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

  // Pages concept removed — all modes now use continuous sliding windows

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
    setActivePageIndex(-1);
    setSettledPageIndex(-1);
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
      setSettledPageIndex(-1);
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
    setSettledPageIndex(-1);
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
    const windowSize = viewMode === '7d' ? 7 : viewMode === '30d' ? 30 : 12;
    const step = node.clientWidth / windowSize;
    const idx = Math.round(node.scrollLeft / step);
    setActivePageIndex(idx);
    if (headerSettleTimeoutRef.current) {
      clearTimeout(headerSettleTimeoutRef.current);
    }
    headerSettleTimeoutRef.current = setTimeout(() => {
      setSettledPageIndex(idx);
      headerSettleTimeoutRef.current = null;
    }, SCROLL_SETTLE_DELAY_MS);
    // Close tooltip on scroll
    if (selectedDate) {
      setTooltipClosing(true);
      setTimeout(() => {
        setSelectedDate(null);
        setTooltipClosing(false);
      }, 150);
    }
  }, [selectedDate, viewMode]);

  // --- Global chart data (used for Y-axis in all modes) ---
  const globalChartData = useMemo(() => {
    if (viewMode === '12m') {
      const values = filledMonthGroups
        .filter((m) => !m.isEmpty && m.avg != null)
        .map((m) => m.avg);
      return values.length ? computeChartData(values) : null;
    }
    if (!sortedEntries.length) return null;
    return computeChartData(sortedEntries.map((e) => e.bodyFat));
  }, [viewMode, sortedEntries, filledMonthGroups]);

  // Chart data used for Y-axis display — always global for smooth continuous scrolling
  const effectiveChartData = globalChartData;

  const chartWidth = graphViewportWidth || 300;

  // Build calendar-based timeline for 7d: includes all days from first to last entry
  const timeline7d = useMemo(() => {
    if (viewMode !== '7d' || !sortedEntries.length)
      return { days: [], totalSlots: 0 };
    const firstDate = new Date(sortedEntries[0].date + 'T00:00:00Z');
    const lastDate7d = new Date(
      sortedEntries[sortedEntries.length - 1].date + 'T00:00:00Z'
    );
    const calendarDays = Math.round((lastDate7d - firstDate) / 86400000) + 1;
    const padding = Math.max(6, 7 - calendarDays);
    const totalSlots = calendarDays + padding;
    const entryMap = new Map(sortedEntries.map((e) => [e.date, e]));
    const days = [];
    for (let i = 0; i < padding; i++) {
      const d = new Date(firstDate);
      d.setUTCDate(d.getUTCDate() - (padding - i));
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
    return { days, totalSlots };
  }, [viewMode, sortedEntries]);

  // Build continuous timeline for 30d mode
  const timeline30d = useMemo(() => {
    if (viewMode !== '30d' || !sortedEntries.length)
      return { days: [], totalSlots: 0 };
    const firstDate = new Date(sortedEntries[0].date + 'T00:00:00Z');
    const lastDate = new Date(
      sortedEntries[sortedEntries.length - 1].date + 'T00:00:00Z'
    );
    const calendarDays = Math.round((lastDate - firstDate) / 86400000) + 1;
    const padding = Math.max(29, 30 - calendarDays);
    const totalSlots = calendarDays + padding;
    const entryMap = new Map(sortedEntries.map((e) => [e.date, e]));
    const days = [];
    for (let i = 0; i < padding; i++) {
      const d = new Date(firstDate);
      d.setUTCDate(d.getUTCDate() - (padding - i));
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
    return { days, totalSlots };
  }, [viewMode, sortedEntries]);

  // Build continuous timeline for 12m mode
  const timeline12m = useMemo(() => {
    if (viewMode !== '12m' || !filledMonthGroups.length)
      return { months: [], totalSlots: 0 };
    const padding = Math.max(11, 12 - filledMonthGroups.length);
    const totalSlots = filledMonthGroups.length + padding;
    const months = [];
    const firstGroup = filledMonthGroups[0];
    for (let i = padding; i > 0; i--) {
      const d = new Date(Date.UTC(firstGroup.year, firstGroup.month - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      months.push({
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
    filledMonthGroups.forEach((m) => {
      months.push(m);
    });
    return { months, totalSlots };
  }, [viewMode, filledMonthGroups]);

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
          (slot.entry.bodyFat - globalChartData.minValue) /
          globalChartData.range;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const y = (1 - bounded) * chartHeight;
        return { date: slot.date, value: slot.entry.bodyFat, x, y };
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

  // 30d continuous: all points in global coordinate space
  const allPoints30d = useMemo(() => {
    if (viewMode !== '30d' || !sortedEntries.length || !globalChartData)
      return [];
    const { days } = timeline30d;
    const STEP = chartWidth / 30;
    const PAD = STEP / 2;
    return days
      .map((slot, i) => {
        if (!slot.entry) return null;
        const x = PAD + i * STEP;
        const norm =
          (slot.entry.bodyFat - globalChartData.minValue) /
          globalChartData.range;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const y = (1 - bounded) * chartHeight;
        return { date: slot.date, value: slot.entry.bodyFat, x, y };
      })
      .filter(Boolean);
  }, [
    viewMode,
    sortedEntries,
    globalChartData,
    chartWidth,
    chartHeight,
    timeline30d,
  ]);

  // 12m continuous: all points in global coordinate space
  const allPoints12m = useMemo(() => {
    if (viewMode !== '12m' || !filledMonthGroups.length || !globalChartData)
      return [];
    const { months } = timeline12m;
    const STEP = chartWidth / 12;
    const PAD = STEP / 2;
    return months
      .map((m, i) => {
        if (m.isEmpty || m.avg == null) return null;
        const x = PAD + i * STEP;
        const norm = (m.avg - globalChartData.minValue) / globalChartData.range;
        const bounded = Math.min(Math.max(norm, 0), 1);
        const y = (1 - bounded) * chartHeight;
        return { date: m.key, value: m.avg, x, y, label: m.label };
      })
      .filter(Boolean);
  }, [
    viewMode,
    filledMonthGroups,
    globalChartData,
    chartWidth,
    chartHeight,
    timeline12m,
  ]);

  // Y ticks (use effectiveChartData — global for 7d, per-page for 30d/12m)
  const yTicks = useMemo(() => {
    if (!effectiveChartData) return [];
    const steps = Math.max(Y_TICK_COUNT - 1, 1);
    return Array.from(
      { length: Y_TICK_COUNT },
      (_, i) =>
        effectiveChartData.maxValue - (effectiveChartData.range / steps) * i
    );
  }, [effectiveChartData]);

  const yTickPositions = useMemo(() => {
    if (!effectiveChartData || chartHeight <= 0) return [];
    return yTicks.map((val, index) => {
      const norm =
        (val - effectiveChartData.minValue) / effectiveChartData.range;
      const bounded = Math.min(Math.max(norm, 0), 1);
      const y = (1 - bounded) * chartHeight;
      const isTop = index === 0;
      const isBottom = index === yTicks.length - 1;
      const lineY = isTop ? 0 : isBottom ? chartHeight : y;
      return { value: val, index, lineY };
    });
  }, [effectiveChartData, chartHeight, yTicks]);

  // Current body fat tick on y-axis
  const latestBf = sortedEntries.length
    ? sortedEntries[sortedEntries.length - 1].bodyFat
    : resolvedLatestBodyFat;

  const currentBfTick = useMemo(() => {
    if (!effectiveChartData || !Number.isFinite(latestBf)) return null;
    const norm =
      (latestBf - effectiveChartData.minValue) / effectiveChartData.range;
    const bounded = Math.min(Math.max(norm, 0), 1);
    const y = (1 - bounded) * chartHeight;
    return { yPx: y, value: latestBf };
  }, [effectiveChartData, chartHeight, latestBf]);

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

  const currentBfDisplay = (() => {
    const formatted = formatBodyFat(latestBf);
    return formatted ? `${formatted}%` : '—';
  })();

  const weeklyRate7dDisplay = formatWeeklyRate(trend7d.weeklyRate, 'bodyFat');

  const weeklyRateDisplay = formatWeeklyRate(trend.weeklyRate, 'bodyFat');

  // Per-page dynamic stat for 30d and 12m
  const pageAverage = useMemo(() => {
    if (viewMode === '30d') {
      const { days } = timeline30d;
      if (!days.length) return null;
      const startIdx = Math.max(
        0,
        Math.min(
          settledPageIndex >= 0 ? settledPageIndex : days.length - 30,
          days.length - 30
        )
      );
      const windowDays = days.slice(startIdx, startIdx + 30);
      const vals = windowDays
        .filter((d) => d.entry)
        .map((d) => d.entry.bodyFat);
      if (!vals.length) return null;
      return (
        Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      );
    }
    if (viewMode === '12m') {
      const { months } = timeline12m;
      if (!months.length) return null;
      const startIdx = Math.max(
        0,
        Math.min(
          settledPageIndex >= 0 ? settledPageIndex : months.length - 12,
          months.length - 12
        )
      );
      const windowMonths = months.slice(startIdx, startIdx + 12);
      const vals = windowMonths.filter((m) => m.avg != null).map((m) => m.avg);
      if (!vals.length) return null;
      return (
        Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      );
    }
    return null;
  }, [viewMode, timeline30d, timeline12m, settledPageIndex]);

  const visibleWindowTrackedDays = useMemo(() => {
    if (viewMode !== '12m') return 0;
    const { months } = timeline12m;
    if (!months.length) return 0;
    const startIdx = Math.max(
      0,
      Math.min(
        settledPageIndex >= 0 ? settledPageIndex : months.length - 12,
        months.length - 12
      )
    );
    const windowMonths = months.slice(startIdx, startIdx + 12);
    return windowMonths.reduce(
      (sum, m) => sum + getTrackedDaysCount(m.entries),
      0
    );
  }, [viewMode, timeline12m, settledPageIndex]);

  const pageTimeframeRange = useMemo(() => {
    if (viewMode === '30d') {
      const { days } = timeline30d;
      if (!days.length) return '';
      const startIdx = Math.max(
        0,
        Math.min(
          settledPageIndex >= 0 ? settledPageIndex : days.length - 30,
          days.length - 30
        )
      );
      const windowDays = days.slice(startIdx, startIdx + 30);
      return `${formatShortDate(windowDays[0]?.date)} - ${formatShortDate(windowDays[windowDays.length - 1]?.date)}`;
    }
    if (viewMode === '12m') {
      const { months } = timeline12m;
      if (!months.length) return '';
      const startIdx = Math.max(
        0,
        Math.min(
          settledPageIndex >= 0 ? settledPageIndex : months.length - 12,
          months.length - 12
        )
      );
      const windowMonths = months.slice(startIdx, startIdx + 12);
      return `${formatShortDate(windowMonths[0]?.key + '-01')} - ${formatShortDate(windowMonths[windowMonths.length - 1]?.key + '-28')}`;
    }
    return '';
  }, [viewMode, timeline30d, timeline12m, settledPageIndex]);

  // --- Tooltip ---
  const selectedPoint = useMemo(() => {
    if (!selectedDate) return null;
    if (viewMode === '7d') {
      const real = allPoints7d.find((p) => p.date === selectedDate);
      if (real) return real;
      const slotIdx = timeline7d.days.findIndex((d) => d.date === selectedDate);
      if (slotIdx >= 0) {
        const STEP = chartWidth / 7;
        const PAD = STEP / 2;
        return {
          date: selectedDate,
          value: null,
          x: PAD + slotIdx * STEP,
          y: chartHeight,
          isGhost: true,
        };
      }
      return null;
    }
    if (viewMode === '30d') {
      const real = allPoints30d.find((p) => p.date === selectedDate);
      if (real) return real;
      const slotIdx = timeline30d.days.findIndex(
        (d) => d.date === selectedDate
      );
      if (slotIdx >= 0) {
        const STEP = chartWidth / 30;
        const PAD = STEP / 2;
        return {
          date: selectedDate,
          value: null,
          x: PAD + slotIdx * STEP,
          y: chartHeight,
          isGhost: true,
        };
      }
      return null;
    }
    if (viewMode === '12m') {
      return allPoints12m.find((p) => p.date === selectedDate) ?? null;
    }
    return null;
  }, [
    selectedDate,
    viewMode,
    allPoints7d,
    allPoints30d,
    allPoints12m,
    timeline7d,
    timeline30d,
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

  useEffect(
    () => () => {
      if (headerSettleTimeoutRef.current) {
        clearTimeout(headerSettleTimeoutRef.current);
      }
    },
    []
  );

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
    // All modes now use continuous scrolling — account for scroll offset
    const rect = node.getBoundingClientRect();
    const rawX = rect.left + selectedPoint.x - node.scrollLeft;
    const rawY = rect.top + 16 + selectedPoint.y;
    setTooltipPosition({ x: rawX, y: rawY });
  }, [selectedPoint]);

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

  // --- Render continuous chart (shared helper) ---
  const renderContinuousChart = (
    points,
    timeline,
    windowSize,
    gradIdSuffix,
    strokeW = '3'
  ) => {
    const STEP = chartWidth / windowSize;
    const totalSlots = timeline.length;
    const totalWidth = totalSlots * STEP;

    const pts = points.map((p) => ({ x: p.x, y: p.y }));
    const { pathData, areaData } = buildBezierPaths(pts, {
      chartWidth: totalWidth,
      chartHeight,
      extendToEdges: true,
      singlePointStretch: pts.length === 1,
    });

    const gradId = `areaGradient-bf-${gradIdSuffix}`;

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

            {/* Grid lines spanning full width */}
            {yTickPositions.map(({ index: gi, lineY }) => {
              const isBaseline = gi === yTickPositions.length - 1;
              const yVal = isBaseline ? getBaselineY(lineY) : lineY;
              return (
                <line
                  key={`grid-${gi}`}
                  x1={0}
                  y1={yVal}
                  x2={totalWidth}
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

            {/* Area fill */}
            {areaData && <path d={areaData} fill={`url(#${gradId})`} />}

            {/* Line */}
            {pathData && (
              <path
                d={pathData}
                fill="none"
                stroke={trendVisual.color}
                strokeWidth={strokeW}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Points */}
            {points.map((p) => (
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

        {/* Per-slot snap targets + timeline labels */}
        <div className="flex h-full">{timeline.map((slot) => slot)}</div>
      </div>
    );
  };

  // --- Render 7d continuous chart ---
  const render7dContinuous = () => {
    if (!globalChartData || !allPoints7d.length) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-lg">No body fat data yet.</p>
        </div>
      );
    }

    const STEP = chartWidth / 7;
    const firstRenderedDateByYear = new Map();
    timeline7d.days.forEach((slot) => {
      const yearKey = slot.date?.slice?.(0, 4);
      if (yearKey && !firstRenderedDateByYear.has(yearKey)) {
        firstRenderedDateByYear.set(yearKey, slot.date);
      }
    });
    const timelineSlots = timeline7d.days.map((s) => {
      const hasEntry = !!s.entry;
      const isEmpty = !hasEntry;
      const yearKey = s.date.slice(0, 4);
      const showYear =
        isFirstDayOfYearUtc(s.date) ||
        firstRenderedDateByYear.get(yearKey) === s.date;
      return (
        <div
          key={s.date}
          className="flex-shrink-0 flex flex-col justify-end"
          style={{ width: `${STEP}px`, scrollSnapAlign: 'start' }}
        >
          <div className="pb-2">
            <div
              className="relative"
              style={{ height: `${TIMELINE_TRACK_HEIGHT}px` }}
            >
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer"
                data-date-label
                style={{ left: `${STEP / 2}px` }}
                onClick={(e) => handleLabelClick(s.date, e)}
              >
                <div className="flex flex-col items-center leading-none">
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
                  {showYear && (
                    <span
                      className={`mt-0.5 text-[9px] font-medium ${isEmpty ? 'text-muted/30' : 'text-muted/70'}`}
                    >
                      {yearKey}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    });

    return renderContinuousChart(allPoints7d, timelineSlots, 7, '7d-cont', '3');
  };

  // --- Render 30d continuous chart ---
  const render30dContinuous = () => {
    if (!globalChartData || !allPoints30d.length) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-lg">No body fat data yet.</p>
        </div>
      );
    }

    const STEP = chartWidth / 30;
    const firstRenderedDateByYear = new Map();
    timeline30d.days.forEach((slot, index) => {
      if (index % 5 !== 0) return;
      const yearKey = slot.date?.slice?.(0, 4);
      if (yearKey && !firstRenderedDateByYear.has(yearKey)) {
        firstRenderedDateByYear.set(yearKey, slot.date);
      }
    });
    const timelineSlots = timeline30d.days.map((s, i) => {
      const showLabel = i % 5 === 0;
      const hasEntry = !!s.entry;
      const yearKey = s.date.slice(0, 4);
      const showYear =
        showLabel &&
        (isFirstDayOfYearUtc(s.date) ||
          firstRenderedDateByYear.get(yearKey) === s.date);
      return (
        <div
          key={s.date}
          className="flex-shrink-0 flex flex-col justify-end"
          style={{ width: `${STEP}px`, scrollSnapAlign: 'start' }}
        >
          <div className="pb-2">
            <div
              className="relative"
              style={{ height: `${TIMELINE_TRACK_HEIGHT}px` }}
            >
              {showLabel && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer"
                  data-date-label
                  style={{ left: `${STEP / 2}px` }}
                  onClick={(e) => handleLabelClick(s.date, e)}
                >
                  <div className="flex flex-col items-center leading-none">
                    <span
                      className={`text-[11px] font-semibold whitespace-nowrap ${
                        !hasEntry
                          ? 'text-muted/30'
                          : s.date === latestDate
                            ? 'text-accent-blue'
                            : 'text-muted'
                      }`}
                    >
                      {formatTimelineLabel(s.date)}
                    </span>
                    {showYear && (
                      <span
                        className={`mt-0.5 text-[9px] font-medium ${!hasEntry ? 'text-muted/30' : 'text-muted/70'}`}
                      >
                        {yearKey}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    });

    return renderContinuousChart(
      allPoints30d,
      timelineSlots,
      30,
      '30d-cont',
      '2'
    );
  };

  // --- Render 12m continuous chart ---
  const render12mContinuous = () => {
    if (!globalChartData || !allPoints12m.length) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-lg">No body fat data yet.</p>
        </div>
      );
    }

    const STEP = chartWidth / 12;
    const timelineSlots = timeline12m.months.map((m) => (
      <div
        key={m.key}
        className="flex-shrink-0 flex flex-col justify-end"
        style={{ width: `${STEP}px`, scrollSnapAlign: 'start' }}
      >
        <div className="pb-2">
          <div
            className="relative"
            style={{ height: `${TIMELINE_TRACK_HEIGHT}px` }}
          >
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer"
              data-date-label
              style={{ left: `${STEP / 2}px` }}
              onClick={(e) => handleLabelClick(m.key, e)}
            >
              <div className="flex flex-col items-center leading-none">
                <span
                  className={`text-[11px] font-semibold whitespace-nowrap ${
                    m.isEmpty ? 'text-muted/30' : 'text-muted'
                  }`}
                >
                  {m.label}
                </span>
                {m.month === 0 && (
                  <span
                    className={`mt-0.5 text-[9px] font-medium ${m.isEmpty ? 'text-muted/30' : 'text-muted/70'}`}
                  >
                    {m.year}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    ));

    return renderContinuousChart(
      allPoints12m,
      timelineSlots,
      12,
      '12m-cont',
      '3'
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
              Body Fat Tracker
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onSwitchToWeight?.()}
            className="px-4 py-2 rounded-md bg-accent-blue text-white text-sm font-semibold md:hover:brightness-110 transition-colors flex items-center press-feedback focus-ring"
            aria-label="Switch to weight tracker"
          >
            <Repeat size={16} className="mr-2 opacity-90" />
            Weight
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
              viewMode === '12m' ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'
            }`}
          >
            {viewMode === '7d' ? (
              <>
                {/* Current Body Fat */}
                <div>
                  <p className="text-muted text-xs uppercase tracking-wide mb-1">
                    Current Body Fat
                  </p>
                  <p className="text-foreground text-2xl font-bold">
                    {currentBfDisplay}
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
                        {avg7 != null ? `${formatBodyFat(avg7)}%` : '—'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted text-[11px]">14d</span>
                      <span className="text-foreground text-sm font-semibold">
                        {avg14 != null ? `${formatBodyFat(avg14)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* 7-Day Trend */}
                <div>
                  <button
                    type="button"
                    onClick={openTrendInfo}
                    aria-label="7-day trend details"
                    className="text-muted text-xs uppercase tracking-wide mb-1 md:hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 group focus-ring"
                  >
                    7-Day Trend
                    <Info
                      size={14}
                      className="opacity-60 md:group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                  <p
                    className={`${getTrendToneClass(trend7d, selectedGoal, 'bodyFat')} font-semibold text-lg flex items-center gap-2`}
                  >
                    <TrendIcon direction={trend7d.direction} />
                    {trend7d.label}
                  </p>
                  {goalAlignment7d && (
                    <p
                      className={`${goalAlignment7d.color} text-xs mt-1 font-medium`}
                    >
                      {goalAlignment7d.text}
                    </p>
                  )}
                </div>
                {/* 7-Day Rate */}
                <div>
                  <button
                    type="button"
                    onClick={openTrendInfo}
                    aria-label="7-day rate details"
                    className="text-muted text-xs uppercase tracking-wide mb-1 md:hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 group focus-ring"
                  >
                    7-Day Rate
                    <Info
                      size={14}
                      className="opacity-60 md:group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                  <p className="text-foreground text-lg font-semibold">
                    {weeklyRate7dDisplay}
                  </p>
                  <p className="text-muted text-xs mt-1">
                    Goal: {getGoalWeeklyTarget(selectedGoal, 'bodyFat')}
                  </p>
                </div>
              </>
            ) : (
              <>
                {viewMode === '30d' ? (
                  <>
                    {/* Current Body Fat */}
                    <div>
                      <p className="text-muted text-xs uppercase tracking-wide mb-1">
                        Current Body Fat
                      </p>
                      <p className="text-foreground text-2xl font-bold">
                        {currentBfDisplay}
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
                    {/* 30 Day Avg */}
                    <div>
                      <p className="text-muted text-xs uppercase tracking-wide mb-1">
                        30-Day Avg
                      </p>
                      <p className="text-foreground text-2xl font-bold">
                        {pageAverage != null
                          ? `${formatBodyFat(pageAverage)}%`
                          : '—'}
                      </p>
                      <p className="text-muted text-[11px] mt-1">
                        {pageTimeframeRange}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 12 Month Avg */}
                    <div>
                      <p className="text-muted text-xs uppercase tracking-wide mb-1">
                        12-Month Avg
                      </p>
                      <p className="text-foreground text-2xl font-bold">
                        {pageAverage != null
                          ? `${formatBodyFat(pageAverage)}%`
                          : '—'}
                      </p>
                      <p className="text-muted text-[11px] mt-1">
                        Current: {currentBfDisplay}
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
                        {`${visibleWindowTrackedDays} days tracked`}
                      </p>
                    </div>
                  </>
                )}
                {viewMode === '30d' && (
                  <>
                    {/* 30-Day Trend */}
                    <div>
                      <button
                        type="button"
                        onClick={openTrendInfo}
                        aria-label="30-day trend details"
                        className="text-muted text-xs uppercase tracking-wide mb-1 md:hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 group focus-ring"
                      >
                        30-Day Trend
                        <Info
                          size={14}
                          className="opacity-60 md:group-hover:opacity-100 transition-opacity"
                        />
                      </button>
                      <p
                        className={`${getTrendToneClass(trend, selectedGoal, 'bodyFat')} font-semibold text-lg flex items-center gap-2`}
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
                    {/* 30-Day Rate */}
                    <div>
                      <button
                        type="button"
                        onClick={openTrendInfo}
                        aria-label="30-day rate details"
                        className="text-muted text-xs uppercase tracking-wide mb-1 md:hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 group focus-ring"
                      >
                        30-Day Rate
                        <Info
                          size={14}
                          className="opacity-60 md:group-hover:opacity-100 transition-opacity"
                        />
                      </button>
                      <p className="text-foreground text-lg font-semibold">
                        {weeklyRateDisplay}
                      </p>
                      <p className="text-muted text-xs mt-1">
                        Goal: {getGoalWeeklyTarget(selectedGoal, 'bodyFat')}
                      </p>
                    </div>
                  </>
                )}
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
                    scrollSnapType: 'x proximity',
                    WebkitOverflowScrolling: 'touch',
                  }}
                  onScroll={handleCarouselScroll}
                >
                  {viewMode === '7d' ? (
                    render7dContinuous()
                  ) : viewMode === '30d' ? (
                    render30dContinuous()
                  ) : viewMode === '12m' ? (
                    render12mContinuous()
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-muted text-lg">
                        No body fat data yet.
                      </p>
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
                    ? yTickPositions.map(({ value, index, lineY }) => (
                        <div
                          key={`tick-${index}`}
                          className="absolute right-2 text-sm font-semibold text-foreground/70 tracking-tight text-right"
                          style={{
                            top: `${lineY}px`,
                            transform: 'translateY(-50%)',
                            transition: 'top 0.3s ease-out',
                          }}
                        >
                          {formatBodyFat(value)}
                        </div>
                      ))
                    : null}
                  {currentBfTick &&
                    (viewMode === '7d' || viewMode === '30d') && (
                      <div
                        className="absolute right-0.5 px-2.5 py-1 rounded-lg text-[12px] font-bold text-white shadow-md flex items-center justify-center leading-none"
                        style={{
                          top: `${currentBfTick.yPx}px`,
                          transform: 'translateY(-50%)',
                          transition: 'top 0.3s ease-out',
                          backgroundColor: `${trendVisual.color}cc`,
                          borderColor: trendVisual.color,
                          borderWidth: '1px',
                        }}
                      >
                        {formatBodyFat(currentBfTick.value)}
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
                  ? 'Edit body fat entry'
                  : 'Add body fat entry'
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
                      {formatBodyFat(monthsMap[selectedDate].avg)}%
                    </p>
                    <p className="text-muted text-[10px] mt-2 uppercase tracking-wide">
                      {(() => {
                        const month = monthsMap[selectedDate];
                        if (!month) return '0/0 days tracked';
                        const trackedDays = getTrackedDaysCount(month.entries);
                        const daysInMonth = getDaysInMonthUtc(
                          month.year,
                          month.month
                        );
                        return `${trackedDays}/${daysInMonth} days tracked`;
                      })()}
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
                      {formatBodyFat(entriesMap[selectedDate].bodyFat)}%
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

      {/* Body Fat Trend Info Modal */}
      <BodyFatTrendInfoModal
        isOpen={isTrendInfoOpen}
        isClosing={isTrendInfoClosing}
        trend={viewMode === '7d' ? trend7d : trend}
        selectedGoal={selectedGoal}
        onClose={closeTrendInfo}
      />
    </>
  );
};
