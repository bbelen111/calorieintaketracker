import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CloudOff,
  Sparkles,
  Search,
  Camera,
  MessageSquareReply,
  Plus,
  Copy,
  Pencil,
  ImagePlus,
  RotateCcw,
  ChevronDown,
  AlertCircle,
  Square,
  Paperclip,
  SendHorizontal,
  X,
} from 'lucide-react';
import { formatOne } from '../../../../../utils/formatting/format';
import { FoodTagBadges } from '../../../common/FoodTagBadges';
import { buildFinalizedEntryChips } from '../../../../../utils/food/aiFinalizedEntryState';
import {
  buildLookupContextEntryKey,
  getLookupErrorReasonMessage,
  getLookupErrorRecoveryHint,
} from '../../../../../services/foodLookupContext';

const CHAT_STAGE_LABELS = {
  extraction: 'Analyzing meal input',
  retrieval: 'Searching nutrition sources',
  verification: 'Finalizing nutrition data',
  presentation: 'Finalizing response',
  processing: 'Preparing finalized entries',
};

const CHAT_STAGE_MESSAGES = {
  extraction: 'Chopping up your request into food entries...',
  retrieval: 'Scouring nutrition sources for the best matches...',
  verification: 'Cross-checking portions, calories, and macros...',
  presentation: 'Plating your final response...',
  processing: 'Synthesizing your response...',
};

const CHAT_STAGE_MESSAGE_VARIANTS = {
  extraction: [
    'Chopping up your request into food entries...',
    'Identifying ingredients and portions...',
  ],
  retrieval: [
    'Scouring nutrition sources for the best matches...',
    'Comparing database candidates...',
  ],
  verification: [
    'Cross-checking portions, calories, and macros...',
    'Locking each card to finalized source data...',
  ],
  presentation: [
    'Plating your final response...',
    'Formatting finalized food entries for review...',
  ],
  processing: [
    'Synthesizing your response...',
    'Holding cards until final data is ready...',
    'Finalizing the best result for each entry...',
  ],
};

const MESSAGE_CYCLE_MS = 1400;

export const FoodSearchChatPanel = ({
  isOnline,
  aiRagQualityMode,
  aiRagQualityOptions,
  onChangeAiRagQualityMode,
  chatMessages,
  chatAttachments,
  chatError,
  chatAttachmentErrors,
  removeAttachmentError,
  isSendingChat,
  chatStatusNowMs,
  activeChatRequest,
  chatScrollRef,
  fileInputRef,
  cameraInputRef,
  chatTextareaRef,
  chatPlaceholder,
  chatInput,
  setChatInput,
  answerClarification,
  expandedAiEntryKeys,
  aiEntryLookupByKey,
  getFoodSearchSourceLabel,
  toggleAiEntryExpansion,
  loggedAiEntryKeys,
  favouritedAiEntryKeys,
  handleLogAiEntry,
  handleSaveAiFavourite,
  handleLogAllAiEntries,
  copyChatText,
  handleEditUserMessage,
  handleReuseUserAttachments,
  retryUserMessage,
  regenerateAssistantReply,
  removeAttachment,
  stopChatRequest,
  handleChatInputKeyDown,
  handleChatInputPaste,
  sendChat,
  handleAddAttachmentFiles,
}) => {
  const [expandedTraceKeys, setExpandedTraceKeys] = useState({});
  const [expandedTechnicalTraceKeys, setExpandedTechnicalTraceKeys] = useState(
    {}
  );
  const [isAiModeDropdownOpen, setIsAiModeDropdownOpen] = useState(false);

  const currentStage = activeChatRequest?.currentStage || 'processing';
  const activeStatusLabel =
    CHAT_STAGE_LABELS[currentStage] || CHAT_STAGE_LABELS.processing;
  const statusVariants =
    CHAT_STAGE_MESSAGE_VARIANTS[currentStage] ||
    CHAT_STAGE_MESSAGE_VARIANTS.processing;
  const fallbackStatusMessage =
    CHAT_STAGE_MESSAGES[currentStage] || CHAT_STAGE_MESSAGES.processing;
  const startedAtMs = Number(activeChatRequest?.startedAtMs) || chatStatusNowMs;
  const elapsedMs = Math.max(0, chatStatusNowMs - startedAtMs);
  const statusVariantIndex =
    statusVariants.length > 1
      ? Math.floor(elapsedMs / MESSAGE_CYCLE_MS) % statusVariants.length
      : 0;
  const activeStatusMessage =
    statusVariants[statusVariantIndex] || fallbackStatusMessage;
  const activeStatusMessageKey = `${currentStage}-${statusVariantIndex}`;

  const toggleTraceExpansion = (entryKey) => {
    setExpandedTraceKeys((previous) => ({
      ...previous,
      [entryKey]: !previous[entryKey],
    }));
  };

  const toggleTechnicalTraceExpansion = (entryKey) => {
    setExpandedTechnicalTraceKeys((previous) => ({
      ...previous,
      [entryKey]: !previous[entryKey],
    }));
  };

  const getLookupStatusLabel = (status) => {
    switch (String(status || '').toLowerCase()) {
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

  const qualityOptions = Array.isArray(aiRagQualityOptions)
    ? aiRagQualityOptions
    : [];
  const qualityModeIndex = Math.max(
    qualityOptions.findIndex((option) => option.value === aiRagQualityMode),
    0
  );
  const qualitySegmentWidth =
    qualityOptions.length > 0
      ? `calc((100% - 0.5rem) / ${qualityOptions.length})`
      : 'calc((100% - 0.5rem) / 3)';
  const qualityActiveClass =
    aiRagQualityMode === 'fast'
      ? 'bg-accent-indigo'
      : aiRagQualityMode === 'precision'
        ? 'bg-accent-purple'
        : 'bg-accent-blue';
  const currentQualityOption = qualityOptions.find(
    (option) => option.value === aiRagQualityMode
  ) ||
    qualityOptions[0] || {
      label: 'Balanced',
      value: 'balanced',
    };
  const qualityTagClass =
    currentQualityOption.value === 'fast'
      ? 'bg-accent-indigo'
      : currentQualityOption.value === 'precision'
        ? 'bg-accent-purple'
        : 'bg-accent-blue';

  return (
    <div className="flex-1 min-h-0 flex flex-col mt-2">
      <div className="mx-4 mb-2 flex-shrink-0 rounded-lg border border-border bg-surface-highlight px-3 py-2">
        <button
          type="button"
          onClick={() => setIsAiModeDropdownOpen((previous) => !previous)}
          className="w-full p-1 flex items-center justify-between gap-3 text-left pressable-inline focus-ring rounded-md"
          aria-expanded={isAiModeDropdownOpen}
          aria-label="Toggle AI Mode selector"
        >
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-foreground uppercase tracking-wide">
              AI Mode
            </p>
            <span
              className={`text-sm px-2 py-0.5 rounded-full font-semibold whitespace-nowrap text-white ${qualityTagClass}`}
            >
              {currentQualityOption.label}
            </span>
          </div>
          <ChevronDown
            size={15}
            className={`text-muted transition-transform duration-200 ${
              isAiModeDropdownOpen ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        <AnimatePresence initial={false}>
          {isAiModeDropdownOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: {
                  duration: 0.26,
                  ease: [0.32, 0.72, 0, 1],
                },
                opacity: {
                  duration: 0.2,
                  ease: 'easeOut',
                },
              }}
              className="overflow-hidden"
            >
              <motion.div
                initial={{ y: -4 }}
                animate={{ y: 0 }}
                exit={{ y: -3 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="pt-2"
              >
                <div className="relative flex items-stretch p-1 bg-surface rounded-lg border border-border">
                  <div
                    className={`absolute inset-y-1 left-1 rounded-md shadow-md ${qualityActiveClass}`}
                    style={{
                      width: qualitySegmentWidth,
                      transform: `translateX(${qualityModeIndex * 100}%)`,
                      transition:
                        'transform 0.2s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.2s ease-out',
                    }}
                  />

                  {qualityOptions.map((option) => {
                    const isActive = option.value === aiRagQualityMode;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onChangeAiRagQualityMode?.(option.value)}
                        className={`relative z-10 flex-1 px-2 py-2 rounded-md text-left transition-colors pressable-inline focus-ring ${
                          isActive
                            ? 'text-primary-foreground'
                            : 'text-muted md:hover:text-foreground'
                        }`}
                      >
                        <span className="block text-sm font-semibold leading-tight">
                          {option.label}
                        </span>
                        <span
                          className={`block text-[10px] leading-tight mt-0.5 ${
                            isActive
                              ? 'text-primary-foreground/90'
                              : 'text-muted'
                          }`}
                        >
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!isOnline && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-accent-amber/10 border border-accent-amber/30 rounded-lg flex-shrink-0">
          <CloudOff size={14} className="text-accent-amber flex-shrink-0" />
          <p className="text-accent-amber text-xs">
            You&apos;re offline. AI chat requires an internet connection.
          </p>
        </div>
      )}

      <div
        ref={chatScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-action-pan-y px-4 pt-3 pb-2 space-y-4"
      >
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-5 px-2 py-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center">
                <Sparkles size={22} className="text-accent-blue" />
              </div>
              <p className="text-foreground font-semibold text-base">
                Food Log Parser
              </p>
              <p className="text-muted text-xs max-w-[240px] leading-relaxed">
                Describe what you ate, attach meal images if helpful, and review
                the finalized entries before logging them.
              </p>
            </div>

            <div className="w-full grid grid-cols-2 gap-2">
              {[
                {
                  icon: Search,
                  label: 'Parse a food text',
                  prompt: '3 egg omelette',
                },
                {
                  icon: Camera,
                  label: 'Parse text + image',
                  prompt: 'Burger from a local diner (I will attach an image)',
                },
                {
                  icon: MessageSquareReply,
                  label: 'Ask with assumptions',
                  prompt: '2 slices pepperoni pizza, large slice size',
                },
                {
                  icon: Plus,
                  label: 'Multi-item parse',
                  prompt: 'Chicken sandwich and medium fries',
                },
              ].map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setChatInput(prompt)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-surface-highlight border border-border rounded-xl text-left text-xs font-medium text-foreground md:hover:border-accent-blue/40 md:hover:bg-accent-blue/5 transition-all pressable-inline focus-ring"
                >
                  <Icon size={15} className="text-accent-blue flex-shrink-0" />
                  <span className="leading-tight">{label}</span>
                </button>
              ))}
            </div>

            <p className="text-muted text-[11px] text-center max-w-[250px]">
              AI estimates are only as good as the detail you provide. Attach
              meal photos, mention portions, and check finalized fallback chips
              before logging.
            </p>
          </div>
        ) : (
          <>
            {chatMessages.map((message) => {
              const isUser = message.role === 'user';
              const hasAttachments =
                Array.isArray(message.attachments) &&
                message.attachments.length > 0;

              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {isUser && hasAttachments && (
                    <div className="max-w-[98%] md:max-w-[92%] self-end overflow-x-auto touch-action-pan-x scrollbar-hide">
                      <div className="flex items-center justify-end gap-2 w-max min-w-full">
                        {message.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="rounded-xl overflow-hidden border border-border bg-surface w-20 h-20 flex-shrink-0"
                          >
                            <img
                              src={attachment.previewUrl}
                              alt={attachment.name || 'Attached meal'}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center mb-0.5">
                        <Sparkles size={12} className="text-accent-blue" />
                      </div>
                    )}{' '}
                    <div
                      className={`${isUser ? 'max-w-[98%] md:max-w-[92%] min-w-[148px] sm:min-w-[168px] px-4 w-fit' : 'max-w-[82%] px-3.5'} rounded-2xl py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-accent-blue text-primary-foreground rounded-br-md'
                          : 'bg-surface-highlight border border-border text-foreground rounded-bl-md'
                      }`}
                    >
                      {message.text && <p>{message.text}</p>}

                      {message.status === 'sending' && !isUser && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] opacity-80">
                          <div className="w-3.5 h-3.5 border-2 border-current/25 border-t-current rounded-full animate-spin-fast" />
                          <span>Finalizing response...</span>
                        </div>
                      )}

                      {message.status === 'error' && (
                        <div className="mt-2 rounded-xl border border-accent-red/30 bg-accent-red/10 px-2.5 py-2 text-[11px] text-accent-red">
                          {message.error || 'Something went wrong.'}
                        </div>
                      )}

                      {isUser && message.status === 'queued' && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-accent-amber">
                          <CloudOff size={12} />
                          <span>Queued offline — will send on reconnect.</span>
                        </div>
                      )}

                      {isUser && message.status === 'sending' && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] opacity-80">
                          <div className="w-3.5 h-3.5 border-2 border-current/25 border-t-current rounded-full animate-spin-fast" />
                          <span>Sending...</span>
                        </div>
                      )}

                      {!isUser &&
                        message.foodParser?.messageType === 'clarification' && (
                          <div className="mt-3 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3 py-2">
                            <p className="text-[11px] font-semibold text-accent-amber">
                              Clarification needed
                            </p>
                            {message.foodParser.followUpQuestion && (
                              <p className="mt-1 text-xs text-foreground">
                                {message.foodParser.followUpQuestion}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => answerClarification(message)}
                              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-accent-amber text-primary-foreground px-2.5 py-1.5 text-[11px] font-semibold md:hover:brightness-110 press-feedback focus-ring"
                            >
                              <MessageSquareReply size={12} />
                              Answer in composer
                            </button>
                          </div>
                        )}

                      {!isUser &&
                        message.foodParser?.messageType === 'food_entries' &&
                        Array.isArray(message.foodParser.entries) &&
                        message.foodParser.entries.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {message.foodParser.entries.map((entry, index) => {
                              const entryKey = buildLookupContextEntryKey(
                                message.id,
                                index
                              );
                              const isExpanded =
                                expandedAiEntryKeys[entryKey] === true;
                              const isTraceExpanded =
                                expandedTraceKeys[entryKey] === true;
                              const isTechnicalTraceExpanded =
                                expandedTechnicalTraceKeys[entryKey] === true;
                              const isLogged =
                                loggedAiEntryKeys[entryKey] === true;
                              const isFavourited =
                                favouritedAiEntryKeys[entryKey] === true;
                              const lookupMeta =
                                (entry?.lookupMeta &&
                                typeof entry.lookupMeta === 'object'
                                  ? entry.lookupMeta
                                  : null) || aiEntryLookupByKey?.[entryKey];
                              const lookupReasonBySource =
                                lookupMeta?.errorReasonsBySource || {};
                              const prioritizedLookupReasonCode =
                                lookupReasonBySource?.ai_web_search ||
                                lookupReasonBySource?.usda ||
                                lookupReasonBySource?.local ||
                                null;
                              const primaryLookupReasonCode =
                                prioritizedLookupReasonCode ||
                                lookupReasonBySource?.[
                                  lookupMeta?.usedSource
                                ] ||
                                Object.values(lookupReasonBySource)[0] ||
                                null;
                              const primaryLookupReasonMessage =
                                getLookupErrorReasonMessage(
                                  primaryLookupReasonCode
                                );
                              const primaryLookupRecoveryHint =
                                getLookupErrorRecoveryHint(
                                  primaryLookupReasonCode
                                );
                              const hasLookupIssue =
                                Boolean(primaryLookupReasonMessage) ||
                                (lookupMeta?.status &&
                                  lookupMeta.status !== 'resolved');
                              const friendlyLookupStatusLabel =
                                getLookupStatusLabel(lookupMeta?.status);
                              const resolvedSource = entry.source || 'estimate';
                              const finalizedEntryChips =
                                buildFinalizedEntryChips({
                                  entry,
                                  lookupMeta,
                                  primaryLookupReasonCode,
                                });
                              const isLastResortEstimate =
                                resolvedSource === 'estimate';
                              const aiTagFood = {
                                name: entry.name,
                                category:
                                  entry.category ||
                                  lookupMeta?.matchedFood?.category ||
                                  'custom',
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
                                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                      {finalizedEntryChips.map((chip) => (
                                        <span
                                          key={`${entryKey}-${chip.label}`}
                                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${chip.className}`}
                                        >
                                          {chip.label}
                                        </span>
                                      ))}
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-surface-highlight text-muted">
                                        {entry.confidence ?? 'medium'}{' '}
                                        confidence
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted mb-2">
                                    {Number.isFinite(Number(entry.grams)) && (
                                      <span>{formatOne(entry.grams)}g</span>
                                    )}
                                    <span className="text-accent-emerald">
                                      {formatOne(entry.calories)} kcal
                                    </span>
                                    <span className="text-accent-red">
                                      {formatOne(entry.protein)}P
                                    </span>
                                    <span className="text-accent-amber">
                                      {formatOne(entry.carbs)}C
                                    </span>
                                    <span className="text-accent-yellow">
                                      {formatOne(entry.fats)}F
                                    </span>
                                  </div>

                                  <FoodTagBadges
                                    food={aiTagFood}
                                    showCategory
                                    showSource={false}
                                    showPortion={false}
                                    className="mb-2"
                                  />

                                  {isLastResortEstimate &&
                                    (primaryLookupReasonMessage ||
                                      primaryLookupRecoveryHint) && (
                                      <div className="mb-2 rounded-lg border border-accent-amber/25 bg-accent-amber/10 px-2.5 py-2 space-y-1">
                                        {primaryLookupReasonMessage && (
                                          <p className="text-[10px] text-accent-amber">
                                            Why estimate:{' '}
                                            {primaryLookupReasonMessage}
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
                                    (Array.isArray(entry.assumptions) &&
                                      entry.assumptions.length > 0)) && (
                                    <div className="mb-2 rounded-lg bg-surface-highlight/40 overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleAiEntryExpansion(
                                            entry,
                                            entryKey
                                          )
                                        }
                                        className="w-full flex items-center justify-between px-3 py-2.5 md:hover:bg-surface-highlight/60 transition-colors text-left active:scale-[0.99] focus-ring"
                                      >
                                        <span className="text-[11px] text-muted font-medium">
                                          Assumptions
                                        </span>
                                        <span
                                          className={`text-foreground transition-transform duration-300 ${
                                            isExpanded
                                              ? 'rotate-180'
                                              : 'rotate-0'
                                          }`}
                                        >
                                          <ChevronDown size={14} />
                                        </span>
                                      </button>

                                      <div
                                        className={`overflow-hidden transition-all duration-300 ${
                                          isExpanded
                                            ? 'max-h-96 opacity-100'
                                            : 'max-h-0 opacity-0'
                                        }`}
                                      >
                                        <div className="px-3 pb-2.5 pt-1.5 border-t border-border/50 space-y-2">
                                          {entry.rationale && (
                                            <p className="text-[11px] text-foreground">
                                              {entry.rationale}
                                            </p>
                                          )}

                                          {Array.isArray(entry.assumptions) &&
                                            entry.assumptions.length > 0 && (
                                              <div className="space-y-1">
                                                {entry.assumptions.map(
                                                  (assumption) => (
                                                    <p
                                                      key={assumption}
                                                      className="text-[11px] text-muted"
                                                    >
                                                      • {assumption}
                                                    </p>
                                                  )
                                                )}
                                              </div>
                                            )}

                                          {lookupMeta && (
                                            <div className="rounded-lg bg-surface-highlight/40 overflow-hidden">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  toggleTraceExpansion(entryKey)
                                                }
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
                                                    isTraceExpanded
                                                      ? 'rotate-180'
                                                      : 'rotate-0'
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
                                                        {getFoodSearchSourceLabel(
                                                          lookupMeta.usedSource
                                                        )}
                                                      </span>
                                                    </p>
                                                    <p className="text-[11px] text-foreground">
                                                      Match confidence:{' '}
                                                      <span className="text-muted">
                                                        {lookupMeta.matchConfidence ||
                                                          'low'}
                                                        {Number.isFinite(
                                                          lookupMeta.matchScore
                                                        )
                                                          ? ` (${Math.round(lookupMeta.matchScore * 100)}%)`
                                                          : ''}
                                                      </span>
                                                    </p>
                                                    {lookupMeta.matchedFood
                                                      ?.name && (
                                                      <p className="text-[10px] text-muted">
                                                        Matched food:{' '}
                                                        {
                                                          lookupMeta.matchedFood
                                                            .name
                                                        }
                                                      </p>
                                                    )}
                                                  </div>

                                                  {lookupMeta.verificationFallbackUsed && (
                                                    <p className="text-[10px] text-accent-green">
                                                      Portion and nutrition were
                                                      recalculated from base
                                                      values for a safer result.
                                                    </p>
                                                  )}

                                                  {friendlyLookupStatusLabel &&
                                                    lookupMeta.status !==
                                                      'resolved' && (
                                                      <p className="text-[10px] text-accent-amber">
                                                        What happened:{' '}
                                                        {
                                                          friendlyLookupStatusLabel
                                                        }
                                                      </p>
                                                    )}

                                                  {primaryLookupReasonMessage && (
                                                    <p className="text-[10px] text-accent-amber">
                                                      What happened:{' '}
                                                      {
                                                        primaryLookupReasonMessage
                                                      }
                                                    </p>
                                                  )}
                                                  {primaryLookupRecoveryHint && (
                                                    <p className="text-[10px] text-accent-blue">
                                                      Try this:{' '}
                                                      {
                                                        primaryLookupRecoveryHint
                                                      }
                                                    </p>
                                                  )}

                                                  <div className="rounded-lg bg-surface-highlight/40 overflow-hidden">
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        toggleTechnicalTraceExpansion(
                                                          entryKey
                                                        )
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
                                                        <ChevronDown
                                                          size={12}
                                                        />
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
                                                            Query used:{' '}
                                                            {
                                                              lookupMeta.queryUsed
                                                            }
                                                          </p>
                                                        )}
                                                        {lookupMeta.confidenceComponents && (
                                                          <p className="text-[10px] text-muted">
                                                            Confidence model:
                                                            raw{' '}
                                                            {Math.round(
                                                              (Number(
                                                                lookupMeta
                                                                  .confidenceComponents
                                                                  .rawScore
                                                              ) || 0) * 100
                                                            )}
                                                            % × trust{' '}
                                                            {Number(
                                                              lookupMeta
                                                                .confidenceComponents
                                                                .trustMultiplier
                                                            ) || 0}{' '}
                                                            = weighted{' '}
                                                            {Math.round(
                                                              (Number(
                                                                lookupMeta.weightedMatchScore ??
                                                                  lookupMeta
                                                                    .confidenceComponents
                                                                    .weightedScore
                                                              ) || 0) * 100
                                                            )}
                                                            %
                                                          </p>
                                                        )}
                                                        {lookupMeta.status && (
                                                          <p className="text-[10px] text-muted">
                                                            Internal status:{' '}
                                                            {lookupMeta.status}
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
                                      onClick={() =>
                                        handleSaveAiFavourite(
                                          entry,
                                          entryKey,
                                          index
                                        )
                                      }
                                      disabled={isFavourited}
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all press-feedback focus-ring ${
                                        isFavourited
                                          ? 'bg-accent-green/15 border border-accent-green/35 text-accent-green cursor-not-allowed'
                                          : 'bg-accent-green text-primary-foreground md:hover:brightness-110'
                                      }`}
                                    >
                                      {isFavourited
                                        ? 'Favourited'
                                        : 'Save & Favourite'}
                                    </button>
                                  </div>
                                </motion.div>
                              );
                            })}

                            {message.foodParser.entries.length > 1 && (
                              <div className="rounded-xl bg-surface border border-border px-3 py-2">
                                {(() => {
                                  const remainingLoggableCount =
                                    message.foodParser.entries.reduce(
                                      (count, _entry, entryIndex) => {
                                        const key = buildLookupContextEntryKey(
                                          message.id,
                                          entryIndex
                                        );
                                        return loggedAiEntryKeys[key]
                                          ? count
                                          : count + 1;
                                      },
                                      0
                                    );

                                  const allLogged =
                                    remainingLoggableCount === 0;

                                  return (
                                    <>
                                      <p className="text-[11px] text-muted mb-2">
                                        Batch actions{' '}
                                        <span className="text-muted/80">
                                          ({remainingLoggableCount} remaining)
                                        </span>
                                      </p>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleLogAllAiEntries(
                                              message.id,
                                              message.foodParser.entries,
                                              false
                                            )
                                          }
                                          disabled={allLogged}
                                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all press-feedback focus-ring ${
                                            allLogged
                                              ? 'bg-surface-highlight border border-border text-muted cursor-not-allowed'
                                              : 'bg-primary text-primary-foreground md:hover:brightness-110'
                                          }`}
                                        >
                                          {allLogged ? 'All Logged' : 'Log All'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleLogAllAiEntries(
                                              message.id,
                                              message.foodParser.entries,
                                              true
                                            )
                                          }
                                          disabled={allLogged}
                                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all press-feedback focus-ring ${
                                            allLogged
                                              ? 'bg-surface-highlight border border-border text-muted cursor-not-allowed'
                                              : 'bg-accent-blue text-primary-foreground md:hover:brightness-110'
                                          }`}
                                        >
                                          {allLogged
                                            ? 'All Logged'
                                            : 'Log All & Exit'}
                                        </button>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                    className={`${isUser ? 'max-w-[98%] md:max-w-[92%]' : 'max-w-[82%]'} flex flex-wrap gap-2 text-[11px] text-muted ${
                      isUser
                        ? 'justify-end self-end'
                        : 'justify-start self-start ml-8'
                    }`}
                  >
                    {isUser && (
                      <>
                        <button
                          type="button"
                          onClick={() => copyChatText(message.text)}
                          className="inline-flex items-center gap-1 transition-colors md:hover:text-foreground pressable-inline focus-ring"
                        >
                          <Copy size={12} />
                          Copy text
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditUserMessage(message)}
                          className="inline-flex items-center gap-1 transition-colors md:hover:text-foreground pressable-inline focus-ring"
                        >
                          <Pencil size={12} />
                          Edit & resend
                        </button>
                        {hasAttachments && (
                          <button
                            type="button"
                            onClick={() => handleReuseUserAttachments(message)}
                            className="inline-flex items-center gap-1 transition-colors md:hover:text-foreground pressable-inline focus-ring"
                          >
                            <ImagePlus size={12} />
                            Reuse attachments
                          </button>
                        )}
                        {message.status === 'error' && (
                          <>
                            <button
                              type="button"
                              onClick={() => retryUserMessage(message)}
                              className="inline-flex items-center gap-1 transition-colors md:hover:text-foreground pressable-inline focus-ring"
                            >
                              <RotateCcw size={12} />
                              Retry
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                retryUserMessage(message, {
                                  asDraft: true,
                                })
                              }
                              className="inline-flex items-center gap-1 transition-colors md:hover:text-foreground pressable-inline focus-ring"
                            >
                              <Pencil size={12} />
                              Retry as draft
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {!isUser && message.status !== 'sending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => copyChatText(message.text)}
                          className="inline-flex items-center gap-1 transition-colors md:hover:text-foreground pressable-inline focus-ring"
                        >
                          <Copy size={12} />
                          Copy reply
                        </button>
                        <button
                          type="button"
                          onClick={() => regenerateAssistantReply(message)}
                          className="inline-flex items-center gap-1 transition-colors md:hover:text-foreground pressable-inline focus-ring"
                        >
                          <RotateCcw size={12} />
                          {message.status === 'error' ? 'Retry' : 'Regenerate'}
                        </button>
                      </>
                    )}
                  </motion.div>
                </motion.div>
              );
            })}

            {isSendingChat &&
              activeChatRequest?.assistantPlaceholderId == null && (
                <div className="flex items-end gap-2 justify-start">
                  <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center">
                    <Sparkles size={12} className="text-accent-blue" />
                  </div>
                  <div
                    className="bg-surface-highlight border border-border rounded-2xl rounded-bl-md px-4 py-2.5"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-1">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce"
                          style={{
                            animationDelay: `${delay}ms`,
                            animationDuration: '900ms',
                          }}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-muted font-medium">
                      {activeStatusLabel}
                    </p>
                    <div className="relative mt-0.5 min-h-[1.1rem] overflow-hidden">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={activeStatusMessageKey}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.24, ease: 'easeOut' }}
                          className="text-[11px] text-foreground/90 leading-snug"
                        >
                          {activeStatusMessage}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )}
          </>
        )}
      </div>

      {chatError && (
        <div className="mx-4 mb-1 flex-shrink-0">
          <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg px-3 py-2 text-accent-red text-xs flex items-start gap-2">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{chatError}</span>
          </div>
        </div>
      )}

      {Array.isArray(chatAttachmentErrors) &&
        chatAttachmentErrors.length > 0 && (
          <div className="mx-4 mb-1 flex-shrink-0 space-y-1">
            {chatAttachmentErrors.map((attachmentError) => (
              <div
                key={attachmentError.id}
                className="bg-accent-amber/10 border border-accent-amber/30 rounded-lg px-3 py-2 text-accent-amber text-xs flex items-start gap-2"
              >
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">
                    {attachmentError.name}
                  </p>
                  <p>{attachmentError.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachmentError?.(attachmentError.id)}
                  className="text-accent-amber/80 md:hover:text-accent-amber pressable-inline focus-ring"
                  aria-label="Dismiss attachment error"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

      <div className="px-4 pb-3 pt-2 flex-shrink-0">
        <div className="relative">
          {chatAttachments.length > 0 && (
            <div className="pointer-events-none absolute -top-14 right-2 z-20 max-w-[85%]">
              <div className="pointer-events-auto overflow-x-auto touch-action-pan-x scrollbar-hide">
                <div className="flex gap-2 w-max py-1">
                  {chatAttachments.map((attachment) => (
                    <motion.div
                      key={attachment.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative w-16 h-16 rounded-xl border border-border overflow-hidden bg-surface-highlight flex-shrink-0 shadow-sm"
                    >
                      <img
                        src={attachment.previewUrl}
                        alt="Attachment preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="absolute top-0.5 right-0.5 w-5.5 h-5.5 rounded-full bg-background/90 backdrop-blur-sm text-foreground md:hover:text-foreground flex items-center justify-center pressable-inline focus-ring border border-border/50"
                        aria-label="Remove image"
                      >
                        <X size={11} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface-highlight overflow-hidden shadow-sm">
            <div className="flex items-center gap-2.5 px-2 py-2.5 min-h-[62px]">
              <div className="flex items-center gap-1 pb-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSendingChat}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-foreground md:hover:text-foreground md:hover:bg-surface transition-all pressable-inline focus-ring disabled:opacity-40"
                  aria-label="Attach image"
                >
                  <Paperclip size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isSendingChat}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-foreground md:hover:text-foreground md:hover:bg-surface transition-all pressable-inline focus-ring disabled:opacity-40"
                  aria-label="Take photo"
                >
                  <Camera size={17} />
                </button>
              </div>

              <div className="w-px h-7 bg-border flex-shrink-0 self-center" />

              <textarea
                ref={chatTextareaRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatInputKeyDown}
                onPaste={handleChatInputPaste}
                placeholder={chatPlaceholder}
                rows={1}
                className="flex-1 resize-none max-h-28 min-h-11 bg-transparent text-foreground placeholder:text-muted outline-none py-2.5 px-2.5 text-[15px] leading-relaxed overflow-y-auto"
              />

              <button
                type="button"
                onClick={isSendingChat ? stopChatRequest : sendChat}
                disabled={
                  !isSendingChat &&
                  !chatInput.trim() &&
                  chatAttachments.length === 0
                }
                className={`flex-shrink-0 w-11 h-11 rounded-xl text-primary-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center press-feedback focus-ring ${
                  isSendingChat
                    ? 'bg-accent-red md:hover:brightness-110'
                    : 'bg-accent-blue md:hover:brightness-110'
                }`}
                aria-label={isSendingChat ? 'Stop generating' : 'Send message'}
              >
                {isSendingChat ? (
                  <Square size={15} />
                ) : (
                  <SendHorizontal size={15} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          handleAddAttachmentFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleAddAttachmentFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};
