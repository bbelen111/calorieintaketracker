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
import { ModalShell } from '../common/ModalShell';
import {
  calculateWeightTrend,
  formatWeight,
  sortWeightEntries,
} from '../../../utils/weight';
import {
  getGoalAlignedStyle,
  getGoalAlignedTextClass,
} from '../../../utils/goalAlignment';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { WeightTrendInfoModal } from './WeightTrendInfoModal';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

const TrendIcon = ({ direction }) => {
  if (direction === 'up') {
    return <TrendingUp size={18} />;
  }
  if (direction === 'down') {
    return <TrendingDown size={18} />;
  }
  return <Minus size={18} />;
};

const getTrendToneClass = (trend, selectedGoal) => {
  // If no meaningful data, show white
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

  // Map goals to expected weekly rates (rough estimates in kg/week)
  const goalExpectations = {
    aggressive_bulk: { min: 0.5, max: 1.0, direction: 'up' },
    bulking: { min: 0.25, max: 0.5, direction: 'up' },
    maintenance: { min: -0.1, max: 0.1, direction: 'flat' },
    cutting: { min: 0.25, max: 0.5, direction: 'down' },
    aggressive_cut: { min: 0.5, max: 1.0, direction: 'down' },
  };

  const expectation = goalExpectations[selectedGoal];
  if (!expectation) return null;

  // Determine actual direction
  let actualDirection = 'flat';
  if (weeklyRate < -0.1) actualDirection = 'down';
  else if (weeklyRate > 0.1) actualDirection = 'up';

  // Check if direction matches goal
  if (
    actualDirection !== expectation.direction &&
    expectation.direction !== 'flat'
  ) {
    if (expectation.direction === 'up') {
      return { text: 'Not gaining as expected', color: 'text-accent-yellow' };
    }
    if (expectation.direction === 'down') {
      return { text: 'Not losing as expected', color: 'text-accent-yellow' };
    }
  }

  // Check if rate is within expected range
  if (expectation.direction === 'flat') {
    if (absRate <= 0.1) {
      return { text: 'On track with goal', color: 'text-accent-green' };
    }
    return { text: 'Deviating from maintenance', color: 'text-accent-yellow' };
  }

  const expectedRate =
    expectation.direction === 'down' ? -weeklyRate : weeklyRate;

  if (expectedRate >= expectation.min && expectedRate <= expectation.max) {
    return { text: 'On track with goal', color: 'text-accent-green' };
  }

  if (expectedRate < expectation.min) {
    return { text: 'Slower than goal target', color: 'text-accent-blue' };
  }

  if (expectedRate > expectation.max) {
    return { text: 'Faster than goal target', color: 'text-accent-yellow' };
  }

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

const DATE_COLUMN_WIDTH = 55;
const DATE_COLUMN_GAP = 8;
const Y_TICK_COUNT = 7;
// Visual padding when stretching across the viewport
const LEFT_EDGE_PADDING_GRAPH = 8; // tiny base value; additional leading space applied below
const RIGHT_EDGE_PADDING_GRAPH = 10; // small extra so the line/area can extend slightly
const LEFT_EDGE_PADDING_TIMELINE = DATE_COLUMN_WIDTH / 2; // base offset; combined with leading space for earliest entry
const RIGHT_EDGE_PADDING_TIMELINE = 16;
const MIN_VISIBLE_WEIGHT_RANGE = 6;
const MIN_RANGE_PADDING = 0.5;
const TIMELINE_TRACK_HEIGHT = 56;
const BASELINE_Y_OFFSET = 18;
const LEADING_ENTRY_SPACE = 45;
const FIRST_ENTRY_CENTER_OFFSET = LEADING_ENTRY_SPACE + DATE_COLUMN_WIDTH / 2;
const TOOLTIP_WIDTH = 144;
const TOOLTIP_VERTICAL_OFFSET = 17;
const POINT_RADIUS = 6;
const POINT_HIT_RADIUS = 12;
const DATA_OLD_WARNING_DAYS = 1;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getBaselineY = (defaultY) => defaultY - BASELINE_Y_OFFSET;

const getColumnsWidth = (count) => {
  if (count <= 0) {
    return 0;
  }
  const gaps = Math.max(0, count - 1) * DATE_COLUMN_GAP;
  return count * DATE_COLUMN_WIDTH + gaps;
};

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const formatTimelineLabel = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
};

// Short uppercase month date format e.g. "OCT 10, 2025"
const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00Z');
  const parts = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  // Uppercase the month abbreviation (first token)
  return parts.replace(/^[A-Za-z]{3}/, (m) => m.toUpperCase());
};
// Helper to format date for tooltip
const formatTooltipDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// Helper to get weekday from date string
const getWeekday = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const getDataAgeInDays = (dateKey) => {
  if (!dateKey) return null;

  const entryDate = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(entryDate.getTime())) {
    return null;
  }

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
  if (!Number.isFinite(ageDays) || ageDays < DATA_OLD_WARNING_DAYS) {
    return null;
  }

  const dayLabel = ageDays === 1 ? 'day' : 'days';
  return `${ageDays} ${dayLabel} old`;
};

export const WeightTrackerModal = ({
  isOpen,
  isClosing,
  entries,
  latestWeight,
  selectedGoal = 'maintenance',
  phases,
  onClose,
  onAddEntry,
  onEditEntry,
  canSwitchToBodyFat = false,
  onSwitchToBodyFat,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      weightEntries: state.weightEntries ?? [],
      phases: state.phases ?? [],
      latestWeight: state.userData.weight,
    }),
    shallow
  );
  const resolvedEntries = entries ?? store.weightEntries;
  const resolvedPhases = phases ?? store.phases;
  const resolvedLatestWeight = latestWeight ?? store.latestWeight;
  const [selectedDate, setSelectedDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedTimeframe, setSelectedTimeframe] = useState('all');
  const [isTimeframeDropdownOpen, setIsTimeframeDropdownOpen] = useState(false);
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [isPhaseDropdownOpen, setIsPhaseDropdownOpen] = useState(false);
  const graphScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeframeDropdownRef = useRef(null);
  const phaseDropdownRef = useRef(null);
  const scrollCloseTimeoutRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [graphViewportWidth, setGraphViewportWidth] = useState(0);
  const [graphViewportHeight, setGraphViewportHeight] = useState(0);
  const prevEntriesLengthRef = useRef(resolvedEntries?.length ?? 0);

  // Weight Trend Info Modal
  const {
    isOpen: isTrendInfoOpen,
    isClosing: isTrendInfoClosing,
    open: openTrendInfo,
    requestClose: closeTrendInfo,
  } = useAnimatedModal();

  const sortedEntries = useMemo(
    () => sortWeightEntries(resolvedEntries ?? []),
    [resolvedEntries]
  );

  // Get selected phase object
  const selectedPhase = useMemo(() => {
    if (!selectedPhaseId) return null;
    return resolvedPhases.find((p) => p.id === selectedPhaseId) || null;
  }, [resolvedPhases, selectedPhaseId]);

  // Filter entries based on selected phase - read from daily logs if phase selected
  const phaseFilteredEntries = useMemo(() => {
    if (!selectedPhase) return sortedEntries;

    // Build weight entries from daily logs' weightRef
    const weightEntriesMap = new Map();
    sortedEntries.forEach((entry) => {
      weightEntriesMap.set(entry.date, entry);
    });

    const phaseWeightEntries = [];
    const includedDates = new Set();
    const dailyLogs = selectedPhase.dailyLogs || {};

    Object.values(dailyLogs).forEach((log) => {
      if (log.weightRef && log.weightRef.trim() !== '') {
        const weightEntry = weightEntriesMap.get(log.weightRef);
        if (weightEntry) {
          // Only add if not already included
          if (!includedDates.has(weightEntry.date)) {
            includedDates.add(weightEntry.date);
            phaseWeightEntries.push(weightEntry);
          }
        }
      }
    });

    // Sort by date
    return phaseWeightEntries.sort((a, b) => a.date.localeCompare(b.date));
  }, [sortedEntries, selectedPhase]);

  // Filter entries based on selected timeframe (within phase if selected)
  const filteredEntries = useMemo(() => {
    if (!phaseFilteredEntries.length) return [];
    if (selectedTimeframe === 'all') return phaseFilteredEntries;

    const latestEntry = phaseFilteredEntries[phaseFilteredEntries.length - 1];
    const latestDate = new Date(latestEntry.date + 'T00:00:00Z');

    const daysMap = {
      '7d': 7,
      '14d': 14,
      '30d': 30,
      '90d': 90,
    };

    const daysToSubtract = daysMap[selectedTimeframe];
    if (!daysToSubtract) return phaseFilteredEntries;

    const cutoffDate = new Date(latestDate);
    cutoffDate.setDate(cutoffDate.getDate() - daysToSubtract);

    return phaseFilteredEntries.filter((entry) => {
      const entryDate = new Date(entry.date + 'T00:00:00Z');
      return entryDate >= cutoffDate;
    });
  }, [phaseFilteredEntries, selectedTimeframe]);

  const trend = useMemo(
    () => calculateWeightTrend(filteredEntries),
    [filteredEntries]
  );
  const trendVisual = useMemo(
    () => getGoalAlignedStyle(trend, selectedGoal, 'weight'),
    [trend, selectedGoal]
  );
  const goalAlignment = useMemo(
    () => getGoalAlignmentText(trend.weeklyRate, selectedGoal),
    [trend.weeklyRate, selectedGoal]
  );

  useIsomorphicLayoutEffect(() => {
    const node = graphScrollRef.current;
    if (!node) {
      return undefined;
    }

    const updateDimensions = () => {
      setGraphViewportWidth(node.clientWidth);
      setGraphViewportHeight(node.clientHeight);
    };
    updateDimensions();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setGraphViewportWidth(entry.contentRect.width);
        setGraphViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [isOpen]);

  // Removed unused entryCount variable
  const filteredEntryCount = filteredEntries.length;

  const baseChartWidth = useMemo(() => {
    const baseWidth = getColumnsWidth(Math.max(filteredEntryCount, 1));
    if (filteredEntryCount > 0) {
      return baseWidth + LEADING_ENTRY_SPACE;
    }
    return baseWidth;
  }, [filteredEntryCount]);

  const chartWidth = useMemo(
    () => Math.max(baseChartWidth, graphViewportWidth || 0),
    [baseChartWidth, graphViewportWidth]
  );

  const shouldStretchAcrossViewport = useMemo(
    () => chartWidth > baseChartWidth,
    [chartWidth, baseChartWidth]
  );

  const chartHeight = useMemo(() => {
    if (graphViewportHeight && graphViewportHeight > 0) {
      return graphViewportHeight;
    }
    return 280;
  }, [graphViewportHeight]);

  const hasHorizontalOverflow = useMemo(() => {
    if (!graphViewportWidth) {
      return false;
    }
    return chartWidth > graphViewportWidth;
  }, [chartWidth, graphViewportWidth]);

  const xPositions = useMemo(() => {
    if (filteredEntryCount === 0) {
      return [];
    }

    if (!shouldStretchAcrossViewport) {
      const start = FIRST_ENTRY_CENTER_OFFSET;
      const step = DATE_COLUMN_WIDTH + DATE_COLUMN_GAP;
      return filteredEntries.map((_, index) => start + index * step);
    }

    if (filteredEntryCount === 1) {
      // Keep the point slightly inset from the left
      return [Math.max(FIRST_ENTRY_CENTER_OFFSET, chartWidth / 2)];
    }

    // Stretch to fill: minimal left padding, slight right padding
    const leftPad = Math.max(
      LEFT_EDGE_PADDING_GRAPH,
      FIRST_ENTRY_CENTER_OFFSET
    );
    const rightPad = RIGHT_EDGE_PADDING_GRAPH;
    const usableWidth = Math.max(chartWidth - leftPad - rightPad, 0);
    const step =
      filteredEntryCount > 1 ? usableWidth / (filteredEntryCount - 1) : 0;
    return filteredEntries.map((_, index) => leftPad + step * index);
  }, [
    chartWidth,
    filteredEntryCount,
    shouldStretchAcrossViewport,
    filteredEntries,
  ]);

  // Separate X positions for timeline labels so the first label rests flush on the left
  const timelineXPositions = useMemo(() => {
    if (filteredEntryCount === 0) return [];

    if (!shouldStretchAcrossViewport) {
      const start = FIRST_ENTRY_CENTER_OFFSET;
      const step = DATE_COLUMN_WIDTH + DATE_COLUMN_GAP;
      return filteredEntries.map((_, index) => start + index * step);
    }

    if (filteredEntryCount === 1) {
      return [Math.max(FIRST_ENTRY_CENTER_OFFSET, chartWidth / 2)];
    }

    const leftPad = Math.max(
      LEFT_EDGE_PADDING_TIMELINE,
      FIRST_ENTRY_CENTER_OFFSET
    );
    const rightPad = RIGHT_EDGE_PADDING_TIMELINE;
    const usableWidth = Math.max(chartWidth - leftPad - rightPad, 0);
    const step =
      filteredEntryCount > 1 ? usableWidth / (filteredEntryCount - 1) : 0;
    return filteredEntries.map((_, index) => leftPad + step * index);
  }, [
    chartWidth,
    filteredEntryCount,
    shouldStretchAcrossViewport,
    filteredEntries,
  ]);

  const chartData = useMemo(() => {
    if (filteredEntries.length === 0) {
      return null;
    }

    let visibleEntries = filteredEntries;
    if (
      graphViewportWidth > 0 &&
      xPositions.length === filteredEntries.length
    ) {
      const buffer = DATE_COLUMN_WIDTH * 2;
      visibleEntries = filteredEntries.filter((_, index) => {
        const x = xPositions[index];
        return (
          x >= scrollLeft - buffer &&
          x <= scrollLeft + graphViewportWidth + buffer
        );
      });
      if (visibleEntries.length === 0) {
        visibleEntries = filteredEntries;
      }
    }

    const weights = visibleEntries.map((entry) => entry.weight);
    let minWeight = Math.min(...weights);
    let maxWeight = Math.max(...weights);
    let range = maxWeight - minWeight;

    if (range === 0) {
      range = Math.max(MIN_VISIBLE_WEIGHT_RANGE, MIN_RANGE_PADDING * 2);
      const halfRange = range / 2;
      minWeight -= halfRange;
      maxWeight += halfRange;
    } else {
      const padding = Math.max(range * 0.1, MIN_RANGE_PADDING);
      minWeight -= padding;
      maxWeight += padding;
      range = maxWeight - minWeight;

      if (range < MIN_VISIBLE_WEIGHT_RANGE) {
        const targetRange = Math.max(
          MIN_VISIBLE_WEIGHT_RANGE,
          MIN_RANGE_PADDING * 2
        );
        const midpoint = (maxWeight + minWeight) / 2;
        minWeight = midpoint - targetRange / 2;
        maxWeight = midpoint + targetRange / 2;
        range = targetRange;
      }
    }

    return {
      minWeight,
      maxWeight,
      range,
    };
  }, [filteredEntries, scrollLeft, graphViewportWidth, xPositions]);

  const chartPoints = useMemo(() => {
    if (!chartData) {
      return [];
    }

    return filteredEntries.map((entry, index) => {
      const x = xPositions[index] ?? 0;
      const normalized = (entry.weight - chartData.minWeight) / chartData.range;
      const bounded = Math.min(Math.max(normalized, 0), 1);
      const y = (1 - bounded) * chartHeight;

      return {
        date: entry.date,
        weight: entry.weight,
        x,
        y,
        bounded,
      };
    });
  }, [chartData, chartHeight, filteredEntries, xPositions]);

  const selectedPoint = useMemo(() => {
    if (!selectedDate) {
      return null;
    }
    return chartPoints.find((point) => point.date === selectedDate) ?? null;
  }, [chartPoints, selectedDate]);

  useEffect(() => {
    if (!isOpen) return;

    const scrollToLatest = () => {
      const graphNode = graphScrollRef.current;
      if (graphNode) {
        const target = Math.max(
          graphNode.scrollWidth - graphNode.clientWidth,
          0
        );
        graphNode.scrollTo({ left: target, behavior: 'instant' });
      }

      const timelineNode = timelineScrollRef.current;
      if (timelineNode) {
        const target = Math.max(
          timelineNode.scrollWidth - timelineNode.clientWidth,
          0
        );
        timelineNode.scrollTo({ left: target, behavior: 'instant' });
      }
    };

    // Schedule to allow layout to settle before scrolling.
    const frame = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Auto-scroll to latest entry when a new entry is added
  useEffect(() => {
    const currentLength = resolvedEntries?.length ?? 0;
    const prevLength = prevEntriesLengthRef.current;

    // Only scroll if modal is open, entries increased, and we have entries
    if (isOpen && currentLength > prevLength && currentLength > 0) {
      const scrollToLatest = () => {
        const graphNode = graphScrollRef.current;
        if (graphNode) {
          const target = Math.max(
            graphNode.scrollWidth - graphNode.clientWidth,
            0
          );
          graphNode.scrollTo({ left: target, behavior: 'smooth' });
        }

        const timelineNode = timelineScrollRef.current;
        if (timelineNode) {
          const target = Math.max(
            timelineNode.scrollWidth - timelineNode.clientWidth,
            0
          );
          timelineNode.scrollTo({ left: target, behavior: 'smooth' });
        }
      };

      // Small delay to ensure DOM has updated with new entry
      const timeout = setTimeout(scrollToLatest, 100);
      return () => clearTimeout(timeout);
    }

    // Update the ref with current length
    prevEntriesLengthRef.current = currentLength;
  }, [isOpen, resolvedEntries?.length]);

  // Auto-scroll to latest entry when phase selection or timeframe changes
  useEffect(() => {
    if (!isOpen) return;

    const scrollToLatest = () => {
      const graphNode = graphScrollRef.current;
      if (graphNode) {
        const target = Math.max(
          graphNode.scrollWidth - graphNode.clientWidth,
          0
        );
        graphNode.scrollTo({ left: target, behavior: 'smooth' });
      }

      const timelineNode = timelineScrollRef.current;
      if (timelineNode) {
        const target = Math.max(
          timelineNode.scrollWidth - timelineNode.clientWidth,
          0
        );
        timelineNode.scrollTo({ left: target, behavior: 'smooth' });
      }
    };

    // Small delay to ensure DOM has updated with filtered entries
    const timeout = setTimeout(scrollToLatest, 100);
    return () => clearTimeout(timeout);
  }, [selectedPhaseId, selectedTimeframe, isOpen]);

  // Map entries by date for quick lookup
  const entriesMap = useMemo(() => {
    const map = {};
    filteredEntries.forEach((entry) => {
      map[entry.date] = entry;
    });
    return map;
  }, [filteredEntries]);

  // Get latest entry date
  const latestDate = filteredEntries.length
    ? filteredEntries[filteredEntries.length - 1].date
    : null;
  const oldDataWarningText = useMemo(
    () => getOldDataWarningText(latestDate),
    [latestDate]
  );

  // Earliest entry date and timeframe details for the trend summary
  const earliestDate = filteredEntries.length ? filteredEntries[0].date : null;
  const entriesCount = filteredEntries.length;
  const daysRange =
    earliestDate && latestDate
      ? Math.floor(
          (new Date(latestDate + 'T00:00:00Z') -
            new Date(earliestDate + 'T00:00:00Z')) /
            (1000 * 60 * 60 * 24)
        ) + 1
      : 0;
  const timeframeRangeLine =
    earliestDate && latestDate
      ? `${formatShortDate(earliestDate)} - ${formatShortDate(latestDate)}`
      : '';

  const timeframeLabel = (() => {
    if (selectedPhase) {
      // When a phase is selected, show phase-aware label
      if (selectedTimeframe === 'all') {
        return `${selectedPhase.name}`;
      }
      switch (selectedTimeframe) {
        case '7d':
          return `Last 7 days in ${selectedPhase.name}`;
        case '14d':
          return `Last 14 days in ${selectedPhase.name}`;
        case '30d':
          return `Last 30 days in ${selectedPhase.name}`;
        case '90d':
          return `Last 90 days in ${selectedPhase.name}`;
        default:
          return selectedPhase.name;
      }
    }

    // Default labels when no phase selected
    switch (selectedTimeframe) {
      case '7d':
        return '7-day';
      case '14d':
        return '14-day';
      case '30d':
        return '30-day';
      case '90d':
        return '90-day';
      case 'all':
        return 'All-time';
      default:
        return '30-day';
    }
  })();

  const timeframeMain = (() => {
    const entriesText = `${entriesCount} ${entriesCount === 1 ? 'entry' : 'entries'}`;
    const daysText =
      earliestDate && latestDate ? ` over ${daysRange} days` : '';

    if (selectedPhase) {
      return `${entriesText}${daysText}`;
    }

    return `${timeframeLabel} trend (${entriesText}${daysText})`;
  })();

  const currentWeightValue = filteredEntries.length
    ? filteredEntries[filteredEntries.length - 1].weight
    : resolvedLatestWeight;
  const currentWeightDisplay = (() => {
    const formatted = formatWeight(currentWeightValue);
    return formatted ? `${formatted} kg` : '—';
  })();

  // Removed unused totalChangeDisplay variable
  const weeklyRateDisplay = (() => {
    if (!Number.isFinite(trend.weeklyRate) || trend.weeklyRate === 0) {
      return '0.0 kg/wk';
    }
    const sign = trend.weeklyRate > 0 ? '+' : '';
    return `${sign}${trend.weeklyRate.toFixed(2)} kg/wk`;
  })();

  const currentWeightTick = useMemo(() => {
    if (!chartData || !Number.isFinite(currentWeightValue)) {
      return null;
    }
    const normalized =
      (currentWeightValue - chartData.minWeight) / chartData.range;
    const bounded = Math.min(Math.max(normalized, 0), 1);
    const y = (1 - bounded) * chartHeight;
    return {
      yPx: y,
      weight: currentWeightValue,
    };
  }, [chartData, chartHeight, currentWeightValue]);

  const yTicks = useMemo(() => {
    if (!chartData) return [];
    const steps = Math.max(Y_TICK_COUNT - 1, 1);
    return Array.from(
      { length: Y_TICK_COUNT },
      (_, index) => chartData.maxWeight - (chartData.range / steps) * index
    );
  }, [chartData]);

  const yTickPositions = useMemo(() => {
    if (!chartData || chartHeight <= 0) {
      return [];
    }

    const totalTicks = Math.max(yTicks.length, 1);

    return yTicks.map((weight, index) => {
      const normalized = (weight - chartData.minWeight) / chartData.range;
      const bounded = Math.min(Math.max(normalized, 0), 1);
      const y = (1 - bounded) * chartHeight;
      const isTop = index === 0;
      const isBottom = index === totalTicks - 1;
      const lineY = isTop ? 0 : isBottom ? chartHeight : y;

      return {
        weight,
        index,
        lineY,
      };
    });
  }, [chartData, chartHeight, yTicks]);

  const closeTooltip = useCallback(() => {
    setTooltipClosing(true);
    setTimeout(() => {
      setSelectedDate(null);
      setTooltipClosing(false);
    }, 150);
  }, []);

  const scheduleTooltipClose = useCallback(() => {
    if (!selectedDate) return;
    if (scrollCloseTimeoutRef.current) {
      clearTimeout(scrollCloseTimeoutRef.current);
    }
    scrollCloseTimeoutRef.current = setTimeout(() => {
      closeTooltip();
    }, 120);
  }, [closeTooltip, selectedDate]);

  useEffect(() => {
    return () => {
      if (scrollCloseTimeoutRef.current) {
        clearTimeout(scrollCloseTimeoutRef.current);
      }
    };
  }, []);

  const handleDateClick = useCallback(
    (date, event) => {
      const entry = entriesMap[date];
      if (!entry) return;

      // Stop propagation so pointerdown handler doesn't interfere
      event?.stopPropagation();

      if (selectedDate === date) {
        onEditEntry?.(entry);
        closeTooltip();
      } else {
        // Close any existing tooltip first
        if (selectedDate) {
          setTooltipClosing(true);
          setTooltipEntered(false);
        }
        // Then open the new one
        setSelectedDate(date);
        setTooltipClosing(false);
      }
    },
    [entriesMap, selectedDate, onEditEntry, closeTooltip]
  );

  useEffect(() => {
    if (!selectedDate) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const tooltipNode = tooltipRef.current;
      const timeframeDropdownNode = timeframeDropdownRef.current;

      // Check if click is inside tooltip or timeframe dropdown
      if (
        tooltipNode?.contains(event.target) ||
        timeframeDropdownNode?.contains(event.target)
      ) {
        return;
      }

      // Check if click is on a chart point (SVG circle element)
      const target = event.target;
      if (target.tagName === 'circle' || target.tagName === 'g') {
        // Let the handleDateClick handle it
        return;
      }

      // Close tooltip and timeframe dropdown if clicking outside
      closeTooltip();
      setIsTimeframeDropdownOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [closeTooltip, selectedDate]);

  useEffect(() => {
    if (selectedDate && !tooltipClosing) {
      const frame = requestAnimationFrame(() => setTooltipEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    if (!selectedDate) {
      // Avoid direct setState in effect, use microtask
      Promise.resolve().then(() => setTooltipEntered(false));
    }
    return undefined;
  }, [selectedDate, tooltipClosing]);

  const handleTooltipClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (selectedDate) {
        const entry = entriesMap[selectedDate];
        onEditEntry?.(entry);
        closeTooltip();
      }
    },
    [selectedDate, entriesMap, onEditEntry, closeTooltip]
  );

  const updateTooltipPosition = useCallback(() => {
    if (!selectedPoint) {
      return;
    }

    const graphNode = graphScrollRef.current;
    if (!graphNode) {
      return;
    }

    const svgNode = graphNode.querySelector('svg');
    if (!svgNode) {
      return;
    }

    const svgRect = svgNode.getBoundingClientRect();
    const rawX = svgRect.left + selectedPoint.x;
    const rawY = svgRect.top + selectedPoint.y;

    setTooltipPosition({ x: rawX, y: rawY });
  }, [selectedPoint]);

  useIsomorphicLayoutEffect(() => {
    if (!selectedPoint) {
      return undefined;
    }

    updateTooltipPosition();

    const handleScroll = () => scheduleTooltipClose();
    const handleResize = () => updateTooltipPosition();

    const graphNode = graphScrollRef.current;
    const timelineNode = timelineScrollRef.current;

    graphNode?.addEventListener('scroll', handleScroll);
    timelineNode?.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);

    return () => {
      graphNode?.removeEventListener('scroll', handleScroll);
      timelineNode?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [scheduleTooltipClose, selectedPoint, updateTooltipPosition]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        timeframeDropdownRef.current &&
        !timeframeDropdownRef.current.contains(event.target)
      ) {
        setIsTimeframeDropdownOpen(false);
      }
      if (
        phaseDropdownRef.current &&
        !phaseDropdownRef.current.contains(event.target)
      ) {
        setIsPhaseDropdownOpen(false);
      }
    };

    if (isTimeframeDropdownOpen || isPhaseDropdownOpen) {
      document.addEventListener('pointerdown', handleClickOutside);
      return () =>
        document.removeEventListener('pointerdown', handleClickOutside);
    }

    return undefined;
  }, [isTimeframeDropdownOpen, isPhaseDropdownOpen]);

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch z-[1000]"
        contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none !max-h-none flex flex-col pt-[calc(env(safe-area-inset-top)+16px)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] z-[1001]"
      >
        {/* Header with back button */}
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
              className="px-4 py-2 md:px-4 md:py-2 rounded-md bg-blue-600 border border-blue-400 text-white text-sm font-semibold md:hover:bg-blue-500 transition-colors flex items-center press-feedback focus-ring"
              aria-label="Switch to body fat tracker"
            >
              <Repeat size={16} className="mr-2 opacity-90" />
              Body Fat
            </button>
          )}
        </div>

        {/* Combined Timeline and Current Weight Section - Takes full remaining space */}
        <div className="flex-1 bg-surface border-t border-border overflow-y-auto flex flex-col">
          {/* Stats Section */}
          <div className="px-4 pt-4 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
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
            <div>
              <p className="text-muted text-xs uppercase tracking-wide mb-1">
                {selectedPhase ? 'Phase Range' : 'Timeframe'}
              </p>
              <p className="text-foreground text-sm font-semibold">
                {timeframeRangeLine}
              </p>
              <p className="text-muted text-[11px] mt-1">{timeframeMain}</p>
            </div>
          </div>

          <div className="sticky top-0 z-10 px-4 py-2 bg-surface/95 backdrop-blur border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onAddEntry?.()}
                className="px-4 py-1.5 md:px-4 md:py-2.5 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all font-semibold text-sm md:hover:bg-blue-500/90 press-feedback focus-ring"
              >
                Add Entry
              </button>

              <div className="flex items-center gap-2">
                {/* Phase Selector - Expandable Dropdown */}
                {resolvedPhases.length > 0 && (
                  <div className="relative" ref={phaseDropdownRef}>
                    <button
                      type="button"
                      onClick={() =>
                        setIsPhaseDropdownOpen(!isPhaseDropdownOpen)
                      }
                      className="px-3 py-1.5 md:py-2.5 rounded-md font-semibold text-sm transition-all whitespace-nowrap bg-surface-highlight text-foreground border border-border md:hover:bg-surface-highlight/80 flex items-center gap-2 focus-ring press-feedback"
                    >
                      <span>
                        {selectedPhase ? selectedPhase.name : 'All Data'}
                      </span>
                      <ChevronLeft
                        size={16}
                        className={`transition-transform duration-200 ${isPhaseDropdownOpen ? 'rotate-90' : '-rotate-90'}`}
                      />
                    </button>

                    {/* Dropdown Menu */}
                    {isPhaseDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-md shadow-lg z-10 min-w-[160px] max-h-[300px] overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPhaseId(null);
                            setIsPhaseDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors md:hover:bg-surface-highlight first:rounded-t-md ${
                            !selectedPhaseId
                              ? 'bg-blue-600 text-white'
                              : 'text-muted'
                          }`}
                        >
                          All Data
                        </button>
                        {resolvedPhases.map((phase) => (
                          <button
                            key={phase.id}
                            type="button"
                            onClick={() => {
                              setSelectedPhaseId(phase.id);
                              setIsPhaseDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors md:hover:bg-surface-highlight last:rounded-b-md ${
                              selectedPhaseId === phase.id
                                ? 'bg-blue-600 text-white'
                                : 'text-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate">{phase.name}</span>
                              {phase.status === 'active' && (
                                <span className="flex-shrink-0 w-2 h-2 bg-accent-green rounded-full" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Timeframe Selector - Expandable Dropdown */}
                <div className="relative" ref={timeframeDropdownRef}>
                  <button
                    type="button"
                    onClick={() =>
                      setIsTimeframeDropdownOpen(!isTimeframeDropdownOpen)
                    }
                    className="px-3 py-1.5 md:py-2.5 rounded-md font-semibold text-sm transition-all whitespace-nowrap bg-blue-600 text-white border border-blue-400 md:hover:bg-blue-500 flex items-center gap-2 focus-ring press-feedback"
                  >
                    <span>
                      {(() => {
                        switch (selectedTimeframe) {
                          case '7d':
                            return '7 Days';
                          case '14d':
                            return '14 Days';
                          case '30d':
                            return '30 Days';
                          case '90d':
                            return '90 Days';
                          case 'all':
                            return 'All Time';
                          default:
                            return '30 Days';
                        }
                      })()}
                    </span>
                    <ChevronLeft
                      size={16}
                      className={`transition-transform duration-200 ${isTimeframeDropdownOpen ? 'rotate-90' : '-rotate-90'}`}
                    />
                  </button>

                  {/* Dropdown Menu */}
                  {isTimeframeDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-md shadow-lg z-10 min-w-[120px]">
                      {[
                        { value: '7d', label: '7 Days' },
                        { value: '14d', label: '14 Days' },
                        { value: '30d', label: '30 Days' },
                        { value: '90d', label: '90 Days' },
                        { value: 'all', label: 'All Time' },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setSelectedTimeframe(value);
                            setIsTimeframeDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors md:hover:bg-surface-highlight first:rounded-t-md last:rounded-b-md ${
                            selectedTimeframe === value
                              ? 'bg-blue-600 text-white'
                              : 'text-muted'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Graph and Timeline Section - Synchronized scrolling */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 pr-3 pb-1 overflow-hidden flex">
              {/* Graph viewport wrapper to pin overlay fades */}
              <div className="relative rounded-l-lg flex-1 overflow-hidden">
                <div
                  ref={graphScrollRef}
                  className={`${hasHorizontalOverflow ? 'overflow-x-auto' : 'overflow-x-hidden'} overflow-y-hidden h-full`}
                  onScroll={(e) => {
                    const nextScrollLeft = e.currentTarget.scrollLeft;
                    setScrollLeft(nextScrollLeft);
                    if (
                      timelineScrollRef.current &&
                      timelineScrollRef.current.scrollLeft !== nextScrollLeft
                    ) {
                      timelineScrollRef.current.scrollLeft = nextScrollLeft;
                    }
                    scheduleTooltipClose();
                  }}
                >
                  <div
                    className="py-[16px] pr-6 pl-0 h-full"
                    style={{ width: `${chartWidth}px` }}
                  >
                    {chartData ? (
                      <svg
                        width={chartWidth}
                        height={chartHeight}
                        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient
                            id="areaGradient"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <>
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
                            </>
                          </linearGradient>
                        </defs>

                        {/* Line graph, area, and grid */}
                        {(() => {
                          let pathData = '';
                          let areaData = '';
                          const points = chartPoints;
                          // Removed unused baselineY variable

                          if (
                            points.length === 1 &&
                            shouldStretchAcrossViewport
                          ) {
                            const singlePoint = points[0];
                            const startX = 0;
                            const endX = chartWidth;
                            pathData = `M ${startX} ${singlePoint.y} L ${endX} ${singlePoint.y}`;
                            areaData = `M ${startX} ${chartHeight} L ${startX} ${singlePoint.y} L ${endX} ${singlePoint.y} L ${endX} ${chartHeight} Z`;
                          } else if (points.length > 1) {
                            // Connect to left edge first
                            const firstPoint = points[0];
                            pathData = `M 0 ${firstPoint.y} L ${firstPoint.x} ${firstPoint.y}`;
                            areaData = `M 0 ${chartHeight} L 0 ${firstPoint.y} L ${firstPoint.x} ${firstPoint.y}`;

                            // Create smooth curves between points using cubic Bézier
                            for (let i = 0; i < points.length - 1; i++) {
                              const current = points[i];
                              const next = points[i + 1];

                              // Calculate control points for smooth cubic Bézier curve
                              const cp1x =
                                current.x + (next.x - current.x) * 0.4;
                              const cp1y = current.y;
                              const cp2x = next.x - (next.x - current.x) * 0.4;
                              const cp2y = next.y;

                              // Use cubic Bézier curve for both line and area
                              pathData += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
                              areaData += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
                            }

                            if (points.length > 0) {
                              const lastPoint = points[points.length - 1];
                              // Extend the line to the right edge
                              pathData += ` L ${chartWidth} ${lastPoint.y}`;
                              areaData += ` L ${chartWidth} ${lastPoint.y} L ${chartWidth} ${chartHeight} Z`;
                            }
                          } else {
                            // fallback for 0 points
                            pathData = '';
                            areaData = '';
                          }

                          return (
                            <>
                              {/* Area fill */}
                              {areaData && (
                                <path d={areaData} fill="url(#areaGradient)" />
                              )}

                              {/* Grid lines */}
                              <g>
                                {yTickPositions.map(({ index, lineY }) => {
                                  const isBaseline =
                                    index === yTickPositions.length - 1;
                                  const yValue = isBaseline
                                    ? getBaselineY(lineY)
                                    : lineY;
                                  return (
                                    <line
                                      key={`grid-${index}`}
                                      x1="0"
                                      y1={yValue}
                                      x2={chartWidth}
                                      y2={yValue}
                                      stroke={
                                        isBaseline ? '#fff' : 'currentColor'
                                      }
                                      strokeWidth={isBaseline ? 2 : 1}
                                      strokeDasharray={
                                        isBaseline ? 'none' : '4 6'
                                      }
                                      className={
                                        isBaseline
                                          ? 'opacity-80'
                                          : 'text-muted opacity-60'
                                      }
                                    />
                                  );
                                })}
                              </g>

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
                              {points.map(({ x, y, date }) => (
                                <g
                                  key={date}
                                  onClick={(e) => handleDateClick(date, e)}
                                  className="cursor-pointer"
                                >
                                  {/* Larger invisible circle for easier clicking */}
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r={POINT_HIT_RADIUS}
                                    fill="transparent"
                                  />
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r={POINT_RADIUS}
                                    fill="#1e293b"
                                    stroke={trendVisual.color}
                                    strokeWidth="2"
                                    className="transition-all"
                                  />
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-muted text-lg">
                          No weight data yet.
                        </p>
                      </div>
                    )}
                  </div>
                  {/* Close scroll container before adding overlay */}
                </div>
                {/* Right edge soft fade pinned to viewport of graph */}
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-surface/90 to-transparent" />
              </div>

              {/* Y-axis - Fixed on right side */}
              <div className="rounded-r-lg w-14 flex-shrink-0 relative">
                <div
                  className="absolute inset-x-0 px-2"
                  style={{ top: '16px', height: `${chartHeight}px` }}
                >
                  {chartData
                    ? yTickPositions.map(({ weight, index, lineY }) => {
                        return (
                          <div
                            key={`tick-${index}`}
                            className="absolute right-2 text-sm font-semibold text-foreground/70 tracking-tight text-right"
                            style={{
                              top: `${lineY}px`,
                              transform: 'translateY(-50%)',
                            }}
                          >
                            {formatWeight(weight)}
                          </div>
                        );
                      })
                    : null}
                  {currentWeightTick && (
                    <div
                      className="absolute right-0.5 px-2.5 py-1 rounded-lg text-[12px] font-bold text-white shadow-md flex items-center justify-center leading-none"
                      style={{
                        top: `${currentWeightTick.yPx}px`,
                        transform: 'translateY(-50%)',
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

            <div className="pr-1 pb-1 flex gap-1 flex-shrink-0">
              {/* Timeline viewport wrapper to pin overlay fades */}
              <div className="relative flex-1 rounded-lg overflow-hidden">
                <div
                  id="timeline-scroll"
                  ref={timelineScrollRef}
                  className={`${hasHorizontalOverflow ? 'overflow-x-auto' : 'overflow-x-hidden'} overflow-y-hidden`}
                  onScroll={(e) => {
                    const nextScrollLeft = e.currentTarget.scrollLeft;
                    setScrollLeft(nextScrollLeft);
                    if (
                      graphScrollRef.current &&
                      graphScrollRef.current.scrollLeft !== nextScrollLeft
                    ) {
                      graphScrollRef.current.scrollLeft = nextScrollLeft;
                    }
                    scheduleTooltipClose();
                  }}
                >
                  <div
                    className="pl-0 pr-6 py-3"
                    style={{ width: `${chartWidth}px` }}
                  >
                    <div
                      className="relative"
                      style={{
                        width: `${chartWidth}px`,
                        height: `${TIMELINE_TRACK_HEIGHT}px`,
                      }}
                    >
                      {filteredEntries.map((entry, index) => {
                        const { date } = entry;
                        const isLatest = date === latestDate;
                        const label = formatTimelineLabel(date);
                        const weekday = getWeekday(date);
                        const isSunday = weekday === 'Sun';
                        const x = timelineXPositions[index] ?? 0;
                        // Removed unused prevX and nextX variables

                        // Fixed width for timeline label boxes
                        const buttonWidth = DATE_COLUMN_WIDTH;

                        return (
                          <div
                            key={`${date}-${index}`}
                            className="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2"
                            style={{
                              left: `${x}px`,
                              width: `${buttonWidth}px`,
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleDateClick(date, e)}
                              aria-pressed={selectedDate === date}
                              className={`w-full flex flex-col items-center gap-1 py-2 px-3 rounded-md border transition-colors text-xs font-semibold ${
                                isLatest
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'bg-transparent border-border text-foreground'
                              } ${selectedDate === date ? 'ring-2 ring-accent-blue' : ''}`}
                            >
                              <span
                                className={`w-full text-center ${isSunday && !isLatest && selectedDate !== date ? 'text-accent-red' : ''}`}
                              >
                                {label}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Close inner wrapper and scroll container before overlay */}
                </div>
                {/* Right edge soft fade pinned to viewport of timeline */}
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-surface/90 to-transparent" />
              </div>
              <div className="w-14 flex-shrink-0" />
            </div>
          </div>
        </div>
      </ModalShell>

      {/* Tooltip */}
      {selectedPoint && selectedDate && entriesMap[selectedDate] && (
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
          role="button"
          tabIndex={0}
          aria-label="Edit weight entry"
          onClick={handleTooltipClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleTooltipClick(event);
            }
          }}
        >
          <div className="cursor-pointer md:hover:bg-surface-highlight/50 rounded p-2 transition-all pressable focus-ring">
            <p className="text-muted text-[11.5px] mb-1">
              {formatTooltipDate(selectedDate)}
            </p>
            <p className="text-foreground text-2xl font-bold">
              {formatWeight(entriesMap[selectedDate].weight)} kg
            </p>
            <p className="text-muted text-[10px] mt-2 uppercase tracking-wide">
              Tap to edit
            </p>
          </div>

          {/* Arrow */}
          <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-border"></div>
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
