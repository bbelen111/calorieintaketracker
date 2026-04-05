import React, { useCallback, useMemo, useRef } from 'react';
import { Save, Beef, Cookie, Droplet, Settings2 } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  calculateMacroRecommendations,
  createMacroTriangleGeometry,
  formatMacroSplitPercent,
  macroSplitFromConstrainedTrianglePoint,
  macroSplitToConstrainedTrianglePoint,
  normalizeMacroRecommendationSplit,
} from '../../../../utils/calculations/macroRecommendations';

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

const MacroChip = ({ icon: Icon, label, pct, grams, kcal, accentClass }) => (
  <div className="rounded-xl border border-border/50 bg-surface-highlight/50 px-3 py-2.5 flex flex-col gap-1">
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

  const handlePointerSelection = useCallback(
    (event) => {
      if (!triangleRef.current) return;
      const point = getRelativePoint(event, triangleRef.current);
      onChange?.(
        macroSplitFromConstrainedTrianglePoint(point, triangleGeometry, {
          targetCalories,
          userData,
        })
      );
    },
    [onChange, targetCalories, userData]
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
    () =>
      macroSplitToConstrainedTrianglePoint(draftSplit, triangleGeometry, {
        targetCalories,
        userData,
      }),
    [draftSplit, targetCalories, userData]
  );
  const splitPercent = useMemo(
    () => formatMacroSplitPercent(draftSplit),
    [draftSplit]
  );
  const recommendations = useMemo(
    () =>
      calculateMacroRecommendations({
        targetCalories,
        macroSplit: draftSplit,
        userData,
      }),
    [draftSplit, targetCalories, userData]
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
      <div className="text-center mb-8">
        <h3 className="text-foreground font-bold text-xl">Macro Split</h3>
        <p className="text-muted text-xs mt-1 mb-2 tracking-wide">
          Drag the triangle to adjust your ratio
        </p>
      </div>

      {/* Triangle */}
      <div
        ref={triangleRef}
        className="relative mx-auto w-full max-w-[320px] touch-none select-none pb-8"
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
            r="7"
            fill="rgb(var(--accent-blue))"
            stroke="rgb(var(--accent-blue))"
            strokeWidth="1.5"
          />
        </svg>

        {/* Vertex labels */}
        <div className="pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 flex flex-col items-center">
          <span className="text-[11px] font-semibold text-accent-red tracking-wider uppercase">
            Protein
          </span>
          <span className="text-[9px] text-accent-red/70 leading-tight">
            Recovery &amp; Repair
          </span>
        </div>
        <div className="pointer-events-none absolute -left-2 bottom-2 flex flex-col items-center">
          <span className="text-[11px] font-semibold text-accent-yellow tracking-wider uppercase">
            Fats
          </span>
          <span className="text-[9px] text-accent-yellow/70 leading-tight">
            Hormonal Baseline
          </span>
        </div>
        <div className="pointer-events-none absolute -right-2 bottom-2 flex flex-col items-center">
          <span className="text-[11px] font-semibold text-accent-amber tracking-wider uppercase">
            Carbs
          </span>
          <span className="text-[9px] text-accent-amber/70 leading-tight">
            Performance Energy
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
        />
        <MacroChip
          icon={Droplet}
          label="Fats"
          pct={splitPercent.fats}
          grams={fats}
          kcal={kcalByMacro.fats}
          accentClass="text-accent-yellow"
        />
        <MacroChip
          icon={Cookie}
          label="Carbs"
          pct={splitPercent.carbs}
          grams={carbs}
          kcal={kcalByMacro.carbs}
          accentClass="text-accent-amber"
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
