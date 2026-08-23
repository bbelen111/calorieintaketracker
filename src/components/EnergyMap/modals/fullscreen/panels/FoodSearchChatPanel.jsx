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
  AlertCircle,
  Square,
  Paperclip,
  SendHorizontal,
  X,
} from 'lucide-react';
import { buildLookupContextEntryKey } from '../../../../../services/foodLookupContext';
import { FoodSearchEntryCard } from './FoodSearchEntryCard';

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

const MESSAGE_CYCLE_MS = 2600;

// Shimmering skeleton primitives used while a reply is still being generated.
const SkeletonLine = ({ width = '100%', className = '' }) => (
  <div
    className={`h-3 rounded-full bg-surface-highlight animate-pulse ${className}`}
    style={{ width }}
  />
);

const SkeletonEntryCard = () => (
  <div className="rounded-2xl border border-border/60 bg-surface px-3.5 py-3.5 space-y-3">
    <div className="flex items-center justify-between">
      <SkeletonLine width="55%" />
      <SkeletonLine width="14%" className="h-4 rounded-full" />
    </div>
    <div className="h-10 rounded-xl bg-surface-highlight/70 animate-pulse" />
    <div className="flex gap-1.5">
      <SkeletonLine width="100%" className="h-8 rounded-xl flex-1" />
    </div>
  </div>
);

// Quick-start tiles for the empty state — same prompts/handlers as before,
// restyled as icon-forward tiles instead of plain text rows.
const QUICK_START_ITEMS = [
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
];

export const FoodSearchChatPanel = ({
  isOnline,
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

  return (
    <div className="flex-1 min-h-0 flex flex-col mt-2">
      {!isOnline && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-accent-amber/10 border border-accent-amber/30 rounded-xl flex-shrink-0">
          <CloudOff size={14} className="text-accent-amber flex-shrink-0" />
          <p className="text-accent-amber text-xs">
            You&apos;re offline. AI chat requires an internet connection.
          </p>
        </div>
      )}

      <div
        ref={chatScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-action-pan-y px-4 pt-3 pb-2 space-y-5"
      >
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-6 px-2 py-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-accent-blue to-accent-blue/70 shadow-[0_4px_14px_-2px_rgba(59,130,246,0.45)] flex items-center justify-center">
                <Sparkles size={24} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-foreground font-semibold text-[17px] tracking-[-0.01em]">
                  Food Log Parser
                </p>
                <p className="text-muted text-[13px] max-w-[260px] leading-relaxed mt-1">
                  Describe what you ate, attach meal images if helpful, and
                  review the finalized entries before logging them.
                </p>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-2.5">
              {QUICK_START_ITEMS.map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setChatInput(prompt)}
                  className="flex flex-col items-start gap-2.5 px-3.5 py-3.5 bg-surface-highlight border border-border/70 rounded-2xl text-left transition-all pressable-inline focus-ring md:hover:border-accent-blue/40 md:hover:bg-accent-blue/5 md:hover:-translate-y-0.5"
                >
                  <div className="w-8 h-8 rounded-full bg-accent-blue/12 flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-accent-blue" />
                  </div>
                  <span className="text-[12.5px] font-medium text-foreground leading-tight">
                    {label}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-muted text-[11px] text-center max-w-[260px] leading-relaxed">
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
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-stretch'}`}
                >
                  {isUser && hasAttachments && (
                    <div className="max-w-[92%] self-end overflow-x-auto touch-action-pan-x scrollbar-hide">
                      <div className="flex items-center justify-end gap-2 w-max min-w-full">
                        {message.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="rounded-xl overflow-hidden border border-border bg-surface w-20 h-20 flex-shrink-0 shadow-sm"
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

                  {isUser ? (
                    // User message: refined bubble, right-aligned.
                    // Sending state is shown as a subtle bubble dim, not a spinner.
                    // Queued/error states are detached below the bubble instead of
                    // living inside the colored fill.
                    <div className="w-full flex flex-col items-end gap-1.5">
                      <div
                        className={`max-w-[85%] px-4 py-2.5 rounded-[20px] rounded-br-lg bg-gradient-to-br from-accent-blue to-accent-blue/90 text-primary-foreground text-[14.5px] leading-relaxed whitespace-pre-wrap break-words shadow-[0_2px_8px_-2px_rgba(59,130,246,0.4)] transition-opacity ${
                          message.status === 'sending'
                            ? 'opacity-70'
                            : 'opacity-100'
                        }`}
                      >
                        {message.text && <p>{message.text}</p>}
                      </div>

                      {message.status === 'queued' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-amber/10 border border-accent-amber/25 text-[11px] text-accent-amber">
                          <CloudOff size={11} />
                          <span>Queued offline — will send on reconnect.</span>
                        </div>
                      )}

                      {message.status === 'error' && (
                        <div className="max-w-[85%] rounded-xl border border-accent-red/30 bg-accent-red/10 px-2.5 py-2 text-[11px] text-accent-red">
                          {message.error || 'Something went wrong.'}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Assistant message: full-width card, not a bubble
                    <div className="w-full rounded-[22px] bg-surface border border-border/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
                      <div className="flex items-center gap-2 px-4 pt-3.5">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-accent-blue to-accent-blue/70 flex items-center justify-center">
                          <Sparkles size={11} className="text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
                          Food Log Parser
                        </span>
                      </div>

                      <div className="px-4 pt-2 pb-3.5 text-[14.5px] leading-relaxed text-foreground whitespace-pre-wrap">
                        {message.text && <p>{message.text}</p>}

                        {message.status === 'sending' && !message.text && (
                          <div className="space-y-2 py-0.5">
                            <SkeletonLine width="92%" />
                            <SkeletonLine width="68%" />
                          </div>
                        )}

                        {message.status === 'error' && (
                          <div className="mt-2 rounded-xl border border-accent-red/30 bg-accent-red/10 px-2.5 py-2 text-[11px] text-accent-red">
                            {message.error || 'Something went wrong.'}
                          </div>
                        )}

                        {message.foodParser?.messageType ===
                          'clarification' && (
                          <div className="mt-3 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3 py-2.5">
                            <p className="text-[11px] font-semibold text-accent-amber">
                              Clarification needed
                            </p>
                            {message.foodParser.followUpQuestion && (
                              <p className="mt-1 text-[13px] text-foreground leading-relaxed">
                                {message.foodParser.followUpQuestion}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => answerClarification(message)}
                              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent-amber text-primary-foreground px-3 py-1.5 text-[11px] font-semibold md:hover:brightness-110 press-feedback focus-ring"
                            >
                              <MessageSquareReply size={12} />
                              Answer in composer
                            </button>
                          </div>
                        )}

                        {message.foodParser?.messageType === 'food_entries' &&
                          Array.isArray(message.foodParser.entries) &&
                          message.foodParser.entries.length > 0 && (
                            <div className="mt-3 space-y-2.5">
                              {message.foodParser.entries.map(
                                (entry, index) => (
                                  <FoodSearchEntryCard
                                    key={buildLookupContextEntryKey(
                                      message.id,
                                      index,
                                      entry?.name
                                    )}
                                    entryKey={buildLookupContextEntryKey(
                                      message.id,
                                      index,
                                      entry?.name
                                    )}
                                    entry={entry}
                                    index={index}
                                    aiEntryLookupByKey={aiEntryLookupByKey}
                                    expandedAiEntryKeys={expandedAiEntryKeys}
                                    expandedTraceKeys={expandedTraceKeys}
                                    expandedTechnicalTraceKeys={
                                      expandedTechnicalTraceKeys
                                    }
                                    loggedAiEntryKeys={loggedAiEntryKeys}
                                    favouritedAiEntryKeys={
                                      favouritedAiEntryKeys
                                    }
                                    toggleAiEntryExpansion={
                                      toggleAiEntryExpansion
                                    }
                                    toggleTraceExpansion={toggleTraceExpansion}
                                    toggleTechnicalTraceExpansion={
                                      toggleTechnicalTraceExpansion
                                    }
                                    handleLogAiEntry={handleLogAiEntry}
                                    handleSaveAiFavourite={
                                      handleSaveAiFavourite
                                    }
                                    getFoodSearchSourceLabel={
                                      getFoodSearchSourceLabel
                                    }
                                  />
                                )
                              )}

                              {message.foodParser.entries.length > 1 && (
                                <div className="rounded-xl bg-surface-highlight/60 border border-border/60 px-3 py-2.5">
                                  {(() => {
                                    const remainingLoggableCount =
                                      message.foodParser.entries.reduce(
                                        (count, _entry, entryIndex) => {
                                          const key =
                                            buildLookupContextEntryKey(
                                              message.id,
                                              entryIndex,
                                              _entry?.name
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
                                            className={`px-2.5 py-2 rounded-xl text-[12px] font-semibold transition-all press-feedback focus-ring ${
                                              allLogged
                                                ? 'bg-surface border border-border text-muted cursor-not-allowed'
                                                : 'bg-primary text-primary-foreground shadow-sm md:hover:brightness-110'
                                            }`}
                                          >
                                            {allLogged
                                              ? 'All logged'
                                              : 'Log all'}
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
                                            className={`px-2.5 py-2 rounded-xl text-[12px] font-semibold transition-all press-feedback focus-ring ${
                                              allLogged
                                                ? 'bg-surface border border-border text-muted cursor-not-allowed'
                                                : 'bg-accent-blue text-primary-foreground shadow-sm md:hover:brightness-110'
                                            }`}
                                          >
                                            {allLogged
                                              ? 'All logged'
                                              : 'Log all & exit'}
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
                  )}

                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                    className={`flex flex-wrap gap-3 text-[11px] text-muted px-1 ${
                      isUser
                        ? 'max-w-[88%] justify-end self-end'
                        : 'justify-start pl-1'
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
                <div className="w-full rounded-[22px] bg-surface border border-border/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-4 py-3.5">
                  <div
                    className="flex items-center gap-2 mb-3"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-accent-blue to-accent-blue/70 flex items-center justify-center">
                      <Sparkles size={11} className="text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
                      Food Log Parser
                    </span>
                    <div className="flex items-center gap-1 ml-0.5">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="w-1.5 h-1.5 bg-accent-blue/70 rounded-full animate-bounce"
                          style={{
                            animationDelay: `${delay}ms`,
                            animationDuration: '900ms',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="relative mb-3 min-h-[1.1rem] overflow-hidden">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p
                        key={activeStatusMessageKey}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className="text-[11px] text-muted leading-snug"
                      >
                        {activeStatusLabel} — {activeStatusMessage}
                      </motion.p>
                    </AnimatePresence>
                  </div>

                  {/* Skeleton preview of the entry card(s) taking shape */}
                  <div className="space-y-2.5">
                    <SkeletonEntryCard />
                  </div>
                </div>
              )}
          </>
        )}
      </div>

      {chatError && (
        <div className="mx-4 mb-1 flex-shrink-0">
          <div className="bg-accent-red/10 border border-accent-red/30 rounded-xl px-3 py-2 text-accent-red text-xs flex items-start gap-2">
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
                className="bg-accent-amber/10 border border-accent-amber/30 rounded-xl px-3 py-2 text-accent-amber text-xs flex items-start gap-2"
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
            <div className="pointer-events-none absolute -top-[4.6rem] right-2 z-20 max-w-[85%]">
              <div className="pointer-events-auto overflow-x-auto touch-action-pan-x scrollbar-hide">
                <div className="flex gap-2 w-max py-1">
                  {chatAttachments.map((attachment) => (
                    <motion.div
                      key={attachment.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative w-16 h-16 rounded-xl border border-border overflow-hidden bg-surface-highlight flex-shrink-0 shadow-md"
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

          {/* Pill-shaped composer, iMessage-style */}
          <div className="rounded-full border border-border bg-surface-highlight overflow-hidden shadow-[0_2px_10px_-2px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-1.5 pl-1.5 pr-1.5 py-1.5 min-h-[56px]">
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSendingChat}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-muted md:hover:text-foreground md:hover:bg-surface transition-all pressable-inline focus-ring disabled:opacity-40"
                  aria-label="Attach image"
                >
                  <Paperclip size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isSendingChat}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-muted md:hover:text-foreground md:hover:bg-surface transition-all pressable-inline focus-ring disabled:opacity-40"
                  aria-label="Take photo"
                >
                  <Camera size={17} />
                </button>
              </div>

              <textarea
                ref={chatTextareaRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatInputKeyDown}
                onPaste={handleChatInputPaste}
                placeholder={chatPlaceholder}
                rows={1}
                className="flex-1 resize-none max-h-28 min-h-11 bg-transparent text-foreground placeholder:text-muted outline-none py-2.5 px-1 text-[15px] leading-relaxed overflow-y-auto"
              />

              <button
                type="button"
                onClick={isSendingChat ? stopChatRequest : sendChat}
                disabled={
                  !isSendingChat &&
                  !chatInput.trim() &&
                  chatAttachments.length === 0
                }
                className={`flex-shrink-0 w-10 h-10 rounded-full text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center press-feedback focus-ring shadow-sm ${
                  isSendingChat
                    ? 'bg-accent-red md:hover:brightness-110'
                    : 'bg-gradient-to-br from-accent-blue to-accent-blue/80 md:hover:brightness-110'
                }`}
                aria-label={isSendingChat ? 'Stop generating' : 'Send message'}
              >
                {isSendingChat ? (
                  <Square size={14} />
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
