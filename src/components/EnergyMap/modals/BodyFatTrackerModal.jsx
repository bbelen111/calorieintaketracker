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
} from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import {
  calculateBodyFatTrend,
  formatBodyFat,
  sortBodyFatEntries,
} from '../../../utils/bodyFat';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { BodyFatTrendInfoModal } from './BodyFatTrendInfoModal';

const TrendIcon = ({ direction }) => {
  if (direction === 'up') {
    return <TrendingUp size={18} />;
  }
  if (direction === 'down') {
    return <TrendingDown size={18} />;
  }
  return <Minus size={18} />;
};

const getTrendToneClass = (direction, label) => {
  if (label === 'Need more data' || label === 'No data yet') {
    return 'text-white';
  }

  if (label.includes('Severe')) {
    return 'text-red-500';
  }

  if (label.includes('Aggressive body fat loss')) {
    return 'text-orange-500';
  }
  if (label.includes('Aggressive body fat gain')) {
    return 'text-purple-500';
  }

  if (label.includes('Moderate body fat loss')) {
    return 'text-yellow-500';
  }
  if (label.includes('Moderate body fat gain')) {
    return 'text-green-500';
  }

  if (direction === 'down') {
    return 'text-yellow-400';
  }
  if (direction === 'up') {
    return 'text-green-400';
  }

  return 'text-blue-400';
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
    if (expectation.direction === 'up') {
      return { text: 'Not gaining as expected', color: 'text-yellow-400' };
    }
    if (expectation.direction === 'down') {
      return { text: 'Not reducing as expected', color: 'text-yellow-400' };
    }
  }

  if (expectation.direction === 'flat') {
    if (absRate <= 0.1) {
      return { text: 'On track with goal', color: 'text-green-400' };
    }
    return { text: 'Deviating from maintenance', color: 'text-yellow-400' };
  }

  const expectedRate =
    expectation.direction === 'down' ? -weeklyRate : weeklyRate;

  if (expectedRate >= expectation.min && expectedRate <= expectation.max) {
    return { text: 'On track with goal', color: 'text-green-400' };
  }

  if (expectedRate < expectation.min) {
    return { text: 'Slower than goal target', color: 'text-blue-400' };
  }

  if (expectedRate > expectation.max) {
    return { text: 'Faster than goal target', color: 'text-yellow-400' };
  }

  return null;
};

const getGoalWeeklyTarget = (selectedGoal) => {
  const goalTargets = {
    aggressive_bulk: '+0.5-1.0 %/wk',
    bulking: '+0.25-0.5 %/wk',
    maintenance: '0.0 %/wk',
    cutting: '-0.25-0.5 %/wk',
    aggressive_cut: '-0.5-1.0 %/wk',
  };

  return goalTargets[selectedGoal] || '0.0 %/wk';
};

const DATE_COLUMN_WIDTH = 55;
const DATE_COLUMN_GAP = 8;
const Y_TICK_COUNT = 7;
const LEFT_EDGE_PADDING_GRAPH = 8;
const RIGHT_EDGE_PADDING_GRAPH = 10;
const LEFT_EDGE_PADDING_TIMELINE = DATE_COLUMN_WIDTH / 2;
const RIGHT_EDGE_PADDING_TIMELINE = 16;
const MIN_VISIBLE_BODY_FAT_RANGE = 4;
const MIN_RANGE_PADDING = 0.5;
const TIMELINE_TRACK_HEIGHT = 56;
const BASELINE_Y_OFFSET = 18;
const Y_AXIS_PADDING = 16;
const LEADING_ENTRY_SPACE = 45;
const FIRST_ENTRY_CENTER_OFFSET = LEADING_ENTRY_SPACE + DATE_COLUMN_WIDTH / 2;
const TOOLTIP_WIDTH = 144;
const TOOLTIP_VERTICAL_OFFSET = 17;
const POINT_RADIUS = 6;
const POINT_HIT_RADIUS = 12;

const getTrendVisualStyle = (trend) => {
  if (trend.label.includes('Severe')) {
    return { color: '#ef4444', topOpacity: 0.3, bottomOpacity: 0.05 };
  }
  if (trend.label.includes('Aggressive body fat loss')) {
    return { color: '#f97316', topOpacity: 0.3, bottomOpacity: 0.05 };
  }
  if (trend.label.includes('Aggressive body fat gain')) {
    return { color: '#a855f7', topOpacity: 0.3, bottomOpacity: 0.05 };
  }
  if (trend.label.includes('Moderate body fat loss')) {
    return { color: '#eab308', topOpacity: 0.3, bottomOpacity: 0.05 };
  }
  if (trend.label.includes('Moderate body fat gain')) {
    return { color: '#22c55e', topOpacity: 0.3, bottomOpacity: 0.05 };
  }
  if (trend.direction === 'down') {
    return { color: '#eab308', topOpacity: 0.25, bottomOpacity: 0.05 };
  }
  if (trend.direction === 'up') {
    return { color: '#22c55e', topOpacity: 0.25, bottomOpacity: 0.05 };
  }
  return { color: '#60a5fa', topOpacity: 0.3, bottomOpacity: 0.05 };
};

const getBaselineY = (defaultY) => defaultY - BASELINE_Y_OFFSET;

const clampPercent = (value) => Math.max(0, Math.min(100, value));

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

export const BodyFatTrackerModal = ({
  isOpen,
  isClosing,
  entries,
  latestBodyFat,
  selectedGoal = 'maintenance',
  phases = [],
  onClose,
  onAddEntry,
  onEditEntry,
}) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');
  const [isTimeframeDropdownOpen, setIsTimeframeDropdownOpen] = useState(false);
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [isPhaseDropdownOpen, setIsPhaseDropdownOpen] = useState(false);
  const graphScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeframeDropdownRef = useRef(null);
  const phaseDropdownRef = useRef(null);
  const scrollCloseTimeoutRef = useRef(null);
  const [graphViewportWidth, setGraphViewportWidth] = useState(0);
  const [graphViewportHeight, setGraphViewportHeight] = useState(0);
  const prevEntriesLengthRef = useRef(entries?.length ?? 0);

  const {
    isOpen: isTrendInfoOpen,
    isClosing: isTrendInfoClosing,
    open: openTrendInfo,
    requestClose: closeTrendInfo,
  } = useAnimatedModal();

  const sortedEntries = useMemo(
    () => sortBodyFatEntries(entries ?? []),
    [entries]
  );

  const selectedPhase = useMemo(() => {
    if (!selectedPhaseId) return null;
    return phases.find((p) => p.id === selectedPhaseId) || null;
  }, [selectedPhaseId, phases]);

  const phaseFilteredEntries = useMemo(() => {
    if (!selectedPhase) return sortedEntries;

    const startDate = selectedPhase.startDate;
    const endDate = selectedPhase.endDate;

    return sortedEntries.filter((entry) => {
      if (startDate && entry.date < startDate) {
        return false;
      }
      if (endDate && entry.date > endDate) {
        return false;
      }
      return true;
    });
  }, [sortedEntries, selectedPhase]);

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
    () => calculateBodyFatTrend(filteredEntries),
    [filteredEntries]
  );
  const trendVisual = useMemo(() => getTrendVisualStyle(trend), [trend]);
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
      return [Math.max(FIRST_ENTRY_CENTER_OFFSET, chartWidth / 2)];
    }

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

    const values = filteredEntries.map((entry) => entry.bodyFat);
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    let range = maxValue - minValue;

    if (range === 0) {
      range = Math.max(MIN_VISIBLE_BODY_FAT_RANGE, MIN_RANGE_PADDING * 2);
      const halfRange = range / 2;
      minValue -= halfRange;
      maxValue += halfRange;
    } else {
      const padding = Math.max(range * 0.1, MIN_RANGE_PADDING);
      minValue -= padding;
      maxValue += padding;
      range = maxValue - minValue;

      if (range < MIN_VISIBLE_BODY_FAT_RANGE) {
        const targetRange = Math.max(
          MIN_VISIBLE_BODY_FAT_RANGE,
          MIN_RANGE_PADDING * 2
        );
        const midpoint = (maxValue + minValue) / 2;
        minValue = midpoint - targetRange / 2;
        maxValue = midpoint + targetRange / 2;
        range = targetRange;
      }
    }

    return {
      minValue,
      maxValue,
      range,
    };
  }, [filteredEntries]);

  const chartPoints = useMemo(() => {
    if (!chartData) {
      return [];
    }

    return filteredEntries.map((entry, index) => {
      const x = xPositions[index] ?? 0;
      const normalized = (entry.bodyFat - chartData.minValue) / chartData.range;
      const bounded = Math.min(Math.max(normalized, 0), 1);
      const y = (1 - bounded) * chartHeight;

      return {
        date: entry.date,
        bodyFat: entry.bodyFat,
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

    const frame = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    const currentLength = entries?.length ?? 0;
    const prevLength = prevEntriesLengthRef.current;

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

      const timeout = setTimeout(scrollToLatest, 100);
      return () => clearTimeout(timeout);
    }

    prevEntriesLengthRef.current = currentLength;
  }, [entries?.length, isOpen]);

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

    const timeout = setTimeout(scrollToLatest, 100);
    return () => clearTimeout(timeout);
  }, [selectedPhaseId, selectedTimeframe, isOpen]);

  const entriesMap = useMemo(() => {
    const map = {};
    filteredEntries.forEach((entry) => {
      map[entry.date] = entry;
    });
    return map;
  }, [filteredEntries]);

  const latestDate = filteredEntries.length
    ? filteredEntries[filteredEntries.length - 1].date
    : null;

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

  const currentBodyFatValue = filteredEntries.length
    ? filteredEntries[filteredEntries.length - 1].bodyFat
    : latestBodyFat;
  const currentBodyFatDisplay = (() => {
    const formatted = formatBodyFat(currentBodyFatValue);
    return formatted ? `${formatted}%` : '—';
  })();

  const weeklyRateDisplay = (() => {
    if (!Number.isFinite(trend.weeklyRate) || trend.weeklyRate === 0) {
      return '0.0 %/wk';
    }
    const sign = trend.weeklyRate > 0 ? '+' : '';
    return `${sign}${trend.weeklyRate.toFixed(2)} %/wk`;
  })();

  const currentBodyFatTick = useMemo(() => {
    if (!chartData || !Number.isFinite(currentBodyFatValue)) {
      return null;
    }
    const normalized =
      (currentBodyFatValue - chartData.minValue) / chartData.range;
    const bounded = Math.min(Math.max(normalized, 0), 1);
    const y = (1 - bounded) * chartHeight;
    return {
      yPx: y + Y_AXIS_PADDING - 4,
      bodyFat: currentBodyFatValue,
    };
  }, [chartData, chartHeight, currentBodyFatValue]);

  const yTicks = useMemo(() => {
    if (!chartData) return [];
    const steps = Math.max(Y_TICK_COUNT - 1, 1);
    return Array.from(
      { length: Y_TICK_COUNT },
      (_, index) => chartData.maxValue - (chartData.range / steps) * index
    );
  }, [chartData]);

  const yTickPositions = useMemo(() => {
    if (!chartData || chartHeight <= 0) {
      return [];
    }

    const totalTicks = Math.max(yTicks.length, 1);

    return yTicks.map((value, index) => {
      const normalized = (value - chartData.minValue) / chartData.range;
      const bounded = Math.min(Math.max(normalized, 0), 1);
      const y = (1 - bounded) * chartHeight;
      const isTop = index === 0;
      const isBottom = index === totalTicks - 1;
      const lineY = isTop ? 0 : isBottom ? chartHeight : y;
      const labelPercent = clampPercent(
        chartHeight === 0 ? 0 : (lineY / chartHeight) * 100
      );

      return {
        value,
        index,
        lineY,
        labelPercent,
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

      event?.stopPropagation();

      if (selectedDate === date) {
        onEditEntry?.(entry);
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
    [entriesMap, selectedDate, onEditEntry, closeTooltip]
  );

  useEffect(() => {
    if (!selectedDate) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const tooltipNode = tooltipRef.current;
      const timeframeDropdownNode = timeframeDropdownRef.current;

      if (
        tooltipNode?.contains(event.target) ||
        timeframeDropdownNode?.contains(event.target)
      ) {
        return;
      }

      const target = event.target;
      if (target.tagName === 'circle' || target.tagName === 'g') {
        return;
      }

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
        overlayClassName="fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch"
        contentClassName="fixed inset-0 w-screen h-screen p-0 bg-slate-900 rounded-none border-none !max-h-none flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onClose?.()}
              aria-label="Back"
              className="text-slate-300 hover:text-white transition-all"
            >
              <ChevronLeft size={24} />
            </button>
            <h3 className="text-white font-bold text-xl">Body Fat Tracker</h3>
          </div>
        </div>

        <div className="flex-1 bg-slate-800 border-t border-slate-700 overflow-y-auto flex flex-col">
          <div className="px-4 pt-4 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">
                Current Body Fat
              </p>
              <p className="text-white text-2xl font-bold">
                {currentBodyFatDisplay}
              </p>
              <p className="text-slate-400 text-[11px] mt-1">
                {latestDate ? `as of ${formatTooltipDate(latestDate)}` : ''}
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={openTrendInfo}
                aria-label="Weekly rate details"
                className="text-slate-400 text-xs uppercase tracking-wide mb-1 hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 group"
              >
                Weekly Rate
                <Info
                  size={14}
                  className="opacity-60 group-hover:opacity-100 transition-opacity"
                />
              </button>
              <p className="text-white text-lg font-semibold">
                {weeklyRateDisplay}
              </p>
              <p className="text-slate-400 text-xs mt-1">
                Goal: {getGoalWeeklyTarget(selectedGoal)}
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={openTrendInfo}
                aria-label="Trend details"
                className="text-slate-400 text-xs uppercase tracking-wide mb-1 hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 group"
              >
                Trend
                <Info
                  size={14}
                  className="opacity-60 group-hover:opacity-100 transition-opacity"
                />
              </button>
              <p
                className={`${getTrendToneClass(trend.direction, trend.label)} font-semibold text-lg flex items-center gap-2`}
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
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">
                {selectedPhase ? 'Phase Range' : 'Timeframe'}
              </p>
              <p className="text-white text-sm font-semibold">
                {timeframeRangeLine}
              </p>
              <p className="text-slate-400 text-[11px] mt-1">{timeframeMain}</p>
            </div>
          </div>

          <div className="sticky top-0 z-10 px-4 py-2 bg-slate-800/95 backdrop-blur border-b border-slate-700 flex-shrink-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onAddEntry?.()}
                className="px-4 py-1.5 md:px-4 md:py-2.5 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all font-semibold text-sm hover:bg-blue-500/90"
              >
                Add Entry
              </button>

              <div className="flex items-center gap-2">
                {phases.length > 0 && (
                  <div className="relative" ref={phaseDropdownRef}>
                    <button
                      type="button"
                      onClick={() =>
                        setIsPhaseDropdownOpen(!isPhaseDropdownOpen)
                      }
                      className="px-3 py-1.5 md:py-2.5 rounded-md font-semibold text-sm transition-all whitespace-nowrap bg-slate-700 text-white border border-slate-600 hover:bg-slate-600 flex items-center gap-2"
                    >
                      <span>
                        {selectedPhase ? selectedPhase.name : 'All Data'}
                      </span>
                      <ChevronLeft
                        size={16}
                        className={`transition-transform duration-200 ${isPhaseDropdownOpen ? 'rotate-90' : '-rotate-90'}`}
                      />
                    </button>

                    {isPhaseDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-10 min-w-[160px] max-h-[300px] overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPhaseId(null);
                            setIsPhaseDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-600 first:rounded-t-md ${
                            !selectedPhaseId
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-200'
                          }`}
                        >
                          All Data
                        </button>
                        {phases.map((phase) => (
                          <button
                            key={phase.id}
                            type="button"
                            onClick={() => {
                              setSelectedPhaseId(phase.id);
                              setIsPhaseDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-600 last:rounded-b-md ${
                              selectedPhaseId === phase.id
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate">{phase.name}</span>
                              {phase.status === 'active' && (
                                <span className="flex-shrink-0 w-2 h-2 bg-green-400 rounded-full" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="relative" ref={timeframeDropdownRef}>
                  <button
                    type="button"
                    onClick={() =>
                      setIsTimeframeDropdownOpen(!isTimeframeDropdownOpen)
                    }
                    className="px-3 py-1.5 md:py-2.5 rounded-md font-semibold text-sm transition-all whitespace-nowrap bg-blue-600 text-white border border-blue-400 hover:bg-blue-500 flex items-center gap-2"
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

                  {isTimeframeDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-10 min-w-[120px]">
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
                          className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-600 first:rounded-t-md last:rounded-b-md ${
                            selectedTimeframe === value
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-200'
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

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 pr-3 pb-1 overflow-hidden flex">
              <div className="relative rounded-l-lg flex-1 overflow-hidden">
                <div
                  ref={graphScrollRef}
                  className={`${hasHorizontalOverflow ? 'overflow-x-auto' : 'overflow-x-hidden'} overflow-y-hidden h-full`}
                  onScroll={(e) => {
                    const nextScrollLeft = e.currentTarget.scrollLeft;
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
                    className="py-4 pr-6 pl-0 h-full"
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

                        {(() => {
                          let pathData = '';
                          let areaData = '';
                          const points = chartPoints;

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
                            const firstPoint = points[0];
                            pathData = `M 0 ${firstPoint.y} L ${firstPoint.x} ${firstPoint.y}`;
                            areaData = `M 0 ${chartHeight} L 0 ${firstPoint.y} L ${firstPoint.x} ${firstPoint.y}`;

                            for (let i = 0; i < points.length - 1; i++) {
                              const current = points[i];
                              const next = points[i + 1];

                              const cp1x =
                                current.x + (next.x - current.x) * 0.4;
                              const cp1y = current.y;
                              const cp2x = next.x - (next.x - current.x) * 0.4;
                              const cp2y = next.y;

                              pathData += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
                              areaData += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
                            }

                            if (points.length > 0) {
                              const lastPoint = points[points.length - 1];
                              pathData += ` L ${chartWidth} ${lastPoint.y}`;
                              areaData += ` L ${chartWidth} ${lastPoint.y} L ${chartWidth} ${chartHeight} Z`;
                            }
                          } else {
                            pathData = '';
                            areaData = '';
                          }

                          return (
                            <>
                              {areaData && (
                                <path d={areaData} fill="url(#areaGradient)" />
                              )}

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
                                          : 'text-slate-500 opacity-60'
                                      }
                                    />
                                  );
                                })}
                              </g>

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

                              {points.map(({ x, y, date }) => (
                                <g
                                  key={date}
                                  onClick={(e) => handleDateClick(date, e)}
                                  className="cursor-pointer"
                                >
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
                        <p className="text-slate-500 text-lg">
                          No body fat data yet.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-slate-800/90 to-transparent" />
              </div>

              <div className="rounded-r-lg w-14 flex-shrink-0 relative">
                <div className="absolute inset-0 px-2 py-4">
                  {chartData
                    ? yTickPositions.map(({ value, index, labelPercent }) => {
                        const isTop = index === 0;
                        const isBottom = index === yTickPositions.length - 1;
                        const offsetPx = isTop ? 10 : isBottom ? -10 : 15;
                        const translateY = `translateY(calc(-50% + ${offsetPx}px))`;
                        return (
                          <div
                            key={`tick-${index}`}
                            className="absolute right-2 text-sm font-semibold text-slate-100/70 tracking-tight text-right"
                            style={{
                              top: `${labelPercent}%`,
                              transform: translateY,
                            }}
                          >
                            {formatBodyFat(value)}
                          </div>
                        );
                      })
                    : null}
                  {currentBodyFatTick && (
                    <div
                      className="absolute right-0.5 up px-2.5 py-1 rounded-lg text-[12px] font-bold text-white shadow-md"
                      style={{
                        top: `${currentBodyFatTick.yPx}px`,
                        transform: 'translateY(-50%)',
                        backgroundColor: `${trendVisual.color}cc`,
                        borderColor: trendVisual.color,
                        borderWidth: '1px',
                      }}
                    >
                      {formatBodyFat(currentBodyFatTick.bodyFat)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pr-1 pb-1 flex gap-1 flex-shrink-0">
              <div className="relative flex-1 rounded-lg overflow-hidden">
                <div
                  id="timeline-scroll"
                  ref={timelineScrollRef}
                  className={`${hasHorizontalOverflow ? 'overflow-x-auto' : 'overflow-x-hidden'} overflow-y-hidden`}
                  onScroll={(e) => {
                    const nextScrollLeft = e.currentTarget.scrollLeft;
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
                        const x = timelineXPositions[index] ?? 0;

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
                                  : 'bg-transparent border-slate-600 text-slate-100'
                              } ${selectedDate === date ? 'ring-2 ring-blue-400' : ''}`}
                            >
                              <span className="w-full text-center">
                                {label}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-slate-800/90 to-transparent" />
              </div>
              <div className="w-14 flex-shrink-0" />
            </div>
          </div>
        </div>
      </ModalShell>

      {selectedPoint && selectedDate && entriesMap[selectedDate] && (
        <div
          ref={tooltipRef}
          className={`fixed z-[1200] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-4 transform -translate-x-1/2 -translate-y-full pointer-events-auto transition duration-150 ease-out ${
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
          aria-label="Edit body fat entry"
          onClick={handleTooltipClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleTooltipClick(event);
            }
          }}
        >
          <div className="cursor-pointer hover:bg-slate-700/50 rounded p-2 transition-all">
            <p className="text-slate-400 text-[11.5px] mb-1">
              {formatTooltipDate(selectedDate)}
            </p>
            <p className="text-white text-2xl font-bold">
              {formatBodyFat(entriesMap[selectedDate].bodyFat)}%
            </p>
            <p className="text-slate-300 text-[10px] mt-2 uppercase tracking-wide">
              Tap to edit
            </p>
          </div>

          <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-600"></div>
        </div>
      )}

      <BodyFatTrendInfoModal
        isOpen={isTrendInfoOpen}
        isClosing={isTrendInfoClosing}
        trend={trend}
        onClose={closeTrendInfo}
      />
    </>
  );
};
