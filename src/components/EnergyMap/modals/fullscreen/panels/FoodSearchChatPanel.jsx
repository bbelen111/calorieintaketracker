import React from 'react';
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
  ChevronUp,
  AlertCircle,
  Square,
  Paperclip,
  SendHorizontal,
  X,
} from 'lucide-react';
import { formatOne } from '../../../../../utils/format';
import { MAX_IMAGE_COUNT } from '../../../../../services/gemini';

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
  chatInput,
  setChatInput,
  answerClarification,
  expandedAiEntryKeys,
  toggleAiEntryExpansion,
  openAiEntryEditModal,
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
  <div className="flex-1 min-h-0 flex flex-col">
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
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-action-pan-y px-4 pt-3 pb-2 space-y-3"
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
              <div
                key={message.id}
                className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center mb-0.5">
                    <Sparkles size={12} className="text-accent-blue" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-accent-blue text-primary-foreground rounded-br-md'
                      : 'bg-surface-highlight border border-border text-foreground rounded-bl-md'
                  }`}
                >
                  {message.text && <p>{message.text}</p>}

                  {hasAttachments && (
                    <div
                      className={`mt-2 grid grid-cols-3 gap-2 ${
                        message.text ? '' : 'mt-0'
                      }`}
                    >
                      {message.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className={`rounded-xl overflow-hidden border ${
                            isUser
                              ? 'border-primary-foreground/20 bg-primary-foreground/10'
                              : 'border-border bg-surface'
                          }`}
                        >
                          <img
                            src={attachment.previewUrl}
                            alt={attachment.name || 'Attached meal'}
                            className="w-full h-20 object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {message.status === 'sending' && (
                    <div className="mt-2 flex items-center gap-2 text-[11px] opacity-80">
                      <div className="w-3.5 h-3.5 border-2 border-current/25 border-t-current rounded-full animate-spin-fast" />
                      <span>
                        {isUser ? 'Sending to AI...' : 'Regenerating...'}
                      </span>
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

                          return (
                            <div
                              key={entryKey}
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

                              {isLowConfidence && (
                                <p className="mb-2 text-[11px] text-accent-red">
                                  Low confidence. Review or edit this estimate
                                  before logging.
                                </p>
                              )}

                              {(entry.rationale ||
                                (Array.isArray(entry.assumptions) &&
                                  entry.assumptions.length > 0)) && (
                                <div className="mb-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleAiEntryExpansion(entryKey)
                                    }
                                    className="inline-flex items-center gap-1 text-[11px] text-muted md:hover:text-foreground pressable-inline focus-ring"
                                  >
                                    {isExpanded ? (
                                      <ChevronUp size={12} />
                                    ) : (
                                      <ChevronDown size={12} />
                                    )}
                                    <span>Assumptions</span>
                                  </button>

                                  {isExpanded && (
                                    <div className="mt-2 rounded-lg bg-surface-highlight border border-border px-2.5 py-2 space-y-2">
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
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAiEntryEditModal(
                                      message.id,
                                      index,
                                      entry
                                    )
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-surface-highlight border border-border text-foreground text-xs font-semibold md:hover:border-accent-blue/40 press-feedback focus-ring"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleLogAiEntry(entry, {
                                      closeModal: false,
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-accent-blue text-primary-foreground text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
                                >
                                  Log
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleLogAiEntry(entry, {
                                      closeModal: true,
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-accent-emerald text-primary-foreground text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
                                >
                                  Log & Exit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveAiFavourite(entry, index)
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-surface-highlight border border-border text-foreground text-xs font-semibold md:hover:border-accent-purple/50 press-feedback focus-ring"
                                >
                                  Save Favorite
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {message.foodParser.entries.length > 1 && (
                          <div className="rounded-xl bg-surface border border-border px-3 py-2">
                            <p className="text-[11px] text-muted mb-2">
                              Batch actions
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleLogAllAiEntries(
                                    message.foodParser.entries,
                                    false
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-accent-indigo text-primary-foreground text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
                              >
                                Add All
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleLogAllAiEntries(
                                    message.foodParser.entries,
                                    true
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-accent-purple text-primary-foreground text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
                              >
                                Add All & Exit
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  <div
                    className={`mt-3 flex flex-wrap gap-2 text-[11px] ${
                      isUser ? 'text-primary-foreground/80' : 'text-muted'
                    }`}
                  >
                    {isUser && (
                      <>
                        <button
                          type="button"
                          onClick={() => copyChatText(message.text)}
                          className="inline-flex items-center gap-1 md:hover:text-foreground pressable-inline focus-ring"
                        >
                          <Copy size={12} />
                          Copy text
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditUserMessage(message)}
                          className="inline-flex items-center gap-1 md:hover:text-foreground pressable-inline focus-ring"
                        >
                          <Pencil size={12} />
                          Edit & resend
                        </button>
                        {hasAttachments && (
                          <button
                            type="button"
                            onClick={() => handleReuseUserAttachments(message)}
                            className="inline-flex items-center gap-1 md:hover:text-foreground pressable-inline focus-ring"
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
                              className="inline-flex items-center gap-1 md:hover:text-foreground pressable-inline focus-ring"
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
                              className="inline-flex items-center gap-1 md:hover:text-foreground pressable-inline focus-ring"
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
                          className="inline-flex items-center gap-1 md:hover:text-foreground pressable-inline focus-ring"
                        >
                          <Copy size={12} />
                          Copy reply
                        </button>
                        <button
                          type="button"
                          onClick={() => regenerateAssistantReply(message)}
                          className="inline-flex items-center gap-1 md:hover:text-foreground pressable-inline focus-ring"
                        >
                          <RotateCcw size={12} />
                          {message.status === 'error' ? 'Retry' : 'Regenerate'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
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

    {chatAttachments.length > 0 && (
      <div className="px-4 pb-1 flex-shrink-0">
        <p className="mb-1 text-[10px] text-muted">Draft attachments</p>
        <div className="overflow-x-auto touch-action-pan-x scrollbar-hide">
          <div className="flex gap-2 w-max py-1">
            {chatAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="relative w-14 h-14 rounded-xl border border-border overflow-hidden bg-surface-highlight flex-shrink-0"
              >
                <img
                  src={attachment.previewUrl}
                  alt="Attachment preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-background/90 backdrop-blur-sm text-muted md:hover:text-foreground flex items-center justify-center pressable-inline focus-ring border border-border/50"
                  aria-label="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {chatError && (
      <div className="mx-4 mb-1 flex-shrink-0">
        <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg px-3 py-2 text-accent-red text-xs flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{chatError}</span>
        </div>
      </div>
    )}

    <div className="px-4 pb-3 pt-1 flex-shrink-0">
      <div className="rounded-2xl border border-border bg-surface-highlight overflow-hidden shadow-sm">
        {isSendingChat && (
          <div className="px-3 pt-2">
            <button
              type="button"
              onClick={stopChatRequest}
              className="inline-flex items-center gap-1 rounded-lg border border-accent-red/30 bg-accent-red/10 px-2.5 py-1 text-[11px] font-semibold text-accent-red md:hover:bg-accent-red/15 press-feedback focus-ring"
            >
              <Square size={11} />
              Stop
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 px-2 pt-2 pb-2">
          <div className="flex items-center gap-0.5 pb-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSendingChat}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted md:hover:text-foreground md:hover:bg-surface transition-all pressable-inline focus-ring disabled:opacity-40"
              aria-label="Attach image"
            >
              <Paperclip size={15} />
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isSendingChat}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted md:hover:text-foreground md:hover:bg-surface transition-all pressable-inline focus-ring disabled:opacity-40"
              aria-label="Take photo"
            >
              <Camera size={15} />
            </button>
          </div>

          <div className="w-px h-5 bg-border flex-shrink-0 self-center" />

          <textarea
            ref={chatTextareaRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatInputKeyDown}
            onPaste={handleChatInputPaste}
            placeholder="Describe the food, portion, and any assumptions..."
            rows={1}
            className="flex-1 resize-none max-h-28 bg-transparent text-foreground placeholder:text-muted outline-none py-1.5 px-2 text-sm leading-relaxed overflow-y-auto"
          />

          <button
            type="button"
            onClick={sendChat}
            disabled={
              isSendingChat ||
              (!chatInput.trim() && chatAttachments.length === 0)
            }
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent-blue text-primary-foreground md:hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center press-feedback focus-ring self-end"
            aria-label="Send message"
          >
            {isSendingChat ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin-fast" />
            ) : (
              <SendHorizontal size={15} />
            )}
          </button>
        </div>

        <div className="px-3 pb-2 flex items-center justify-between">
          <p className="text-[10px] text-muted">
            Up to {MAX_IMAGE_COUNT} images · JPEG/PNG/WebP · max 5MB each ·
            paste supported
          </p>
          <div
            className="flex items-center gap-1 text-[10px] text-muted"
            title="Paste images into the composer"
          >
            <ImagePlus size={11} />
            <span>paste</span>
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
