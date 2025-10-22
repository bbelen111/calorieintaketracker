import React from 'react';

export const ScreenTabs = ({ tabs, currentScreen, onSelect }) => (
  <div className="mx-auto mb-6 flex w-full max-w-xs items-center gap-3">
    {tabs.map(({ key, label, icon: Icon }, index) => (
      <button
        key={key}
        type="button"
        onClick={() => onSelect(index)}
        aria-pressed={currentScreen === index}
        aria-label={label}
        className={`flex-1 h-10 rounded-full border border-transparent transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
          currentScreen === index
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
            : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white'
        } flex items-center justify-center`}
      >
        <Icon size={currentScreen === index ? 22 : 20} className="shrink-0" />
        <span className="sr-only">{label}</span>
      </button>
    ))}
  </div>
);
