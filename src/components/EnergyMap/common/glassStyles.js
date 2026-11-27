/*
  The floating glass pill shared by the bottom tab bar (ScreenTabs) and the AI
  chat composer. One definition so the two surfaces cannot drift apart.

  The glass only reads as glass when content scrolls *behind* the element, so a
  consumer should float it over its scroll area rather than stacking it below.
*/
// The glass without a corner radius, for a surface that changes shape (the AI
// chat composer squares off to hold its camera viewfinder).
export const GLASS_SURFACE_CLASS =
  'border border-border/50 bg-surface/35 shadow-lg shadow-background/30 inset-shadow-[0_1px_0_rgb(255_255_255/0.07)] backdrop-blur-2xl';

export const GLASS_PILL_CLASS = `rounded-full ${GLASS_SURFACE_CLASS}`;

/*
  Accent circle sitting inside the pill (apply on a `bg-primary` element):
  glassy top-light + a soft primary glow.
*/
export const GLASS_ACCENT_STYLE = {
  backgroundImage:
    'linear-gradient(to bottom, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0) 55%, rgb(0 0 0 / 0.06))',
  boxShadow:
    'inset 0 1px 0 rgb(255 255 255 / 0.22), 0 0 14px rgb(var(--primary) / 0.5)',
};
