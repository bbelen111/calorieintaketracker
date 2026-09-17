/**
 * Global setup for the Vitest (jsdom) UI tier.
 *
 * Responsibilities:
 *  1. Register Capacitor plugin doubles for the whole run (see ./mocks/capacitor.js).
 *  2. Add the two browser APIs jsdom does not implement that app code relies on
 *     (`visualViewport` — used by `common/ModalShell.jsx`; and `window.scrollTo`,
 *     which jsdom logs "Not implemented" for).
 *  3. Install `@testing-library/jest-dom` matchers.
 *
 * Deliberately no IntersectionObserver / scrollIntoView stubs: nothing in `src/`
 * uses them, so a future dependency on them should fail loudly rather than be
 * silently absorbed by a no-op.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react normally self-registers cleanup by detecting a global
// `afterEach`. With `globals: false` there is none, so without this every test
// would accumulate the previous test's DOM (including ModalShell portals) and
// queries would match multiple elements.
afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Capacitor plugin doubles
// ---------------------------------------------------------------------------

vi.mock('@capacitor/core', async () => {
  const { CapacitorMock } = await import('./mocks/capacitor.js');
  return { Capacitor: CapacitorMock };
});

vi.mock('@capacitor/preferences', async () => {
  const { PreferencesMock } = await import('./mocks/capacitor.js');
  return { Preferences: PreferencesMock };
});

vi.mock('@capacitor/app', async () => {
  const { AppMock } = await import('./mocks/capacitor.js');
  return { App: AppMock };
});

vi.mock('@capacitor/status-bar', async () => {
  const { StatusBarMock, StyleMock } = await import('./mocks/capacitor.js');
  return { StatusBar: StatusBarMock, Style: StyleMock };
});

vi.mock('@capacitor/keyboard', async () => {
  const { KeyboardMock, KeyboardStyleMock } =
    await import('./mocks/capacitor.js');
  return { Keyboard: KeyboardMock, KeyboardStyle: KeyboardStyleMock };
});

vi.mock('@capacitor/splash-screen', async () => {
  const { SplashScreenMock } = await import('./mocks/capacitor.js');
  return { SplashScreen: SplashScreenMock };
});

vi.mock('@capacitor/barcode-scanner', async () => {
  const { BarcodeScannerMock } = await import('./mocks/capacitor.js');
  return BarcodeScannerMock;
});

vi.mock('@capgo/capacitor-health', async () => {
  const { HealthMock } = await import('./mocks/capacitor.js');
  return { Health: HealthMock };
});

vi.mock('@capgo/capacitor-navigation-bar', async () => {
  const { NavigationBarMock } = await import('./mocks/capacitor.js');
  return { NavigationBar: NavigationBarMock };
});

// ---------------------------------------------------------------------------
// jsdom gaps
// ---------------------------------------------------------------------------

if (!window.visualViewport) {
  const viewport = new window.EventTarget();
  Object.assign(viewport, {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetTop: 0,
    offsetLeft: 0,
    pageTop: 0,
    pageLeft: 0,
    scale: 1,
  });
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    writable: true,
    value: viewport,
  });
}

// jsdom throws "Not implemented: window.scrollTo" through its virtual console.
window.scrollTo = () => {};

// jsdom implements neither `Element.prototype.scrollTo` nor `scrollBy`, and the
// tracker modals drive their chart carousels imperatively (`carouselRef.current
// .scrollTo({ left, behavior })`) from effects, so mounting one would emit an
// unhandled `TypeError` per effect run. Shimmed at the prototype so every scroll
// container in the tree is covered; scroll *position* stays 0, which is what the
// snap maths expects from an unlaid-out jsdom element anyway.
const elementPrototype = window.Element?.prototype;
if (elementPrototype && typeof elementPrototype.scrollTo !== 'function') {
  elementPrototype.scrollTo = () => {};
}
if (elementPrototype && typeof elementPrototype.scrollBy !== 'function') {
  elementPrototype.scrollBy = () => {};
}
