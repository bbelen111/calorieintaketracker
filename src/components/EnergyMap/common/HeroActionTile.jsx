import React from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { HeroProgressOutline } from './HeroProgressOutline';

// A typical phone tile is ~150x80px; the reference box only has to be close
// enough that stretching it barely bends the corners.
const OUTLINE_REF_WIDTH_PX = 150;
const OUTLINE_REF_HEIGHT_PX = 80;
const OUTLINE_RADIUS_PX = 12; // matches `rounded-xl`

/**
 * A Home readout tile for a hero metric - the same design, class for class, as
 * the original Weight / Body Fat tiles (label, large value, muted caption,
 * chevron), now the shell for whichever metric a tile slot is set to. Weight and
 * Body Fat are just two of the metrics it can show, including their staleness
 * warning chip.
 *
 * It renders a display model from `buildHeroActionModel`
 * (`utils/calculations/heroActionMetrics.js`) and, like the pill, knows nothing
 * about which metric it is: `shortLabel` / `primary` / `caption` / `warning` /
 * `progress` are all it needs. A metric with a goal draws the same progress
 * outline as the pill (`HeroProgressOutline`); a plain reading (Weight, resting
 * HR) has none and stays flat like its neighbours.
 */
export const HeroActionTile = ({ model, onPress }) => (
  <button
    onClick={onPress}
    type="button"
    aria-label={model?.ariaLabel}
    className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-3 md:p-4 border border-border/50 transition-all active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
  >
    <HeroProgressOutline
      progress={model?.progress}
      refWidth={OUTLINE_REF_WIDTH_PX}
      refHeight={OUTLINE_REF_HEIGHT_PX}
      radius={OUTLINE_RADIUS_PX}
    />
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-muted text-xs font-medium truncate">
          {model?.shortLabel}
        </p>
        <p className="text-2xl md:text-3xl font-bold text-foreground leading-tight mt-1 flex items-baseline gap-1.5">
          <span className="shrink-0">{model?.primary}</span>
          {model?.warning && (
            <span className="inline-flex items-center gap-0.5 text-accent-yellow text-[10px] font-medium truncate min-w-0">
              <AlertCircle size={10} className="shrink-0" />
              {model.warning}
            </span>
          )}
        </p>
        <p className="text-muted text-[11px] mt-1 truncate">
          {model?.caption || ' '}
        </p>
      </div>
      <ChevronRight
        size={20}
        className="text-muted/60 shrink-0 mt-1 md:group-hover:text-primary transition-colors"
      />
    </div>
  </button>
);

HeroActionTile.displayName = 'HeroActionTile';
