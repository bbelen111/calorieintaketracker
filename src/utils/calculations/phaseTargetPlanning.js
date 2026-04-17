const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const KCAL_PER_KG_WEIGHT = 7700;

const SURPLUS_STRICT_MIN = 100;
const SURPLUS_STRICT_MAX = 600;
const SURPLUS_LENIENT_MIN = 50;
const SURPLUS_LENIENT_MAX = 800;

const DEFICIT_STRICT_MIN = 200;
const DEFICIT_STRICT_MAX = 1000;
const DEFICIT_LENIENT_MIN = 100;
const DEFICIT_LENIENT_MAX = 1300;

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

	const [year, month, day] = normalized.split('-').map((value) => Number(value));
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
		if (delta >= SURPLUS_LENIENT_MIN && delta <= SURPLUS_LENIENT_MAX) {
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
	if (
		deficitMagnitude >= DEFICIT_LENIENT_MIN &&
		deficitMagnitude <= DEFICIT_LENIENT_MAX
	) {
		return 'lenient';
	}
	return 'blocked';
};

const resolveGoalFromDelta = (requiredDailyDeltaCalories) => {
	const delta = Number(requiredDailyDeltaCalories);
	if (!Number.isFinite(delta) || Math.abs(delta) < 1) {
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
				safeStartWeight *
				KCAL_PER_KG_WEIGHT
			: null;

	const hasWeightTarget = Number.isFinite(weightDeltaKcal);
	const hasBodyFatTarget = Number.isFinite(bodyFatDeltaKcal);
	if (!hasWeightTarget && !hasBodyFatTarget) {
		return null;
	}

	const combinedDeltaKcal = hasWeightTarget
		? hasBodyFatTarget
			? (weightDeltaKcal + bodyFatDeltaKcal) / 2
			: weightDeltaKcal
		: bodyFatDeltaKcal;

	return {
		metric:
			hasWeightTarget && hasBodyFatTarget
				? 'weight_and_bodyFat'
				: hasWeightTarget
					? 'weight'
					: 'bodyFat',
		totalDeltaKcal: combinedDeltaKcal,
		components: {
			weightDeltaKcal: hasWeightTarget ? Math.round(weightDeltaKcal) : null,
			bodyFatDeltaKcal: hasBodyFatTarget ? Math.round(bodyFatDeltaKcal) : null,
		},
	};
};

export const estimateRequiredDailyEnergyDelta = ({
	startDate,
	endDate,
	startWeightKg,
	targetWeightKg,
	startBodyFatPercent,
	targetBodyFatPercent,
}) => {
	const normalizedStartDate = normalizeDateKey(startDate);
	const normalizedEndDate = normalizeDateKey(endDate);
	if (!normalizedStartDate || !normalizedEndDate) {
		return null;
	}

	const daySpan = getDaySpan(normalizedStartDate, normalizedEndDate);
	if (!daySpan) {
		return null;
	}

	const metricEnergyDelta = resolveMetricEnergyDelta({
		startWeightKg,
		targetWeightKg,
		startBodyFatPercent,
		targetBodyFatPercent,
	});
	if (!metricEnergyDelta) {
		return null;
	}

	const requiredDailyDeltaCalories =
		metricEnergyDelta.totalDeltaKcal / Math.max(daySpan, 1);
	const roundedDailyDeltaCalories = Math.round(requiredDailyDeltaCalories);
	const aggressivenessBand = classifyAggressivenessBand(
		roundedDailyDeltaCalories
	);

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

export const buildFeasibleDateBands = ({
	startDate,
	minEndDate,
	maxEndDate,
	startWeightKg,
	targetWeightKg,
	startBodyFatPercent,
	targetBodyFatPercent,
}) => {
	const normalizedStartDate = normalizeDateKey(startDate);
	const normalizedMinEndDate =
		normalizeDateKey(minEndDate) ?? addDaysUtc(startDate, 1);
	const normalizedMaxEndDate = normalizeDateKey(maxEndDate);

	if (!normalizedStartDate || !normalizedMinEndDate || !normalizedMaxEndDate) {
		return {
			strictDateKeys: [],
			lenientDateKeys: [],
			blockedDateKeys: [],
			evaluations: [],
		};
	}

	const evaluations = [];
	const strictDateKeys = [];
	const lenientDateKeys = [];
	const blockedDateKeys = [];

	let currentDateKey = normalizedMinEndDate;
	while (currentDateKey && currentDateKey <= normalizedMaxEndDate) {
		const estimate = estimateRequiredDailyEnergyDelta({
			startDate: normalizedStartDate,
			endDate: currentDateKey,
			startWeightKg,
			targetWeightKg,
			startBodyFatPercent,
			targetBodyFatPercent,
		});

		const aggressivenessBand = estimate?.aggressivenessBand ?? 'blocked';
		const evaluation = {
			dateKey: currentDateKey,
			aggressivenessBand,
			requiredDailyDeltaCalories: estimate?.requiredDailyDeltaCalories ?? null,
			daySpan: estimate?.daySpan ?? null,
		};

		evaluations.push(evaluation);

		if (aggressivenessBand === 'strict') {
			strictDateKeys.push(currentDateKey);
		} else if (aggressivenessBand === 'lenient') {
			lenientDateKeys.push(currentDateKey);
		} else {
			blockedDateKeys.push(currentDateKey);
		}

		currentDateKey = addDaysUtc(currentDateKey, 1);
	}

	return {
		strictDateKeys,
		lenientDateKeys,
		blockedDateKeys,
		evaluations,
	};
};

export const deriveTargetCreationModePayload = ({
	startDate,
	endDate,
	startWeightKg,
	targetWeightKg,
	startBodyFatPercent,
	targetBodyFatPercent,
}) => {
	const estimate = estimateRequiredDailyEnergyDelta({
		startDate,
		endDate,
		startWeightKg,
		targetWeightKg,
		startBodyFatPercent,
		targetBodyFatPercent,
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

