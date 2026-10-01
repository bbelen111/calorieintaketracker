/**
 * UI-tier helper: drive the *viewport* half of the keyboard signal that
 * `hooks/useKeyboardVisible.js` reads (`window.innerHeight` = layout viewport,
 * `window.visualViewport.height` = visual viewport), without involving the
 * Capacitor plugin events.
 *
 * jsdom has no real viewport dimensions (`innerHeight` is fixed and
 * `visualViewport` is shimmed by `src/tests/setup.js`), so specs override both
 * and restore the originals afterwards. The two heights are what the hook
 * compares: a visual viewport that shrank below the layout viewport means the
 * keyboard *overlays* the page (the shipping iOS `resize: "none"` shape), while
 * both shrinking together means the window itself resized for the keyboard
 * (Android `adjustResize`).
 */

const originalInnerHeight = Object.getOwnPropertyDescriptor(
  window,
  'innerHeight'
);
const originalVisualHeight = window.visualViewport?.height;

const dispatchResize = (target) => {
  target?.dispatchEvent(new window.Event('resize'));
};

export const setKeyboardViewport = ({ layoutHeight, visualHeight }) => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: layoutHeight,
  });

  if (window.visualViewport) {
    window.visualViewport.height = visualHeight;
    dispatchResize(window.visualViewport);
  }

  dispatchResize(window);
};

export const restoreKeyboardViewport = () => {
  if (originalInnerHeight) {
    Object.defineProperty(window, 'innerHeight', originalInnerHeight);
  } else {
    delete window.innerHeight;
  }

  if (window.visualViewport) {
    window.visualViewport.height = originalVisualHeight;
  }
};
