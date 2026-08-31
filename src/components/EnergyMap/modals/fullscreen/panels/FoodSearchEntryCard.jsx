import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Flame, Info } from 'lucide-react';
import { formatOne } from '../../../../../utils/formatting/format';
import { FoodTagBadges } from '../../../common/FoodTagBadges';
import { buildFinalizedEntryCardState } from '../../../../../utils/food/aiFinalizedEntryState';
import {
  getLookupErrorReasonMessage,
  getLookupErrorRecoveryHint,
} from '../../../../../services/foodLookupContext';

const getLookupStatusLabel = (lookupMeta) => {
  const decisionReason = String(lookupMeta?.decisionReason || '')
    .trim()
    .toLowerCase();
  const status = String(lookupMeta?.status || '')
    .trim()
    .toLowerCase();

  switch (decisionReason) {
    case 'accepted_history_match':
      return 'Reused prior accepted match';
    case 'strong_local_match':
    case 'dominant_local_match':
      return 'Accepted local database match';
    case 'local_retained_after_cloud':
      return 'Kept local match after online check';
    case 'local_ambiguous':
      return 'Checking online due to local ambiguity';
    case 'missing_macros':
      return 'Checking online for complete nutrition';
    case 'brand_mismatch':
      return 'Checking online for branded match';
    case 'grounding_required':
      return 'Searching online for a better match';
    case 'cloud_resolved_ambiguity':
      return 'Resolved with online database';
    case 'cloud_completed_missing_macros':
      return 'Completed with online nutrition data';
    case 'cloud_better_match':
      return 'Found a better online database match';
    default:
      break;
  }

  switch (status) {
    case 'resolved':
      return 'Matched';
    case 'needs_grounding':
      return 'Searching online for a better match';
    case 'no_match':
      return 'No close database match found';
    case 'error':
      return 'Lookup had an issue';
    default:
      return null;
  }
};

// Small stat chip used in the macro strip. Kept purely presentational —
// no logic changes vs. the values already computed above.
const MacroChip = ({ label, value, dotClassName }) => (
  <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
    <div className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${dotClassName}`} />
      <span className="text-[13px] font-semibold text-foreground tabular-nums">
        {value}
      </span>
    </div>
    <span className="text-[9.5px] uppercase tracking-wide text-muted font-medium">
      {label}
    </span>
  </div>
);

export const FoodSearchEntryCard = ({
  entry,
  entryKey,
  index,
  aiEntryLookupByKey,
  expandedAiEntryKeys,
  expandedTraceKeys,
  expandedTechnicalTraceKeys,
  loggedAiEntryKeys,
  favouritedAiEntryKeys,
  toggleAiEntryExpansion,
  toggleTraceExpansion,
  toggleTechnicalTraceExpansion,
  handleLogAiEntry,
  handleSaveAiFavourite,
  getFoodSearchSourceLabel,
}) => {
  const isExpanded = expandedAiEntryKeys[entryKey] === true;
  const isTraceExpanded = expandedTraceKeys[entryKey] === true;
  const isTechnicalTraceExpanded =
    expandedTechnicalTraceKeys[entryKey] === true;
  const isLogged = loggedAiEntryKeys[entryKey] === true;
  const isFavourited = favouritedAiEntryKeys[entryKey] === true;
  const lookupMeta =
    (entry?.lookupMeta && typeof entry.lookupMeta === 'object'
      ? entry.lookupMeta
      : null) || aiEntryLookupByKey?.[entryKey];
  const lookupReasonBySource = lookupMeta?.errorReasonsBySource || {};
  const prioritizedLookupReasonCode =
    lookupReasonBySource?.ai_web_search ||
    lookupReasonBySource?.cloud ||
    lookupReasonBySource?.local ||
    null;
  const primaryLookupReasonCode =
    prioritizedLookupReasonCode ||
    lookupReasonBySource?.[lookupMeta?.usedSource] ||
    Object.values(lookupReasonBySource)[0] ||
    null;
  const primaryLookupReasonMessage = getLookupErrorReasonMessage(
    primaryLookupReasonCode
  );
  const primaryLookupRecoveryHint = getLookupErrorRecoveryHint(
    primaryLookupReasonCode
  );
  const hasLookupIssue =
    Boolean(primaryLookupReasonMessage) ||
    (lookupMeta?.status && lookupMeta.status !== 'resolved');
  const friendlyLookupStatusLabel = getLookupStatusLabel(lookupMeta);
  const resolvedSource = entry.source || 'estimate';
  const finalizedEntryCardState = buildFinalizedEntryCardState({
    entry,
    lookupMeta,
    primaryLookupReasonCode,
  });
  const isLastResortEstimate = resolvedSource === 'estimate';
  const aiTagFood = {
    name: entry.name,
    category: entry.category || lookupMeta?.matchedFood?.category || 'custom',
    source: 'ai',
  };
  const hasDetailsSection =
    entry.rationale ||
    (Array.isArray(entry.assumptions) && entry.assumptions.length > 0);

  return (
    <motion.div
      key={entryKey}
      initial={{ opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl bg-surface-highlight/50 border border-border/70 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-3.5 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-semibold text-foreground leading-snug tracking-[-0.01em] break-words">
            {entry.name}
          </p>
          {Number.isFinite(Number(entry.grams)) && (
            <span className="flex-shrink-0 text-[11px] font-medium text-muted bg-surface-highlight rounded-full px-2 py-0.5">
              {formatOne(entry.grams)}g
            </span>
          )}
        </div>

        {finalizedEntryCardState?.primaryBadge ? (
          <div className="mt-1.5 flex items-center">
            <span
              className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${finalizedEntryCardState.primaryBadge.className}`}
            >
              <span className="truncate">
                {finalizedEntryCardState.primaryBadge.label}
              </span>
            </span>
          </div>
        ) : null}

        {/* Macro strip */}
        <div className="mt-3 flex items-stretch rounded-xl bg-surface-highlight/60 px-2.5 py-2.5">
          <div className="flex items-center gap-1 pr-2.5 border-r border-border/60">
            <Flame size={13} className="text-accent-emerald" />
            <span className="text-[14px] font-bold text-foreground tabular-nums">
              {formatOne(entry.calories)}
            </span>
            <span className="text-[9.5px] text-muted font-medium">kcal</span>
          </div>
          <div className="flex flex-1 items-center pl-2.5">
            <MacroChip
              label="Protein"
              value={`${formatOne(entry.protein)}g`}
              dotClassName="bg-accent-red"
            />
            <MacroChip
              label="Carbs"
              value={`${formatOne(entry.carbs)}g`}
              dotClassName="bg-accent-amber"
            />
            <MacroChip
              label="Fat"
              value={`${formatOne(entry.fats)}g`}
              dotClassName="bg-accent-yellow"
            />
          </div>
          {(entry?.fiber != null ||
            entry?.sodium != null ||
            entry?.saturatedFats != null ||
            entry?.sugars != null) && (
            <div className="flex items-center gap-2.5 px-2.5 mt-1.5 text-[10.5px]">
              {entry.fiber != null && (
                <span className="text-accent-green font-semibold">
                  {formatOne(entry.fiber)}g fiber
                </span>
              )}
              {entry.fiber != null &&
                (entry.sodium != null ||
                  entry.saturatedFats != null ||
                  entry.sugars != null) && (
                  <span className="text-muted">·</span>
                )}
              {entry.sodium != null && (
                <span className="text-accent-indigo font-semibold">
                  {Math.round(entry.sodium)}mg Na
                </span>
              )}
              {entry.sodium != null &&
                (entry.saturatedFats != null || entry.sugars != null) && (
                  <span className="text-muted">·</span>
                )}
              {entry.saturatedFats != null && (
                <span className="text-accent-yellow font-semibold">
                  {formatOne(entry.saturatedFats)}g sat
                </span>
              )}
              {entry.saturatedFats != null && entry.sugars != null && (
                <span className="text-muted">·</span>
              )}
              {entry.sugars != null && (
                <span className="text-accent-pink font-semibold">
                  {formatOne(entry.sugars)}g sugar
                </span>
              )}
            </div>
          )}
        </div>

        <FoodTagBadges
          food={aiTagFood}
          showCategory
          showSource={false}
          showPortion={false}
          className="mt-2.5"
        />

        {isLastResortEstimate &&
          (primaryLookupReasonMessage || primaryLookupRecoveryHint) && (
            <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-accent-amber/25 bg-accent-amber/10 px-2.5 py-2">
              <Info
                size={12}
                className="text-accent-amber flex-shrink-0 mt-0.5"
              />
              <div className="space-y-0.5">
                {primaryLookupReasonMessage && (
                  <p className="text-[10px] text-accent-amber leading-snug">
                    {primaryLookupReasonMessage}
                  </p>
                )}
                {primaryLookupRecoveryHint && (
                  <p className="text-[10px] text-accent-blue leading-snug">
                    Tip: {primaryLookupRecoveryHint}
                  </p>
                )}
              </div>
            </div>
          )}
      </div>

      {/* Details disclosure — flattened, single hairline-divided panel instead of nested boxes */}
      {hasDetailsSection && (
        <div className="border-t border-border/60">
          <button
            type="button"
            onClick={() => toggleAiEntryExpansion(entry, entryKey)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 md:hover:bg-surface-highlight/40 transition-colors text-left active:scale-[0.995] focus-ring"
          >
            <span className="text-[11.5px] text-muted font-medium">
              Details & assumptions
            </span>
            <ChevronDown
              size={14}
              className={`text-muted transition-transform duration-300 ${
                isExpanded ? 'rotate-180' : 'rotate-0'
              }`}
            />
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ${
              isExpanded ? 'max-h-[640px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-3.5 pb-3 pt-0.5 border-t border-border/50 space-y-2.5">
              {entry.rationale && (
                <p className="text-[11.5px] text-foreground leading-relaxed">
                  {entry.rationale}
                </p>
              )}

              {Array.isArray(entry.assumptions) &&
                entry.assumptions.length > 0 && (
                  <ul className="space-y-1">
                    {entry.assumptions.map((assumption) => (
                      <li
                        key={assumption}
                        className="text-[11.5px] text-muted flex gap-1.5"
                      >
                        <span className="text-muted/60">•</span>
                        <span>{assumption}</span>
                      </li>
                    ))}
                  </ul>
                )}

              {lookupMeta && (
                <div className="rounded-xl border border-border/60 bg-surface-highlight/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleTraceExpansion(entryKey)}
                    className="w-full flex items-center justify-between px-3 py-2.5 md:hover:bg-surface-highlight/50 transition-colors text-left active:scale-[0.995] focus-ring"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted font-medium">
                        Lookup details
                      </span>
                      {hasLookupIssue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-amber/20 text-accent-amber px-1.5 py-0.5 text-[9px] font-semibold">
                          Note
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      size={13}
                      className={`text-muted transition-transform duration-300 ${
                        isTraceExpanded ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      isTraceExpanded
                        ? 'max-h-96 opacity-100'
                        : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-3 pb-2.5 pt-1 border-t border-border/50 space-y-1.5">
                      <div className="space-y-1">
                        <p className="text-[11px] text-foreground">
                          Source:{' '}
                          <span className="text-muted">
                            {getFoodSearchSourceLabel(lookupMeta.usedSource)}
                          </span>
                        </p>
                        <p className="text-[11px] text-foreground">
                          Match confidence:{' '}
                          <span className="text-muted">
                            {lookupMeta.matchConfidence ||
                              entry.confidence ||
                              'low'}
                            {Number.isFinite(lookupMeta.matchScore)
                              ? ` (${Math.round(lookupMeta.matchScore * 100)}%)`
                              : ''}
                          </span>
                        </p>
                        {lookupMeta.matchedFood?.name && (
                          <p className="text-[10px] text-muted">
                            Matched food: {lookupMeta.matchedFood.name}
                          </p>
                        )}
                      </div>

                      {lookupMeta.verificationFallbackUsed && (
                        <p className="text-[10px] text-accent-green">
                          Portion and nutrition were recalculated from base
                          values for a safer result.
                        </p>
                      )}

                      {friendlyLookupStatusLabel &&
                        lookupMeta.status !== 'resolved' && (
                          <p className="text-[10px] text-accent-amber">
                            What happened: {friendlyLookupStatusLabel}
                          </p>
                        )}

                      {primaryLookupReasonMessage && (
                        <p className="text-[10px] text-accent-amber">
                          What happened: {primaryLookupReasonMessage}
                        </p>
                      )}
                      {finalizedEntryCardState?.detailsSummary
                        ?.decisionReason && (
                        <p className="text-[10px] text-muted">
                          Summary:{' '}
                          {
                            finalizedEntryCardState.detailsSummary
                              .decisionReason
                          }
                        </p>
                      )}
                      {primaryLookupRecoveryHint && (
                        <p className="text-[10px] text-accent-blue">
                          Try this: {primaryLookupRecoveryHint}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleTechnicalTraceExpansion(entryKey)}
                        className="w-full flex items-center justify-between pt-1.5 mt-1 border-t border-border/40 text-left active:scale-[0.995] focus-ring"
                      >
                        <span className="text-[10px] text-muted font-medium">
                          Technical details
                        </span>
                        <ChevronDown
                          size={12}
                          className={`text-muted transition-transform duration-300 ${
                            isTechnicalTraceExpanded ? 'rotate-180' : 'rotate-0'
                          }`}
                        />
                      </button>

                      <div
                        className={`overflow-hidden transition-all duration-300 ${
                          isTechnicalTraceExpanded
                            ? 'max-h-72 opacity-100'
                            : 'max-h-0 opacity-0'
                        }`}
                      >
                        <div className="pt-1.5 space-y-1">
                          {lookupMeta.queryUsed && (
                            <p className="text-[10px] text-muted">
                              Query used: {lookupMeta.queryUsed}
                            </p>
                          )}
                          {lookupMeta.confidenceComponents && (
                            <p className="text-[10px] text-muted">
                              Confidence model: raw{' '}
                              {Math.round(
                                (Number(
                                  lookupMeta.confidenceComponents.rawScore
                                ) || 0) * 100
                              )}
                              % × trust{' '}
                              {Number(
                                lookupMeta.confidenceComponents.trustMultiplier
                              ) || 0}{' '}
                              = weighted{' '}
                              {Math.round(
                                (Number(
                                  lookupMeta.weightedMatchScore ??
                                    lookupMeta.confidenceComponents
                                      .weightedScore
                                ) || 0) * 100
                              )}
                              %
                            </p>
                          )}
                          {lookupMeta.status && (
                            <p className="text-[10px] text-muted">
                              Internal status: {lookupMeta.status}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions — one clear primary action, two quieter tinted secondary actions */}
      <div className="px-3.5 pb-3.5 pt-3 border-t border-border/60 space-y-1.5">
        <button
          type="button"
          onClick={() =>
            handleLogAiEntry(entry, entryKey, {
              closeModal: false,
            })
          }
          disabled={isLogged}
          className={`w-full px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all press-feedback focus-ring ${
            isLogged
              ? 'bg-surface-highlight border border-border text-muted cursor-not-allowed'
              : 'bg-primary text-primary-foreground shadow-sm md:hover:brightness-110'
          }`}
        >
          {isLogged ? 'Logged' : 'Log entry'}
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() =>
              handleLogAiEntry(entry, entryKey, {
                closeModal: true,
              })
            }
            disabled={isLogged}
            className={`px-2.5 py-2 rounded-xl text-[12px] font-semibold transition-all press-feedback focus-ring ${
              isLogged
                ? 'bg-surface-highlight border border-border text-muted cursor-not-allowed'
                : 'bg-accent-blue/10 text-accent-blue md:hover:bg-accent-blue/15'
            }`}
          >
            {isLogged ? 'Logged' : 'Log & exit'}
          </button>
          <button
            type="button"
            onClick={() => handleSaveAiFavourite(entry, entryKey, index)}
            disabled={isFavourited}
            className={`px-2.5 py-2 rounded-xl text-[12px] font-semibold transition-all press-feedback focus-ring ${
              isFavourited
                ? 'bg-accent-green/15 text-accent-green cursor-not-allowed'
                : 'bg-accent-green/10 text-accent-green md:hover:bg-accent-green/15'
            }`}
          >
            {isFavourited ? 'Favourited' : 'Save & favourite'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
