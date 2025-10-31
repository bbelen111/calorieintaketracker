import React from 'react';

export const ScreenTabs = ({ tabs, currentScreen, onSelect }) => (
  <div className="mx-auto mb-6 flex w-full max-w-md items-end gap-3">
    {tabs.map(({ key, label, icon: Icon }, index) => {
      const isActive = currentScreen === index;
      const isHome = key === 'home';
      const iconSize = isHome ? (isActive ? 24 : 22) : isActive ? 20 : 18;

      const baseClasses =
        'flex items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';

      const stateClasses = isActive
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white';

      const shapeClasses = isHome
        ? 'flex-[1.1] h-11 -mb-0.5 border-blue-300/70 shadow-lg shadow-blue-500/20'
        : 'flex-1 h-9 border-transparent';

      return (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(index)}
          aria-pressed={isActive}
          aria-label={label}
          className={`${baseClasses} ${stateClasses} ${shapeClasses}`}
        >
          <Icon size={iconSize} className="shrink-0" />
          <span className="sr-only">{label}</span>
        </button>
      );
    })}
  </div>
);
