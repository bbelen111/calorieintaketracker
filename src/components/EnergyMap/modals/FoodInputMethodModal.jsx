import React from 'react';
import { Search, Edit3, Camera, Sparkles } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const FoodInputMethodModal = ({
  isOpen,
  isClosing,
  onClose,
  onSelectMethod,
}) => {
  const methods = [
    {
      id: 'search',
      label: 'Search Database',
      description: 'Find food from our database',
      icon: Search,
      color: 'blue',
      available: true,
    },
    {
      id: 'manual',
      label: 'Manual Entry',
      description: 'Enter nutrition info manually',
      icon: Edit3,
      color: 'emerald',
      available: true,
    },
    {
      id: 'photo',
      label: 'Photo Recognition',
      description: 'Coming soon',
      icon: Camera,
      color: 'purple',
      available: false,
    },
    {
      id: 'ai',
      label: 'AI Assistant',
      description: 'Coming soon',
      icon: Sparkles,
      color: 'amber',
      available: false,
    },
  ];

  const handleMethodSelect = (methodId) => {
    if (onSelectMethod) {
      onSelectMethod(methodId);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-xl p-6"
    >
      <div className="mb-6">
        <h3 className="text-white font-bold text-2xl mb-2">Add Food</h3>
        <p className="text-slate-400 text-sm">
          Choose how you want to add your food
        </p>
      </div>

      <div className="space-y-3">
        {methods.map((method) => {
          const IconComponent = method.icon;
          const isDisabled = !method.available;

          return (
            <button
              key={method.id}
              onClick={() => !isDisabled && handleMethodSelect(method.id)}
              disabled={isDisabled}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                isDisabled
                  ? 'bg-slate-700/30 border-slate-600/50 cursor-not-allowed opacity-50'
                  : `bg-slate-700/50 border-slate-600 hover:border-${method.color}-500 hover:bg-slate-700 active:scale-[0.98]`
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`p-3 rounded-lg ${
                    isDisabled ? 'bg-slate-600/50' : `bg-${method.color}-500/20`
                  }`}
                >
                  <IconComponent
                    size={24}
                    className={
                      isDisabled ? 'text-slate-400' : `text-${method.color}-400`
                    }
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`font-semibold ${isDisabled ? 'text-slate-400' : 'text-white'}`}
                    >
                      {method.label}
                    </h4>
                    {isDisabled && (
                      <span className="text-xs px-2 py-0.5 bg-slate-600 text-slate-400 rounded">
                        Soon
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-sm mt-1 ${isDisabled ? 'text-slate-500' : 'text-slate-400'}`}
                  >
                    {method.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
};
