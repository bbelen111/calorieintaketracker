import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import {
  calculateWeightTrend,
  formatWeight,
  sortWeightEntries
} from '../../../utils/weight';

const TrendIcon = ({ direction }) => {
  if (direction === 'up') {
    return <TrendingUp size={18} />;
  }
  if (direction === 'down') {
    return <TrendingDown size={18} />;
  }
  return <Minus size={18} />;
};

const getTrendToneClass = (direction) => {
  if (direction === 'down') {
    return 'text-emerald-300';
  }
  if (direction === 'up') {
    return 'text-amber-300';
  }
  return 'text-slate-300';
};

const DATE_COLUMN_WIDTH = 66;
const DATE_COLUMN_GAP = 8;
const Y_TICK_COUNT = 8;
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
const TOOLTIP_VERTICAL_OFFSET = 24;


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

// Helper to get day name

const formatTimelineLabel = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
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
  onClose,
  onAddEntry,
  onEditEntry
}) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const graphScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const tooltipRef = useRef(null);
  const [graphViewportWidth, setGraphViewportWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 0
  ));
  const [graphViewportHeight, setGraphViewportHeight] = useState(() => (
    typeof window !== 'undefined' ? window.innerHeight * 0.3 : 0
  ));
  
  const sortedEntries = useMemo(() => sortWeightEntries(entries ?? []), [entries]);
  const trend = useMemo(() => calculateWeightTrend(sortedEntries), [sortedEntries]);

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

  const baseChartWidth = useMemo(() => {
    const baseWidth = getColumnsWidth(Math.max(entryCount, 1));
    if (entryCount > 0) {
      return baseWidth + LEADING_ENTRY_SPACE;
    }
    return baseWidth;
  }, [entryCount]);

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
    if (entryCount === 0) {
      return [];
    }

    if (!shouldStretchAcrossViewport) {
      const start = FIRST_ENTRY_CENTER_OFFSET;
      const step = DATE_COLUMN_WIDTH + DATE_COLUMN_GAP;
      return sortedEntries.map((_, index) => start + index * step);
    }

    if (entryCount === 1) {
      // Keep the point slightly inset from the left
      return [Math.max(FIRST_ENTRY_CENTER_OFFSET, chartWidth / 2)];
    }

    // Stretch to fill: minimal left padding, slight right padding
    const leftPad = Math.max(LEFT_EDGE_PADDING_GRAPH, FIRST_ENTRY_CENTER_OFFSET);
    const rightPad = RIGHT_EDGE_PADDING_GRAPH;
    const usableWidth = Math.max(chartWidth - leftPad - rightPad, 0);
    const step = entryCount > 1 ? usableWidth / (entryCount - 1) : 0;
    return sortedEntries.map((_, index) => leftPad + step * index);
  }, [chartWidth, entryCount, shouldStretchAcrossViewport, sortedEntries]);

  // Separate X positions for timeline labels so the first label rests flush on the left
  const timelineXPositions = useMemo(() => {
    if (entryCount === 0) return [];

    if (!shouldStretchAcrossViewport) {
      const start = FIRST_ENTRY_CENTER_OFFSET;
      const step = DATE_COLUMN_WIDTH + DATE_COLUMN_GAP;
      return sortedEntries.map((_, index) => start + index * step);
    }

    if (entryCount === 1) {
      return [Math.max(FIRST_ENTRY_CENTER_OFFSET, chartWidth / 2)];
    }

    const leftPad = Math.max(LEFT_EDGE_PADDING_TIMELINE, FIRST_ENTRY_CENTER_OFFSET);
    const rightPad = RIGHT_EDGE_PADDING_TIMELINE;
    const usableWidth = Math.max(chartWidth - leftPad - rightPad, 0);
    const step = entryCount > 1 ? usableWidth / (entryCount - 1) : 0;
    return sortedEntries.map((_, index) => leftPad + step * index);
  }, [chartWidth, entryCount, shouldStretchAcrossViewport, sortedEntries]);

  const chartData = useMemo(() => {
    if (sortedEntries.length === 0) {
      return null;
    }

    const weights = sortedEntries.map((entry) => entry.weight);
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
  }, [sortedEntries]);

  const chartPoints = useMemo(() => {
    if (!chartData) {
      return [];
    }

    return sortedEntries.map((entry, index) => {
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
  }, [chartData, chartHeight, sortedEntries, xPositions]);

  const selectedPoint = useMemo(() => {
    if (!selectedDate) {
      return null;
    }
    return chartPoints.find((point) => point.date === selectedDate) ?? null;
  }, [chartPoints, selectedDate]);

  useEffect(() => {
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
    }, [chartWidth, sortedEntries.length, isOpen]);
  
  // Map entries by date for quick lookup
  const entriesMap = useMemo(() => {
    const map = {};
    sortedEntries.forEach(entry => {
      map[entry.date] = entry;
    });
    return map;
  }, [sortedEntries]);
  
  // Get latest entry date
  const latestDate = sortedEntries.length ? sortedEntries[sortedEntries.length - 1].date : null;

  const currentWeightValue = sortedEntries.length
    ? sortedEntries[sortedEntries.length - 1].weight
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

  const handleDateClick = (date) => {
    const entry = entriesMap[date];
    if (!entry) return;

    if (selectedDate === date) {
      onEditEntry?.(entry);
      closeTooltip();
    } else {
      setSelectedDate(date);
    }
  };

  useEffect(() => {
    if (!selectedDate) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const tooltipNode = tooltipRef.current;
      const graphNode = graphScrollRef.current;
      const timelineNode = timelineScrollRef.current;

      if (
        tooltipNode?.contains(event.target) ||
        graphNode?.contains(event.target) ||
        timelineNode?.contains(event.target)
      ) {
        return;
      }

      closeTooltip();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
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
              onClick={onClose}
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
            </div>
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total Change</p>
              <p className="text-white text-2xl font-semibold">{totalChangeDisplay}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Weekly Rate</p>
              <p className="text-white text-2xl font-semibold">{weeklyRateDisplay}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Trend</p>
              <p className={`${getTrendToneClass(trend.direction)} font-semibold text-lg flex items-center gap-2`}>
                <TrendIcon direction={trend.direction} />
                {trend.label}
              </p>
            </div>
          </div>

          <div className="px-6 pb-4 flex-shrink-0">
            <button
              type="button"
              onClick={() => onAddEntry?.()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all text-sm font-medium"
            >
              Add Entry
            </button>
          </div>

          {/* Graph and Timeline Section - Synchronized scrolling */}
            <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 pr-6 pb-4 overflow-hidden flex gap-1">
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
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
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
                        } else {
                          points.forEach(({ x, y }, idx) => {
                            if (idx === 0) {
                              pathData = `M ${x} ${y}`;
                              areaData = `M ${x} ${chartHeight} L ${x} ${y}`;
                            } else {
                              pathData += ` L ${x} ${y}`;
                              areaData += ` L ${x} ${y}`;
                            }
                          });

                          if (points.length > 0) {
                            const lastPoint = points[points.length - 1];
                            // Extend the line slightly to the right edge for a nicer finish
                            pathData += ` L ${chartWidth} ${lastPoint.y}`;
                            areaData += ` L ${chartWidth} ${lastPoint.y} L ${chartWidth} ${chartHeight} Z`;
                          }
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
                                stroke="#3b82f6"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            )}
                            
                            {/* Points */}
                            {points.map(({ x, y, date }) => (
                              <g
                                key={date}
                                onClick={() => handleDateClick(date)}
                                className="cursor-pointer"
                              >
                                {/* Larger invisible circle for easier clicking */}
                                <circle cx={x} cy={y} r="12" fill="transparent" />
                                <circle
                                  cx={x}
                                  cy={y}
                                  r="6"
                                  fill="#1e293b"
                                  stroke="#3b82f6"
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
                      <p className="text-slate-500 text-lg">No weight data yet. Start tracking to see your progress!</p>
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
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs">kg</div>
                  )}
                </div>
              </div>
            </div>

            <div className="pr-6 pb-6 flex gap-1 flex-shrink-0">
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
                    {sortedEntries.map((entry, index) => {
                      const { date } = entry;
                      const isLatest = date === latestDate;
                      const label = formatTimelineLabel(date);
                      const x = timelineXPositions[index] ?? 0;
                      const prevX = index > 0 ? timelineXPositions[index - 1] : null;
                      const nextX = index < timelineXPositions.length - 1 ? timelineXPositions[index + 1] : null;

                      const leftBoundary = prevX != null ? (prevX + x) / 2 : 0;
                      const rightBoundary = nextX != null ? (nextX + x) / 2 : chartWidth;
                      const availableWidth = Math.max(rightBoundary - leftBoundary, DATE_COLUMN_WIDTH);
                      const stretchedWidth = Math.max(availableWidth - 12, DATE_COLUMN_WIDTH);
                      const proposedWidth = shouldStretchAcrossViewport
                        ? stretchedWidth
                        : DATE_COLUMN_WIDTH;
                      const leftSpace = Math.max(x - leftBoundary, DATE_COLUMN_WIDTH / 2);
                      const rightSpace = Math.max(rightBoundary - x, DATE_COLUMN_WIDTH / 2);
                      const constrainedWidth = Math.min(proposedWidth, leftSpace * 2, rightSpace * 2);
                      const buttonWidth = Math.max(constrainedWidth, DATE_COLUMN_WIDTH);

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
          onClick={(e) => {
            e.stopPropagation();
            const entry = entriesMap[selectedDate];
            onEditEntry?.(entry);
            closeTooltip();
          }}
        >
          <div className="cursor-pointer hover:bg-slate-700/50 rounded p-2 transition-all">
            <p className="text-slate-400 text-xs mb-1">{formatTooltipDate(selectedDate)}</p>
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
    </>
  );
};
