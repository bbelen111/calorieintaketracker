/**
 * Modal stack ordering + backdrop opacity math.
 *
 * Extracted verbatim from `components/EnergyMap/common/ModalShell.jsx` so the
 * rules every one of the app's ~69 modal instances depends on can be unit
 * tested without a DOM.
 *
 * ## z-index lanes
 * Wrappers occupy every OTHER z-index (`BASE_Z_INDEX`, `+2`, `+4`, ...), leaving
 * each wrapper's odd slot free for its own overlay layer. That guarantees
 * `lower modal < overlay < top modal` at any stack depth.
 *
 * ## Progressive darkening
 * Each modal owns its own backdrop (no shared overlay singleton).
 * `calculateStackTargetOpacity(depth)` is the *cumulative* darkness the user
 * should perceive at that depth; `calculateLayerOpacity(depth)` converts it into
 * the opacity THIS layer must paint given the darkness already painted beneath
 * it. Painting the cumulative value on every layer overdarkens the stack, so the
 * delta is divided by the remaining visible light (`1 - previousTarget`).
 */

export const BASE_Z_INDEX = 1000;

/** Fade duration for a modal's own overlay layer (ms). */
export const OVERLAY_FADE_MS = 180;

export const OVERLAY_BASE_OPACITY = 0.56; // Single modal backdrop
export const OVERLAY_STACK_PRIMARY_INCREMENT = 0.15; // Depths 2-3
export const OVERLAY_STACK_EXTRA_INCREMENT = 0.05; // Depth 4+
export const OVERLAY_MAX_OPACITY = 0.95; // Cap to prevent complete blackout

/** Microtask scheduler used to batch stack notifications. */
export const queueTask =
  typeof globalThis.queueMicrotask === 'function'
    ? globalThis.queueMicrotask
    : (cb) => Promise.resolve().then(cb);

export const calculateStackTargetOpacity = (depth) => {
  if (depth <= 0) return 0;
  if (depth === 1) return OVERLAY_BASE_OPACITY;

  const primaryLayers = Math.min(depth - 1, 2);
  const extraLayers = Math.max(depth - 3, 0);
  const target =
    OVERLAY_BASE_OPACITY +
    OVERLAY_STACK_PRIMARY_INCREMENT * primaryLayers +
    OVERLAY_STACK_EXTRA_INCREMENT * extraLayers;

  return Math.min(target, OVERLAY_MAX_OPACITY);
};

/**
 * Convert cumulative target opacity into per-layer opacity so each modal can
 * own its own backdrop while preserving progressive darkening.
 */
export const calculateLayerOpacity = (depth) => {
  if (depth <= 0) return 0;

  const currentTarget = calculateStackTargetOpacity(depth);
  const previousTarget = calculateStackTargetOpacity(depth - 1);

  if (currentTarget <= previousTarget) return 0;

  const remainingVisibility = 1 - previousTarget;
  if (remainingVisibility <= 0) return 0;

  const layerOpacity = (currentTarget - previousTarget) / remainingVisibility;
  return Math.max(0, Math.min(layerOpacity, 1));
};

/**
 * Tracks all open modals with stable ordering.
 *
 * `isClosing` modals are excluded from "topmost" status, so while a top modal
 * animates out the modal beneath it immediately regains Escape/overlay-click
 * ownership.
 */
export class ModalStackManager {
  constructor() {
    // Map of modalId -> { zIndex, isClosing }
    this.modals = new Map();
    this.nextId = 1;
    this.listeners = new Set();
  }

  register(isClosing = false) {
    const id = this.nextId++;
    // Reserve one z-index lane between modal wrappers for the shared overlay.
    // This guarantees: lower modal < overlay < top modal.
    const zIndex = this.getHighestZIndex() + 2;
    this.modals.set(id, { zIndex, isClosing });
    this.notifyListeners();
    return { id, zIndex };
  }

  unregister(id) {
    if (!this.modals.has(id)) return;
    this.modals.delete(id);
    this.notifyListeners();
  }

  setClosing(id, isClosing) {
    const modal = this.modals.get(id);
    if (modal) {
      modal.isClosing = isClosing;
      this.notifyListeners();
    }
  }

  getTopModal() {
    let topId = null;
    let topZIndex = 0;

    for (const [id, data] of this.modals) {
      // Only consider non-closing modals for "topmost" status
      if (!data.isClosing && data.zIndex > topZIndex) {
        topZIndex = data.zIndex;
        topId = id;
      }
    }

    return { id: topId, zIndex: topZIndex };
  }

  getActiveCount() {
    // Count modals that are not in closing state (used for topmost logic)
    let count = 0;
    for (const data of this.modals.values()) {
      if (!data.isClosing) count++;
    }
    return count;
  }

  getTotalCount() {
    return this.modals.size;
  }

  getHighestZIndex() {
    let highest = BASE_Z_INDEX;
    for (const data of this.modals.values()) {
      if (data.zIndex > highest) highest = data.zIndex;
    }
    return highest;
  }

  getDepth(id) {
    if (!this.modals.has(id)) return 0;

    const orderedIds = [...this.modals.entries()]
      .sort((a, b) => a[1].zIndex - b[1].zIndex)
      .map(([modalId]) => modalId);

    return orderedIds.indexOf(id) + 1;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    // Use microtask to batch notifications
    queueTask(() => {
      this.listeners.forEach((listener) => listener());
    });
  }
}
