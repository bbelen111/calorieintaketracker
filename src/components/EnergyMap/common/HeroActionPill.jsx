import React from 'react';
import { Utensils } from 'lucide-react';
import { HERO_ACTION_ICONS_BY_KEY } from './heroActionIcons';
import { HeroProgressOutline } from './HeroProgressOutline';

// The pill is one of the hero buttons (`bg-primary`, `rounded-lg`, `px-4 py-2`,
// semibold, a 20px icon) with a progress outline on top, so it hugs its content
// and occupies exactly their box. That box must be *derived* the way theirs is,
// never a fixed rem height: the root font is 13.5px mobile / 17px desktop, and
// the siblings measure 33.5px / 42.5px because their height is `py-2` +
// max(icon 20px, label line box) — `h-9` (2.25rem) came out 3.4px short and
// `h-10` (2.5rem) 0.25px over. `leading-none md:leading-normal` keeps this
// pill's line box under the icon on phones (where the siblings hide their label,
// so their content is icon-driven) and equal to it on desktop, which lands on
// 33.5px / 42.5px — measured identical to them at both breakpoints.
const OUTLINE_RADIUS_PX = 5.5; // concentric inside `rounded-lg`

/**
 * Home's hero action as one tappable control: a readout for today plus the
 * action behind it, in a single tap target.
 *
 * It renders a display `model` built by `buildHeroActionModel`
 * (`utils/calculations/heroActionMetrics.js`) and knows nothing about which
 * metric it is: `iconKey`, `value`, `unit`, `progress` and `ariaLabel` are all it
 * needs. `progress` is a 0-100 outline fill (0 shows the empty track), or `null`
 * for a metric with no goal (a plain readout with no outline at all).
 *
 * It is a *sibling* of the other screens' hero buttons, not a lookalike: same
 * `bg-primary` fill, `rounded-lg`, semibold label, no shadow utility and no rim
 * of its own (the global `button.bg-primary` sheen/glow rule styles it and its
 * siblings alike) and the same press/hover behaviour — it just carries a number
 * and a progress outline. It hugs its content, so a long number widens it
 * instead of clipping. `shrink-0` matters: the hero title row must wrap the pill
 * rather than squeeze it.
 *
 * The outline (`HeroProgressOutline`, shared with the tiles) is drawn in the
 * fill's own text colour, so it is white on every theme.
 */
export const HeroActionPill = ({
  model,
  onPress,
  className = '',
  ariaLabel,
}) => {
  const Icon = HERO_ACTION_ICONS_BY_KEY[model?.iconKey] ?? Utensils;

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel ?? model?.ariaLabel}
      className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-all press-feedback focus-ring md:hover:brightness-110 ${className}`.trim()}
    >
      <HeroProgressOutline
        progress={model?.progress}
        radius={OUTLINE_RADIUS_PX}
        colorVar="--primary-foreground"
      />
      <Icon size={20} className="shrink-0" aria-hidden="true" />
      <span className="tabular-nums leading-none md:leading-normal">
        {model?.value}
        {model?.unit ? (
          <>
            {' '}
            <span className="text-[0.9em] opacity-85">{model.unit}</span>
          </>
        ) : null}
      </span>
    </button>
  );
};

HeroActionPill.displayName = 'HeroActionPill';
