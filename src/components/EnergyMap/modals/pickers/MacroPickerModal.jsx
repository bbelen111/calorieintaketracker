import React, { useCallback, useMemo, useRef } from 'react';
import { Save, Beef, Cookie, Droplet, Settings2 } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  calculateMacroRecommendations,
  createMacroTriangleGeometry,
  formatMacroSplitPercent,
  macroSplitFromTrianglePoint,
  macroSplitToTrianglePoint,
  normalizeMacroRecommendationSplit,
} from '../../../../utils/macroRecommendations';

const TRIANGLE_WIDTH = 320;
const TRIANGLE_HEIGHT = 280;

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
  borderClass,
}) => (
  <div
    className={`rounded-xl border ${borderClass} bg-surface-highlight/30 px-3 py-2.5 flex flex-col gap-1`}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className={accentClass} />
        <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
          {label}
        </span>
      </div>
      <span className={`text-xs font-bold ${accentClass}`}>{pct}%</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-lg font-bold text-foreground leading-none">
        {grams}
      </span>
      <span className="text-[11px] text-muted">g</span>
      <span className="text-[11px] text-muted ml-auto">{kcal} kcal</span>
    </div>
  </div>
);

export const MacroPickerModal = ({
  isOpen,
  isClosing,
  value,
  onChange,
  targetCalories,
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

  const handlePointerSelection = useCallback(
    (event) => {
      if (!triangleRef.current) return;
      const point = getRelativePoint(event, triangleRef.current);
      onChange?.(macroSplitFromTrianglePoint(point, triangleGeometry));
    },
    [onChange]
  );

  const pointerCaptureIdRef = useRef(null);

  const handlePointerDown = useCallback(
    (event) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      pointerCaptureIdRef.current = event.pointerId;
      triangleRef.current?.setPointerCapture?.(event.pointerId);
      handlePointerSelection(event);
    },
    [handlePointerSelection]
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
    () => macroSplitToTrianglePoint(draftSplit, triangleGeometry),
    [draftSplit]
  );
  const splitPercent = useMemo(
    () => formatMacroSplitPercent(draftSplit),
    [draftSplit]
  );
  const recommendations = useMemo(
    () =>
      calculateMacroRecommendations({ targetCalories, macroSplit: draftSplit }),
    [draftSplit, targetCalories]
  );

  const { protein, carbs, fats } = recommendations.grams;
  const { calories: kcalByMacro } = recommendations;
  const { protein: pV, fats: fV, carbs: cV } = triangleGeometry.vertices;

  const handleSave = useCallback(() => {
    onSave?.(normalizeMacroRecommendationSplit(draftSplit));
  }, [draftSplit, onSave]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-4 md:p-6 w-full max-w-lg"
    >
      {/* Header */}
      <div className="text-center mb-5">
        <h3 className="text-foreground font-bold text-xl">Macro Split</h3>
        <p className="text-muted text-xs mt-1 tracking-wide">
          Drag the triangle to adjust your ratio
        </p>
      </div>

      {/* Triangle */}
      <div
        ref={triangleRef}
        className="relative mx-auto w-full max-w-[320px] touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <svg
          viewBox={`0 0 ${TRIANGLE_WIDTH} ${TRIANGLE_HEIGHT}`}
          className="w-full h-auto overflow-visible"
        >
          <defs>
            <linearGradient id="triFill" x1="0%" y1="100%" x2="50%" y2="0%">
              <stop
                offset="0%"
                stopColor="rgb(var(--accent-yellow))"
                stopOpacity="0.3"
              />
              <stop
                offset="50%"
                stopColor="rgb(var(--accent-red))"
                stopOpacity="0.25"
              />
              <stop
                offset="100%"
                stopColor="rgb(var(--accent-amber))"
                stopOpacity="0.3"
              />
            </linearGradient>
            <filter
              id="handleGlow"
              x="-80%"
              y="-80%"
              width="260%"
              height="260%"
            >
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Triangle face */}
          <polygon
            points={`${pV.x},${pV.y} ${fV.x},${fV.y} ${cV.x},${cV.y}`}
            fill="url(#triFill)"
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
            r="13"
            fill="rgb(var(--background))"
            stroke="rgb(var(--accent-blue))"
            strokeWidth="2.5"
            filter="url(#handleGlow)"
          />
          <circle
            cx={markerPoint.x}
            cy={markerPoint.y}
            r="4"
            fill="rgb(var(--accent-blue))"
            opacity="0.9"
          />
        </svg>

        {/* Vertex labels */}
        <div className="pointer-events-none absolute left-1/2 -top-1 -translate-x-1/2 flex flex-col items-center">
          <span className="text-[11px] font-semibold text-accent-red tracking-wider uppercase">
            Protein
          </span>
          <span className="text-[10px] text-accent-red/60 font-medium">
            {splitPercent.protein}%
          </span>
        </div>
        <div className="pointer-events-none absolute left-1 bottom-0 flex flex-col items-start">
          <span className="text-[11px] font-semibold text-accent-yellow tracking-wider uppercase">
            Fats
          </span>
          <span className="text-[10px] text-accent-yellow/60 font-medium">
            {splitPercent.fats}%
          </span>
        </div>
        <div className="pointer-events-none absolute right-1 bottom-0 flex flex-col items-end">
          <span className="text-[11px] font-semibold text-accent-amber tracking-wider uppercase">
            Carbs
          </span>
          <span className="text-[10px] text-accent-amber/60 font-medium">
            {splitPercent.carbs}%
          </span>
        </div>
      </div>

      {/* Macro chips */}
      <div className="grid grid-cols-3 gap-2 mt-5">
        <MacroChip
          icon={Beef}
          label="Protein"
          pct={splitPercent.protein}
          grams={protein}
          kcal={kcalByMacro.protein}
          accentClass="text-accent-red"
          borderClass="border-accent-red/20"
        />
        <MacroChip
          icon={Cookie}
          label="Carbs"
          pct={splitPercent.carbs}
          grams={carbs}
          kcal={kcalByMacro.carbs}
          accentClass="text-accent-amber"
          borderClass="border-accent-amber/20"
        />
        <MacroChip
          icon={Droplet}
          label="Fats"
          pct={splitPercent.fats}
          grams={fats}
          kcal={kcalByMacro.fats}
          accentClass="text-accent-yellow"
          borderClass="border-accent-yellow/20"
        />
      </div>

      {/* Calorie total */}
      <div className="mt-3 rounded-xl border border-border bg-surface-highlight/20 px-4 py-2.5 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted">Daily target</p>
          <p className="text-xs text-muted truncate">{targetLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">
            {Math.round(targetCalories || 0)}{' '}
            <span className="text-xs font-normal text-muted">kcal</span>
          </span>
          <button
            type="button"
            onClick={onOpenCalorieTargetModal}
            className="p-1.5 rounded-lg border border-border/50 bg-surface-highlight/40 text-muted transition-all pressable-inline focus-ring md:hover:bg-surface-highlight/80"
            aria-label="Change calorie target"
            title="Change calorie target"
          >
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 md:gap-3 mt-4">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight text-foreground px-4 py-3 rounded-xl transition-all active:scale-95 font-medium focus-ring press-feedback md:hover:bg-surface text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          type="button"
          className="flex-1 bg-primary active:brightness-110 text-primary-foreground px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback text-sm"
        >
          <Save size={16} />
          Save Split
        </button>
      </div>
    </ModalShell>
  );
};
