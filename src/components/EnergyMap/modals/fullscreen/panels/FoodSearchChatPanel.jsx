import React from 'react';
import { motion } from 'framer-motion';
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

export const FoodSearchChatPanel = ({
  isOnline,
  chatMessages,
  chatAttachments,
  chatError,
  isSendingChat,
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
}) => (
  <div className="flex-1 min-h-0 flex flex-col mt-2">
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
              the AI estimate before logging it.
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
            AI estimates are only as good as the detail you provide. Attach meal
            photos, mention portions, and review low-confidence entries before
            logging.
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
                  <div className="max-w-[90%] md:max-w-[82%] self-end overflow-x-auto touch-action-pan-x scrollbar-hide">
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
                  )}

                  <div
                    className={`${isUser ? 'max-w-[90%] md:max-w-[82%] min-w-[84px] px-4' : 'max-w-[82%] px-3.5'} rounded-2xl py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-accent-blue text-primary-foreground rounded-br-md'
                        : 'bg-surface-highlight border border-border text-foreground rounded-bl-md'
                    }`}
                  >
                    {message.text && <p>{message.text}</p>}

                    {message.status === 'sending' && !isUser && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] opacity-80">
                        <div className="w-3.5 h-3.5 border-2 border-current/25 border-t-current rounded-full animate-spin-fast" />
                        <span>Regenerating...</span>
                      </div>
                    )}

                    {message.status === 'error' && (
                      <div className="mt-2 rounded-xl border border-accent-red/30 bg-accent-red/10 px-2.5 py-2 text-[11px] text-accent-red">
                        {message.error || 'Something went wrong.'}
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
                            const entryKey = `${message.id}-${index}`;
                            const isExpanded =
                              expandedAiEntryKeys[entryKey] === true;
                            const isLowConfidence = entry.confidence === 'low';
                            const isLogged =
                              loggedAiEntryKeys[entryKey] === true;
                            const isFavourited =
                              favouritedAiEntryKeys[entryKey] === true;
                            const lookupMeta = aiEntryLookupByKey?.[entryKey];
                            const parsedGrams = Number(entry.grams);
                            const aiTagFood = {
                              name: entry.name,
                              category:
                                entry.category ||
                                lookupMeta?.matchedFood?.category ||
                                'custom',
                              source: 'ai',
                              grams:
                                Number.isFinite(parsedGrams) && parsedGrams > 0
                                  ? parsedGrams
                                  : null,
                            };

                            return (
                              <motion.div
                                key={entryKey}
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.16, ease: 'easeOut' }}
                                className={`rounded-xl bg-surface border px-3 py-2 ${
                                  isLowConfidence
                                    ? 'border-accent-red/35'
                                    : 'border-border'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <p className="text-xs font-semibold text-foreground truncate">
                                    {entry.name}
                                  </p>
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                      entry.confidence === 'high'
                                        ? 'bg-accent-green/20 text-accent-green'
                                        : entry.confidence === 'low'
                                          ? 'bg-accent-red/20 text-accent-red'
                                          : 'bg-accent-amber/20 text-accent-amber'
                                    }`}
                                  >
                                    {entry.confidence ?? 'medium'}
                                  </span>
                                </div>

                                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted mb-2">
                                  {Number.isFinite(entry.grams) && (
                                    <span>{formatOne(entry.grams)}g</span>
                                  )}
                                  <span>{formatOne(entry.calories)} kcal</span>
                                  <span>{formatOne(entry.protein)}P</span>
                                  <span>{formatOne(entry.carbs)}C</span>
                                  <span>{formatOne(entry.fats)}F</span>
                                </div>

                                <FoodTagBadges
                                  food={aiTagFood}
                                  showCategory
                                  className="mb-2"
                                />

                                {isLowConfidence && (
                                  <p className="mb-2 text-[11px] text-accent-red">
                                    Low confidence. Review this estimate before
                                    logging.
                                  </p>
                                )}

                                {(entry.rationale ||
                                  (Array.isArray(entry.assumptions) &&
                                    entry.assumptions.length > 0)) && (
                                  <div className="mb-2 rounded-lg bg-surface-highlight/40 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleAiEntryExpansion(entry, entryKey)
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

                                        {lookupMeta && (
                                          <div className="rounded-md border border-border/70 bg-surface px-2 py-1.5 space-y-1">
                                            <p className="text-[10px] font-semibold text-foreground">
                                              Search Trace
                                            </p>
                                            {lookupMeta.queryUsed && (
                                              <p className="text-[10px] text-muted">
                                                Query: {lookupMeta.queryUsed}
                                              </p>
                                            )}
                                            <p className="text-[10px] text-muted">
                                              Used:{' '}
                                              {getFoodSearchSourceLabel(
                                                lookupMeta.usedSource
                                              )}
                                            </p>
                                            <p className="text-[10px] text-muted">
                                              Match confidence:{' '}
                                              {lookupMeta.matchConfidence || 'low'}
                                              {Number.isFinite(lookupMeta.matchScore)
                                                ? ` (${Math.round(lookupMeta.matchScore * 100)}%)`
                                                : ''}
                                            </p>
                                            {lookupMeta.matchedFood?.name && (
                                              <p className="text-[10px] text-muted">
                                                Match: {lookupMeta.matchedFood.name}
                                              </p>
                                            )}
                                            {lookupMeta.status &&
                                              lookupMeta.status !== 'resolved' && (
                                                <p className="text-[10px] text-accent-amber">
                                                  Status: {lookupMeta.status}
                                                </p>
                                              )}
                                          </div>
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
                                      const key = `${message.id}-${entryIndex}`;
                                      return loggedAiEntryKeys[key]
                                        ? count
                                        : count + 1;
                                    },
                                    0
                                  );

                                const allLogged = remainingLoggableCount === 0;

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
                  className={`${isUser ? 'max-w-[90%] md:max-w-[82%]' : 'max-w-[82%]'} flex flex-wrap gap-2 text-[11px] text-muted ${
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
                <div className="bg-surface-highlight border border-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
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
