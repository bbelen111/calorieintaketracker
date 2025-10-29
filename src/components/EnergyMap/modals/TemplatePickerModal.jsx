import React from 'react';
import { ModalShell } from '../common/ModalShell';
import { PHASE_TEMPLATES } from '../../../constants/phaseTemplates';

export const TemplatePickerModal = ({
  isOpen,
  isClosing,
  onSelectTemplate,
  onClose
}) => {

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[60]"
      contentClassName="p-4 md:p-6 w-full md:max-w-2xl"
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-bold text-xl md:text-2xl">Choose a Template</h3>
            <p className="text-slate-400 text-sm md:text-base mt-1">
              Templates provide pre-configured phases with suggested duration and weight targets based on common fitness goals.
            </p>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto pr-1 max-h-[60vh]" role="list">
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
                className={
                  `w-full text-left p-4 rounded-xl border-2 transition-all active:scale-[0.98] flex flex-col gap-2 bg-blue-600 border-blue-400 text-white hover:bg-blue-500/90`
                }
                role="listitem"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-base md:text-lg leading-tight text-white">{template.name}</p>
                    <p className="text-xs md:text-sm opacity-80 text-white/80 mt-1">{template.description}</p>
                    <div className="flex items-center gap-4 text-xs text-white/70 mt-3">
                      <span>{template.suggestedDuration} days</span>
                      <span>•</span>
                      <span className="capitalize">{template.goalType}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-lg font-bold ${
                      template.targetWeightChange > 0
                        ? 'text-blue-200'
                        : template.targetWeightChange < 0
                        ? 'text-red-300'
                        : 'text-white/80'
                    }`}>
                      {template.targetWeightChange > 0 ? '+' : ''}{template.targetWeightChange} kg
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
            className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 py-3 rounded-lg transition-all active:scale-95 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
