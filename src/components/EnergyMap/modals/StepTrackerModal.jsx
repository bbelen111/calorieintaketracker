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
  Footprints,
} from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
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

const DATE_COLUMN_WIDTH = 48;
const DATE_COLUMN_GAP = 6;
const Y_TICK_COUNT = 6;
const LEFT_EDGE_PADDING_GRAPH = 12;
const RIGHT_EDGE_PADDING_GRAPH = 12;
const MIN_VISIBLE_STEP_RANGE = 5000;
const MIN_RANGE_PADDING = 500;
const TIMELINE_TRACK_HEIGHT = 56;
const Y_AXIS_PADDING = 16;
const LEADING_ENTRY_SPACE = 24;
const FIRST_ENTRY_CENTER_OFFSET = LEADING_ENTRY_SPACE + DATE_COLUMN_WIDTH / 2;
const TOOLTIP_WIDTH = 144;
const TOOLTIP_VERTICAL_OFFSET = 17;
const BAR_WIDTH = 32;
const BAR_RADIUS = 6;

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

const formatStepCount = (steps) => {
  if (steps >= 1000) {
    return `${(steps / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return steps.toLocaleString();
};

const calculateStepTrend = (entries) => {
  if (!entries || entries.length === 0) {
    return {
      direction: 'flat',
      label: 'No data yet',
      weeklyAverage: 0,
      totalEntries: 0,
      averageSteps: 0,
    };
  }

  if (entries.length < 3) {
    const totalSteps = entries.reduce((sum, e) => sum + (e.steps || 0), 0);
    const average = Math.round(totalSteps / entries.length);
    return {
      direction: 'flat',
      label: 'Need more data',
      weeklyAverage: 0,
      totalEntries: entries.length,
      averageSteps: average,
    };
  }

  const totalSteps = entries.reduce((sum, e) => sum + (e.steps || 0), 0);
  const averageSteps = Math.round(totalSteps / entries.length);

  // Calculate 7-day averages for comparison
  const lastWeekEntries = entries.slice(-7);
  const prevWeekEntries = entries.slice(-14, -7);

  const lastWeekAvg = lastWeekEntries.length
    ? lastWeekEntries.reduce((sum, e) => sum + (e.steps || 0), 0) /
      lastWeekEntries.length
    : 0;
  const prevWeekAvg = prevWeekEntries.length
    ? prevWeekEntries.reduce((sum, e) => sum + (e.steps || 0), 0) /
      prevWeekEntries.length
    : lastWeekAvg;

  const weeklyChange = prevWeekAvg > 0 ? lastWeekAvg - prevWeekAvg : 0;
  const changePercent =
    prevWeekAvg > 0 ? ((lastWeekAvg - prevWeekAvg) / prevWeekAvg) * 100 : 0;

  let direction = 'flat';
  let label = 'Stable';

  if (Math.abs(changePercent) < 5) {
    direction = 'flat';
    label = 'Stable';
  } else if (changePercent >= 20) {
    direction = 'up';
    label = 'Strong increase';
  } else if (changePercent >= 5) {
    direction = 'up';
    label = 'Increasing';
  } else if (changePercent <= -20) {
    direction = 'down';
    label = 'Strong decrease';
  } else if (changePercent <= -5) {
    direction = 'down';
    label = 'Decreasing';
  }

  return {
    direction,
    label,
    weeklyAverage: Math.round(lastWeekAvg),
    weeklyChange: Math.round(weeklyChange),
    changePercent: Math.round(changePercent),
    totalEntries: entries.length,
    averageSteps,
  };
};

const getTrendColorClass = (trend) => {
  if (trend.direction === 'up') {
    return 'text-green-400';
  }
  if (trend.direction === 'down') {
    return 'text-yellow-400';
  }
  return 'text-blue-400';
};

const getBarColor = (steps, average) => {
  if (steps >= average * 1.2) {
    return '#22c55e'; // green-500
  }
  if (steps >= average * 0.8) {
    return '#3b82f6'; // blue-500
  }
  return '#f59e0b'; // amber-500
};

export const StepTrackerModal = ({
  isOpen,
  isClosing,
  entries,
  todaySteps,
  onClose,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      stepEntries: state.stepEntries ?? [],
    }),
    shallow
  );
  const resolvedEntries = entries ?? store.stepEntries;
  const [selectedDate, setSelectedDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');
  const [isTimeframeDropdownOpen, setIsTimeframeDropdownOpen] = useState(false);
  const graphScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeframeDropdownRef = useRef(null);
  const scrollCloseTimeoutRef = useRef(null);
  const [graphViewportWidth, setGraphViewportWidth] = useState(0);
  const [graphViewportHeight, setGraphViewportHeight] = useState(0);

  const sortedEntries = useMemo(
    () =>
      [...(resolvedEntries ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [resolvedEntries]
  );

  // Filter entries based on selected timeframe
  const filteredEntries = useMemo(() => {
    if (!sortedEntries.length) return [];
    if (selectedTimeframe === 'all') return sortedEntries;

    const latestEntry = sortedEntries[sortedEntries.length - 1];
    const latestDate = new Date(latestEntry.date + 'T00:00:00Z');

    const daysMap = {
      '7d': 7,
      '14d': 14,
      '30d': 30,
      '90d': 90,
    };

    const daysToSubtract = daysMap[selectedTimeframe];
    if (!daysToSubtract) return sortedEntries;

    const cutoffDate = new Date(latestDate);
    cutoffDate.setDate(cutoffDate.getDate() - daysToSubtract);

    return sortedEntries.filter((entry) => {
      const entryDate = new Date(entry.date + 'T00:00:00Z');
      return entryDate >= cutoffDate;
    });
  }, [sortedEntries, selectedTimeframe]);

  const trend = useMemo(
    () => calculateStepTrend(filteredEntries),
    [filteredEntries]
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
      return (
        baseWidth +
        LEADING_ENTRY_SPACE +
        LEFT_EDGE_PADDING_GRAPH +
        RIGHT_EDGE_PADDING_GRAPH
      );
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

    const leftPad = Math.max(DATE_COLUMN_WIDTH / 2, FIRST_ENTRY_CENTER_OFFSET);
    const rightPad = 16;
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

    const steps = filteredEntries.map((entry) => entry.steps || 0);
    let minSteps = Math.min(...steps);
    let maxSteps = Math.max(...steps);
    let range = maxSteps - minSteps;

    if (range === 0) {
      range = Math.max(MIN_VISIBLE_STEP_RANGE, MIN_RANGE_PADDING * 2);
      const halfRange = range / 2;
      minSteps = Math.max(0, minSteps - halfRange);
      maxSteps += halfRange;
    } else {
      const padding = Math.max(range * 0.15, MIN_RANGE_PADDING);
      minSteps = Math.max(0, minSteps - padding);
      maxSteps += padding;
      range = maxSteps - minSteps;

      if (range < MIN_VISIBLE_STEP_RANGE) {
        const targetRange = Math.max(
          MIN_VISIBLE_STEP_RANGE,
          MIN_RANGE_PADDING * 2
        );
        const midpoint = (maxSteps + minSteps) / 2;
        minSteps = Math.max(0, midpoint - targetRange / 2);
        maxSteps = midpoint + targetRange / 2;
        range = targetRange;
      }
    }

    // Always start from 0 for bar charts
    minSteps = 0;
    range = maxSteps;

    return {
      minSteps,
      maxSteps,
      range,
    };
  }, [filteredEntries]);

  const chartBars = useMemo(() => {
    if (!chartData) {
      return [];
    }

    return filteredEntries.map((entry, index) => {
      const x = xPositions[index] ?? 0;
      const normalizedHeight =
        chartData.range > 0 ? (entry.steps || 0) / chartData.range : 0;
      const bounded = Math.min(Math.max(normalizedHeight, 0), 1);
      const barHeight = bounded * (chartHeight - Y_AXIS_PADDING * 2);
      const y = chartHeight - Y_AXIS_PADDING - barHeight;

      return {
        date: entry.date,
        steps: entry.steps || 0,
        source: entry.source,
        x,
        y,
        height: barHeight,
        bounded,
      };
    });
  }, [chartData, chartHeight, filteredEntries, xPositions]);

  const selectedBar = useMemo(() => {
    if (!selectedDate) {
      return null;
    }
    return chartBars.find((bar) => bar.date === selectedDate) ?? null;
  }, [chartBars, selectedDate]);

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
  }, [selectedTimeframe, isOpen]);

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
    return `${timeframeLabel} trend (${entriesText}${daysText})`;
  })();

  const currentStepsValue =
    todaySteps ??
    (filteredEntries.length
      ? filteredEntries[filteredEntries.length - 1].steps
      : 0);
  const currentStepsDisplay =
    currentStepsValue > 0 ? currentStepsValue.toLocaleString() : '—';

  const weeklyAverageDisplay = (() => {
    if (!trend.weeklyAverage || trend.weeklyAverage === 0) {
      return '—';
    }
    return formatStepCount(trend.weeklyAverage);
  })();

  const yTicks = useMemo(() => {
    if (!chartData) return [];
    const steps = Math.max(Y_TICK_COUNT - 1, 1);
    return Array.from(
      { length: Y_TICK_COUNT },
      (_, index) => chartData.maxSteps - (chartData.range / steps) * index
    );
  }, [chartData]);

  const yTickPositions = useMemo(() => {
    if (!chartData || chartHeight <= 0) {
      return [];
    }

    const totalTicks = Math.max(yTicks.length, 1);

    return yTicks.map((steps, index) => {
      const normalized = chartData.range > 0 ? steps / chartData.range : 0;
      const bounded = Math.min(Math.max(normalized, 0), 1);
      const y =
        (1 - bounded) * (chartHeight - Y_AXIS_PADDING * 2) + Y_AXIS_PADDING;
      const isTop = index === 0;
      const isBottom = index === totalTicks - 1;
      const lineY = isTop
        ? Y_AXIS_PADDING
        : isBottom
          ? chartHeight - Y_AXIS_PADDING
          : y;
      const labelPercent = clampPercent(
        chartHeight === 0 ? 0 : (lineY / chartHeight) * 100
      );

      return {
        steps,
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
    [entriesMap, selectedDate, closeTooltip]
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
      if (target.tagName === 'rect' || target.tagName === 'g') {
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

  const updateTooltipPosition = useCallback(() => {
    if (!selectedBar) {
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
    const rawX = svgRect.left + selectedBar.x;
    const rawY = svgRect.top + selectedBar.y;

    setTooltipPosition({ x: rawX, y: rawY });
  }, [selectedBar]);

  useIsomorphicLayoutEffect(() => {
    if (!selectedBar) {
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
  }, [scheduleTooltipClose, selectedBar, updateTooltipPosition]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        timeframeDropdownRef.current &&
        !timeframeDropdownRef.current.contains(event.target)
      ) {
        setIsTimeframeDropdownOpen(false);
      }
    };

    if (isTimeframeDropdownOpen) {
      document.addEventListener('pointerdown', handleClickOutside);
      return () =>
        document.removeEventListener('pointerdown', handleClickOutside);
    }

    return undefined;
  }, [isTimeframeDropdownOpen]);

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch"
        contentClassName="fixed inset-0 w-screen h-screen p-0 bg-slate-900 rounded-none border-none !max-h-none flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        {/* Header with back button */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onClose?.()}
              aria-label="Back"
              className="text-slate-300 md:hover:text-white transition-all pressable-inline focus-ring"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="flex items-center gap-2">
              <Footprints size={22} className="text-blue-400" />
              <h3 className="text-white font-bold text-xl">Step History</h3>
            </div>
          </div>
        </div>

        {/* Stats and Chart Section */}
        <div className="flex-1 bg-slate-800 border-t border-slate-700 overflow-y-auto flex flex-col">
          {/* Stats Section */}
          <div className="px-4 pt-4 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">
                {todaySteps != null ? "Today's Steps" : 'Latest'}
              </p>
              <p className="text-white text-2xl font-bold">
                {currentStepsDisplay}
              </p>
              <p className="text-slate-400 text-[11px] mt-1">
                {latestDate && !todaySteps
                  ? `as of ${formatTooltipDate(latestDate)}`
                  : 'steps'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">
                7-Day Average
              </p>
              <p className="text-white text-lg font-semibold">
                {weeklyAverageDisplay}
              </p>
              <p className="text-slate-400 text-xs mt-1">steps/day</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">
                Trend
              </p>
              <p
                className={`${getTrendColorClass(trend)} font-semibold text-lg flex items-center gap-2`}
              >
                <TrendIcon direction={trend.direction} />
                {trend.label}
              </p>
              {trend.changePercent !== undefined &&
                trend.changePercent !== 0 && (
                  <p
                    className={`${trend.changePercent > 0 ? 'text-green-400' : 'text-yellow-400'} text-xs mt-1 font-medium`}
                  >
                    {trend.changePercent > 0 ? '+' : ''}
                    {trend.changePercent}% vs last week
                  </p>
                )}
            </div>
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">
                Timeframe
              </p>
              <p className="text-white text-sm font-semibold">
                {timeframeRangeLine}
              </p>
              <p className="text-slate-400 text-[11px] mt-1">{timeframeMain}</p>
            </div>
          </div>

          <div className="sticky top-0 z-10 px-4 py-2 bg-slate-800/95 backdrop-blur border-b border-slate-700 flex-shrink-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-slate-400 text-sm">
                {filteredEntries.length > 0
                  ? `${trend.averageSteps.toLocaleString()} avg steps`
                  : 'No step data recorded yet'}
              </p>

              <div className="flex items-center gap-2">
                {/* Timeframe Selector */}
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
                          className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors md:hover:bg-slate-600 first:rounded-t-md last:rounded-b-md ${
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

          {/* Graph and Timeline Section */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 pr-3 pb-1 overflow-hidden flex">
              {/* Graph viewport wrapper */}
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
                        {/* Grid lines */}
                        <g>
                          {yTickPositions.map(({ index, lineY }) => {
                            const isBaseline =
                              index === yTickPositions.length - 1;
                            return (
                              <line
                                key={`grid-${index}`}
                                x1="0"
                                y1={lineY}
                                x2={chartWidth}
                                y2={lineY}
                                stroke={isBaseline ? '#fff' : 'currentColor'}
                                strokeWidth={isBaseline ? 2 : 1}
                                strokeDasharray={isBaseline ? 'none' : '4 6'}
                                className={
                                  isBaseline
                                    ? 'opacity-80'
                                    : 'text-slate-500 opacity-60'
                                }
                              />
                            );
                          })}
                        </g>

                        {/* Bars */}
                        {chartBars.map(({ x, y, height, date, steps }) => (
                          <g
                            key={date}
                            onClick={(e) => handleDateClick(date, e)}
                            className="cursor-pointer"
                          >
                            {/* Invisible larger hit area */}
                            <rect
                              x={x - DATE_COLUMN_WIDTH / 2}
                              y={Y_AXIS_PADDING}
                              width={DATE_COLUMN_WIDTH}
                              height={chartHeight - Y_AXIS_PADDING * 2}
                              fill="transparent"
                            />
                            {/* Visible bar */}
                            <rect
                              x={x - BAR_WIDTH / 2}
                              y={y}
                              width={BAR_WIDTH}
                              height={Math.max(height, 2)}
                              rx={BAR_RADIUS}
                              ry={BAR_RADIUS}
                              fill={getBarColor(steps, trend.averageSteps)}
                              className={`transition-opacity ${
                                selectedDate === date
                                  ? 'opacity-100'
                                  : 'opacity-80 md:hover:opacity-100'
                              }`}
                            />
                            {/* Selection ring */}
                            {selectedDate === date && (
                              <rect
                                x={x - BAR_WIDTH / 2 - 2}
                                y={y - 2}
                                width={BAR_WIDTH + 4}
                                height={Math.max(height, 2) + 4}
                                rx={BAR_RADIUS + 1}
                                ry={BAR_RADIUS + 1}
                                fill="none"
                                stroke="#60a5fa"
                                strokeWidth="2"
                              />
                            )}
                          </g>
                        ))}
                      </svg>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <Footprints
                            size={48}
                            className="text-slate-600 mx-auto mb-3"
                          />
                          <p className="text-slate-500 text-lg">
                            No step data yet
                          </p>
                          <p className="text-slate-600 text-sm mt-1">
                            Connect Health Connect to start tracking
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Right edge soft fade */}
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-slate-800/90 to-transparent" />
              </div>

              {/* Y-axis - Fixed on right side */}
              <div className="rounded-r-lg w-14 flex-shrink-0 relative">
                <div className="absolute inset-0 px-2 py-4">
                  {chartData
                    ? yTickPositions.map(({ steps, index, labelPercent }) => {
                        const isTop = index === 0;
                        const isBottom = index === yTickPositions.length - 1;
                        const offsetPx = isTop ? 10 : isBottom ? -10 : 15;
                        const translateY = `translateY(calc(-50% + ${offsetPx}px))`;
                        return (
                          <div
                            key={`tick-${index}`}
                            className="absolute right-2 text-xs font-semibold text-slate-100/70 tracking-tight text-right"
                            style={{
                              top: `${labelPercent}%`,
                              transform: translateY,
                            }}
                          >
                            {formatStepCount(Math.round(steps))}
                          </div>
                        );
                      })
                    : null}
                </div>
              </div>
            </div>

            <div className="pr-1 pb-1 flex gap-1 flex-shrink-0">
              {/* Timeline viewport wrapper */}
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
                              className={`w-full flex flex-col items-center gap-1 py-2 px-2 rounded-md border transition-colors text-[10px] font-semibold ${
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
                {/* Right edge soft fade */}
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-slate-800/90 to-transparent" />
              </div>
              <div className="w-14 flex-shrink-0" />
            </div>
          </div>
        </div>
      </ModalShell>

      {/* Tooltip */}
      {selectedBar && selectedDate && entriesMap[selectedDate] && (
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
        >
          <div className="p-2">
            <p className="text-slate-400 text-[11.5px] mb-1">
              {formatTooltipDate(selectedDate)}
            </p>
            <p className="text-white text-2xl font-bold">
              {entriesMap[selectedDate].steps.toLocaleString()}
            </p>
            <p className="text-slate-400 text-sm">steps</p>
            {entriesMap[selectedDate].source && (
              <p className="text-slate-500 text-[10px] mt-2 uppercase tracking-wide">
                via{' '}
                {entriesMap[selectedDate].source === 'healthConnect'
                  ? 'Health Connect'
                  : 'manual'}
              </p>
            )}
          </div>

          {/* Arrow */}
          <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-600"></div>
        </div>
      )}
    </>
  );
};
