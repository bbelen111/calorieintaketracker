import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { goals } from '../../../constants/goals';
import {
  calculateWeightTrend,
  formatWeight,
  sortWeightEntries
} from '../../../utils/weight';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { WeightTrendInfoModal } from './WeightTrendInfoModal';

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
  // If no meaningful data, show white
  if (label === 'Need more data' || label === 'No data yet') {
    return 'text-white';
  }
  
  // Severe states (most extreme) - Red
  if (label.includes('Severe')) {
    return 'text-red-500';
  }
  
  // Aggressive states
  if (label.includes('Aggressive weight loss')) {
    return 'text-orange-500'; // Matches aggressive_cut goal
  }
  if (label.includes('Aggressive weight gain')) {
    return 'text-purple-500'; // Matches aggressive_bulk goal
  }
  
  // Moderate states
  if (label.includes('Moderate weight loss')) {
    return 'text-yellow-500'; // Matches cutting goal
  }
  if (label.includes('Moderate weight gain')) {
    return 'text-green-500'; // Matches bulking/lean bulk goal
  }
  
  // Gradual states - use slightly muted versions
  if (direction === 'down') {
    return 'text-yellow-400'; // Gradual loss
  }
  if (direction === 'up') {
    return 'text-green-400'; // Gradual gain
  }
  
  return 'text-blue-400'; // Stable/maintenance
};

const getGoalAlignmentText = (weeklyRate, selectedGoal) => {
  const absRate = Math.abs(weeklyRate);
  const goal = goals[selectedGoal];
  
  // Map goals to expected weekly rates (rough estimates in kg/week)
  const goalExpectations = {
    aggressive_bulk: { min: 0.5, max: 1.0, direction: 'up' },
    bulking: { min: 0.25, max: 0.5, direction: 'up' },
    maintenance: { min: -0.1, max: 0.1, direction: 'flat' },
    cutting: { min: 0.25, max: 0.5, direction: 'down' },
    aggressive_cut: { min: 0.5, max: 1.0, direction: 'down' }
  };
  
  const expectation = goalExpectations[selectedGoal];
  if (!expectation) return null;
  
  // Determine actual direction
  let actualDirection = 'flat';
  if (weeklyRate < -0.1) actualDirection = 'down';
  else if (weeklyRate > 0.1) actualDirection = 'up';
  
  // Check if direction matches goal
  if (actualDirection !== expectation.direction && expectation.direction !== 'flat') {
    if (expectation.direction === 'up') {
      return { text: 'Not gaining as expected', color: 'text-yellow-400' };
    }
    if (expectation.direction === 'down') {
      return { text: 'Not losing as expected', color: 'text-yellow-400' };
    }
  }
  
  // Check if rate is within expected range
  if (expectation.direction === 'flat') {
    if (absRate <= 0.1) {
      return { text: 'On track with goal', color: 'text-green-400' };
    }
    return { text: 'Deviating from maintenance', color: 'text-yellow-400' };
  }
  
  const expectedRate = expectation.direction === 'down' ? -weeklyRate : weeklyRate;
  
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
    aggressive_bulk: '+0.5-1.0 kg/wk',
    bulking: '+0.25-0.5 kg/wk',
    maintenance: '0.0 kg/wk',
    cutting: '-0.25-0.5 kg/wk',
    aggressive_cut: '-0.5-1.0 kg/wk'
  };
  
  return goalTargets[selectedGoal] || '0.0 kg/wk';
};

const DATE_COLUMN_WIDTH = 55;
const DATE_COLUMN_GAP = 8;
const Y_TICK_COUNT = 7;
// Visual padding when stretching across the viewport
const LEFT_EDGE_PADDING_GRAPH = 8; // tiny base value; additional leading space applied below
const RIGHT_EDGE_PADDING_GRAPH = 16; // small extra so the line/area can extend slightly
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

const getBaselineY = (defaultY) => defaultY - BASELINE_Y_OFFSET;

const clampPercent = (value) => Math.max(0, Math.min(100, value));

const getColumnsWidth = (count) => {
  if (count <= 0) {
    return 0;
  }
  const gaps = Math.max(0, count - 1) * DATE_COLUMN_GAP;
  return count * DATE_COLUMN_WIDTH + gaps;
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const formatTimelineLabel = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
};

// Short uppercase month date format e.g. "OCT 10, 2025"
const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  const parts = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  // Uppercase the month abbreviation (first token)
  return parts.replace(/^[A-Za-z]{3}/, (m) => m.toUpperCase());
};
// Helper to format date for tooltip
const formatTooltipDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
};

export const WeightTrackerModal = ({
  isOpen,
  isClosing,
  entries,
  latestWeight,
  selectedGoal = 'maintenance',
  onClose,
  onAddEntry,
  onEditEntry
}) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');
  const graphScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const tooltipRef = useRef(null);
  const [graphViewportWidth, setGraphViewportWidth] = useState(0);
  const [graphViewportHeight, setGraphViewportHeight] = useState(0);
  
  // Weight Trend Info Modal
  const {
    isOpen: isTrendInfoOpen,
    isClosing: isTrendInfoClosing,
    open: openTrendInfo,
    requestClose: closeTrendInfo
  } = useAnimatedModal();
  
  const sortedEntries = useMemo(() => sortWeightEntries(entries ?? []), [entries]);
  
  // Filter entries based on selected timeframe
  const filteredEntries = useMemo(() => {
    if (!sortedEntries.length) return [];
    if (selectedTimeframe === 'all') return sortedEntries;
    
    const latestEntry = sortedEntries[sortedEntries.length - 1];
    const latestDate = new Date(latestEntry.date + 'T00:00:00');
    
    const daysMap = {
      '7d': 7,
      '14d': 14,
      '30d': 30,
      '90d': 90
    };
    
    const daysToSubtract = daysMap[selectedTimeframe];
    if (!daysToSubtract) return sortedEntries;
    
    const cutoffDate = new Date(latestDate);
    cutoffDate.setDate(cutoffDate.getDate() - daysToSubtract);
    
    return sortedEntries.filter(entry => {
      const entryDate = new Date(entry.date + 'T00:00:00');
      return entryDate >= cutoffDate;
    });
  }, [sortedEntries, selectedTimeframe]);
  
  const trend = useMemo(() => calculateWeightTrend(filteredEntries), [filteredEntries]);
  const goalAlignment = useMemo(() => getGoalAlignmentText(trend.weeklyRate, selectedGoal), [trend.weeklyRate, selectedGoal]);

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

  const entryCount = sortedEntries.length;
  const filteredEntryCount = filteredEntries.length;

  const baseChartWidth = useMemo(() => {
    const baseWidth = getColumnsWidth(Math.max(filteredEntryCount, 1));
    if (filteredEntryCount > 0) {
      return baseWidth + LEADING_ENTRY_SPACE;
    }
    return baseWidth;
  }, [filteredEntryCount]);

  const chartWidth = useMemo(() => (
    Math.max(baseChartWidth, graphViewportWidth || 0)
  ), [baseChartWidth, graphViewportWidth]);

  const shouldStretchAcrossViewport = useMemo(() => (
    chartWidth > baseChartWidth
  ), [chartWidth, baseChartWidth]);

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
    const leftPad = Math.max(LEFT_EDGE_PADDING_GRAPH, FIRST_ENTRY_CENTER_OFFSET);
    const rightPad = RIGHT_EDGE_PADDING_GRAPH;
    const usableWidth = Math.max(chartWidth - leftPad - rightPad, 0);
    const step = filteredEntryCount > 1 ? usableWidth / (filteredEntryCount - 1) : 0;
    return filteredEntries.map((_, index) => leftPad + step * index);
  }, [chartWidth, filteredEntryCount, shouldStretchAcrossViewport, filteredEntries]);

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

    const leftPad = Math.max(LEFT_EDGE_PADDING_TIMELINE, FIRST_ENTRY_CENTER_OFFSET);
    const rightPad = RIGHT_EDGE_PADDING_TIMELINE;
    const usableWidth = Math.max(chartWidth - leftPad - rightPad, 0);
    const step = filteredEntryCount > 1 ? usableWidth / (filteredEntryCount - 1) : 0;
    return filteredEntries.map((_, index) => leftPad + step * index);
  }, [chartWidth, filteredEntryCount, shouldStretchAcrossViewport, filteredEntries]);

  const chartData = useMemo(() => {
    if (filteredEntries.length === 0) {
      return null;
    }

    const weights = filteredEntries.map((entry) => entry.weight);
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
        const targetRange = Math.max(MIN_VISIBLE_WEIGHT_RANGE, MIN_RANGE_PADDING * 2);
        const midpoint = (maxWeight + minWeight) / 2;
        minWeight = midpoint - targetRange / 2;
        maxWeight = midpoint + targetRange / 2;
        range = targetRange;
      }
    }

    return {
      minWeight,
      maxWeight,
      range
    };
  }, [filteredEntries]);

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
        bounded
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
        const target = Math.max(graphNode.scrollWidth - graphNode.clientWidth, 0);
        graphNode.scrollLeft = target;
      }

      const timelineNode = timelineScrollRef.current;
      if (timelineNode) {
        const target = Math.max(timelineNode.scrollWidth - timelineNode.clientWidth, 0);
        timelineNode.scrollLeft = target;
      }
    };

    // Schedule to allow layout to settle before scrolling.
    const frame = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);
  
  // Map entries by date for quick lookup
  const entriesMap = useMemo(() => {
    const map = {};
    filteredEntries.forEach(entry => {
      map[entry.date] = entry;
    });
    return map;
  }, [filteredEntries]);
  
  // Get latest entry date
  const latestDate = filteredEntries.length ? filteredEntries[filteredEntries.length - 1].date : null;

  // Earliest entry date and timeframe details for the trend summary
  const earliestDate = filteredEntries.length ? filteredEntries[0].date : null;
  const entriesCount = filteredEntries.length;
  const daysRange = (earliestDate && latestDate)
    ? Math.round((new Date(latestDate + 'T00:00:00') - new Date(earliestDate + 'T00:00:00')) / (1000 * 60 * 60 * 24))
    : 0;
  const timeframeRangeLine = earliestDate && latestDate
    ? `${formatShortDate(earliestDate)} - ${formatShortDate(latestDate)}`
    : '';
  
  const timeframeLabel = (() => {
    switch (selectedTimeframe) {
      case '7d': return '7-day';
      case '14d': return '14-day';
      case '30d': return '30-day';
      case '90d': return '90-day';
      case 'all': return 'All-time';
      default: return '30-day';
    }
  })();
  
  const timeframeMain = `${timeframeLabel} trend (${entriesCount} ${entriesCount === 1 ? 'entry' : 'entries'}${earliestDate && latestDate ? ` over ${daysRange} days` : ''})`;

  const currentWeightValue = filteredEntries.length
    ? filteredEntries[filteredEntries.length - 1].weight
    : latestWeight;
  const currentWeightDisplay = (() => {
    const formatted = formatWeight(currentWeightValue);
    return formatted ? `${formatted} kg` : '—';
  })();

  const totalChangeDisplay = (() => {
    if (!Number.isFinite(trend.delta) || trend.delta === 0) {
      return '0.0 kg';
    }
    const sign = trend.delta > 0 ? '+' : '';
    return `${sign}${trend.delta.toFixed(1)} kg`;
  })();
  const weeklyRateDisplay = (() => {
    if (!Number.isFinite(trend.weeklyRate) || trend.weeklyRate === 0) {
      return '0.0 kg/wk';
    }
    const sign = trend.weeklyRate > 0 ? '+' : '';
    return `${sign}${trend.weeklyRate.toFixed(2)} kg/wk`;
  })();

  const yTicks = useMemo(() => {
    if (!chartData) return [];
    const steps = Math.max(Y_TICK_COUNT - 1, 1);
    return Array.from({ length: Y_TICK_COUNT }, (_, index) => (
      chartData.maxWeight - (chartData.range / steps) * index
    ));
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
      const labelPercent = clampPercent(chartHeight === 0 ? 0 : (lineY / chartHeight) * 100);

      return {
        weight,
        index,
        lineY,
        labelPercent
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

  const handleDateClick = useCallback((date, event) => {
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
  }, [entriesMap, selectedDate, onEditEntry, closeTooltip]);

  useEffect(() => {
    if (!selectedDate) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const tooltipNode = tooltipRef.current;
      
      // Check if click is inside tooltip
      if (tooltipNode?.contains(event.target)) {
        return;
      }

      // Check if click is on a chart point (SVG circle element)
      const target = event.target;
      if (target.tagName === 'circle' || target.tagName === 'g') {
        // Let the handleDateClick handle it
        return;
      }

      // Close tooltip if clicking outside
      closeTooltip();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [closeTooltip, selectedDate]);

  useEffect(() => {
    if (selectedDate && !tooltipClosing) {
      const frame = requestAnimationFrame(() => setTooltipEntered(true));
      return () => {
        cancelAnimationFrame(frame);
        setTooltipEntered(false);
      };
    }
    if (!selectedDate) {
      setTooltipEntered(false);
    }
    return undefined;
  }, [selectedDate, tooltipClosing]);

  const handleTooltipClick = useCallback((e) => {
    e.stopPropagation();
    if (selectedDate) {
      const entry = entriesMap[selectedDate];
      onEditEntry?.(entry);
      closeTooltip();
    }
  }, [selectedDate, entriesMap, onEditEntry, closeTooltip]);

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

  const handleScroll = () => closeTooltip();
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
  }, [closeTooltip, selectedPoint, updateTooltipPosition]);

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="!z-[80] fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch"
        contentClassName="fixed inset-0 w-screen h-screen p-0 bg-slate-900 rounded-none border-none !max-h-none flex flex-col"
      >
        {/* Header with back button */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="text-slate-300 hover:text-white transition-all"
            >
              <ChevronLeft size={24} />
            </button>
            <h3 className="text-white font-bold text-2xl">Weight Tracker</h3>
          </div>
        </div>

    {/* Combined Timeline and Current Weight Section - Takes full remaining space */}
    <div className="flex-1 bg-slate-800 border-t border-slate-700 overflow-y-auto flex flex-col">
          {/* Stats Section */}
          <div className="px-6 pt-6 pb-4 grid grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Current Weight</p>
              <p className="text-white text-3xl font-bold">{currentWeightDisplay}</p>
              <p className="text-slate-400 text-xs mt-1 text-sm">
                {latestDate ? `as of ${formatTooltipDate(latestDate)}` : ''}
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={openTrendInfo}
                className="text-slate-400 text-xs uppercase tracking-wide mb-1 hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 group"
              >
                Weekly Rate
                <Info size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>
              <p className="text-white text-lg font-semibold">{weeklyRateDisplay}</p>
              <p className="text-slate-400 text-xs mt-1">
                Goal: {getGoalWeeklyTarget(selectedGoal)}
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={openTrendInfo}
                className="text-slate-400 text-xs uppercase tracking-wide mb-1 hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 group"
              >
                Trend
                <Info size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>
              <p className={`${getTrendToneClass(trend.direction, trend.label)} font-semibold text-l flex items-center gap-2`}>
                <TrendIcon direction={trend.direction} />
                {trend.label}
              </p>
              {goalAlignment && (
                <p className={`${goalAlignment.color} text-xs mt-1 font-medium`}>
                  {goalAlignment.text}
                </p>
              )}
            </div>
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Timeframe</p>
              <p className="text-white text-sm font-semibold">{timeframeRangeLine}</p>
              <p className="text-slate-400 text-[11px] mt-1">{timeframeMain}</p>
            </div>
          </div>

          <div className="px-6 pb-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAddEntry?.()}
                className="px-5 py-1 md:px-4 md:py-3 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all font-semibold text-base hover:bg-blue-500/90"
              >
                Add Entry
              </button>
              
              {/* Timeframe Selector */}
              <div className="flex gap-1.5">
                {[
                  { value: '7d', label: '7D' },
                  { value: '14d', label: '14D' },
                  { value: '30d', label: '30D' },
                  { value: '90d', label: '90D' },
                  { value: 'all', label: 'All' }
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedTimeframe(value)}
                    className={`px-3 py-1.5 md:py-2.5 rounded-md font-semibold text-xs transition-all whitespace-nowrap ${
                      selectedTimeframe === value
                        ? 'bg-blue-600 text-white border border-blue-400'
                        : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
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
                    if (timelineScrollRef.current && timelineScrollRef.current.scrollLeft !== nextScrollLeft) {
                      timelineScrollRef.current.scrollLeft = nextScrollLeft;
                    }
                    if (selectedDate) {
                      closeTooltip();
                    }
                  }}
                >
                  <div className="py-4 pr-6 pl-0 h-full" style={{ width: `${chartWidth}px` }}>
                  {chartData ? (
                    <svg
                      width={chartWidth}
                      height={chartHeight}
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                          {trend.label.includes('Severe') ? (
                            <>
                              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
                            </>
                          ) : trend.label.includes('Aggressive weight loss') ? (
                            <>
                              <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#f97316" stopOpacity="0.05" />
                            </>
                          ) : trend.label.includes('Aggressive weight gain') ? (
                            <>
                              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.05" />
                            </>
                          ) : trend.label.includes('Moderate weight loss') ? (
                            <>
                              <stop offset="0%" stopColor="#eab308" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#eab308" stopOpacity="0.05" />
                            </>
                          ) : trend.label.includes('Moderate weight gain') ? (
                            <>
                              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                            </>
                          ) : trend.direction === 'down' ? (
                            <>
                              <stop offset="0%" stopColor="#eab308" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#eab308" stopOpacity="0.05" />
                            </>
                          ) : trend.direction === 'up' ? (
                            <>
                              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                            </>
                          ) : (
                            <>
                              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.05" />
                            </>
                          )}
                        </linearGradient>
                      </defs>
                      
                      {/* Line graph, area, and grid */}
                      {(() => {

                        let pathData = '';
                        let areaData = '';
                        const points = chartPoints;
                        const baselineY = yTickPositions.length > 0
                          ? yTickPositions[yTickPositions.length - 1].lineY
                          : chartHeight;

                        if (points.length === 1 && shouldStretchAcrossViewport) {
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
                          points.forEach(({ x, y }, idx) => {
                            if (idx === 0) return; // already handled first point
                            pathData += ` L ${x} ${y}`;
                            areaData += ` L ${x} ${y}`;
                          });
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
                              <path
                                d={areaData}
                                fill="url(#areaGradient)"
                              />
                            )}
                            
                            {/* Grid lines */}
                            <g>
                              {yTickPositions.map(({ index, lineY }) => {
                                const isBaseline = index === yTickPositions.length - 1;
                                const yValue = isBaseline ? getBaselineY(lineY) : lineY;
                                return (
                                  <line
                                    key={`grid-${index}`}
                                    x1="0"
                                    y1={yValue}
                                    x2={chartWidth}
                                    y2={yValue}
                                    stroke={isBaseline ? '#fff' : 'currentColor'}
                                    strokeWidth={isBaseline ? 2 : 1}
                                    strokeDasharray={isBaseline ? 'none' : '4 6'}
                                    className={isBaseline ? 'opacity-80' : 'text-slate-500 opacity-60'}
                                  />
                                );
                              })}
                            </g>

                            {/* Line */}
                            {pathData && (
                              <path
                                d={pathData}
                                fill="none"
                                stroke={
                                  trend.label.includes('Severe')
                                    ? '#ef4444'
                                    : trend.label.includes('Aggressive weight loss')
                                    ? '#f97316'
                                    : trend.label.includes('Aggressive weight gain')
                                    ? '#a855f7'
                                    : trend.label.includes('Moderate weight loss')
                                    ? '#eab308'
                                    : trend.label.includes('Moderate weight gain')
                                    ? '#22c55e'
                                    : trend.direction === 'down' 
                                    ? '#eab308' 
                                    : trend.direction === 'up' 
                                    ? '#22c55e' 
                                    : '#60a5fa'
                                }
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
                                <circle cx={x} cy={y} r={POINT_HIT_RADIUS} fill="transparent" />
                                <circle
                                  cx={x}
                                  cy={y}
                                  r={POINT_RADIUS}
                                  fill="#1e293b"
                                  stroke={
                                    trend.label.includes('Severe')
                                      ? '#ef4444'
                                      : trend.label.includes('Aggressive weight loss')
                                      ? '#f97316'
                                      : trend.label.includes('Aggressive weight gain')
                                      ? '#a855f7'
                                      : trend.label.includes('Moderate weight loss')
                                      ? '#eab308'
                                      : trend.label.includes('Moderate weight gain')
                                      ? '#22c55e'
                                      : trend.direction === 'down' 
                                      ? '#eab308' 
                                      : trend.direction === 'up' 
                                      ? '#22c55e' 
                                      : '#60a5fa'
                                  }
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
                      <p className="text-slate-500 text-lg">No weight data yet.</p>
                    </div>
                  )}
                </div>
                {/* Close scroll container before adding overlay */}
                </div>
                {/* Right edge soft fade pinned to viewport of graph */}
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-5 bg-gradient-to-l from-slate-800/95 to-transparent" />
              </div>

              {/* Y-axis - Fixed on right side */}
              <div className="rounded-r-lg w-14 flex-shrink-0 relative">
                <div className="absolute inset-0 px-2 py-4">
                  {chartData ? (
                    yTickPositions.map(({ weight, index, labelPercent }) => {
                      const isTop = index === 0;
                      const isBottom = index === yTickPositions.length - 1;
                      const offsetPx = isTop ? 10 : isBottom ? -10 : 15;
                      const translateY = `translateY(calc(-50% + ${offsetPx}px))`;
                      return (
                        <div
                          key={`tick-${index}`}
                          className="absolute right-2 text-sm font-semibold text-slate-100 tracking-tight text-right"
                          style={{ top: `${labelPercent}%`, transform: translateY }}
                        >
                          {formatWeight(weight)}
                        </div>
                      );
                    })
                  ) : null}
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
                    if (graphScrollRef.current && graphScrollRef.current.scrollLeft !== nextScrollLeft) {
                      graphScrollRef.current.scrollLeft = nextScrollLeft;
                    }
                    if (selectedDate) {
                      closeTooltip();
                    }
                  }}
                >
                  <div className="pl-0 pr-6 py-3" style={{ width: `${chartWidth}px` }}>
                  <div
                    className="relative"
                    style={{
                      width: `${chartWidth}px`,
                      height: `${TIMELINE_TRACK_HEIGHT}px`
                    }}
                  >
                    {filteredEntries.map((entry, index) => {
                      const { date } = entry;
                      const isLatest = date === latestDate;
                      const label = formatTimelineLabel(date);
                      const x = timelineXPositions[index] ?? 0;
                      const prevX = index > 0 ? timelineXPositions[index - 1] : null;
                      const nextX = index < timelineXPositions.length - 1 ? timelineXPositions[index + 1] : null;

                      // Fixed width for timeline label boxes
                      const buttonWidth = DATE_COLUMN_WIDTH;

                      return (
                        <div
                          key={`${date}-${index}`}
                          className="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2"
                          style={{
                            left: `${x}px`,
                            width: `${buttonWidth}px`
                          }}
                        >
                          <button
                            type="button"
                            tabIndex={-1}
                            className={`w-full flex flex-col items-center gap-1 py-2 px-3 rounded-md border transition-colors text-xs font-semibold ${
                              isLatest
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-transparent border-slate-600 text-slate-100'
                            } ${selectedDate === date ? 'ring-2 ring-blue-400' : ''}`}
                            disabled
                          >
                            <span className="w-full text-center">{label}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Close inner wrapper and scroll container before overlay */}
                </div>
                {/* Right edge soft fade pinned to viewport of timeline */}
                <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-5 bg-gradient-to-l from-slate-800/95 to-transparent" />
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
          className={`fixed z-[100] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-4 transform -translate-x-1/2 -translate-y-full pointer-events-auto transition duration-150 ease-out ${
            tooltipEntered && !tooltipClosing ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y - TOOLTIP_VERTICAL_OFFSET}px`,
            width: `${TOOLTIP_WIDTH}px`,
          }}
          onClick={handleTooltipClick}
        >
          <div className="cursor-pointer hover:bg-slate-700/50 rounded p-2 transition-all">
            <p className="text-slate-400 text-[11.5px] mb-1">{formatTooltipDate(selectedDate)}</p>
            <p className="text-white text-2xl font-bold">
              {formatWeight(entriesMap[selectedDate].weight)} kg
            </p>
            <p className="text-slate-500 text-[10px] mt-2 uppercase tracking-wide">Tap to edit</p>
          </div>
          
          {/* Arrow */}
          <div
            className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-600"
          ></div>
        </div>
      )}

      {/* Weight Trend Info Modal */}
      <WeightTrendInfoModal
        isOpen={isTrendInfoOpen}
        isClosing={isTrendInfoClosing}
        trend={trend}
        onClose={closeTrendInfo}
      />
    </>
  );
};
