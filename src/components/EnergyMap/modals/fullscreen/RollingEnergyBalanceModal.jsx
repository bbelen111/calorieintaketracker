import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  ChevronLeft,
  BarChart3,
  TrendingDown,
  TrendingUp,
  Minus,
  HelpCircle,
  Info,
  X,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  formatDateKeyUtc,
  getTodayDateKey,
} from '../../../../utils/data/dateKeys';
import {
  calculateRollingEnergyBalance,
  getDailyBalanceKind,
  ROLLING_BALANCE_WINDOWS,
  DEFAULT_ROLLING_BALANCE_WINDOW_DAYS,
  MAINTENANCE_EPSILON,
} from '../../../../utils/calculations/rollingEnergyBalance';
import {
  calculateWeightTrend,
  formatDateLabel,
  normalizeDateKey,
} from '../../../../utils/measurements/weight';
import { sortBodyFatEntries } from '../../../../utils/measurements/bodyFat';
import { formatWeeklyRate } from '../../../../utils/visuals/trackerHelpers';

const WINDOW_LABELS = {
  3: '3D',
  7: '7D',
  14: '14D',
  28: '28D',
};

// Fixed bar sizing per window (mirrors StepTracker's per-mode bar dims).
const BAR_WIDTH_BY_WINDOW = {
  3: 40,
  7: 24,
  14: 14,
  28: 8,
};
const BAR_RADIUS_BY_WINDOW = {
  3: 10,
  7: 6,
  14: 4,
  28: 2,
};

const KIND_META = {
  deficit: {
    label: 'Deficit',
    textClass: 'text-accent-red',
    fill: 'rgb(var(--accent-red))',
  },
  surplus: {
    label: 'Surplus',
    textClass: 'text-accent-green',
    fill: 'rgb(var(--accent-green))',
  },
  maintenance: {
    label: 'Maintenance',
    textClass: 'text-accent-slate',
    fill: 'rgb(var(--accent-slate))',
  },
};

const TIMELINE_TRACK_HEIGHT = 36;
const Y_TICK_COUNT = 5;
const TOOLTIP_WIDTH = 150;
const TOOLTIP_VERTICAL_OFFSET = 27;
const SCROLL_SETTLE_DELAY_MS = 140;
const GRAPH_ENTER_DURATION_MS = 280;
const GRAPH_SWITCH_DURATION_MS = 220;
/**
 * Max span (inclusive calendar days) for a pinned cross-navigation analysis
 * range. The Smart thermogenesis signal is exactly 28 calendar days; ranges
 * outside 1..28 are ignored so the modal falls back to the ordinary ledger.
 */
const SMART_ANALYSIS_MAX_SPAN_DAYS = 28;

// ---------------------------------------------------------------------------
// Formatting + date helpers (tracker-modal conventions)
// ---------------------------------------------------------------------------

/**
 * Display-sign convention for rolling energy balance. The canonical calc in
 * rollingEnergyBalance.js keeps balance = tdee - intake (positive = deficit) and
 * that is what the unit tests assert; this render layer only is sign-flipped so a
 * deficit reads negative and deficit bars hang downward (surplus positive, up).
 * Negated at getBalanceForSnapshot/avgValue and the header Stats (data.* is the
 * core positive=deficit stream); colour classified via getDailyBalanceKind(-b);
 * bar growth + transformOrigin branches swapped. goalDailyBalanceTarget and the
 * expected/variance comparison keep using positive=deficit internally.
 */
const formatSignedKcal = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '\u2014';
  const rounded = Math.round(numeric);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString()} kcal`;
};

const formatKcal = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '\u2014';
  return `${Math.round(numeric).toLocaleString()} kcal`;
};

const formatAverage = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return '\u2014';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(1)} kcal/day`;
};

const formatEstimateKg = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return '\u2014';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '+';
  return `${sign}${Math.abs(numeric).toFixed(2)} kg`;
};

const formatEstimatePercent = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return '\u2014';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '+';
  return `${sign}${Math.abs(numeric).toFixed(1)}%`;
};

// Compact signed value for axis labels (units implied by the modal context).
const formatAxisKcal = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '\u2014';
  const rounded = Math.round(numeric);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString()}`;
};

const formatTimelineLabel = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
  });
};

// Compact range label for the pinned Smart-signal chip ("Jul 26 – Aug 22").
const formatRangeLabel = (startKey, endKey) => {
  const start = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '';
  }
  const options = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const startLabel = start.toLocaleDateString('en-US', options);
  const endLabel = end.toLocaleDateString('en-US', options);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
};

const toDateKey = (d) => formatDateKeyUtc(d);

const isFirstDayOfYear = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.getUTCMonth() === 0 && date.getUTCDate() === 1;
};

const addDays = (dateStr, delta) => {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return toDateKey(d);
};

const getBalanceForSnapshot = (snap) => {
  const tdee = Number(snap?.tdee);
  const intake = Number(snap?.intake);
  if (!Number.isFinite(tdee) || !Number.isFinite(intake)) return null;
  return { tdee, intake, balance: intake - tdee };
};

// Build a continuous calendar timeline over all tracked days ending at today.
// Missing / padding slots appear as empty bars, mirroring WeightTracker.
const buildCalendarTimeline = (dayMap, todayKey, windowDays) => {
  const keys = [...dayMap.keys()].sort();
  if (!keys.length) return [];
  const firstDateKey = keys[0];
  const firstDate = new Date(firstDateKey + 'T00:00:00Z');
  const lastDate = new Date(todayKey + 'T00:00:00Z');
  if (lastDate < firstDate) return [];
  const calendarDays = Math.round((lastDate - firstDate) / 86400000) + 1;
  const padding = Math.max(windowDays - calendarDays, 0);
  const slots = [];
  for (let i = padding; i > 0; i--) {
    slots.push({
      date: addDays(firstDateKey, -i),
      day: null,
      isPadding: true,
    });
  }
  for (let i = 0; i < calendarDays; i++) {
    const date = addDays(firstDateKey, i);
    slots.push({ date, day: dayMap.get(date) ?? null, isPadding: false });
  }
  return slots;
};
// ---------------------------------------------------------------------------
// Small UI blocks
// ---------------------------------------------------------------------------

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    <BarChart3 size={28} className="text-muted mb-2" />
    <p className="text-foreground font-semibold text-sm">No tracked days yet</p>
    <p className="text-muted text-xs mt-1 leading-snug max-w-xs text-center">
      Log calories through the Tracker to start building up a rolling energy
      balance. Days with no log aren&apos;t counted as zero-intake days.
    </p>
  </div>
);

const Legend = () => (
  <div className="flex items-center justify-center gap-4 py-1 flex-shrink-0">
    <span className="flex items-center gap-1 text-[11px] text-accent-red">
      <TrendingDown size={12} /> Deficit
    </span>
    <span className="flex items-center gap-1 text-[11px] text-accent-green">
      <TrendingUp size={12} /> Surplus
    </span>
    <span className="flex items-center gap-1 text-[11px] text-accent-slate">
      <Minus size={12} /> Near zero
    </span>
  </div>
);

const Stat = ({ label, children, caption }) => (
  <div>
    <p className="text-muted text-xs uppercase tracking-wide mb-1">{label}</p>
    {children}
    {caption && <p className="text-muted text-[11px] mt-1">{caption}</p>}
  </div>
);

export const RollingEnergyBalanceModal = ({
  isOpen,
  isClosing,
  onClose,
  onOpenInfo,
  // Pinned cross-navigation context ({ origin, rangeStart, rangeEnd }) from the
  // Adaptive Thermogenesis modal. Transient and orchestrator-owned; purely a
  // viewing lens — it never changes how balances are computed.
  analysisContext,
  onDismissAnalysisContext,
  onOpenThermogenesis,
  onOpenWeightTracker,
}) => {
  const [windowDays, setWindowDays] = useState(
    DEFAULT_ROLLING_BALANCE_WINDOW_DAYS
  );

  const store = useEnergyMapStore(
    (state) => ({
      dailySnapshots: state.userData?.dailySnapshots,
      weightEntries: state.weightEntries ?? [],
      goalDailyBalanceTarget: state.goalDailyBalanceTarget,
      userData: state.userData ?? {},
      bodyFatEntries: state.userData?.bodyFatEntries ?? [],
    }),
    shallow
  );

  // --- Selection tooltip state ---
  const [selectedDate, setSelectedDate] = useState(null);
  const [tooltipEntered, setTooltipEntered] = useState(false);
  const [tooltipClosing, setTooltipClosing] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // --- Carousel + animation state (mirrors the tracker modals) ---
  // activePageIndex tracks live scroll position (used only as a setter).
  const [, setActivePageIndex] = useState(-1);
  const [settledPageIndex, setSettledPageIndex] = useState(-1);
  const [graphViewportWidth, setGraphViewportWidth] = useState(0);
  const [graphViewportHeight, setGraphViewportHeight] = useState(0);
  const [graphAnimationPhase, setGraphAnimationPhase] = useState('idle');
  const [settledWindowData, setSettledWindowData] = useState(null);

  const carouselRef = useRef(null);
  const tooltipRef = useRef(null);
  const headerSettleTimeoutRef = useRef(null);
  const graphAnimationTimeoutRef = useRef(null);
  const wasOpenRef = useRef(false);
  const prevSnapshotRef = useRef(null);

  // --- Persisted selection: moving the scroll position re-anchors the window
  // header stats to whatever page the carousel has settled on. ---
  const settledAsOfRef = useRef(null);

  const prefersReducedMotion = useMemo(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const clearGraphAnimationTimeout = useCallback(() => {
    if (graphAnimationTimeoutRef.current) {
      clearTimeout(graphAnimationTimeoutRef.current);
      graphAnimationTimeoutRef.current = null;
    }
  }, []);

  const triggerGraphAnimation = useCallback(
    (phase) => {
      if (prefersReducedMotion) {
        setGraphAnimationPhase('idle');
        return;
      }
      clearGraphAnimationTimeout();
      setGraphAnimationPhase(phase);
      const duration =
        phase === 'enter' ? GRAPH_ENTER_DURATION_MS : GRAPH_SWITCH_DURATION_MS;
      graphAnimationTimeoutRef.current = setTimeout(() => {
        setGraphAnimationPhase('idle');
        graphAnimationTimeoutRef.current = null;
      }, duration);
    },
    [clearGraphAnimationTimeout, prefersReducedMotion]
  );

  // --- Derived data ---
  const dayMap = useMemo(() => {
    const map = new Map();
    const snapshots = store.dailySnapshots ?? {};
    Object.entries(snapshots).forEach(([date, snap]) => {
      const parsed = getBalanceForSnapshot(snap);
      if (parsed) map.set(date, { date, ...parsed });
    });
    return map;
  }, [store.dailySnapshots]);

  const todayKey = getTodayDateKey();

  const timelineSlots = useMemo(
    () => buildCalendarTimeline(dayMap, todayKey, windowDays),
    [dayMap, todayKey, windowDays]
  );

  // Default window data (latest = as of today). Re-anchored while scrolling.
  const latestWindowData = useMemo(
    () =>
      calculateRollingEnergyBalance({
        snapshots: store.dailySnapshots,
        windowDays,
        asOfDate: todayKey,
        goalDailyBalanceTarget: store.goalDailyBalanceTarget,
      }),
    [store.dailySnapshots, windowDays, todayKey, store.goalDailyBalanceTarget]
  );

  // --- Pinned Smart-signal view (cross-navigation from Adaptive Thermogenesis) ---
  // When the orchestrator supplies an adaptive-thermogenesis context, this
  // modal views the Smart signal's exact calendar source range instead of the
  // latest-N-valid-days ledger window. The calculation itself stays canonical
  // (same calculateRollingEnergyBalance, bounded by startDate + asOfDate).
  const analysisRange = useMemo(() => {
    if (analysisContext?.origin !== 'adaptive-thermogenesis') return null;
    const start = normalizeDateKey(analysisContext?.rangeStart);
    const end = normalizeDateKey(analysisContext?.rangeEnd);
    if (!start || !end || start > end) return null;
    const spanDays =
      Math.round(
        (new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) /
          86400000
      ) + 1;
    if (spanDays < 1 || spanDays > SMART_ANALYSIS_MAX_SPAN_DAYS) return null;
    return { start, end, spanDays };
  }, [analysisContext]);
  const analysisActive = Boolean(analysisRange);

  const analysisWindowData = useMemo(() => {
    if (!analysisRange) return null;
    return calculateRollingEnergyBalance({
      snapshots: store.dailySnapshots,
      windowDays: SMART_ANALYSIS_MAX_SPAN_DAYS,
      startDate: analysisRange.start,
      asOfDate: analysisRange.end,
      goalDailyBalanceTarget: store.goalDailyBalanceTarget,
    });
  }, [analysisRange, store.dailySnapshots, store.goalDailyBalanceTarget]);

  // Carousel slot index of the range's final day (scroll anchor).
  const analysisEndSlotIndex = useMemo(() => {
    if (!analysisRange) return -1;
    let index = -1;
    timelineSlots.forEach((slot, i) => {
      if (slot.date === analysisRange.end) index = i;
    });
    return index;
  }, [analysisRange, timelineSlots]);

  // Header stats reflect the pinned Smart range while active, otherwise the
  // currently settled carousel page (if scrolled).
  const data =
    analysisActive && analysisWindowData
      ? analysisWindowData
      : (settledWindowData ?? latestWindowData);

  const weightTrend = useMemo(
    () => calculateWeightTrend(store.weightEntries ?? [], 7),
    [store.weightEntries]
  );

  // Estimated body-fat change derived from the rolling weight change, using a
  // directional fat-mass fraction: deficits lose ~77% fat, surpluses gain ~50% fat.
  // Body-fat percent change is relative to the current bodyweight (kg).
  const estimatedBodyFatChangePercent = useMemo(() => {
    const weightChangeKg = -Number(data.estimatedWeightChangeKg);
    if (!Number.isFinite(weightChangeKg)) return null;
    const weight = Number(store.userData?.weight);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    if (!store.userData?.bodyFatTrackingEnabled) return null;
    const sorted = sortBodyFatEntries(store.bodyFatEntries);
    const latest = sorted[sorted.length - 1];
    if (!latest?.bodyFat) return null;
    const fatRatio = weightChangeKg < 0 ? 0.77 : 0.5;
    const fatMassChangeKg = weightChangeKg * fatRatio;
    return (fatMassChangeKg / weight) * 100;
  }, [data.estimatedWeightChangeKg, store.userData, store.bodyFatEntries]);

  const balanceTone =
    data.hasData && data.rollingBalance !== 0
      ? getDailyBalanceKind(data.rollingBalance) === 'deficit'
        ? 'text-accent-red'
        : 'text-accent-green'
      : 'text-muted';

  const hasExpected =
    data.expectedBalance != null && data.balanceVariance != null;
  const hasWeightTrend =
    Number.isFinite(Number(weightTrend?.weeklyRate)) &&
    weightTrend?.weeklyRate !== 0;

  // --- Carousel / viewport dimensions (mirrors WeightTrackerModal) ---
  useLayoutEffect(() => {
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

  // Scroll on open and when the window mode changes: to the pinned
  // Smart-range end while the analysis view is active, otherwise to latest.
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      setActivePageIndex(-1);
      setSettledPageIndex(-1);
      const node = carouselRef.current;
      if (!node) return;
      const step = node.clientWidth / windowDays;
      const targetLeft =
        analysisEndSlotIndex >= 0
          ? Math.max(0, (analysisEndSlotIndex + 1) * step - node.clientWidth)
          : node.scrollWidth - node.clientWidth;
      node.scrollTo({ left: targetLeft, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, analysisEndSlotIndex, windowDays]);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => {
      setActivePageIndex(-1);
      setSettledPageIndex(-1);
      const node = carouselRef.current;
      if (!node) return;
      const step = node.clientWidth / windowDays;
      const targetLeft =
        analysisEndSlotIndex >= 0
          ? Math.max(0, (analysisEndSlotIndex + 1) * step - node.clientWidth)
          : node.scrollWidth - node.clientWidth;
      node.scrollTo({ left: targetLeft, behavior: 'instant' });
    }, 50);
    return () => clearTimeout(timeout);
  }, [windowDays, isOpen, analysisEndSlotIndex]);

  // --- Chart geometry ---
  const chartWidth = graphViewportWidth || 300;
  const chartHeight = useMemo(
    () =>
      graphViewportHeight > 0
        ? Math.max(graphViewportHeight - TIMELINE_TRACK_HEIGHT - 24, 100)
        : 200,
    [graphViewportHeight]
  );

  const totalSlots = timelineSlots.length;
  const STEP = chartWidth / windowDays;
  const PAD = STEP / 2;
  const totalWidth = totalSlots * STEP;

  // Highlight band behind the bars for the pinned Smart-analysis range.
  const analysisBand = useMemo(() => {
    if (!analysisRange) return null;
    let startIdx = -1;
    let endIdx = -1;
    timelineSlots.forEach((slot, index) => {
      if (slot.date < analysisRange.start || slot.date > analysisRange.end) {
        return;
      }
      if (startIdx === -1) startIdx = index;
      endIdx = index;
    });
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
    return {
      x1: Math.max(0, PAD + startIdx * STEP - STEP / 2),
      x2: Math.min(totalWidth, PAD + endIdx * STEP + STEP / 2),
    };
  }, [analysisRange, timelineSlots, PAD, STEP, totalWidth]);

  // Global y-scale across the whole visible timeline (stable while scrolling).
  const maxAbs = useMemo(() => {
    let max = 1;
    dayMap.forEach((d) => {
      const v = Math.abs(d.balance);
      if (v > max) max = v;
    });
    return max;
  }, [dayMap]);

  const midlineY = chartHeight / 2;
  const halfExtent = chartHeight * 0.44;

  // Y ticks (signed) + positions, like the tracker modals.
  const yTicks = useMemo(() => {
    const steps = Math.max(Y_TICK_COUNT - 1, 1);
    return Array.from(
      { length: Y_TICK_COUNT },
      (_, i) => maxAbs - (2 * maxAbs * i) / steps
    );
  }, [maxAbs]);

  const yTickPositions = useMemo(() => {
    if (chartHeight <= 0) return [];
    return yTicks.map((value, index) => {
      const y = (1 - (value + maxAbs) / (2 * maxAbs)) * chartHeight;
      return { value, index, y, isBaseline: Math.abs(value) < 1 };
    });
  }, [yTicks, chartHeight, maxAbs]);

  // Average-of-visible-window pill on the Y axis (replaces the avg line).
  const avgValue = -Number(data.averageDailyBalance);
  const showAvgPill =
    Number.isFinite(avgValue) && Math.abs(avgValue) > MAINTENANCE_EPSILON;
  const avgY = showAvgPill
    ? Math.min(
        chartHeight,
        Math.max(0, (1 - (avgValue + maxAbs) / (2 * maxAbs)) * chartHeight)
      )
    : null;

  // Bars (StepTracker-style rendering).
  const bars = useMemo(() => {
    return timelineSlots.map((slot, index) => {
      const x = PAD + index * STEP;
      if (!slot.day) {
        return {
          date: slot.date,
          x,
          y: midlineY,
          height: 0,
          hasData: false,
          isPadding: slot.isPadding,
          kind: 'maintenance',
          balance: 0,
          tdee: null,
          intake: null,
        };
      }
      const kind = getDailyBalanceKind(-slot.day.balance);
      const rawH = (Math.abs(slot.day.balance) / maxAbs) * halfExtent;
      const barH = Math.max(rawH, 2);
      const y = slot.day.balance >= 0 ? midlineY - barH : midlineY;
      return {
        date: slot.date,
        x,
        y,
        height: barH,
        hasData: true,
        isPadding: slot.isPadding,
        kind,
        balance: slot.day.balance,
        tdee: slot.day.tdee,
        intake: slot.day.intake,
      };
    });
  }, [timelineSlots, PAD, STEP, maxAbs, halfExtent, midlineY]);

  // --- Tooltip / selection ---
  const closeTooltip = useCallback(() => {
    setTooltipClosing(true);
    setTimeout(() => {
      setSelectedDate(null);
      setTooltipClosing(false);
    }, 150);
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

  // Close tooltip on outside click (mirrors tracker modals).
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

  // Tooltip enter animation.
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
    if (!selectedDate) return;
    const node = carouselRef.current;
    if (!node) return;
    const selectedBar = bars.find((b) => b.date === selectedDate);
    if (!selectedBar) return;
    const rect = node.getBoundingClientRect();
    const rawX = rect.left + selectedBar.x - node.scrollLeft;
    const rawY = rect.top + 8 + selectedBar.y;
    setTooltipPosition({ x: rawX, y: rawY });
  }, [selectedDate, bars]);

  useLayoutEffect(() => {
    if (!selectedDate) return undefined;
    updateTooltipPosition();
    const handleResize = () => updateTooltipPosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedDate, updateTooltipPosition]);

  // --- Snap detection (auto-lock), mirrors WeightTrackerModal ---
  const handleCarouselScroll = useCallback(() => {
    const node = carouselRef.current;
    if (!node || !node.clientWidth) return;
    const stepPx = node.clientWidth / windowDays;
    const idx = Math.round(node.scrollLeft / stepPx);
    setActivePageIndex(idx);
    if (headerSettleTimeoutRef.current) {
      clearTimeout(headerSettleTimeoutRef.current);
    }
    headerSettleTimeoutRef.current = setTimeout(() => {
      setSettledPageIndex(idx);
      headerSettleTimeoutRef.current = null;
    }, SCROLL_SETTLE_DELAY_MS);
    if (selectedDate) {
      setTooltipClosing(true);
      setTimeout(() => {
        setSelectedDate(null);
        setTooltipClosing(false);
      }, 150);
    }
  }, [selectedDate, windowDays]);

  // Re-anchor header stats to the settled page.
  useEffect(() => {
    if (settledPageIndex < 0 || totalSlots === 0) return;
    const endIndex = Math.min(
      settledPageIndex + windowDays - 1,
      totalSlots - 1
    );
    const asOfDate = timelineSlots[endIndex]?.date;
    if (!asOfDate || asOfDate === settledAsOfRef.current) return;
    settledAsOfRef.current = asOfDate;
    setSettledWindowData(
      calculateRollingEnergyBalance({
        snapshots: store.dailySnapshots,
        windowDays,
        asOfDate,
        goalDailyBalanceTarget: store.goalDailyBalanceTarget,
      })
    );
  }, [
    settledPageIndex,
    totalSlots,
    windowDays,
    timelineSlots,
    store.dailySnapshots,
    store.goalDailyBalanceTarget,
  ]);

  // Reset the settled offset when data is replaced so the header returns to
  // the latest window.
  useEffect(() => {
    const sig = JSON.stringify({
      dailySnapshots: store.dailySnapshots,
      goalDailyBalanceTarget: store.goalDailyBalanceTarget,
    });
    if (prevSnapshotRef.current !== sig) {
      prevSnapshotRef.current = sig;
      setSettledPageIndex(-1);
      setSettledWindowData(null);
      settledAsOfRef.current = null;
    }
  }, [store.dailySnapshots, store.goalDailyBalanceTarget]);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      triggerGraphAnimation('enter');
    }
    if (!isOpen) {
      clearGraphAnimationTimeout();
      const frame = requestAnimationFrame(() => setGraphAnimationPhase('idle'));
      return () => cancelAnimationFrame(frame);
    }
    wasOpenRef.current = isOpen;
    return undefined;
  }, [clearGraphAnimationTimeout, isOpen, triggerGraphAnimation]);

  useEffect(
    () => () => {
      if (headerSettleTimeoutRef.current) {
        clearTimeout(headerSettleTimeoutRef.current);
      }
    },
    []
  );

  const handleWindowChange = useCallback(
    (next) => {
      // While the pinned Smart-range view is active, any window-pill tap first
      // exits back to the ordinary ledger window.
      if (analysisActive) {
        onDismissAnalysisContext?.();
        if (selectedDate) closeTooltip();
        triggerGraphAnimation('switch');
        if (next !== windowDays) {
          setWindowDays(next);
          setSettledPageIndex(-1);
          setSettledWindowData(null);
          settledAsOfRef.current = null;
        }
        return;
      }
      if (next === windowDays) return;
      if (selectedDate) closeTooltip();
      setWindowDays(next);
      setSettledPageIndex(-1);
      setSettledWindowData(null);
      settledAsOfRef.current = null;
      triggerGraphAnimation('switch');
    },
    [
      windowDays,
      selectedDate,
      closeTooltip,
      triggerGraphAnimation,
      analysisActive,
      onDismissAnalysisContext,
    ]
  );

  // Exiting the pinned Smart-range view re-anchors the carousel to the latest
  // ledger page. Covers same-window-pill dismissal, where no other scroll
  // effect re-runs because windowDays did not change. Deferred to the next
  // frame, matching the modal's other scroll effects.
  const wasAnalysisActiveRef = useRef(false);
  useEffect(() => {
    const wasActive = wasAnalysisActiveRef.current;
    wasAnalysisActiveRef.current = analysisActive;
    if (!wasActive || analysisActive || !isOpen) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      setActivePageIndex(-1);
      setSettledPageIndex(-1);
      carouselRef.current?.scrollTo({
        left: carouselRef.current.scrollWidth - carouselRef.current.clientWidth,
        behavior: 'instant',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [analysisActive, isOpen]);

  const graphAnimationClass =
    graphAnimationPhase === 'enter'
      ? 'tracker-graph-enter'
      : graphAnimationPhase === 'switch'
        ? 'tracker-graph-switch'
        : '';

  // --- Selected day for the tooltip ---
  const selectedBar = selectedDate
    ? (bars.find((b) => b.date === selectedDate) ?? null)
    : null;
  const selectedKind = selectedBar ? selectedBar.kind : 'maintenance';

  // --- Render a single bar (StepTracker-style) ---
  const renderBar = (bar) => {
    const isSelected = bar.date === selectedDate;
    const inAnalysisRange =
      !analysisActive ||
      (bar.date >= analysisRange.start && bar.date <= analysisRange.end);
    const barW = BAR_WIDTH_BY_WINDOW[windowDays] ?? 24;
    const barR = BAR_RADIUS_BY_WINDOW[windowDays] ?? 6;
    const barColor = KIND_META[bar.kind].fill;
    const glow =
      bar.kind === 'deficit'
        ? 'drop-shadow(0 0 4px rgb(var(--accent-red) / 0.5))'
        : bar.kind === 'surplus'
          ? 'drop-shadow(0 0 4px rgb(var(--accent-green) / 0.5))'
          : 'drop-shadow(0 0 4px rgb(var(--accent-slate) / 0.5))';
    return (
      <g
        key={bar.date}
        onClick={(e) => handleDateClick(bar.date, e)}
        className="cursor-pointer"
      >
        <rect
          x={bar.x - barW}
          y={0}
          width={barW * 2}
          height={chartHeight}
          fill="transparent"
        />
        {bar.hasData && (
          <rect
            x={bar.x - barW / 2}
            y={bar.y}
            width={barW}
            height={Math.max(bar.height, 2)}
            rx={barR}
            ry={barR}
            fill={barColor}
            className={`transition-opacity tracker-bar-animated ${
              isSelected
                ? 'opacity-100'
                : inAnalysisRange
                  ? 'md:hover:opacity-90'
                  : 'opacity-25'
            }`}
            style={{
              filter: glow,
              // The shared trackerBarIn keyframe animates upward growth (transform-origin: center bottom).
              // Balance bars grow from the midline: surplus bars (display-positive) grow UP and keep the
              // center bottom origin; deficit bars (display-negative) hang DOWN and animate from their top
              transformOrigin:
                bar.balance >= 0 ? 'center bottom' : 'center top',
            }}
          />
        )}
        {isSelected && bar.hasData && (
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

  // Adaptive x-axis label density per window.
  const labelStep = windowDays > 21 ? 4 : windowDays > 10 ? 2 : 1;
  const firstRenderedDateByYear = new Map();
  timelineSlots.forEach((slot, index) => {
    if (index % labelStep !== 0) return;
    const yearKey = slot.date.slice(0, 4);
    if (yearKey && !firstRenderedDateByYear.has(yearKey)) {
      firstRenderedDateByYear.set(yearKey, slot.date);
    }
  });

  const timelineTrack = timelineSlots.map((slot, index) => {
    const showLabel = index % labelStep === 0 || slot.date === todayKey;
    const yearKey = slot.date.slice(0, 4);
    const showYear =
      showLabel &&
      (isFirstDayOfYear(slot.date) ||
        firstRenderedDateByYear.get(yearKey) === slot.date);
    const hasData = !!slot.day;
    const isEmpty = !hasData;
    return (
      <div
        key={slot.date}
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
                onClick={(e) => handleLabelClick(slot.date, e)}
              >
                <div className="flex flex-col items-center leading-none">
                  <span
                    className={`text-[11px] font-semibold whitespace-nowrap ${
                      isEmpty
                        ? 'text-muted/30'
                        : slot.date === todayKey
                          ? 'text-accent-blue'
                          : 'text-muted'
                    }`}
                  >
                    {formatTimelineLabel(slot.date)}
                  </span>
                  {showYear && (
                    <span
                      className={`mt-0.5 text-[9px] font-medium ${
                        isEmpty ? 'text-muted/30' : 'text-muted/70'
                      }`}
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

  const hasAnyData = dayMap.size > 0;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="fixed inset-0 bg-surface/70 !p-0 !flex-none !items-stretch !justify-stretch z-[1000]"
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
              Rolling Energy Balance
            </h3>
          </div>
          <div className="flex items-center gap-5">
            {typeof onOpenThermogenesis === 'function' && (
              <button
                type="button"
                onClick={onOpenThermogenesis}
                aria-label="View in Adaptive Thermogenesis"
                title="View in Adaptive Thermogenesis"
                className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
              >
                <Activity size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenInfo}
              aria-label="Rolling Energy Balance info"
              className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
            >
              <HelpCircle size={20} />
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 bg-surface border-t border-border overflow-y-auto flex flex-col">
          {/* Window selector */}
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <div className="relative flex items-center gap-1 p-1 bg-surface-highlight rounded-lg">
              <div
                className="absolute inset-y-1 rounded-md shadow-md bg-accent-blue"
                style={{
                  width: `calc((100% - 20px) / ${ROLLING_BALANCE_WINDOWS.length})`,
                  left: `calc(${ROLLING_BALANCE_WINDOWS.indexOf(windowDays)} * ((100% - 20px) / ${ROLLING_BALANCE_WINDOWS.length}) + ${4 + ROLLING_BALANCE_WINDOWS.indexOf(windowDays) * 4}px)`,
                  transition:
                    'left 0.28s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.28s ease-out, box-shadow 0.28s ease-out, opacity 0.2s ease-out',
                  opacity: analysisActive ? 0 : 1,
                }}
              />
              {ROLLING_BALANCE_WINDOWS.map((window) => (
                <button
                  key={window}
                  type="button"
                  onClick={() => handleWindowChange(window)}
                  className={`relative z-10 flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    window === windowDays && !analysisActive
                      ? 'text-primary-foreground'
                      : 'text-muted md:hover:text-foreground'
                  }`}
                >
                  {WINDOW_LABELS[window] ?? `${window}D`}
                </button>
              ))}
            </div>
            {analysisActive && analysisRange ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted min-w-0">
                  <span className="font-semibold text-accent-purple">
                    Smart signal
                  </span>
                  {` · ${formatRangeLabel(analysisRange.start, analysisRange.end)}`}
                  <span className="text-muted/70">
                    {` · ${data.trackedDays} of ${analysisRange.spanDays} days tracked`}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => handleWindowChange(windowDays)}
                  aria-label="Exit Smart signal view"
                  title="Back to ledger"
                  className="flex-shrink-0 rounded-lg p-1.5 text-accent-purple md:hover:bg-surface-highlight/50 pressable-inline focus-ring"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted mt-2">
                {`${windowDays}-day balance`}
                <span className="text-muted/70">
                  {` · ${data.trackedDays} of ${data.windowDays} days tracked`}
                </span>
              </p>
            )}
          </div>

          {!hasAnyData ? (
            <EmptyState />
          ) : (
            <>
              {/* Stat grid (4 blocks, 2x2) */}
              <div className="px-4 pt-1 pb-3 grid grid-cols-2 gap-3 flex-shrink-0">
                <Stat label="Total Balance">
                  <p className={`text-3xl font-bold ${balanceTone}`}>
                    {formatSignedKcal(-data.rollingBalance)}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    Avg{' '}
                    <span className="text-foreground font-semibold">
                      {formatAverage(-data.averageDailyBalance)}
                    </span>
                  </p>
                </Stat>
                <Stat label="Estimated Change">
                  <p className="text-foreground text-3xl font-bold">
                    {formatEstimateKg(-data.estimatedWeightChangeKg)}
                  </p>
                  <p className="text-foreground text-[11px] mt-1">
                    {estimatedBodyFatChangePercent == null
                      ? '\u2014'
                      : `${formatEstimatePercent(
                          estimatedBodyFatChangePercent
                        )} body fat`}
                  </p>
                </Stat>
                <Stat label="Expected">
                  <p className="text-foreground text-lg font-semibold">
                    {hasExpected
                      ? formatSignedKcal(-data.expectedBalance)
                      : '\u2014'}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    {hasExpected
                      ? `Variance: ${formatSignedKcal(-data.balanceVariance)}`
                      : 'no goal target set'}
                  </p>
                </Stat>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="View weight tracker trend details"
                  onClick={onOpenWeightTracker}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenWeightTracker?.();
                    }
                  }}
                  className="group cursor-pointer rounded-lg focus-ring pressable-card md:hover:bg-surface-highlight/40"
                >
                  <p className="text-muted text-xs uppercase tracking-wide mb-1 flex items-center gap-1 md:group-hover:text-foreground transition-colors">
                    Observed Trend
                    <Info
                      size={14}
                      className="opacity-60 md:group-hover:opacity-100 transition-opacity"
                    />
                  </p>
                  <p className="text-foreground text-lg font-semibold">
                    {hasWeightTrend
                      ? formatWeeklyRate(weightTrend.weeklyRate, 'weight')
                      : 'Insufficient data'}
                  </p>
                  <p className="text-muted text-[11px] mt-1">comparison only</p>
                </div>
              </div>

              {/* Separator */}
              <div className="border-b border-border flex-shrink-0" />

              {/* Legend */}
              <Legend />

              {/* Graph carousel + Y-axis */}
              <div className="flex-1 flex flex-col min-h-0 pb-2">
                <div className="flex-1 pr-2 pb-1 overflow-hidden flex">
                  {/* Carousel */}
                  <div className="relative flex-1 overflow-hidden">
                    <div
                      ref={carouselRef}
                      className={`overflow-x-auto overflow-y-hidden h-full flex ${graphAnimationClass}`}
                      style={{
                        scrollSnapType: 'x proximity',
                        WebkitOverflowScrolling: 'touch',
                      }}
                      onScroll={handleCarouselScroll}
                    >
                      <div
                        style={{
                          width: `${totalWidth}px`,
                          height: '100%',
                          position: 'relative',
                          flexShrink: 0,
                        }}
                      >
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
                            {/* Grid lines */}
                            {yTickPositions.map(
                              ({ index: gi, y, isBaseline }) => (
                                <line
                                  key={`grid-${gi}`}
                                  x1={0}
                                  y1={y}
                                  x2={totalWidth}
                                  y2={y}
                                  stroke={
                                    isBaseline
                                      ? 'rgb(var(--foreground) / 0.6)'
                                      : 'currentColor'
                                  }
                                  strokeWidth={isBaseline ? 2 : 1}
                                  strokeDasharray={isBaseline ? 'none' : '4 6'}
                                  className={
                                    isBaseline
                                      ? 'opacity-80'
                                      : 'text-muted opacity-60'
                                  }
                                />
                              )
                            )}
                            {/* Average daily-balance reference line (dashed,
                                spans the plot). Kept under the bars. */}
                            {showAvgPill && avgY != null && (
                              <line
                                x1={0}
                                y1={avgY}
                                x2={totalWidth}
                                y2={avgY}
                                stroke="rgb(var(--accent-blue))"
                                strokeWidth={1.5}
                                strokeDasharray="6 4"
                                opacity={0.85}
                              />
                            )}
                            {/* Pinned Smart-analysis range band (behind bars) */}
                            {analysisBand && (
                              <g pointerEvents="none">
                                <rect
                                  x={analysisBand.x1}
                                  y={0}
                                  width={Math.max(
                                    analysisBand.x2 - analysisBand.x1,
                                    0
                                  )}
                                  height={chartHeight}
                                  fill="rgb(var(--accent-purple) / 0.08)"
                                />
                                <line
                                  x1={analysisBand.x1}
                                  x2={analysisBand.x1}
                                  y1={0}
                                  y2={chartHeight}
                                  stroke="rgb(var(--accent-purple) / 0.5)"
                                  strokeWidth={1}
                                  strokeDasharray="4 4"
                                />
                                <line
                                  x1={analysisBand.x2}
                                  x2={analysisBand.x2}
                                  y1={0}
                                  y2={chartHeight}
                                  stroke="rgb(var(--accent-purple) / 0.5)"
                                  strokeWidth={1}
                                  strokeDasharray="4 4"
                                />
                              </g>
                            )}
                            {bars.map((bar) => renderBar(bar))}
                          </svg>
                        </div>
                        <div className="flex h-full">{timelineTrack}</div>
                      </div>
                    </div>
                    <div className="pointer-events-none absolute right-0 -mr-1 top-0 h-full w-3 bg-gradient-to-l from-surface/90 to-transparent" />
                  </div>

                  {/* Y-axis (right column) */}
                  <div className="rounded-r-lg w-14 flex-shrink-0 relative">
                    <div
                      className="absolute inset-x-0 px-1"
                      style={{ top: '8px', height: `${chartHeight}px` }}
                    >
                      {yTickPositions.map(({ value, index, y }) => (
                        <div
                          key={`tick-${index}`}
                          className="absolute right-2 text-xs font-semibold text-foreground/70 tracking-tight text-right"
                          style={{
                            top: `${y}px`,
                            transform: 'translateY(-50%)',
                            transition: 'top 0.3s ease-out',
                          }}
                        >
                          {formatAxisKcal(value)}
                        </div>
                      ))}
                      {showAvgPill && avgY != null && (
                        <div
                          className="absolute right-0.5 px-2 py-0.5 rounded-lg text-[11px] font-bold text-primary-foreground shadow-md flex items-center justify-center leading-none"
                          style={{
                            top: `${avgY}px`,
                            transform: 'translateY(-50%)',
                            transition: 'top 0.3s ease-out',
                            backgroundColor: 'rgb(var(--accent-blue))',
                          }}
                        >
                          {`avg ${formatAxisKcal(avgValue)}`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ModalShell>

      {/* Selected-day tooltip */}
      {selectedDate && selectedBar && selectedBar.hasData && (
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
          <div className="rounded p-2">
            <p className="text-muted text-[11.5px] mb-1">
              {formatDateLabel(selectedBar.date)}
            </p>
            <p
              className={`text-lg font-bold ${KIND_META[selectedKind].textClass}`}
            >
              {formatSignedKcal(selectedBar.balance)}
            </p>
            <div className="mt-2 pt-2 border-t border-border flex justify-between text-sm">
              <div>
                <p className="text-muted text-[10px] uppercase">TDEE</p>
                <p className="text-foreground font-semibold">
                  {formatKcal(selectedBar.tdee)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted text-[10px] uppercase">Intake</p>
                <p className="text-foreground font-semibold">
                  {formatKcal(selectedBar.intake)}
                </p>
              </div>
            </div>
          </div>
          <div className="absolute left-1/2 transform -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-border" />
        </div>
      )}
    </>
  );
};
