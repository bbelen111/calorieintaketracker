import React, { forwardRef } from 'react';
import React, { forwardRef } from 'react';

export const ScreenTabs = forwardRef(({ tabs, currentScreen, onSelect }, ref) => (
  <div ref={ref} className="mx-auto mb-6 flex w-full max-w-md items-end gap-3">
export const ScreenTabs = forwardRef(({ tabs, currentScreen, onSelect }, ref) => (
  <div ref={ref} className="mx-auto mb-6 flex w-full max-w-md items-end gap-3">
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
));

ScreenTabs.displayName = 'ScreenTabs';

/**
 * Floating version of ScreenTabs - appears when original tabs scroll off screen
 * Identical appearance, positioned fixed below status bar with smooth animations
 */
export const FloatingScreenTabs = ({ tabs, currentScreen, onSelect, isVisible }) => {
  return (
    <div
      className={`fixed left-0 right-0 z-50 px-4 md:px-6 transition-all ${isVisible ? 'floating-screen-tabs' : 'floating-screen-tabs hiding'}`}
      style={{
        top: 'calc(var(--sat, 0px) + 8px)',
        paddingLeft: 'calc(1rem + var(--sal, 0px))',
        paddingRight: 'calc(1rem + var(--sar, 0px))',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto flex w-full max-w-md items-end gap-3">
          {tabs.map(({ key, label, icon: Icon }, index) => {
            const isActive = currentScreen === index;
            const isHome = key === 'home';
            const iconSize = isHome ? (isActive ? 24 : 22) : isActive ? 20 : 18;

            const baseClasses =
              'flex items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';

            const stateClasses = isActive
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white backdrop-blur-sm shadow-xl shadow-black/20';

            const shapeClasses = isHome
              ? 'flex-[1.1] h-11 -mb-0.5 border-blue-300/70 shadow-lg shadow-blue-500/20'
              : isActive
                ? 'flex-1 h-9 border-blue-300/70'
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
      </div>
    </div>
  );
};
