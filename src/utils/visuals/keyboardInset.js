/**
 * Pure keyboard-inset math for modal / overlay layout.
 *
 * The app's keyboard contract is:
 *
 *   - Android resizes the window (`android:windowSoftInputMode="adjustResize"`),
 *     so the *layout* viewport already ends at the keyboard's top edge and
 *     nothing else has to move: `fixed inset-0` overlays, `dvh`, `h-screen` and
 *     modal centering all agree with the keyboard.
 *   - iOS deliberately does NOT resize (`plugins.Keyboard.resize: "none"` with
 *     `autoBackdropColor: "dom"` and `ios.contentInset: "never"` — see
 *     capacitor.config.json), so the keyboard *overlays* a full-height WebView and
 *     `--keyboard-inset` is what lifts bottom chrome and the modal centering band
 *     clear of it. On iOS the inset is load-bearing, not a safety net.
 *
 * `resolveKeyboardState` answers both questions from the live viewport heights
 * plus the plugin's own `keyboardHeight`. The rule is deliberately
 * ordering-proof, because the platform does not promise whether the window
 * resize or the plugin event arrives first:
 *
 *   - a visual viewport that shrank below the layout viewport means the keyboard
 *     *overlays* the page → that shrink is the inset;
 *   - a reported keyboard while the visual viewport still fills the layout
 *     viewport means the platform already removed the keyboard area from the
 *     layout viewport (Android `adjustResize`) → the inset is 0, because padding
 *     for the keyboard height again is the phantom gap above the keyboard.
 *
 * No React/DOM imports here on purpose: these helpers are unit-tested directly
 * with the Node test runner (tests/utils/keyboardInset.test.js).
 */

// CSS custom property published on `:root` by `hooks/useKeyboardVisible.js` and
// consumed by `.keyboard-bottom-inset` (index.css) / any inline padding calc.
export const KEYBOARD_INSET_CSS_VAR = '--keyboard-inset';

// Anything shorter than this is not a keyboard — it is status-bar / gesture /
// visual-viewport noise, and treating it as one would move chrome for nothing.
export const MIN_KEYBOARD_INSET_PX = 80;

// Above this visual-viewport scale the page is zoomed, so a smaller visual
// viewport says nothing about the keyboard.
export const MAX_UNZOOMED_SCALE = 1.05;

const toFinitePx = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Whether the keyboard is up, and how much bottom padding chrome needs to clear
 * it.
 *
 * @param {object} input
 * @param {number} [input.keyboardHeight]       Plugin-reported height (`keyboardDidShow`).
 * @param {number} [input.visualViewportHeight] `window.visualViewport.height`.
 * @param {number} [input.visualViewportScale]  `window.visualViewport.scale`.
 * @param {number} [input.layoutViewportHeight] `window.innerHeight` (layout viewport).
 * @returns {{ isKeyboardVisible: boolean, keyboardInset: number }}
 */
export const resolveKeyboardState = ({
  keyboardHeight = 0,
  visualViewportHeight = 0,
  visualViewportScale = 1,
  layoutViewportHeight = 0,
} = {}) => {
  const layout = toFinitePx(layoutViewportHeight);
  const visual = toFinitePx(visualViewportHeight);
  const reported = toFinitePx(keyboardHeight);
  const scale =
    Number.isFinite(visualViewportScale) && visualViewportScale > 0
      ? visualViewportScale
      : 1;

  // A visual viewport that shrank below the layout viewport is the same signal
  // the plugin reports, and also covers platforms/versions that never emit a
  // keyboard event (or a missed/failed one). A zoomed page is excluded: its
  // smaller visual viewport has nothing to do with the keyboard.
  const visualOverlap =
    scale > MAX_UNZOOMED_SCALE
      ? 0
      : layout > 0 && visual > 0
        ? Math.max(0, layout - visual)
        : 0;

  // Presence can come from either signal — on Android the layout resize leaves
  // no visual overlap, so the plugin event is the only evidence.
  if (Math.max(reported, visualOverlap) < MIN_KEYBOARD_INSET_PX) {
    return { isKeyboardVisible: false, keyboardInset: 0 };
  }

  // Only an *overlay* keyboard needs padding. If the visual viewport still fills
  // the layout viewport while a keyboard is reported, the platform already
  // removed the keyboard area from the layout viewport (Android `adjustResize`),
  // so padding for the keyboard height again would leave a phantom gap above it.
  // This reads both heights at once, so the answer cannot depend on whether the
  // plugin event or the window resize arrived first.
  return {
    isKeyboardVisible: true,
    keyboardInset:
      visualOverlap >= MIN_KEYBOARD_INSET_PX ? Math.round(visualOverlap) : 0,
  };
};
