import React from 'react';
import { ModalShell } from '../../common/ModalShell';
import { PHASE_TEMPLATES } from '../../../../constants/phases/phaseTemplates';
import { goals } from '../../../../constants/goals/goals';

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
      contentClassName="p-4 md:p-6 w-full md:max-w-xl"
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-foreground font-bold text-xl md:text-2xl">
              Choose a Template
            </h3>
            <p className="text-muted text-sm md:text-base mt-1">
              Browse all templates. Each one applies its own phase type mode
              automatically.
            </p>
          </div>
        </div>

        <div
          className="space-y-3 overflow-y-auto pr-1 max-h-[60vh]"
          role="list"
        >
          {PHASE_TEMPLATES.map((template) => {
            const key = template.id;
            const goalConfig = goals?.[template.goalType] ?? goals.maintenance;
            const Icon = goalConfig.icon;
            const templateMode =
              template.creationMode === 'goal' ? 'Goal mode' : 'Target mode';

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSelectTemplate(template);
                  onClose();
                }}
                className="w-full text-left p-3 md:p-4 rounded-xl flex flex-col gap-2 transition-all pressable-card focus-ring border border-primary bg-primary/90 text-primary-foreground shadow-sm"
                role="listitem"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 rounded-full p-2 bg-surface-highlight/20">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-base md:text-lg leading-tight text-primary-foreground">
                      {template.name}
                    </p>
                    <p className="text-xs md:text-sm text-primary-foreground/80 mt-1">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs mt-3 flex-wrap text-primary-foreground/80">
                      <span className="inline-flex items-center rounded-md border border-primary-foreground/30 bg-surface-highlight/20 px-2 py-0.5 text-primary-foreground">
                        {templateMode}
                      </span>
                      <span>{template.suggestedDuration} days</span>
                      <span>•</span>
                      <span className="capitalize">{template.goalType}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-lg font-bold ${
                        template.targetWeightChange > 0
                          ? 'text-primary-foreground'
                          : template.targetWeightChange < 0
                            ? 'text-primary-foreground'
                            : 'text-primary-foreground/80'
                      }`}
                    >
                      {template.targetWeightChange > 0 ? '+' : ''}
                      {template.targetWeightChange} kg
                    </div>
                    <p className="text-[11px] text-primary-foreground/75 mt-1">
                      weight target
                    </p>
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
