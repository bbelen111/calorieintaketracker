import { getTodayDateKey } from './dateKeys.js';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateKey = (value) => {
  if (value == null) {
    return null;
  }

  const stringValue = typeof value === 'string' ? value : String(value);
  const trimmed = stringValue.trim();
  if (!DATE_KEY_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
};

export const PHASE_V2_VERSION = 2;

export const PHASE_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

export const LOG_COMPLETION_STATUS = {
  EMPTY: 'empty',
  PARTIAL: 'partial',
  COMPLETE: 'complete',
};

const getTodayDateString = () => getTodayDateKey();

const toGoalFamily = (goalType) => {
  const key = String(goalType ?? '').toLowerCase();
  if (key.includes('bulk')) return 'bulk';
  if (key.includes('cut')) return 'cut';
  if (key === 'maintenance') return 'maintenance';
  return 'other';
};

const isActiveStatus = (status) => status === PHASE_STATUS.ACTIVE;

const normalizeTrainingSessionIds = (ids) =>
  Array.isArray(ids)
    ? ids.filter((id) => id != null && String(id).trim() !== '')
    : [];

const PHASE_CREATION_MODES = new Set(['goal', 'target']);
const PHASE_TARGET_METRICS = new Set(['weight', 'bodyFat', 'weight_and_bodyFat']);
const PHASE_TARGET_BANDS = new Set(['strict', 'lenient', 'blocked']);

const normalizeCreationMode = (value) => {
  const normalized = String(value ?? '').trim();
  return PHASE_CREATION_MODES.has(normalized) ? normalized : 'goal';
};

const normalizeTargetMetric = (value, creationMode) => {
  if (creationMode !== 'target') {
    return null;
  }

  const normalized = String(value ?? '').trim();
  return PHASE_TARGET_METRICS.has(normalized) ? normalized : null;
};

const normalizeTargetBand = (value, creationMode) => {
  if (creationMode !== 'target') {
    return null;
  }

  const normalized = String(value ?? '').trim();
  return PHASE_TARGET_BANDS.has(normalized) ? normalized : null;
};

const normalizeTargetBodyFat = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric >= 100) {
    return null;
  }
  return Math.round(numeric * 10) / 10;
};

const normalizeSmartCaloriePlan = (value, creationMode) => {
  if (creationMode !== 'target' || !value || typeof value !== 'object') {
    return null;
  }

  const requiredDailyDeltaCalories = Number(value.requiredDailyDeltaCalories);
  const totalDeltaCalories = Number(value.totalDeltaCalories);
  const daySpan = Number(value.daySpan);

  return {
    requiredDailyDeltaCalories: Number.isFinite(requiredDailyDeltaCalories)
      ? Math.round(requiredDailyDeltaCalories)
      : 0,
    totalDeltaCalories: Number.isFinite(totalDeltaCalories)
      ? Math.round(totalDeltaCalories)
      : 0,
    daySpan: Number.isFinite(daySpan) && daySpan > 0 ? Math.round(daySpan) : 0,
    aggressivenessBand: normalizeTargetBand(value.aggressivenessBand, 'target'),
    startDate: normalizeDateKey(value.startDate),
    endDate: normalizeDateKey(value.endDate),
    components:
      value.components && typeof value.components === 'object'
        ? {
            weightDeltaKcal: Number.isFinite(Number(value.components.weightDeltaKcal))
              ? Math.round(Number(value.components.weightDeltaKcal))
              : null,
            bodyFatDeltaKcal: Number.isFinite(Number(value.components.bodyFatDeltaKcal))
              ? Math.round(Number(value.components.bodyFatDeltaKcal))
              : null,
          }
        : {
            weightDeltaKcal: null,
            bodyFatDeltaKcal: null,
          },
  };
};

export const createDefaultPhaseLogV2State = () => ({
  version: PHASE_V2_VERSION,
  phasesById: {},
  phaseOrder: [],
  activePhaseId: null,
  logsById: {},
  logIdsByPhaseId: {},
  logIdByPhaseDate: {},
});

const normalizeLinks = (rawLinks = {}) => ({
  weightEntryId:
    rawLinks.weightEntryId == null ||
    String(rawLinks.weightEntryId).trim() === ''
      ? null
      : String(rawLinks.weightEntryId),
  bodyFatEntryId:
    rawLinks.bodyFatEntryId == null ||
    String(rawLinks.bodyFatEntryId).trim() === ''
      ? null
      : String(rawLinks.bodyFatEntryId),
  nutritionDayKey:
    rawLinks.nutritionDayKey == null ||
    String(rawLinks.nutritionDayKey).trim() === ''
      ? null
      : String(rawLinks.nutritionDayKey),
  stepEntryId:
    rawLinks.stepEntryId == null || String(rawLinks.stepEntryId).trim() === ''
      ? null
      : String(rawLinks.stepEntryId),
  trainingSessionIds: normalizeTrainingSessionIds(rawLinks.trainingSessionIds),
});

const normalizeLogRecord = (log) => {
  const normalizedDate = normalizeDateKey(log?.date);
  if (!normalizedDate) {
    return null;
  }

  const links = normalizeLinks(log?.links ?? {});
  const normalized = {
    id: String(log?.id ?? ''),
    phaseId: log?.phaseId,
    date: normalizedDate,
    links,
    notes: typeof log?.notes === 'string' ? log.notes : '',
    metadata:
      log?.metadata && typeof log.metadata === 'object' ? log.metadata : {},
    createdAt: Number.isFinite(log?.createdAt) ? log.createdAt : Date.now(),
    updatedAt: Number.isFinite(log?.updatedAt) ? log.updatedAt : Date.now(),
  };

  if (!normalized.id) {
    normalized.id = buildDailyLogId(normalized.phaseId, normalizedDate);
  }

  return normalized;
};

const normalizePhaseRecord = (phase) => {
  const creationMode = normalizeCreationMode(phase?.creationMode);
  const normalizedTargetWeight = Number.isFinite(Number(phase?.targetWeight))
    ? Number(phase.targetWeight)
    : null;
  const normalizedTargetBodyFat = normalizeTargetBodyFat(phase?.targetBodyFat);
  const inferredTargetMetric =
    normalizedTargetWeight != null && normalizedTargetBodyFat != null
      ? 'weight_and_bodyFat'
      : normalizedTargetWeight != null
        ? 'weight'
        : normalizedTargetBodyFat != null
          ? 'bodyFat'
          : null;

  return {
    id: phase?.id,
    name: phase?.name || 'New Phase',
    startDate: normalizeDateKey(phase?.startDate) || getTodayDateString(),
    endDate: normalizeDateKey(phase?.endDate) || null,
    goalType: phase?.goalType || 'maintenance',
    goalFamily: toGoalFamily(phase?.goalType),
    creationMode,
    targetMetric:
      normalizeTargetMetric(phase?.targetMetric, creationMode) ??
      (creationMode === 'target' ? inferredTargetMetric : null),
    targetDateRequired:
      creationMode === 'target'
        ? Boolean(phase?.targetDateRequired ?? true)
        : false,
    targetAggressivenessBand:
      normalizeTargetBand(phase?.targetAggressivenessBand, creationMode) ??
      normalizeTargetBand(phase?.smartCaloriePlan?.aggressivenessBand, creationMode),
    targetWeight: normalizedTargetWeight,
    targetBodyFat: normalizedTargetBodyFat,
    smartCaloriePlan: normalizeSmartCaloriePlan(
      phase?.smartCaloriePlan,
      creationMode
    ),
    startingWeight: Number.isFinite(phase?.startingWeight)
      ? phase.startingWeight
      : null,
    status: Object.values(PHASE_STATUS).includes(phase?.status)
      ? phase.status
      : PHASE_STATUS.DRAFT,
    color: phase?.color || 'bg-accent-blue',
    createdAt: Number.isFinite(phase?.createdAt) ? phase.createdAt : Date.now(),
    updatedAt: Number.isFinite(phase?.updatedAt) ? phase.updatedAt : Date.now(),
  };
};

const normalizeActivePhase = (state, preferredActivePhaseId = null) => {
  const next = {
    ...state,
    phasesById: { ...state.phasesById },
  };

  const availableIds = next.phaseOrder.filter((id) => next.phasesById[id]);
  const candidateActiveId =
    preferredActivePhaseId != null && next.phasesById[preferredActivePhaseId]
      ? preferredActivePhaseId
      : (availableIds.find((id) =>
          isActiveStatus(next.phasesById[id]?.status)
        ) ?? null);

  next.activePhaseId = candidateActiveId;

  availableIds.forEach((id) => {
    const current = next.phasesById[id];
    if (!current) return;

    if (candidateActiveId != null && id === candidateActiveId) {
      next.phasesById[id] = {
        ...current,
        status: PHASE_STATUS.ACTIVE,
      };
      return;
    }

    if (current.status === PHASE_STATUS.ACTIVE) {
      next.phasesById[id] = {
        ...current,
        status: PHASE_STATUS.COMPLETED,
        endDate: current.endDate || getTodayDateString(),
      };
    }
  });

  return next;
};

export const normalizePhaseLogV2State = (rawState) => {
  if (!rawState || typeof rawState !== 'object') {
    return createDefaultPhaseLogV2State();
  }

  const base = createDefaultPhaseLogV2State();
  const phasesById = {};
  const phaseOrder = Array.isArray(rawState.phaseOrder)
    ? rawState.phaseOrder
    : [];

  phaseOrder.forEach((phaseId) => {
    const rawPhase = rawState.phasesById?.[phaseId];
    if (!rawPhase) return;
    phasesById[phaseId] = normalizePhaseRecord(rawPhase);
  });

  const logsById = {};
  const logIdsByPhaseId = {};
  const logIdByPhaseDate = {};

  Object.entries(rawState.logIdsByPhaseId ?? {}).forEach(
    ([phaseId, phaseLogIds]) => {
      if (!Array.isArray(phaseLogIds)) {
        logIdsByPhaseId[phaseId] = [];
        return;
      }

      logIdsByPhaseId[phaseId] = [];
      phaseLogIds.forEach((logId) => {
        const rawLog = rawState.logsById?.[logId];
        if (!rawLog) return;
        const normalized = normalizeLogRecord(rawLog);
        if (!normalized) return;

        logsById[normalized.id] = normalized;
        logIdsByPhaseId[phaseId].push(normalized.id);
        if (!logIdByPhaseDate[phaseId]) {
          logIdByPhaseDate[phaseId] = {};
        }
        logIdByPhaseDate[phaseId][normalized.date] = normalized.id;
      });
    }
  );

  const normalized = {
    ...base,
    version:
      Number(rawState.version) === PHASE_V2_VERSION
        ? PHASE_V2_VERSION
        : PHASE_V2_VERSION,
    phasesById,
    phaseOrder: phaseOrder.filter((id) => Boolean(phasesById[id])),
    logsById,
    logIdsByPhaseId,
    logIdByPhaseDate,
    activePhaseId: rawState.activePhaseId ?? null,
  };

  return normalizeActivePhase(normalized, normalized.activePhaseId);
};

export const buildDailyLogId = (phaseId, date) => `${phaseId}:${date}`;

export const deriveDailyLogStatus = (log) => {
  if (!log) {
    return LOG_COMPLETION_STATUS.EMPTY;
  }

  const links = normalizeLinks(log.links);
  const hasPrimaryMetric =
    Boolean(links.weightEntryId) || Boolean(links.bodyFatEntryId);
  const hasSecondarySource =
    Boolean(links.nutritionDayKey) ||
    Boolean(links.stepEntryId) ||
    links.trainingSessionIds.length > 0 ||
    (typeof log.notes === 'string' && log.notes.trim().length > 0);

  if (hasPrimaryMetric && hasSecondarySource) {
    return LOG_COMPLETION_STATUS.COMPLETE;
  }

  if (hasPrimaryMetric || hasSecondarySource) {
    return LOG_COMPLETION_STATUS.PARTIAL;
  }

  return LOG_COMPLETION_STATUS.EMPTY;
};

export const upsertPhaseLogV2DailyLog = (
  rawState,
  phaseId,
  date,
  logData = {}
) => {
  const normalizedState = normalizePhaseLogV2State(rawState);
  const normalizedDate = normalizeDateKey(date);

  if (!phaseId || !normalizedDate || !normalizedState.phasesById[phaseId]) {
    return normalizedState;
  }

  const next = {
    ...normalizedState,
    logsById: { ...normalizedState.logsById },
    logIdsByPhaseId: {
      ...normalizedState.logIdsByPhaseId,
      [phaseId]: [...(normalizedState.logIdsByPhaseId[phaseId] ?? [])],
    },
    logIdByPhaseDate: {
      ...normalizedState.logIdByPhaseDate,
      [phaseId]: {
        ...(normalizedState.logIdByPhaseDate[phaseId] ?? {}),
      },
    },
  };

  const logId =
    next.logIdByPhaseDate[phaseId][normalizedDate] ||
    buildDailyLogId(phaseId, normalizedDate);
  const existingLog = next.logsById[logId];

  const linkPatch = normalizeLinks({
    ...(existingLog?.links ?? {}),
    weightEntryId:
      logData.weightEntryId ??
      logData.weightRef ??
      existingLog?.links?.weightEntryId,
    bodyFatEntryId:
      logData.bodyFatEntryId ??
      logData.bodyFatRef ??
      existingLog?.links?.bodyFatEntryId,
    nutritionDayKey:
      logData.nutritionDayKey ??
      logData.nutritionRef ??
      existingLog?.links?.nutritionDayKey,
    stepEntryId:
      logData.stepEntryId ?? logData.stepRef ?? existingLog?.links?.stepEntryId,
    trainingSessionIds:
      logData.trainingSessionIds ?? existingLog?.links?.trainingSessionIds,
  });

  next.logsById[logId] = {
    id: logId,
    phaseId,
    date: normalizedDate,
    links: linkPatch,
    notes:
      typeof logData.notes === 'string'
        ? logData.notes
        : (existingLog?.notes ?? ''),
    metadata: {
      ...(existingLog?.metadata ?? {}),
      ...(logData.metadata ?? {}),
    },
    createdAt: existingLog?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  if (!next.logIdByPhaseDate[phaseId][normalizedDate]) {
    next.logIdByPhaseDate[phaseId][normalizedDate] = logId;
    next.logIdsByPhaseId[phaseId].push(logId);
  }

  return next;
};

export const removePhaseLogV2DailyLog = (rawState, phaseId, date) => {
  const normalizedState = normalizePhaseLogV2State(rawState);
  const normalizedDate = normalizeDateKey(date);

  if (!phaseId || !normalizedDate) {
    return normalizedState;
  }

  const logId = normalizedState.logIdByPhaseDate?.[phaseId]?.[normalizedDate];
  if (!logId) {
    return normalizedState;
  }

  const next = {
    ...normalizedState,
    logsById: { ...normalizedState.logsById },
    logIdsByPhaseId: {
      ...normalizedState.logIdsByPhaseId,
      [phaseId]: [...(normalizedState.logIdsByPhaseId[phaseId] ?? [])],
    },
    logIdByPhaseDate: {
      ...normalizedState.logIdByPhaseDate,
      [phaseId]: {
        ...(normalizedState.logIdByPhaseDate[phaseId] ?? {}),
      },
    },
  };

  delete next.logsById[logId];
  delete next.logIdByPhaseDate[phaseId][normalizedDate];
  next.logIdsByPhaseId[phaseId] = next.logIdsByPhaseId[phaseId].filter(
    (id) => id !== logId
  );

  return next;
};
