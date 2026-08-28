import React, { useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Save,
  Beef,
  Cookie,
  Droplet,
  Settings2,
  Lock,
  LockOpen,
  Unlock,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  calculateMacroRecommendations,
  createMacroTriangleGeometry,
  EMPTY_MACRO_LOCKS,
  formatMacroSplitPercent,
  getUnlockedMacroGramRange,
  MAX_MACRO_LOCKS,
  macroSplitFromConstrainedTrianglePoint,
  macroSplitToConstrainedTrianglePoint,
  normalizeMacroLocks,
  normalizeMacroRecommendationSplit,
} from '../../../../utils/calculations/macroRecommendations';

const TRIANGLE_WIDTH = 280;
const TRIANGLE_HEIGHT = 240;

// Depth-transition constants for the triangle <-> horizontal slider handoff.
// Reuses the app's signature sliding-pill easing (see WeightTrackerModal /
// RollingEnergyBalanceModal) instead of the previous abrupt 0.15s crossfade.
const MODE_SWITCH_DURATION = 0.28;
const MODE_SWITCH_EASE = [0.32, 0.72, 0, 1];
const TRIANGLE_BACKDROP_SCALE = 0.86;
const TRIANGLE_BACKDROP_OPACITY = 0.18;
const TRIANGLE_BACKDROP_BLUR = 'blur(2px)';

const triangleGeometry = createMacroTriangleGeometry({
  width: TRIANGLE_WIDTH,
  height: TRIANGLE_HEIGHT,
});

const getRelativePoint = (event, element) => {
  const rect = element.getBoundingClientRect();
  const clientX = event?.clientX ?? 0;
  const clientY = event?.clientY ?? 0;
  const x = ((clientX - rect.left) / rect.width) * TRIANGLE_WIDTH;
  const y = ((clientY - rect.top) / rect.height) * TRIANGLE_HEIGHT;
  return { x, y };
};

const MacroChip = ({
  icon: Icon,
  label,
  pct,
  grams,
  kcal,
  accentClass,
  isLocked,
  canLock,
  onToggleLock,
}) => {
  const handleClick = useCallback(() => {
    if (!canLock) return;
    onToggleLock?.();
  }, [canLock, onToggleLock]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canLock}
      title={
        isLocked
          ? `${label} anchored at ${grams}g — click to unlock`
          : canLock
            ? `Click to anchor ${label} at ${grams}g`
            : `Max ${MAX_MACRO_LOCKS} macros can be anchored`
      }
      aria-label={isLocked ? `Unlock ${label}` : `Lock ${label} at ${grams}g`}
      className={`rounded-xl border px-3 py-2.5 flex flex-col gap-1 transition-all text-left pressable-card focus-ring ${
        isLocked
          ? 'border-accent-blue/50 bg-accent-blue/10'
          : canLock
            ? 'border-border/50 bg-surface-highlight/50 md:hover:border-border'
            : 'border-border/30 bg-surface-highlight/30 opacity-60'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon size={13} className={accentClass} />
          <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
            {label}
          </span>
        </div>
        <div
          className={`p-1 rounded-md transition-all ${
            isLocked
              ? 'text-foreground bg-accent-blue/20'
              : canLock
                ? 'text-muted md:hover:text-foreground'
                : 'text-muted/40'
          }`}
        >
          {isLocked ? <Lock size={13} /> : <LockOpen size={13} />}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-md font-bold text-foreground leading-none">
          {grams}
        </span>
        <span className="text-[11px] text-muted">g</span>
        <span className="text-[11px] text-muted ml-auto">{kcal} kcal</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className={`text-xs font-bold ${accentClass}`}>{pct}%</span>
      </div>
    </button>
  );
};

export const MacroPickerModal = ({
  isOpen,
  isClosing,
  value,
  onChange,
  onLocksChange,
  macroLocks,
  targetCalories,
  userData,
  targetLabel,
  onOpenCalorieTargetModal,
  onCancel,
  onSave,
}) => {
  const triangleRef = useRef(null);
  const draftSplit = useMemo(
    () => normalizeMacroRecommendationSplit(value),
    [value]
  );
  const draftLocks = useMemo(
    () => normalizeMacroLocks(macroLocks),
    [macroLocks]
  );
  const lockedKeys = useMemo(
    () => ['protein', 'carbs', 'fats'].filter((key) => draftLocks[key] != null),
    [draftLocks]
  );
  const hasTwoLocks = lockedKeys.length >= MAX_MACRO_LOCKS;
  const hasOneLock = lockedKeys.length === 1;

  const recommendations = useMemo(
    () =>
      calculateMacroRecommendations({
        targetCalories,
        macroSplit: draftSplit,
        userData,
        macroLocks: draftLocks,
      }),
    [draftSplit, targetCalories, userData, draftLocks]
  );

  const handlePointerSelection = useCallback(
    (event) => {
      if (!triangleRef.current) return;
      if (hasTwoLocks) return;
      if (hasOneLock) return;
      const point = getRelativePoint(event, triangleRef.current);
      onChange?.(
        macroSplitFromConstrainedTrianglePoint(point, triangleGeometry, {
          targetCalories,
          userData,
          macroLocks: draftLocks,
        })
      );
    },
    [onChange, targetCalories, userData, draftLocks, hasTwoLocks, hasOneLock]
  );

  const pointerCaptureIdRef = useRef(null);

  const handlePointerDown = useCallback(
    (event) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      if (hasTwoLocks) return;
      if (hasOneLock) return;
      pointerCaptureIdRef.current = event.pointerId;
      triangleRef.current?.setPointerCapture?.(event.pointerId);
      handlePointerSelection(event);
    },
    [handlePointerSelection, hasTwoLocks, hasOneLock]
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (pointerCaptureIdRef.current !== event.pointerId) return;
      handlePointerSelection(event);
    },
    [handlePointerSelection]
  );

  const handlePointerEnd = useCallback((event) => {
    if (pointerCaptureIdRef.current !== event.pointerId) return;
    pointerCaptureIdRef.current = null;
    triangleRef.current?.releasePointerCapture?.(event.pointerId);
  }, []);

  const markerPoint = useMemo(
    () =>
      macroSplitToConstrainedTrianglePoint(draftSplit, triangleGeometry, {
        targetCalories,
        userData,
        macroLocks: draftLocks,
      }),
    [draftSplit, targetCalories, userData, draftLocks]
  );
  const splitPercent = useMemo(
    () => formatMacroSplitPercent(recommendations.grams),
    [recommendations.grams]
  );

  const { protein, carbs, fats } = recommendations.grams;
  const { calories: kcalByMacro } = recommendations;
  const { protein: pV, fats: fV, carbs: cV } = triangleGeometry.vertices;

  const handleToggleLock = useCallback(
    (key) => {
      const nextLocks = { ...draftLocks };
      if (nextLocks[key] != null) {
        nextLocks[key] = null;
      } else {
        if (lockedKeys.length >= MAX_MACRO_LOCKS) return;
        nextLocks[key] = recommendations.grams[key];
      }
      onLocksChange?.(normalizeMacroLocks(nextLocks));
    },
    [draftLocks, lockedKeys.length, recommendations.grams, onLocksChange]
  );

  const handleClearLocks = useCallback(() => {
    onLocksChange?.({ ...EMPTY_MACRO_LOCKS });
  }, [onLocksChange]);

  const handleSave = useCallback(() => {
    onSave?.(normalizeMacroRecommendationSplit(draftSplit));
  }, [draftSplit, onSave]);

  const relaxedMacros = useMemo(
    () => recommendations.macroLocks?.relaxedKeys ?? [],
    [recommendations.macroLocks]
  );

  const absorbedKey = useMemo(
    () =>
      ['protein', 'carbs', 'fats'].find((key) => draftLocks[key] == null) ??
      null,
    [draftLocks]
  );

  // Depth-transition states. The triangle layer is always mounted and animates
  // between a foreground (interactive) state and a dimmed/blurred backdrop
  // state behind the slider. Reduced-motion users get an opacity-only
  // crossfade (the global prefers-reduced-motion block in index.css only
  // covers tracker CSS animations, not Framer Motion).
  const prefersReducedMotion = useReducedMotion();

  const triangleForegroundState = useMemo(
    () =>
      prefersReducedMotion
        ? { scale: 1, opacity: 1 }
        : { scale: 1, opacity: 1, filter: 'blur(0px)' },
    [prefersReducedMotion]
  );

  const triangleBackdropState = useMemo(
    () =>
      prefersReducedMotion
        ? { scale: 1, opacity: TRIANGLE_BACKDROP_OPACITY }
        : {
            scale: TRIANGLE_BACKDROP_SCALE,
            opacity: TRIANGLE_BACKDROP_OPACITY,
            filter: TRIANGLE_BACKDROP_BLUR,
          },
    [prefersReducedMotion]
  );

  const sliderEnterFrom = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.96, y: 10 };
  const sliderEnterTo = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 1, scale: 1, y: 0 };
  const sliderExitTo = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.98, y: 6 };

  const MACRO_META = {
    protein: {
      label: 'Protein',
      accentClass: 'text-accent-red',
      colorVar: 'rgb(var(--accent-red))',
    },
    carbs: {
      label: 'Carbs',
      accentClass: 'text-accent-amber',
      colorVar: 'rgb(var(--accent-amber))',
    },
    fats: {
      label: 'Fats',
      accentClass: 'text-accent-yellow',
      colorVar: 'rgb(var(--accent-yellow))',
    },
  };

  const gramRange = useMemo(
    () =>
      getUnlockedMacroGramRange({
        grams: recommendations.grams,
        macroLocks: draftLocks,
        targetCalories,
        userData,
      }),
    [recommendations.grams, draftLocks, targetCalories, userData]
  );

  const sliderFirst = gramRange.first;
  const sliderSecond = gramRange.second;
  const sliderFirstMeta = sliderFirst ? MACRO_META[sliderFirst] : null;
  const sliderSecondMeta = sliderSecond ? MACRO_META[sliderSecond] : null;
  const sliderFirstGrams = sliderFirst ? recommendations.grams[sliderFirst] : 0;
  const sliderSecondGrams = sliderSecond
    ? recommendations.grams[sliderSecond]
    : 0;

  const sliderFirstGramsCurrent = sliderFirst
    ? recommendations.grams[sliderFirst]
    : 0;
  const sliderPositionPercent =
    gramRange.max > gramRange.min
      ? Math.round(
          ((sliderFirstGramsCurrent - gramRange.min) /
            (gramRange.max - gramRange.min)) *
            100
        )
      : 50;

  const sliderFirstRatioPercent = useMemo(() => {
    const firstKcal =
      sliderFirstGramsCurrent * (sliderFirst === 'fats' ? 9 : 4);
    const secondKcal = sliderSecondGrams * (sliderSecond === 'fats' ? 9 : 4);
    const total = firstKcal + secondKcal;
    if (total <= 0) return 50;
    return Math.round((firstKcal / total) * 100);
  }, [sliderFirstGramsCurrent, sliderSecondGrams, sliderFirst, sliderSecond]);

  const handleSliderChange = useCallback(
    (event) => {
      const firstGrams = Number(event.target.value);
      const firstKcal = firstGrams * (sliderFirst === 'fats' ? 9 : 4);
      const lockedKey = lockedKeys[0];
      const lockedCalories = lockedKey
        ? recommendations.grams[lockedKey] * (lockedKey === 'fats' ? 9 : 4)
        : 0;
      const residualCalories = Math.max(
        0,
        (Number(targetCalories) || 0) - lockedCalories
      );
      const secondGrams = Math.max(
        0,
        (residualCalories - firstKcal) / (sliderSecond === 'fats' ? 9 : 4)
      );

      // Build the split directly in calorie space from the actual slider grams.
      // Passing through macroSplitFromUnlockedRatio would discard the precise
      // grams and rebuild from the (possibly clamped) locked split fraction,
      // which made the thumb drift and snap to an arbitrary point on release.
      const nextSplit = { ...draftSplit };
      nextSplit[sliderFirst] = firstKcal;
      nextSplit[sliderSecond] = secondGrams * (sliderSecond === 'fats' ? 9 : 4);
      if (lockedKey) {
        nextSplit[lockedKey] = lockedCalories;
      }

      onChange?.(normalizeMacroRecommendationSplit(nextSplit));
    },
    [
      onChange,
      draftSplit,
      sliderFirst,
      sliderSecond,
      lockedKeys,
      targetCalories,
      recommendations.grams,
    ]
  );

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-4 md:p-6 w-full max-w-lg"
    >
      {/* Header */}
      <div className="text-center mb-6">
        <h3 className="text-foreground font-bold text-xl">Macro Split</h3>
        <p className="text-muted text-xs mt-1 tracking-wide">
          Adjust your protein, carbs, and fats to match your goals.
        </p>
      </div>

      {/* Fixed-size transition box: the 0-lock triangle and the 1-lock slider
          are absolutely positioned, so switching between them never changes
          the modal height or shifts the surrounding rows. */}
      <div className="relative h-[280px] w-full">
        {/* Triangle layer is always mounted: it recedes into a dimmed,
            blurred backdrop behind the slider in 1-lock mode and comes
            forward again on unlock. pointer-events are disabled while it
            sits behind the slider so taps can never reach it. */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={hasOneLock ? triangleBackdropState : triangleForegroundState}
          transition={{
            duration: MODE_SWITCH_DURATION,
            ease: MODE_SWITCH_EASE,
          }}
          style={{
            zIndex: 0,
            pointerEvents: hasOneLock ? 'none' : 'auto',
          }}
        >
          <div
            ref={triangleRef}
            className="relative w-full max-w-[280px] touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <svg
              viewBox={`0 0 ${TRIANGLE_WIDTH} ${TRIANGLE_HEIGHT}`}
              className="w-full h-auto overflow-visible"
            >
              {/* Triangle face */}
              <polygon
                points={`${pV.x},${pV.y} ${fV.x},${fV.y} ${cV.x},${cV.y}`}
                fill="rgb(var(--surface-highlight))"
                fillOpacity="0.4"
                stroke="rgb(var(--border))"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />

              {/* Guide lines from handle to each vertex */}
              {[
                { vx: pV.x, vy: pV.y, color: 'rgb(var(--accent-red))' },
                { vx: fV.x, vy: fV.y, color: 'rgb(var(--accent-yellow))' },
                { vx: cV.x, vy: cV.y, color: 'rgb(var(--accent-amber))' },
              ].map(({ vx, vy, color }, i) => (
                <line
                  key={i}
                  x1={markerPoint.x}
                  y1={markerPoint.y}
                  x2={vx}
                  y2={vy}
                  stroke={color}
                  strokeWidth="1"
                  strokeOpacity="0.3"
                  strokeDasharray="4 3"
                />
              ))}

              {/* Vertex dots */}
              <circle
                cx={pV.x}
                cy={pV.y}
                r="4"
                fill="rgb(var(--accent-red))"
                opacity="0.8"
              />
              <circle
                cx={fV.x}
                cy={fV.y}
                r="4"
                fill="rgb(var(--accent-yellow))"
                opacity="0.8"
              />
              <circle
                cx={cV.x}
                cy={cV.y}
                r="4"
                fill="rgb(var(--accent-amber))"
                opacity="0.8"
              />

              {/* Handle */}
              <circle
                cx={markerPoint.x}
                cy={markerPoint.y}
                r={hasTwoLocks ? 6 : 7}
                fill="rgb(var(--accent-blue))"
                stroke={
                  hasTwoLocks
                    ? 'rgb(var(--surface))'
                    : 'rgb(var(--accent-blue))'
                }
                strokeWidth={hasTwoLocks ? 2 : 1.5}
                strokeDasharray={hasTwoLocks ? '3 2' : undefined}
              />
            </svg>

            {/* Vertex labels */}
            <div className="pointer-events-none absolute left-1/2 -top-2.5 -translate-x-1/2 flex flex-col items-center">
              <span className="text-[11px] font-semibold text-accent-red tracking-wider uppercase">
                Protein
              </span>
              <span className="text-[9px] text-accent-red/70 leading-tight">
                Recovery & Repair
              </span>
            </div>
            <div className="pointer-events-none absolute -left-2 -bottom-2.5 flex flex-col items-center">
              <span className="text-[11px] font-semibold text-accent-yellow tracking-wider uppercase">
                Fats
              </span>
              <span className="text-[9px] text-accent-yellow/70 leading-tight">
                Hormonal Baseline
              </span>
            </div>
            <div className="pointer-events-none absolute -right-2 -bottom-2.5 flex flex-col items-center">
              <span className="text-[11px] font-semibold text-accent-amber tracking-wider uppercase">
                Carbs
              </span>
              <span className="text-[9px] text-accent-amber/70 leading-tight">
                Performance Energy
              </span>
            </div>
          </div>
        </motion.div>

        {/* Slider layer: arrives on top after the triangle starts receding. */}
        <AnimatePresence>
          {hasOneLock ? (
            <motion.div
              key="slider"
              className="absolute inset-0 z-10 flex items-center justify-center px-4"
              initial={sliderEnterFrom}
              animate={{
                ...sliderEnterTo,
                transition: {
                  duration: MODE_SWITCH_DURATION,
                  ease: MODE_SWITCH_EASE,
                  delay: prefersReducedMotion ? 0 : 0.08,
                },
              }}
              exit={{
                ...sliderExitTo,
                transition: {
                  duration: MODE_SWITCH_DURATION,
                  ease: MODE_SWITCH_EASE,
                },
              }}
            >
              <div className="w-full max-w-[320px]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col items-start">
                    <span
                      className={`text-xs font-semibold tracking-wider uppercase ${sliderFirstMeta.accentClass}`}
                    >
                      {sliderFirstMeta.label}
                    </span>
                    <span className="text-[10px] text-muted leading-tight">
                      {sliderFirstGrams}g · {sliderFirstRatioPercent}%
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className={`text-xs font-semibold tracking-wider uppercase ${sliderSecondMeta.accentClass}`}
                    >
                      {sliderSecondMeta.label}
                    </span>
                    <span className="text-[10px] text-muted leading-tight">
                      {100 - sliderFirstRatioPercent}% · {sliderSecondGrams}g
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={gramRange.min}
                  max={gramRange.max}
                  step={1}
                  value={sliderFirstGramsCurrent}
                  onChange={handleSliderChange}
                  aria-label={`Balance ${sliderFirstMeta.label} vs ${sliderSecondMeta.label}`}
                  style={{
                    '--value': `${sliderPositionPercent}%`,
                    background: `linear-gradient(to right, ${sliderFirstMeta.colorVar} 0%, ${sliderFirstMeta.colorVar} var(--value), ${sliderSecondMeta.colorVar} var(--value), ${sliderSecondMeta.colorVar} 100%)`,
                  }}
                  className="w-full cursor-pointer transition-all appearance-none h-3 rounded-lg"
                />
                <p className="text-center text-[11px] text-muted mt-2">
                  <span className="font-semibold capitalize">
                    {lockedKeys[0]}
                  </span>{' '}
                  stays anchored — {sliderFirstMeta.label.toLowerCase()} &{' '}
                  {sliderSecondMeta.label.toLowerCase()} balance the remaining
                  calories.
                </p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {hasTwoLocks && absorbedKey ? (
        <motion.p
          className="text-center text-[11px] text-muted mt-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          <span className="font-semibold capitalize">{absorbedKey}</span>{' '}
          absorbs changes while{' '}
          {lockedKeys.map((key) => key.toLowerCase()).join(' & ')} stay anchored
        </motion.p>
      ) : null}

      {relaxedMacros.length > 0 ? (
        <p className="text-center text-[11px] text-accent-yellow mt-2">
          Anchor temporarily relaxed: target too low to hold{' '}
          {relaxedMacros.join(', ')} at locked grams
        </p>
      ) : null}

      {/* Lock help text and clear anchors */}
      <div className="flex items-center justify-center gap-2 mt-2 mb-3">
        {lockedKeys.length > 0 ? (
          <button
            type="button"
            onClick={handleClearLocks}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-blue bg-accent-blue/10 px-3 py-1.5 rounded-full transition-all pressable-inline focus-ring md:hover:bg-accent-blue/20"
          >
            <Unlock size={12} />
            Clear anchors ({lockedKeys.length}/{MAX_MACRO_LOCKS})
          </button>
        ) : (
          <span className="text-[11px] text-muted">
            Tap a macro chip to anchor its grams
          </span>
        )}
      </div>

      {/* Macro chips */}
      <div className="grid grid-cols-3 gap-2">
        <MacroChip
          icon={Beef}
          label="Protein"
          pct={splitPercent.protein}
          grams={protein}
          kcal={kcalByMacro.protein}
          accentClass="text-accent-red"
          isLocked={draftLocks.protein != null}
          canLock={!hasTwoLocks || draftLocks.protein != null}
          onToggleLock={() => handleToggleLock('protein')}
        />
        <MacroChip
          icon={Droplet}
          label="Fats"
          pct={splitPercent.fats}
          grams={fats}
          kcal={kcalByMacro.fats}
          accentClass="text-accent-yellow"
          isLocked={draftLocks.fats != null}
          canLock={!hasTwoLocks || draftLocks.fats != null}
          onToggleLock={() => handleToggleLock('fats')}
        />
        <MacroChip
          icon={Cookie}
          label="Carbs"
          pct={splitPercent.carbs}
          grams={carbs}
          kcal={kcalByMacro.carbs}
          accentClass="text-accent-amber"
          isLocked={draftLocks.carbs != null}
          canLock={!hasTwoLocks || draftLocks.carbs != null}
          onToggleLock={() => handleToggleLock('carbs')}
        />
      </div>

      {/* Calorie total */}
      <div className="mt-3 relative">
        <button
          type="button"
          onClick={onOpenCalorieTargetModal}
          className="w-full bg-surface-highlight/50 border border-border/50 rounded-lg px-3 py-2 text-left flex items-center justify-between md:hover:bg-surface-highlight transition-all shadow-sm pressable-card focus-ring"
          aria-label="Change calorie target"
          title="Change calorie target"
        >
          <div className="flex-1 min-w-0">
            <p className="text-muted text-xs mb-0.5">Target</p>
            <p className="text-foreground text-sm font-semibold truncate">
              {Math.round(targetCalories || 0)} kcal
              <span className="text-muted font-normal ml-2">
                ({targetLabel})
              </span>
            </p>
          </div>
          <Settings2 size={18} className="text-muted" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 md:gap-3 mt-4">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight text-foreground px-4 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback md:hover:bg-surface text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          type="button"
          className="flex-1 bg-primary active:brightness-110 text-primary-foreground px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback text-sm"
        >
          <Save size={16} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
