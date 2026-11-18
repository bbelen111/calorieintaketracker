---
name: Energy Map Calorie Tracker
description: A quiet, technical instrument for reading one day's energy expenditure — slate depth, one working blue, and colour that only ever encodes a measurement.
colors:
  slate-chamber: "#0F172A"
  slate-panel: "#1E293B"
  slate-rail: "#334155"
  slate-edge: "#334155"
  muted-slate: "#94A3B8"
  plate-white: "#FFFFFF"
  ink-black: "#000000"
  selection-hairline: "#FFFFFF"
  signal-blue: "#2563EB"
  accent-blue: "#3B82F6"
  accent-green: "#22C55E"
  accent-lime: "#84CC16"
  accent-emerald: "#10B981"
  accent-yellow: "#EAB308"
  accent-amber: "#F59E0B"
  accent-orange: "#F97316"
  accent-red: "#EF4444"
  accent-purple: "#A855F7"
  accent-slate: "#64748B"
  accent-indigo: "#6366F1"
  accent-pink: "#EC4899"
  accent-teal: "#14B8A6"
  accent-coral: "#FF6F61"
typography:
  display:
    fontFamily: "BarlowDigits, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "BarlowDigits, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "BarlowDigits, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "-0.01em"
  body:
    fontFamily: "BarlowDigits, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "BarlowDigits, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "calc(11px * var(--font-scale, 1))"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.025em"
  numeric:
    fontFamily: "BarlowDigits, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  full: "9999px"
spacing:
  unit: "calc(0.25rem * var(--density, 1))"
  screen-gutter: "calc(1rem * var(--density, 1))"
  card-padding: "calc(1.5rem * var(--density, 1))"
  stack: "calc(1.5rem * var(--density, 1))"
  inline-gap: "calc(0.5rem * var(--density, 1))"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.lg}"
    padding: "calc(0.5rem * var(--density, 1)) calc(1rem * var(--density, 1))"
  button-secondary:
    backgroundColor: "{colors.slate-rail}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.lg}"
    padding: "calc(0.75rem * var(--density, 1)) calc(1rem * var(--density, 1))"
  button-destructive:
    backgroundColor: "{colors.accent-red}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.lg}"
    padding: "calc(0.75rem * var(--density, 1)) calc(1rem * var(--density, 1))"
  card-surface:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.2xl}"
    padding: "calc(1.5rem * var(--density, 1))"
  row-inset:
    backgroundColor: "{colors.slate-rail}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.lg}"
    padding: "calc(1rem * var(--density, 1))"
  stat-chip:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.muted-slate}"
    rounded: "{rounded.full}"
    padding: "calc(0.25rem * var(--density, 1)) calc(0.625rem * var(--density, 1))"
  input-field:
    backgroundColor: "{colors.slate-rail}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.lg}"
    padding: "calc(0.75rem * var(--density, 1)) calc(1rem * var(--density, 1))"
  tab-bar:
    backgroundColor: "{colors.slate-panel}"
    rounded: "{rounded.full}"
    height: "54px"
    width: "384px"
  wheel-picker:
    backgroundColor: "{colors.slate-panel}"
    rounded: "{rounded.xl}"
    height: "10rem"
---

# Design System: Energy Map Calorie Tracker

## Overview

**Creative North Star: "The Calibrated Instrument"**

This is a device you read, not a page you browse. Every screen is a stack of inset panels — a background slate, a raised card, a recessed row inside it — and each panel exists to hold one reading or one action. Nothing is framed for atmosphere: the frame is the hairline, the reading is the number, and the colour is either the working blue that means "you can touch this" or one of fourteen encoder hues that names a quantity.

The atmosphere is quiet, technical and exact. Darkness is the working condition — the app is used on a phone at 6am for a weigh-in and at 10pm for a ledger review — so the neutral ladder is a cool slate and text is white or a muted slate, never pure black on pure white. Density is deliberate but never cramped: a card carries its own heading, one emphasised number, and a support line, and then stops. The one moment of looseness is the glass chrome (tab bar, tracker reading card), which stays glass because it sits over content it must not erase.

Motion is treated as instrumentation, not as delight: entrances are short (140–200ms) fade-and-rise moves; settles are compositor CSS transitions at 350ms on an exponential ease-out; state changes are a sub-1% scale press and a brightness step. Every animation has a `prefers-reduced-motion` opt-out, because an instrument that wobbles is an instrument you stop trusting.

The design's anti-reference is dashboard theatre: gradient hero cards, glow for glow's sake, a coloured border-left announcing importance, or a big number with nothing behind it. Where a neighbouring fitness app sells momentum, this one sells a number you can audit down to the formula that produced it — and the visual system has to look like it can be audited.

**Key Characteristics:**

- One working accent — Signal Blue — carries interaction; the other thirteen accents encode values, categories and states, never decoration.
- Three neutral slates (`chamber` → `panel` → `rail`) separated by 1px hairlines carry all structure; borders are never heavy.
- Numbers are the content: a dedicated digit face (Barlow, digits-only subset), tabular numerals wherever two values are compared, and a 2xl/3xl bold figure beside an 11px muted label.
- Cards on cards: 21 `rounded-2xl bg-surface` screen cards hold `bg-surface-highlight/50` rows, tiles and insets — nesting is the layout grammar, at two levels and no more.
- Depth is tonal first, ambient second: a theme-tinted shadow scale plus a faint top-edge sheen (`--card-sheen`), never a shadow that appears on hover.
- Glass is an effect with a job, used at full strength in exactly two places (floating tab bar, tracker reading card); lighter blur belongs to sticky chart headers and transient toasts.
- Every number traces to an input; absence is shown as `—` or "No entries yet", never as a zero.

## Colors

A night-shift instrument palette: three cool slates, one working blue, and an encoder set of fourteen hues that each mean something specific.

### Primary

- **Signal Blue** (#2563EB): the only colour that means "interactive". It fills primary buttons, the active tab circle, the moving swipe dot, the selected segmented option and the confirmed action of a dialog. Its rarity is the point — a screen normally carries it once or twice.
- **Signal Blue (raised)** (#3B82F6): `accent-blue` on the dark and AMOLED themes — icons, links, chart guides, the tint on an informational chip, and the `:focus-visible` outline. One step lighter than the fill so a 16px glyph still reads against a slate panel; other themes re-calibrate it (sky 400 on forest/midnight, sky 700 on dawn).

### Secondary

The accent set is deliberately not a second brand colour. It is a semantic encoder: the same fourteen token names resolve to different shades per theme (500-level on dark/AMOLED, 600-level on light, 400-level on forest/midnight, 300-level on dusk, 700-level on dawn), but the *meaning* never changes.

| Token | Encodes |
|---|---|
| `accent-blue` | Primary accent, icons, section headers, interactive affordance |
| `accent-green` | On-target, positive, step burn, goal reached |
| `accent-lime` | Goal alignment |
| `accent-emerald` | Brand/secondary positive, the "on" state of a switch |
| `accent-yellow` | Fats, caution, stale-data warnings |
| `accent-amber` | Carbohydrates, calories intake |
| `accent-orange` | Warning level, upward weight trend |
| `accent-red` | Protein, negative deltas, delete, cardio burn |
| `accent-purple` | Supplements, aggressive bulk, NEAT, cached foods |
| `accent-slate` | Neutral, fallback, no-signal |
| `accent-indigo` | Barcode/manual entries, rest day |
| `accent-pink` | Secondary highlight, specialty emphasis |
| `accent-teal` | EPOC / post-exercise burn |
| `accent-coral` | Adaptive-thermogenesis correction |

### Neutral

- **Slate Chamber** (#0F172A): the page. Every screen sits on it, and the backdrop is a plain diagonal wash from chamber to panel and back — no radial glows.
- **Slate Panel** (#1E293B): every primary card, every modal surface, the tab bar fill (at 35% with blur), the stat chip.
- **Slate Rail** (#334155): the recessed layer — session rows, tiles, picker buttons, inputs, range tracks. Usually applied at 50% (`bg-surface-highlight/50`) so the panel still reads through it.
- **Slate Edge** (#334155 as `--border`): the hairline. Cards use `border-border`, inner rows `border-border/50`, dividers `/60`, decorative rules `/30` and `/40`. In practice a border is a whisper, not a frame.
- **Muted Slate** (#94A3B8): every second-tier reading — labels, dates, provenance, units, empty states. Never used for a value the user came to read.
- **Plate White** (#FFFFFF): primary text, and the text colour on any filled accent (`text-primary-foreground`).
- **Ink Black** (#000000 as `--overlay-base`): not a surface — the tint that every shadow and modal backdrop is mixed from. Themes replace it (warm charcoal on Dawn, night navy on Midnight) so depth follows the theme rather than sitting on top of it.
- **Selection Hairline** (#FFFFFF as `--action-border`): a white inner edge used only inside a *filled* selected chip (Food Search filters), so the primary fill still separates from its neighbour without a second colour.

### Theme Matrix

Eight themes redefine the same token names — this is one system with eight calibrations, not eight systems.

| Theme | Chamber | Primary | Mode |
|---|---|---|---|
| Dark (default) | #0F172A | #2563EB | dark |
| Light | #F1F5F9 | #2563EB | light |
| Darker (AMOLED) | #000000 | #3B82F6 | dark |
| Forest | #0D1F1B | #059669 | dark |
| Dawn | #FFF7ED | #C2410C | light |
| Dusk | #1F182B | #D946EF | dark |
| Midnight | #081222 | #0EA5E9 | dark |
| Auto | follows `prefers-color-scheme` (dark ⇄ light) | — | system |

`Auto` is the shipped default. A theme change cross-fades the root (260ms, View Transition API) where the engine supports it, and switches instantly under reduced motion.

### Named Rules

**The One Working Accent Rule.** Signal Blue owns every interactive state. If a control needs to look tappable, it is blue, a tinted blue (`/10` fill, `/20` border), or neutral — never another hue. An accent that is not blue must be reporting a value.

**The Encoded Hue Rule.** A hue may appear only where it names a quantity, a category or a state. Red on a trash icon is a state; red on a heading is a decoration and does not ship.

**The Absence Rule.** Missing data is `—`, "No entries yet", or "Need more data" in Muted Slate. Never a plausible zero, never an interpolated claim, never a green tick for an untracked field.

## Typography

**Display Font:** Barlow, subset to digits and numeric punctuation via `unicode-range` (`BarlowDigits`, weights 400/700), falling back to `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
**Body Font:** the same stack — Barlow's subset only covers `0-9 % + , - . / : −`, so all language renders in the platform sans and all numbers render in Barlow

**Character:** The pairing is deliberately invisible as a pairing: the reader should never see a "font choice", only that the numbers are more precise than the words. Barlow's slightly condensed, slightly industrial digits give a reading its own voice at 20px while the surrounding sans stays out of the way at 11px.

### Hierarchy

- **Display** (900, 1.5rem → 1.875rem at `md`, 1.25 leading, tightened to `leading-none` where a hero stacks a number over a unit): one per screen, always the screen's own name — "Energy Map", "Calorie Tracker", "Insights". `font-black` is reserved for it.
- **Headline** (700, 1.25rem, 1.4): card titles, fullscreen modal titles, the calorie figure in a hero. The default size for "this card is about…".
- **Title** (700, 1.125rem, 1.55): section titles inside a card ("Today's Activity Burn", "Your Goal"), generated food names, list-row lead lines when a card needs two weights of heading.
- **Body** (400, 1rem, 1.5): paragraph and row copy. One step down is `text-sm` (0.875rem, 1.43) for support lines — a session's "45 min • Moderate • ~412 kcal", a setting's description.
- **Label** (600, 11px absolute — `calc(11px * var(--font-scale))`, 1.4, +0.025em, often uppercase): the muted line above a reading — "Weight", "TDEE", "Average (7d)". 118 uses of `text-[11px]`; it is the app's most common type size and the one that makes a screen legible at a glance.
- **Numeric** (700, 1.5rem, 1.2, `tnum`): the emphasised reading in a card or tile — `leading-tight` in tiles, `leading-none` inside the progress pill. Tabular figures are required wherever two numbers can be compared down a column or across a switch (the pill's `consumed / goal`, tracker deltas, the ledger's tiles).

Two units are in play and both are deliberate. The rem roles resolve against a root that is **13.5px on phones and 17px at `md`**, so `1.5rem` is 20.3px on a phone and 25.5px on a desktop; they are then multiplied by `--font-scale` (0.9 / 1 / 1.12 / 1.25 from Settings → Appearance → Text size). The literal sizes — `text-[8px]` through `text-[17px]`, an explicit list in `index.css` (58 uses of `text-[10px]` and 118 of `text-[11px]` alone) — are device-independent and multiplied by the same variable; a new arbitrary size that is not added to that list silently ignores the setting.

### Named Rules

**The Digits Are Data Rule.** Use `tabular-nums` on any figure that sits beside another figure, and never set a number in a different family by hand — the font stack already routes digits to Barlow. A proportionally-set column of numbers is a bug you can see.

**The One Black Title Rule.** Exactly one `font-black` per screen: the screen title. Card and section headings stop at `font-bold`; row lead lines stop at `font-semibold`. Emphasis comes from weight and size, never from a colour change alone.

**The Label Stays Muted Rule.** A label is Muted Slate and small; the value is Plate White and large. Grey out the label, never the reading.

## Layout

The shell is fixed and app-shaped, not document-shaped: `min-h-screen p-4 md:p-6` on the `app-backdrop`, with content in a `max-w-6xl` column and each screen stacked at `space-y-6` with `pb-10` for breathing room above the floating bar.

**Five screens, one gesture.** Logbook → Tracker → Home (default) → Calorie Map → Insights sit in a looping horizontal carousel. All five render once; the viewport is full-bleed (`-mx-4 md:-mx-6`) and each slide is `calc(100% - 32px)` wide, so 16px of the neighbouring screen peeks in at each edge and the slide's inner `px-2` (6.75px) puts real card content into that sliver. Nothing else in the layout is full-bleed.

**Cards carry the rhythm.** A screen card is `bg-surface rounded-2xl p-6 border border-border shadow-lg` (hero cards step up to `p-6 md:p-8`); rows and tiles inside it are `bg-surface-highlight/50 rounded-lg|xl border-border/50 p-3 md:p-4`. Gaps are `gap-3` inside a card, `space-y-6` between cards, `space-y-2` in a settings stack.

**The floating bar has hard numbers.** 54px tall, fully rounded, 40px side insets plus `--sal`/`--sar`, a 36px bottom lift plus `--sab`, and a 384px maximum width so a wide viewport gets a narrower pill rather than a stretched one. Content clearance is derived from those constants (`102px` = 36 + 54 + 12), so the screen padding and the bar can never drift. Drag-linked chrome (the active circle, the swipe dots, the coach mark) is measured in inline px for the same reason — the root font is rem-based.

**One real breakpoint.** `md` (768px) is the only breakpoint in the system: it raises the root font from 13.5px to 17px, turns `p-4` into `p-6`, and reveals button labels that are icon-only on phones. `sm` appears nine times, all padding. Mobile portrait at 360–390px is the design target; desktop is the same layout with more air.

**Two scales the user owns.** `--font-scale` multiplies text only; `--density` multiplies Tailwind's single spacing unit, so `p-4`, `gap-2` and `h-10` all tighten together. Layout density never changes type size, and type size never changes layout. Safe-area insets (`--sat/--sab/--sal/--sar`) and the keyboard inset are layout inputs, not afterthoughts: bottom chrome pads with `max(safe-area, keyboard-inset)`, never their sum.

**Touch first.** Every interactive element assumes a thumb: no hover-only affordance anywhere (`md:hover:` is mandatory for any hover state), press feedback on every button, and the floating bar fades out while the keyboard is up.

## Elevation & Depth

Depth is tonal first and ambient second: the neutral ladder does most of the work (`chamber` behind `panel` behind `rail`), a 1px hairline marks each step, and a single soft shadow lifts a card off the chamber. There is no "no shadows" austerity here and no lifted-card theatre either — a card rests, and it keeps resting when you touch it.

Shadows are themed, not black. Every step is a tight contact shadow plus a long, negative-spread ambient shadow mixed from `--overlay-base`, so Dawn's depth is warm charcoal and Midnight's is night ink. Because the tokens live in the `@theme inline` block, every existing `shadow-*` utility — including modifiers like `shadow-background/40` — picks them up automatically; a one-off `shadow-[…]` on a card is a signal that something is wrong.

### Shadow Vocabulary

Every value below is a stack of `rgb(var(--overlay-base) / α)` layers; the alphas are written inline for brevity, and the full strings live in `index.css` and the design sidecar.

- **`shadow-xs`** (`0 1px 2px rgb(var(--overlay-base) / 0.06)`): the smallest lift — stat chips, selected segmented options, small inset buttons.
- **`shadow-sm`** (`0 1px 2px /0.07, 0 2px 6px -2px /0.08`): settings rows and header chrome.
- **`shadow-md`** (`0 1px 2px /0.06, 0 6px 14px -4px /0.14`): range thumbs, small raised controls.
- **`shadow-lg`** (`0 1px 2px /0.06, 0 10px 28px -8px /0.2, 0 3px 8px -3px /0.08`): the standard screen card and inner session row.
- **`shadow-xl`** (`0 2px 4px /0.08, 0 18px 44px -12px /0.3`): a card that must read above another card.
- **`shadow-2xl`** (`0 4px 8px /0.1, 0 30px 64px -16px /0.45`): modal sheets and the glass tracker card.

Two lights sit on top of the scale: `--card-sheen` gives every `rounded-2xl bg-surface` card a faint top-edge gradient (transparent on the light themes, where a white highlight on white is invisible), and filled action buttons take a glass top-light plus a coloured under-glow (`0 6px 16px -6px` of their own hue at 50%). Fullscreen modals extend the same grammar — a lit header lifted over a body that catches the sheen — via the shared `.fullscreen-header` / `.fullscreen-body` classes.

### Named Rules

**The Theme-Tinted Shadow Rule.** Depth is mixed from `--overlay-base`, never from flat black. A hardcoded `rgba(0,0,0,…)` shadow is off-palette on three of the eight themes (Dawn's warm charcoal, Dusk's night plum, Midnight's ink) and flattens the rest.

**The Thumb Answers, Not the Shadow Rule.** State is carried by a sub-1% scale press (`0.985` generic, `0.98` primary, `0.99` cards) and a brightness step, plus a blue outline ring on `:focus-visible` (2px, 3px offset, 12px radius). Shadows are static: a shadow that grows on hover reads as a web page, not an instrument.

**The Glass Has A Job Rule.** `backdrop-blur-2xl` appears in exactly two places — the floating tab bar and the tracker reading card. Sticky chart headers and transient toasts use `backdrop-blur-sm`/`xs`, and the header gear is a translucent circle (`bg-surface/60`) with no blur at all. Glass marks "this floats over content and must let it through"; applied to a resting card it is decoration, and decoration is not in this palette.

## Shapes

Corners step in five increments and everything else is a pill. `rounded-lg` (0.5rem) is the default control radius, `rounded-xl` (0.75rem) the default tile and secondary card, `rounded-2xl` (1rem) the screen card and modal sheet. `rounded-md` is reserved for the smallest controls (week-nav strips, tag chips at `rounded`), and `rounded-full` for anything that is a pill, a dot, a thumb, a badge or a status lamp — including the entire tab bar.

Radii are rem-based, so they scale with the root font: `rounded-lg` is 6.75px on a phone and 8.5px at `md`, and `rounded-2xl` is 13.5px versus 17px. That is intentional — the shape language grows with the text rather than pinching on desktop.

Borders are hairlines (1px) at partial opacity, and `border-2` is reserved for three jobs: the segmented control's selected option, the goal tile (a filled goal colour needs a matching border), and a selected chip inside a filled filter. There is no left-accent bar, no notched corner, no squircle, and no decorative diagonal.

Iconography is Lucide at 20px by default, 16–18px inline with text, 24px in section headers, 32px for a screen hero, and 12–15px inside chips; a settings-style category icon sits in a `h-9 w-9` box (2.25rem — ~30px on a phone, 38px on desktop) tinted `bg-accent-blue/10` with a `ring-1 ring-accent-blue/20`. Strokes are never mixed with filled icons in the same row.

### Named Rules

**The Hairline First Rule.** Structure is stated by a hairline and a tonal step before it is stated by a shadow. If a region needs separating, move it one slate down before reaching for elevation.

**The Two Levels Rule.** Card inside card is the grammar; a third nested panel is a redesign signal. When a card needs more levels, split it into two cards.

## Components

### Buttons

- **Shape:** `rounded-lg` (0.5rem), `px-4 py-2` for toolbar actions, `px-4 py-3` for dialog actions, `px-6 py-3` for a modal's primary action. Icon-only buttons are `p-2`.
- **Primary:** Signal Blue fill, Plate White text, `font-semibold`, a 20px leading icon. The global `button.bg-primary` rule supplies the top-light sheen and the coloured under-glow, so a primary button never declares its own shadow.
- **Secondary:** `bg-surface-highlight` fill with Plate White text — the dialog Cancel, the picker's dismiss, a settings row action. It reads as "recessed", not as "weak".
- **Destructive:** `bg-accent-red` fill with Plate White text, used by confirm dialogs at `tone="danger"`; `tone="success"` swaps to `bg-accent-green`, and the default tone stays primary blue.
- **Hover / Focus:** `md:hover:brightness-110` on filled actions, `md:hover:bg-surface-highlight/…` on neutral ones, always paired with `press-feedback` (0.98) or `pressable-inline` (0.985) and `focus-ring`. Bare `hover:` is forbidden — it sticks on touch.
- **Disabled:** reduced opacity (`opacity-60` / `opacity-80`), `cursor-not-allowed`, and the under-glow drops out (`:not(:disabled)`), so an inert control looks inert rather than unlit.

### Chips

- **Style:** three distinct grammars, never mixed in one row. (1) **Stat chip** — `rounded-full border border-border/40 bg-surface/50 px-2.5 py-1` with a 15px accent icon and 11px muted text; this is the header's glanceable per-screen reading. (2) **Tag badge** — `text-xs px-2 py-0.5 rounded` tinted from the category's own accent (`bg-accent-amber/15 text-accent-amber`-style), used for food category and source. (3) **Status pill** — `text-[11px] px-2 py-0.5 rounded-full border` with a tinted fill at `/10`, used for "~42% of daily TDEE", the swipe coach mark, and the day-type pill.
- **State:** a selected chip in a filled group takes `bg-primary` + `text-primary-foreground` + a 2px `border-[rgb(var(--action-border)/0.7)]` hairline; an unselected one stays `bg-surface-highlight` with no border. Selection is a fill change, never a border-colour-only change.

### Cards / Containers

- **Corner Style:** `rounded-2xl` (1rem) for screen cards and modal sheets, `rounded-xl` for secondary surfaces and tiles, `rounded-lg` for rows.
- **Background:** `bg-surface` with a faint top-light; inner rows `bg-surface-highlight/50`; a modal sheet is `bg-surface` with `rounded-2xl border border-border/60 shadow-2xl`.
- **Shadow Strategy:** `shadow-lg` on screen cards and session rows; `shadow-2xl` on modal sheets and the glass reading card. See Elevation & Depth.
- **Border:** `border border-border` on screen cards, `border-border/50` on inner rows, `border-border/60` on modal sheets. No border on a card that already sits inside a bordered card unless it is a row.
- **Internal Padding:** `p-6` (hero `p-6 md:p-8`, `px-6 py-5` for list cards), rows `p-4`, tiles `p-3 md:p-4`, stat strips `px-3 py-2`.
- **Empty state:** a card that has no data still renders, with its heading and an action button ("Add Cardio Session", "Add Training Session") — never a blank card, never a zero.

### Inputs / Fields

- **Style:** `bg-surface-highlight` fill, 1px `border-border`, `rounded-lg`, `px-4 py-3`, Plate White text, Muted Slate placeholder. Picker buttons look like this and end with a chevron rather than behaving like a text field.
- **Focus:** the blue `focus-ring` (2px outline at 3px offset) — no glow, no border-colour swap.
- **Labels:** a `text-sm text-foreground/80` label sits above a control at `mb-2`; helper text and errors go below in `text-xs`, errors in `accent-red`.
- **Mobile contract:** form controls are pinned to 16px below 768px so WKWebView cannot zoom the layout on focus, even when a `text-sm` utility is applied. This is intentional and must not be "cleaned up".
- **Range inputs:** an `h-2` track (0.5rem — ~7px on a phone) filled `accent-blue` up to `--value` with a 20px blue thumb that grows 1.1× on hover and presses to 0.95. Every slider uses this, never a bespoke track.

### Navigation

- **Floating tab bar:** the only global navigation. A 54px, fully rounded glass pill (`bg-surface/35` + `backdrop-blur-2xl` + `border-border/50` + a 1px inset top highlight), 40px side insets and a 36px bottom lift, capped at 384px. Icon-only, 20px Lucide icons; the active tab is a 44px filled Signal Blue circle with a glassy gradient and a `0 0 14px` primary glow clipped by the pill. The circle is a *ring*: three copies ride the live drag position, so a loop seam glides one out as the next enters. Icon colour crossfades on the same clock as the circle (350ms settle).
- **Header zone:** universal, above every screen. Row 1: greeting (`text-xl font-bold`) plus long date (`text-xs` muted) on the left, and the right slot holding either the swipe coach mark or the settings gear — a translucent circle (`border-border/50 bg-surface/60 shadow-sm`, no blur) sized by its `p-2` padding around a 20px icon (~34px on a phone). Row 2: the per-screen stat chip, truncated in a `flex-1 min-w-0` container, plus the px-positioned swipe dots (6px dots, 12px pitch, a blue ring copy for the active one). The stat line is re-keyed and plays a 150ms fade/rise.
- **Fullscreen modal header:** `px-4 py-3` over `bg-background` with a 24px back chevron, a `text-xl font-bold` title, and the `fullscreen-header` light/shadow. Back and Escape return one level; from the top level they close.
- **No other navigation.** There is no router, no drawer, no in-page tab strip except the segmented control (a `rounded-lg` row of `border-2` options where the active one is a filled blue pill with a `settings-select-pop` press).

### Wheel Pickers (signature)

The value-entry primitive, used by age, height, weight, body fat, duration, calories/hour, MET, macro and NEAT controls. A `h-40` window (10rem — ~135px on a phone) holds an `h-16` centre row (4rem — ~54px) framed by two `border-accent-blue/70` rails, with permanent gradient fades above and below so rows dissolve rather than clip. Rows are `text-2xl font-bold`, snapping centre, repeated to allow infinite scroll; the selected row is white, the rest Muted Slate. Columns sit side by side (`gap-5`) with a `text-xs uppercase tracking-wide` label above each, and the sheet ends in Cancel / Save at `py-3`.

### Modals (signature)

Every dialog goes through one shell. Wrappers are assigned z-lanes in steps of **+2** from a base of 1000, so a stack can never collide with the floating bar (`900`); the backdrop is per-layer, with cumulative target darkness converted to each layer's opacity, so three stacked modals darken progressively instead of one sheet going opaque. Content is a centered card (`rounded-2xl border border-border/60 shadow-2xl`) capped at `90dvh`, or a true fullscreen takeover (`fixed inset-0`, `rounded-none`, `bg-background` header over `bg-surface` body). The only ambient navigation is Escape and overlay tap, both topmost-only, and the entrance is a 20px rise with a 0.96 scale over 200ms (`cubic-bezier(0.32, 0.72, 0, 1)`), exiting over 150ms in reverse. A sheet that measures a child's resting position opts into a fade-only variant.

### Tracker Reading Card (signature)

The shared day/month reading surface for the Weight, Body Fat, Step and Rolling Balance trackers. A glass strip (`border-border/40`, `bg-surface/85` → `bg-surface/55` with backdrop support, `backdrop-blur-2xl`, `shadow-2xl`) pinned to the plot's top edge inside an `inset-x-2` gutter, always mounted and crossfaded, tied to its data point by a dashed `accent-blue/45` guide line drawn inside the chart. It is never measured onto a point: a constant `top`, a full-width strip, and dismissal by tapping the graph or swiping the plot. Muted date row, `text-xl` primary value, an inline `label value` metric row in 11px, and (only when the modal can edit) a `border-t border-border/30` footer reading "Tap to edit entry".

### Expenditure Segment Bar (signature)

Home's activity burn bar is the system's one multi-colour data mark: a `h-2` fully rounded run of segments (0.5rem — ~7px on a phone) with a 2px gap, each segment filled by its own accent (steps green, training blue, cardio red, NEAT purple), widths proportional to their share of activity burn. The legend below pairs a 16px accent icon with a muted label and a bold accent value. NEAT, when overridden for the day, switches from purple to green and gains an underline plus a 12px chevron — an affordance, not a colour cue alone.

## Do's and Don'ts

### Do:

- **Do** build from the semantic tokens (`bg-background`, `bg-surface`, `bg-surface-highlight`, `text-foreground`, `text-muted`, `border-border`) and the accent tokens. A new hue has to earn a meaning.
- **Do** lead every card with one reading: a muted `text-[11px]` label, then a `text-2xl`/`text-3xl` bold value, then at most one muted support line.
- **Do** put `md:` in front of every hover state, and pair it with `press-feedback` / `pressable-card` / `pressable-inline` plus `focus-ring`.
- **Do** use `tabular-nums` whenever two numbers will be read against each other, and let the font stack route digits through BarlowDigits instead of setting a face by hand.
- **Do** keep the floating bar's geometry in inline px and derive content clearance from `SCREEN_TABS_BOTTOM_CLEARANCE_PX` (102px) rather than hardcoding padding.
- **Do** show absence honestly: `—`, "No entries yet", "Need more data", or a dedicated empty card with the action that fills it.
- **Do** respect the safe-area variables and the keyboard inset (`max(...)`, never a sum) on anything pinned to the bottom, and give every animation a `prefers-reduced-motion` opt-out.
- **Do** scale type with `--font-scale` and layout with `--density`; if you add a new `text-[Npx]` size, add it to the override block in `index.css`.

### Don't:

- **Don't** hardcode a colour — no `bg-slate-800`, `text-white`, `border-slate-700`, `text-blue-400`, and no `rgba(0,0,0,…)` shadow. Literal white/black at low alpha is permitted only for lighting (sheen, top-light, inset highlight), never for a hue.
- **Don't** use a bare `hover:`; on touch it leaves a stuck state. `group-hover:` follows the same rule.
- **Don't** add gradient text, decorative radial glows, coloured `border-left`/`border-right` accents, or a shadow that appears on hover.
- **Don't** use `font-black` twice on one screen, or promote a card heading to display size — emphasis is one step, not two.
- **Don't** put `backdrop-blur` on a resting card, or introduce another full-strength glass surface without a reason the user would notice.
- **Don't** nest a third level of panels; split the card instead.
- **Don't** hand-roll a wheel, a switch, a segmented control or a modal stack — the wheel picker, `BinarySwitch`, `SegmentedButton` and `ModalShell` are the primitives, and a second version of any of them is a drift bug.
- **Don't** zero-fill missing data, invent an interpolation at a chart edge, or present a derived estimate as a measurement. `—` is the correct answer; it is also the one the product's honesty rests on.
- **Don't** change the root font-size to scale text (it would grow the layout with it), write a modal's `height` for the keyboard, or position anything against the peek sliver — those are the platform contracts, not style choices.
