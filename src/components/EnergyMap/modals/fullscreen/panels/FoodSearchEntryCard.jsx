import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
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
    case 'local_retained_after_usda':
      return 'Kept local match after online check';
    case 'local_ambiguous':
      return 'Checking online due to local ambiguity';
    case 'missing_macros':
      return 'Checking online for complete nutrition';
    case 'brand_mismatch':
      return 'Checking online for branded match';
    case 'grounding_required':
      return 'Searching online for a better match';
    case 'usda_resolved_ambiguity':
      return 'Resolved with online database';
    case 'usda_completed_missing_macros':
      return 'Completed with online nutrition data';
    case 'usda_better_match':
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
    lookupReasonBySource?.usda ||
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

  return (
    <motion.div
      key={entryKey}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.16,
        ease: 'easeOut',
      }}
      className="rounded-xl bg-surface border border-border px-3 py-2"
    >
      <div className="mb-2">
        <p className="text-sm font-semibold text-foreground leading-snug break-words">
          {entry.name}
        </p>
        {finalizedEntryCardState?.primaryBadge ? (
          <div className="mt-1.5 flex items-center min-h-[24px]">
            <span
              className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${finalizedEntryCardState.primaryBadge.className}`}
            >
              <span className="truncate">
                {finalizedEntryCardState.primaryBadge.label}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted mb-2">
        {Number.isFinite(Number(entry.grams)) && (
          <span>{formatOne(entry.grams)}g</span>
        )}
        <span className="text-accent-emerald">
          {formatOne(entry.calories)} kcal
        </span>
        <span className="text-accent-red">{formatOne(entry.protein)}P</span>
        <span className="text-accent-amber">{formatOne(entry.carbs)}C</span>
        <span className="text-accent-yellow">{formatOne(entry.fats)}F</span>
      </div>

      <FoodTagBadges
        food={aiTagFood}
        showCategory
        showSource={false}
        showPortion={false}
        className="mb-2"
      />

      {isLastResortEstimate &&
        (primaryLookupReasonMessage || primaryLookupRecoveryHint) && (
          <div className="mb-2 rounded-lg border border-accent-amber/25 bg-accent-amber/10 px-2.5 py-2 space-y-1">
            {primaryLookupReasonMessage && (
              <p className="text-[10px] text-accent-amber">
                Why estimate: {primaryLookupReasonMessage}
              </p>
            )}
            {primaryLookupRecoveryHint && (
              <p className="text-[10px] text-accent-blue">
                Tip: {primaryLookupRecoveryHint}
              </p>
            )}
          </div>
        )}

      {(entry.rationale ||
        (Array.isArray(entry.assumptions) && entry.assumptions.length > 0)) && (
        <div className="mb-2 rounded-lg bg-surface-highlight/40 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleAiEntryExpansion(entry, entryKey)}
            className="w-full flex items-center justify-between px-3 py-2.5 md:hover:bg-surface-highlight/60 transition-colors text-left active:scale-[0.99] focus-ring"
          >
            <span className="text-[11px] text-muted font-medium">
              Assumptions
            </span>
            <span
              className={`text-foreground transition-transform duration-300 ${
                isExpanded ? 'rotate-180' : 'rotate-0'
              }`}
            >
              <ChevronDown size={14} />
            </span>
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ${
              isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-3 pb-2.5 pt-1.5 border-t border-border/50 space-y-2">
              {entry.rationale && (
                <p className="text-[11px] text-foreground">{entry.rationale}</p>
              )}

              {Array.isArray(entry.assumptions) &&
                entry.assumptions.length > 0 && (
                  <div className="space-y-1">
                    {entry.assumptions.map((assumption) => (
                      <p key={assumption} className="text-[11px] text-muted">
                        窶｢ {assumption}
                      </p>
                    ))}
                  </div>
                )}

              {lookupMeta && (
                <div className="rounded-lg bg-surface-highlight/40 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleTraceExpansion(entryKey)}
                    className="w-full flex items-center justify-between px-3 py-2.5 md:hover:bg-surface-highlight/60 transition-colors text-left active:scale-[0.99] focus-ring"
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
                    <span
                      className={`text-foreground transition-transform duration-300 ${
                        isTraceExpanded ? 'rotate-180' : 'rotate-0'
                      }`}
                    >
                      <ChevronDown size={14} />
                    </span>
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      isTraceExpanded
                        ? 'max-h-96 opacity-100'
                        : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-3 pb-2.5 pt-1.5 border-t border-border/50 space-y-2">
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

                      <div className="rounded-lg bg-surface-highlight/40 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            toggleTechnicalTraceExpansion(entryKey)
                          }
                          className="w-full flex items-center justify-between px-3 py-2 md:hover:bg-surface-highlight/60 transition-colors text-left active:scale-[0.99] focus-ring"
                        >
                          <span className="text-[10px] text-muted font-medium">
                            Technical details
                          </span>
                          <span
                            className={`text-foreground transition-transform duration-300 ${
                              isTechnicalTraceExpanded
                                ? 'rotate-180'
                                : 'rotate-0'
                            }`}
                          >
                            <ChevronDown size={12} />
                          </span>
                        </button>

                        <div
                          className={`overflow-hidden transition-all duration-300 ${
                            isTechnicalTraceExpanded
                              ? 'max-h-72 opacity-100'
                              : 'max-h-0 opacity-0'
                          }`}
                        >
                          <div className="px-3 pb-2.5 pt-1.5 border-t border-border/50 space-y-1">
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
                                % ﾃ・trust{' '}
                                {Number(
                                  lookupMeta.confidenceComponents
                                    .trustMultiplier
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
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() =>
            handleLogAiEntry(entry, entryKey, {
              closeModal: false,
            })
          }
          disabled={isLogged}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all press-feedback focus-ring ${
            isLogged
              ? 'bg-surface-highlight border border-border text-muted cursor-not-allowed'
              : 'bg-primary text-primary-foreground md:hover:brightness-110'
          }`}
        >
          {isLogged ? 'Logged' : 'Log'}
        </button>
        <button
          type="button"
          onClick={() =>
            handleLogAiEntry(entry, entryKey, {
              closeModal: true,
            })
          }
          disabled={isLogged}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all press-feedback focus-ring ${
            isLogged
              ? 'bg-surface-highlight border border-border text-muted cursor-not-allowed'
              : 'bg-accent-blue text-primary-foreground md:hover:brightness-110'
          }`}
        >
          {isLogged ? 'Logged' : 'Log & Exit'}
        </button>
        <button
          type="button"
          onClick={() => handleSaveAiFavourite(entry, entryKey, index)}
          disabled={isFavourited}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all press-feedback focus-ring ${
            isFavourited
              ? 'bg-accent-green/15 border border-accent-green/35 text-accent-green cursor-not-allowed'
              : 'bg-accent-green text-primary-foreground md:hover:brightness-110'
          }`}
        >
          {isFavourited ? 'Favourited' : 'Save & Favourite'}
        </button>
      </div>
    </motion.div>
  );
};
