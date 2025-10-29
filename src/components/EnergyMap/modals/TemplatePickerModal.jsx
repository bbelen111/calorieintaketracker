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
    <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="w-full md:max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
      <h3 className="text-white font-bold text-xl mb-4">Choose a Template</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {PHASE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => {
              onSelectTemplate(template);
              onClose();
            }}
            className="text-left p-4 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 hover:border-blue-500 rounded-xl transition-all"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <span className="text-white font-bold text-base">{template.name}</span>
                <p className="text-slate-400 text-sm mt-1">{template.description}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-lg font-bold ${
                  template.targetWeightChange > 0 
                    ? 'text-blue-400' 
                    : template.targetWeightChange < 0 
                    ? 'text-red-400' 
                    : 'text-slate-400'
                }`}>
                  {template.targetWeightChange > 0 ? '+' : ''}{template.targetWeightChange} kg
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-xs text-slate-500 mt-3">
              <span>{template.suggestedDuration} days</span>
              <span>•</span>
              <span className="capitalize">{template.goalType}</span>
            </div>
          </button>
        ))}
      </div>

      {/* <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 mb-4">
        <p className="text-blue-200 text-xs">
          Templates provide pre-configured phases with suggested duration and weight targets based on common fitness goals.
        </p>
      </div> */}

      <button
        type="button"
        onClick={onClose}
        className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
      >
        Close
      </button>
    </ModalShell>
  );
};
