import React from 'react';
import { ModalShell } from '../../common/ModalShell';
import { PHASE_TEMPLATES } from '../../../../constants/phases/phaseTemplates';

export const TemplatePickerModal = ({
  isOpen,
  isClosing,
  onSelectTemplate,
  onClose,
}) => {
  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-surface/80 z-[60]"
      contentClassName="p-4 md:p-6 w-full md:max-w-2xl"
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-foreground font-bold text-xl md:text-2xl">
              Choose a Template
            </h3>
            <p className="text-muted text-sm md:text-base mt-1">
              Templates provide pre-configured phases with suggested duration
              and weight targets based on common fitness goals.
            </p>
          </div>
        </div>

        <div
          className="space-y-3 overflow-y-auto pr-1 max-h-[60vh]"
          role="list"
        >
          {PHASE_TEMPLATES.map((template) => {
            const key = template.id;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSelectTemplate(template);
                  onClose();
                }}
                className="w-full text-left p-4 rounded-xl border-2 transition-all active:scale-[0.98] flex flex-col gap-2 bg-surface border-border text-foreground md:hover:bg-surface-highlight focus-ring pressable"
                role="listitem"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-base md:text-lg leading-tight text-foreground">
                      {template.name}
                    </p>
                    <p className="text-xs md:text-sm text-muted mt-1">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted mt-3">
                      <span>{template.suggestedDuration} days</span>
                      <span>•</span>
                      <span className="capitalize">{template.goalType}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-lg font-bold ${
                        template.targetWeightChange > 0
                          ? 'text-accent-blue'
                          : template.targetWeightChange < 0
                            ? 'text-accent-red'
                            : 'text-muted'
                      }`}
                    >
                      {template.targetWeightChange > 0 ? '+' : ''}
                      {template.targetWeightChange} kg
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 bg-surface-highlight text-foreground px-4 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback md:hover:bg-surface"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
