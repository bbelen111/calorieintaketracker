import { resolveGoalCalorieDelta } from './calculations.js';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// Practical approximation: ~7,700 kcal per kg of bodyweight change.
// This assumes mixed tissue change (not pure fat-only change), so very lean
// gain/loss phases may differ from this estimate.
const KCAL_PER_KG_WEIGHT = 7700;
const MAINTENANCE_DELTA_THRESHOLD = 100;

export const TARGET_METRICS = {
  WEIGHT: 'weight',
  BODY_FAT: 'bodyFat',
  WEIGHT_AND_BODY_FAT: 'weight_and_body_fat',
};

export const LEGACY_TARGET_METRICS = {
  WEIGHT_AND_BODY_FAT: 'weight_and_bodyFat',
};

export const PHASE_TARGET_PLANNING_ERROR = {
  NONE: null,
  MISSING_DATE: 'MISSING_DATE',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  NO_METRIC_INPUT: 'NO_METRIC_INPUT',
  INVALID_DATE_WINDOW: 'INVALID_DATE_WINDOW',
};

const SURPLUS_STRICT_MIN = 100;
const SURPLUS_STRICT_MAX = 600;
const SURPLUS_LENIENT_MAX = 1300;

const DEFICIT_STRICT_MIN = 200;
const DEFICIT_STRICT_MAX = 1000;
const DEFICIT_LENIENT_MAX = 1300;

const setDiagnosticsError = (diagnostics, errorCode) => {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return;
  }

  diagnostics.errorCode = errorCode;
};

const markDiagnosticsSuccess = (diagnostics) => {
  setDiagnosticsError(diagnostics, PHASE_TARGET_PLANNING_ERROR.NONE);
};

const normalizeDateKey = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return DATE_KEY_REGEX.test(normalized) ? normalized : null;
};

const parseDateKeyToUtc = (dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized
    .split('-')
    .map((value) => Number(value));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateKeyUtc = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const addDaysUtc = (dateKey, days) => {
  const parsed = parseDateKeyToUtc(dateKey);
  if (!parsed || !Number.isFinite(days)) {
    return null;
  }

  const next = new Date(parsed.getTime());
  next.setUTCDate(next.getUTCDate() + Math.trunc(days));
  return formatDateKeyUtc(next);
};

const toRoundedNullableNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric * 10) / 10;
};

const toNullablePercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric >= 100) {
    return null;
  }
  return Math.round(numeric * 10) / 10;
};

const getDaySpan = (startDateKey, endDateKey) => {
  const startDate = parseDateKeyToUtc(startDateKey);
  const endDate = parseDateKeyToUtc(endDateKey);
  if (!startDate || !endDate) {
    return null;
  }

  const msDiff = endDate.getTime() - startDate.getTime();
  const daySpan = Math.round(msDiff / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(daySpan) || daySpan <= 0) {
    return null;
  }

  return daySpan;
};

const classifyAggressivenessBand = (requiredDailyDeltaCalories) => {
  const delta = Number(requiredDailyDeltaCalories);
  if (!Number.isFinite(delta)) {
    return 'blocked';
  }

  if (delta === 0) {
    return 'strict';
  }

  if (delta > 0) {
    if (delta >= SURPLUS_STRICT_MIN && delta <= SURPLUS_STRICT_MAX) {
      return 'strict';
    }
    if (delta <= SURPLUS_LENIENT_MAX) {
      return 'lenient';
    }
    return 'blocked';
  }

  const deficitMagnitude = Math.abs(delta);
  if (
    deficitMagnitude >= DEFICIT_STRICT_MIN &&
    deficitMagnitude <= DEFICIT_STRICT_MAX
  ) {
    return 'strict';
  }
  if (deficitMagnitude <= DEFICIT_LENIENT_MAX) {
    return 'lenient';
  }
  return 'blocked';
};

export const getAggressivenessBandDisplayLabel = ({
  aggressivenessBand,
  requiredDailyDeltaCalories,
}) => {
  if (aggressivenessBand === 'blocked') {
    return 'Too fast';
  }

  if (aggressivenessBand === 'strict') {
    return 'Optimal pace';
  }

  const delta = Number(requiredDailyDeltaCalories);
  if (!Number.isFinite(delta)) {
    return 'Flexible pace';
  }

  if (delta > 0) {
    return delta < SURPLUS_STRICT_MIN ? 'Sustainable pace' : 'Aggressive pace';
  }

  const deficitMagnitude = Math.abs(delta);
  return deficitMagnitude < DEFICIT_STRICT_MIN
    ? 'Sustainable pace'
    : 'Aggressive pace';
};

const resolveGoalFromDelta = (requiredDailyDeltaCalories) => {
  const delta = Number(requiredDailyDeltaCalories);
  if (
    !Number.isFinite(delta) ||
    Math.abs(delta) < MAINTENANCE_DELTA_THRESHOLD
  ) {
    return 'maintenance';
  }
  return delta > 0 ? 'bulking' : 'cutting';
};

const resolveMetricEnergyDelta = ({
  startWeightKg,
  targetWeightKg,
  startBodyFatPercent,
  targetBodyFatPercent,
}) => {
  const safeStartWeight = toRoundedNullableNumber(startWeightKg);
  const safeTargetWeight = toRoundedNullableNumber(targetWeightKg);
  const safeStartBodyFat = toNullablePercent(startBodyFatPercent);
  const safeTargetBodyFat = toNullablePercent(targetBodyFatPercent);

  const weightDeltaKcal =
    safeStartWeight != null && safeTargetWeight != null
      ? (safeTargetWeight - safeStartWeight) * KCAL_PER_KG_WEIGHT
      : null;

  const bodyFatDeltaKcal =
    safeStartWeight != null &&
    safeStartBodyFat != null &&
    safeTargetBodyFat != null
      ? ((safeTargetBodyFat - safeStartBodyFat) / 100) *
        (safeTargetWeight != null
          ? (safeStartWeight + safeTargetWeight) / 2
          : safeStartWeight) *
        KCAL_PER_KG_WEIGHT
      : null;

  const hasWeightTarget = Number.isFinite(weightDeltaKcal);
  const hasBodyFatTarget = Number.isFinite(bodyFatDeltaKcal);
  if (!hasWeightTarget && !hasBodyFatTarget) {
    return null;
  }

  let resolvedMetric = null;
  let resolvedTotalDeltaKcal = null;

  if (hasWeightTarget && hasBodyFatTarget) {
    resolvedMetric = TARGET_METRICS.WEIGHT_AND_BODY_FAT;
    // Physical-model priority: weight target is the primary energy signal.
    // Body-fat target remains as a diagnostic component.
    resolvedTotalDeltaKcal = weightDeltaKcal;
  } else if (hasWeightTarget) {
    resolvedMetric = TARGET_METRICS.WEIGHT;
    resolvedTotalDeltaKcal = weightDeltaKcal;
  } else {
    resolvedMetric = TARGET_METRICS.BODY_FAT;
    resolvedTotalDeltaKcal = bodyFatDeltaKcal;
  }

  return {
    metric: resolvedMetric,
    totalDeltaKcal: resolvedTotalDeltaKcal,
    components: {
      weightDeltaKcal: hasWeightTarget ? Math.round(weightDeltaKcal) : null,
      bodyFatDeltaKcal: hasBodyFatTarget ? Math.round(bodyFatDeltaKcal) : null,
    },
  };
};

/**
 * Estimates required daily calorie delta needed to reach weight/body-fat targets.
 *
 * @param {Object} params
 * @param {string} params.startDate - Start date key (YYYY-MM-DD).
 * @param {string} params.endDate - End date key (YYYY-MM-DD), must be after start.
 * @param {number|string|null|undefined} [params.startWeightKg]
 * @param {number|string|null|undefined} [params.targetWeightKg]
 * @param {number|string|null|undefined} [params.startBodyFatPercent]
 * @param {number|string|null|undefined} [params.targetBodyFatPercent]
 * @param {{ errorCode?: string | null } | null} [params.diagnostics] - Optional mutable diagnostics receiver.
 * @returns {null | {
 *  startDate: string,
 *  endDate: string,
 *  daySpan: number,
 *  targetMetric: 'weight' | 'bodyFat' | 'weight_and_body_fat',
 *  totalDeltaCalories: number,
 *  requiredDailyDeltaCalories: number,
 *  aggressivenessBand: 'strict' | 'lenient' | 'blocked',
 *  recommendedGoalType: 'bulking' | 'cutting' | 'maintenance',
 *  components: { weightDeltaKcal: number | null, bodyFatDeltaKcal: number | null },
 * }}
 */
export const estimateRequiredDailyEnergyDelta = ({
  startDate,
  endDate,
  startWeightKg,
  targetWeightKg,
  startBodyFatPercent,
  targetBodyFatPercent,
  diagnostics,
}) => {
  const normalizedStartDate = normalizeDateKey(startDate);
  const normalizedEndDate = normalizeDateKey(endDate);
  if (!normalizedStartDate || !normalizedEndDate) {
    setDiagnosticsError(diagnostics, PHASE_TARGET_PLANNING_ERROR.MISSING_DATE);
    return null;
  }

  const daySpan = getDaySpan(normalizedStartDate, normalizedEndDate);
  if (!daySpan) {
    setDiagnosticsError(
      diagnostics,
      PHASE_TARGET_PLANNING_ERROR.INVALID_DATE_RANGE
    );
    return null;
  }

  const metricEnergyDelta = resolveMetricEnergyDelta({
    startWeightKg,
    targetWeightKg,
    startBodyFatPercent,
    targetBodyFatPercent,
  });
  if (!metricEnergyDelta) {
    setDiagnosticsError(
      diagnostics,
      PHASE_TARGET_PLANNING_ERROR.NO_METRIC_INPUT
    );
    return null;
  }

  const requiredDailyDeltaCalories =
    metricEnergyDelta.totalDeltaKcal / Math.max(daySpan, 1);
  const roundedDailyDeltaCalories = Math.round(requiredDailyDeltaCalories);
  const aggressivenessBand = classifyAggressivenessBand(
    roundedDailyDeltaCalories
  );
  markDiagnosticsSuccess(diagnostics);

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    daySpan,
    targetMetric: metricEnergyDelta.metric,
    totalDeltaCalories: Math.round(metricEnergyDelta.totalDeltaKcal),
    requiredDailyDeltaCalories: roundedDailyDeltaCalories,
    aggressivenessBand,
    recommendedGoalType: resolveGoalFromDelta(roundedDailyDeltaCalories),
    components: metricEnergyDelta.components,
  };
};

const createEmptyFeasibleDateBands = () => ({
  strictDateKeys: [],
  lenientDateKeys: [],
  blockedDateKeys: [],
  strictDaySpanRanges: [],
  lenientDaySpanRanges: [],
  blockedDaySpanRanges: [],
  strictCount: 0,
  lenientCount: 0,
  blockedCount: 0,
  feasibleMinDateKey: null,
  feasibleMaxDateKey: null,
  evaluations: [],
});

const buildRoundedMagnitudeDaySpanRange = ({
  totalMagnitudeCalories,
  minRoundedMagnitude,
  maxRoundedMagnitude,
}) => {
  if (!Number.isFinite(totalMagnitudeCalories) || totalMagnitudeCalories < 0) {
    return null;
  }

  if (!Number.isFinite(minRoundedMagnitude) || minRoundedMagnitude < 0) {
    return null;
  }

  if (!Number.isFinite(maxRoundedMagnitude) || maxRoundedMagnitude < 0) {
    return null;
  }

  if (maxRoundedMagnitude < minRoundedMagnitude) {
    return null;
  }

  const minDaySpan =
    Math.floor(totalMagnitudeCalories / (maxRoundedMagnitude + 0.5)) + 1;
  const maxDaySpan =
    minRoundedMagnitude === 0
      ? Number.POSITIVE_INFINITY
      : Math.floor(totalMagnitudeCalories / (minRoundedMagnitude - 0.5));

  if (!Number.isFinite(maxDaySpan) && maxDaySpan !== Number.POSITIVE_INFINITY) {
    return null;
  }

  if (maxDaySpan < minDaySpan || maxDaySpan < 1) {
    return null;
  }

  return {
    minDaySpan: Math.max(1, minDaySpan),
    maxDaySpan,
  };
};

const buildBlockedHighMagnitudeRange = ({
  totalMagnitudeCalories,
  minRoundedMagnitude,
}) => {
  if (!Number.isFinite(totalMagnitudeCalories) || totalMagnitudeCalories < 0) {
    return null;
  }

  if (!Number.isFinite(minRoundedMagnitude) || minRoundedMagnitude <= 0) {
    return null;
  }

  const maxDaySpan = Math.floor(
    totalMagnitudeCalories / (minRoundedMagnitude - 0.5)
  );

  if (!Number.isFinite(maxDaySpan) || maxDaySpan < 1) {
    return null;
  }

  return {
    minDaySpan: 1,
    maxDaySpan,
  };
};

const compactRanges = (ranges) =>
  ranges
    .filter(
      (range) =>
        range &&
        Number.isFinite(range.minDaySpan) &&
        range.minDaySpan >= 1 &&
        (Number.isFinite(range.maxDaySpan) ||
          range.maxDaySpan === Number.POSITIVE_INFINITY) &&
        range.maxDaySpan >= range.minDaySpan
    )
    .sort((a, b) => a.minDaySpan - b.minDaySpan)
    .reduce((acc, range) => {
      if (acc.length === 0) {
        acc.push(range);
        return acc;
      }

      const previous = acc[acc.length - 1];
      if (previous.maxDaySpan === Number.POSITIVE_INFINITY) {
        return acc;
      }

      const previousMax = previous.maxDaySpan;
      if (range.minDaySpan <= previousMax + 1) {
        previous.maxDaySpan =
          range.maxDaySpan === Number.POSITIVE_INFINITY
            ? Number.POSITIVE_INFINITY
            : Math.max(previous.maxDaySpan, range.maxDaySpan);
        return acc;
      }

      acc.push(range);
      return acc;
    }, []);

const clipDaySpanRangesToWindow = (ranges, minDaySpan, maxDaySpan) =>
  compactRanges(
    ranges.map((range) => ({
      minDaySpan: Math.max(range.minDaySpan, minDaySpan),
      maxDaySpan:
        range.maxDaySpan === Number.POSITIVE_INFINITY
          ? maxDaySpan
          : Math.min(range.maxDaySpan, maxDaySpan),
    }))
  ).filter((range) => range.maxDaySpan >= range.minDaySpan);

const countDaysInRanges = (ranges) =>
  ranges.reduce(
    (sum, range) => sum + (range.maxDaySpan - range.minDaySpan + 1),
    0
  );

const isDaySpanInRanges = (daySpan, ranges) =>
  ranges.some(
    (range) => daySpan >= range.minDaySpan && daySpan <= range.maxDaySpan
  );

const materializeDateKeysFromRanges = (startDateKey, ranges) => {
  const dateKeys = [];

  ranges.forEach((range) => {
    for (
      let daySpan = range.minDaySpan;
      daySpan <= range.maxDaySpan;
      daySpan += 1
    ) {
      const nextDateKey = addDaysUtc(startDateKey, daySpan);
      if (nextDateKey) {
        dateKeys.push(nextDateKey);
      }
    }
  });

  return dateKeys;
};

const buildBandRangesByDaySpan = (totalDeltaCalories) => {
  const roundedTotalDelta = Math.round(Number(totalDeltaCalories));
  if (!Number.isFinite(roundedTotalDelta)) {
    return null;
  }

  if (roundedTotalDelta === 0) {
    return {
      strict: [{ minDaySpan: 1, maxDaySpan: Number.POSITIVE_INFINITY }],
      lenient: [],
      blocked: [],
    };
  }

  const magnitude = Math.abs(roundedTotalDelta);
  const isSurplus = roundedTotalDelta > 0;
  const strictMin = isSurplus ? SURPLUS_STRICT_MIN : DEFICIT_STRICT_MIN;
  const strictMax = isSurplus ? SURPLUS_STRICT_MAX : DEFICIT_STRICT_MAX;
  const lenientMax = isSurplus ? SURPLUS_LENIENT_MAX : DEFICIT_LENIENT_MAX;

  const strictRanges = compactRanges([
    buildRoundedMagnitudeDaySpanRange({
      totalMagnitudeCalories: magnitude,
      minRoundedMagnitude: strictMin,
      maxRoundedMagnitude: strictMax,
    }),
    buildRoundedMagnitudeDaySpanRange({
      totalMagnitudeCalories: magnitude,
      minRoundedMagnitude: 0,
      maxRoundedMagnitude: 0,
    }),
  ]);

  const lenientRanges = compactRanges([
    buildRoundedMagnitudeDaySpanRange({
      totalMagnitudeCalories: magnitude,
      minRoundedMagnitude: 1,
      maxRoundedMagnitude: strictMin - 1,
    }),
    buildRoundedMagnitudeDaySpanRange({
      totalMagnitudeCalories: magnitude,
      minRoundedMagnitude: strictMax + 1,
      maxRoundedMagnitude: lenientMax,
    }),
  ]);

  const blockedRanges = compactRanges([
    buildBlockedHighMagnitudeRange({
      totalMagnitudeCalories: magnitude,
      minRoundedMagnitude: lenientMax + 1,
    }),
  ]);

  return {
    strict: strictRanges,
    lenient: lenientRanges,
    blocked: blockedRanges,
  };
};

/**
 * Builds feasible end-date bands for a target plan.
 *
 * @param {Object} params
 * @param {string} params.startDate
 * @param {string} params.minEndDate
 * @param {string} params.maxEndDate
 * @param {number|string|null|undefined} [params.startWeightKg]
 * @param {number|string|null|undefined} [params.targetWeightKg]
 * @param {number|string|null|undefined} [params.startBodyFatPercent]
 * @param {number|string|null|undefined} [params.targetBodyFatPercent]
 * @param {boolean} [params.includeDateKeys=false] - Materialize per-day date keys when explicitly requested.
 * @param {boolean} [params.includeEvaluations=false] - Include per-day evaluations when explicitly requested.
 * @param {{ errorCode?: string | null } | null} [params.diagnostics] - Optional mutable diagnostics receiver.
 * @returns {{
 *  strictDateKeys: string[],
 *  lenientDateKeys: string[],
 *  blockedDateKeys: string[],
 *  strictDaySpanRanges: Array<{minDaySpan: number, maxDaySpan: number}>,
 *  lenientDaySpanRanges: Array<{minDaySpan: number, maxDaySpan: number}>,
 *  blockedDaySpanRanges: Array<{minDaySpan: number, maxDaySpan: number}>,
 *  strictCount: number,
 *  lenientCount: number,
 *  blockedCount: number,
 *  feasibleMinDateKey: string | null,
 *  feasibleMaxDateKey: string | null,
 *  evaluations: Array<{dateKey: string, aggressivenessBand: 'strict' | 'lenient' | 'blocked', requiredDailyDeltaCalories: number | null, daySpan: number | null}>
 * }}
 */
export const buildFeasibleDateBands = ({
  startDate,
  minEndDate,
  maxEndDate,
  startWeightKg,
  targetWeightKg,
  startBodyFatPercent,
  targetBodyFatPercent,
  includeDateKeys = false,
  includeEvaluations = false,
  diagnostics,
}) => {
  const normalizedStartDate = normalizeDateKey(startDate);
  const normalizedMinEndDate =
    normalizeDateKey(minEndDate) ?? addDaysUtc(startDate, 1);
  const normalizedMaxEndDate = normalizeDateKey(maxEndDate);

  if (!normalizedStartDate || !normalizedMinEndDate || !normalizedMaxEndDate) {
    setDiagnosticsError(
      diagnostics,
      PHASE_TARGET_PLANNING_ERROR.INVALID_DATE_WINDOW
    );
    return createEmptyFeasibleDateBands();
  }

  const totalDeltaEstimate = resolveMetricEnergyDelta({
    startWeightKg,
    targetWeightKg,
    startBodyFatPercent,
    targetBodyFatPercent,
  });

  if (!totalDeltaEstimate) {
    setDiagnosticsError(
      diagnostics,
      PHASE_TARGET_PLANNING_ERROR.NO_METRIC_INPUT
    );
    return createEmptyFeasibleDateBands();
  }

  const minDaySpan = getDaySpan(normalizedStartDate, normalizedMinEndDate);
  const maxDaySpan = getDaySpan(normalizedStartDate, normalizedMaxEndDate);
  if (!minDaySpan || !maxDaySpan || minDaySpan > maxDaySpan) {
    setDiagnosticsError(
      diagnostics,
      PHASE_TARGET_PLANNING_ERROR.INVALID_DATE_RANGE
    );
    return createEmptyFeasibleDateBands();
  }

  const bandRanges = buildBandRangesByDaySpan(
    totalDeltaEstimate.totalDeltaKcal
  );
  if (!bandRanges) {
    setDiagnosticsError(
      diagnostics,
      PHASE_TARGET_PLANNING_ERROR.NO_METRIC_INPUT
    );
    return createEmptyFeasibleDateBands();
  }

  const strictDaySpanRanges = clipDaySpanRangesToWindow(
    bandRanges.strict,
    minDaySpan,
    maxDaySpan
  );
  const lenientDaySpanRanges = clipDaySpanRangesToWindow(
    bandRanges.lenient,
    minDaySpan,
    maxDaySpan
  );
  const blockedDaySpanRanges = clipDaySpanRangesToWindow(
    bandRanges.blocked,
    minDaySpan,
    maxDaySpan
  );

  const strictCount = countDaysInRanges(strictDaySpanRanges);
  const lenientCount = countDaysInRanges(lenientDaySpanRanges);
  const blockedCount = countDaysInRanges(blockedDaySpanRanges);

  const strictDateKeys = includeDateKeys
    ? materializeDateKeysFromRanges(normalizedStartDate, strictDaySpanRanges)
    : [];
  const lenientDateKeys = includeDateKeys
    ? materializeDateKeysFromRanges(normalizedStartDate, lenientDaySpanRanges)
    : [];
  const blockedDateKeys = includeDateKeys
    ? materializeDateKeysFromRanges(normalizedStartDate, blockedDaySpanRanges)
    : [];

  const evaluations = [];
  if (includeEvaluations) {
    for (let daySpan = minDaySpan; daySpan <= maxDaySpan; daySpan += 1) {
      const dateKey = addDaysUtc(normalizedStartDate, daySpan);
      if (!dateKey) {
        continue;
      }

      const roundedDailyDeltaCalories = Math.round(
        totalDeltaEstimate.totalDeltaKcal / daySpan
      );
      const aggressivenessBand = isDaySpanInRanges(daySpan, strictDaySpanRanges)
        ? 'strict'
        : isDaySpanInRanges(daySpan, lenientDaySpanRanges)
          ? 'lenient'
          : 'blocked';

      evaluations.push({
        dateKey,
        aggressivenessBand,
        requiredDailyDeltaCalories: roundedDailyDeltaCalories,
        daySpan,
      });
    }
  }

  const feasibleRanges = compactRanges([
    ...strictDaySpanRanges,
    ...lenientDaySpanRanges,
  ]);
  const feasibleMinDateKey = feasibleRanges.length
    ? addDaysUtc(normalizedStartDate, feasibleRanges[0].minDaySpan)
    : null;
  const feasibleMaxDateKey = feasibleRanges.length
    ? addDaysUtc(
        normalizedStartDate,
        feasibleRanges[feasibleRanges.length - 1].maxDaySpan
      )
    : null;

  markDiagnosticsSuccess(diagnostics);

  return {
    strictDateKeys,
    lenientDateKeys,
    blockedDateKeys,
    strictDaySpanRanges,
    lenientDaySpanRanges,
    blockedDaySpanRanges,
    strictCount,
    lenientCount,
    blockedCount,
    feasibleMinDateKey,
    feasibleMaxDateKey,
    evaluations,
  };
};

/**
 * Derives a target-mode creation payload from target inputs and date span.
 *
 * @param {Object} params
 * @param {string} params.startDate
 * @param {string} params.endDate
 * @param {number|string|null|undefined} [params.startWeightKg]
 * @param {number|string|null|undefined} [params.targetWeightKg]
 * @param {number|string|null|undefined} [params.startBodyFatPercent]
 * @param {number|string|null|undefined} [params.targetBodyFatPercent]
 * @param {{ errorCode?: string | null } | null} [params.diagnostics] - Optional mutable diagnostics receiver.
 * @returns {null | {
 *  creationMode: 'target',
 *  targetMetric: 'weight' | 'bodyFat' | 'weight_and_body_fat',
 *  recommendedGoalType: 'bulking' | 'cutting' | 'maintenance',
 *  smartCaloriePlan: {
 *    requiredDailyDeltaCalories: number,
 *    totalDeltaCalories: number,
 *    daySpan: number,
 *    aggressivenessBand: 'strict' | 'lenient' | 'blocked',
 *    components: { weightDeltaKcal: number | null, bodyFatDeltaKcal: number | null },
 *    startDate: string,
 *    endDate: string,
 *  },
 * }}
 */
export const deriveTargetCreationModePayload = ({
  startDate,
  endDate,
  startWeightKg,
  targetWeightKg,
  startBodyFatPercent,
  targetBodyFatPercent,
  diagnostics,
}) => {
  const estimate = estimateRequiredDailyEnergyDelta({
    startDate,
    endDate,
    startWeightKg,
    targetWeightKg,
    startBodyFatPercent,
    targetBodyFatPercent,
    diagnostics,
  });

  if (!estimate) {
    return null;
  }

  return {
    creationMode: 'target',
    targetMetric: estimate.targetMetric,
    recommendedGoalType: estimate.recommendedGoalType,
    smartCaloriePlan: {
      requiredDailyDeltaCalories: estimate.requiredDailyDeltaCalories,
      totalDeltaCalories: estimate.totalDeltaCalories,
      daySpan: estimate.daySpan,
      aggressivenessBand: estimate.aggressivenessBand,
      components: estimate.components,
      startDate: estimate.startDate,
      endDate: estimate.endDate,
    },
  };
};

/**
 * Projects goal-mode weight change over the selected date span.
 *
 * Note: `predictedWeightDeltaPercent` is percentage of bodyweight change, not
 * body-fat-percentage change. Estimating body-fat percentage change requires a
 * separate tissue-composition model.
 *
 * @param {Object} params
 * @param {string} params.startDate
 * @param {string} params.endDate
 * @param {string} params.goalType
 * @param {number|string|null|undefined} params.currentWeightKg
 * @param {{ errorCode?: string | null } | null} [params.diagnostics] - Optional mutable diagnostics receiver.
 * @returns {null | {
 *  startDate: string,
 *  endDate: string,
 *  daySpan: number,
 *  dailyDelta: number,
 *  totalDeltaCalories: number,
 *  predictedWeightDeltaKg: number,
 *  predictedWeightDeltaPercent: number | null,
 *  predictedBodyFatDeltaPercent: number | null,
 * }}
 */
export const estimateGoalModeProjection = ({
  startDate,
  endDate,
  goalType,
  currentWeightKg,
  diagnostics,
}) => {
  const normalizedStartDate = normalizeDateKey(startDate);
  const normalizedEndDate = normalizeDateKey(endDate);
  if (!normalizedStartDate || !normalizedEndDate) {
    setDiagnosticsError(diagnostics, PHASE_TARGET_PLANNING_ERROR.MISSING_DATE);
    return null;
  }

  const daySpan = getDaySpan(normalizedStartDate, normalizedEndDate);
  if (!daySpan) {
    setDiagnosticsError(
      diagnostics,
      PHASE_TARGET_PLANNING_ERROR.INVALID_DATE_RANGE
    );
    return null;
  }

  const dailyDelta = resolveGoalCalorieDelta(goalType);
  const totalDeltaCalories = dailyDelta * daySpan;
  const predictedWeightDeltaKg = totalDeltaCalories / KCAL_PER_KG_WEIGHT;
  const roundedWeightDelta = Math.round(predictedWeightDeltaKg * 10) / 10;

  const safeCurrentWeight = Number(currentWeightKg);
  const predictedWeightDeltaPercent =
    Number.isFinite(safeCurrentWeight) && safeCurrentWeight > 0
      ? Math.round((predictedWeightDeltaKg / safeCurrentWeight) * 100 * 10) / 10
      : null;
  markDiagnosticsSuccess(diagnostics);

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    daySpan,
    dailyDelta,
    totalDeltaCalories: Math.round(totalDeltaCalories),
    predictedWeightDeltaKg: roundedWeightDelta,
    predictedWeightDeltaPercent,
    // Deprecated alias retained for backward compatibility.
    predictedBodyFatDeltaPercent: predictedWeightDeltaPercent,
  };
};
