import { describe, expect, it, vi } from 'vitest';

import {
  BASE_Z_INDEX,
  ModalStackManager,
  OVERLAY_BASE_OPACITY,
  OVERLAY_MAX_OPACITY,
  calculateLayerOpacity,
  calculateStackTargetOpacity,
} from '../../utils/visuals/modalStack.js';

/**
 * These rules underpin every modal in the app: z-index lane allocation decides
 * stacking, and the opacity math decides how dark the stack gets. Both are pure
 * and previously untestable (module-private inside ModalShell).
 */
describe('modalStack - z-index lanes', () => {
  it('allocates every other lane so each overlay has its own slot', () => {
    const manager = new ModalStackManager();

    const first = manager.register();
    const second = manager.register();
    const third = manager.register();

    expect(first.zIndex).toBe(BASE_Z_INDEX + 2);
    expect(second.zIndex).toBe(BASE_Z_INDEX + 4);
    expect(third.zIndex).toBe(BASE_Z_INDEX + 6);

    // Two apart, so `lower modal < overlay < top modal` always has a lane.
    expect(second.zIndex - first.zIndex).toBe(2);
    expect(third.zIndex - second.zIndex).toBe(2);
  });

  it('reports BASE_Z_INDEX as the floor when empty', () => {
    const manager = new ModalStackManager();
    expect(manager.getHighestZIndex()).toBe(BASE_Z_INDEX);
  });

  it('reuses the vacated lane after the top modal unregisters', () => {
    const manager = new ModalStackManager();
    manager.register();
    const second = manager.register();

    manager.unregister(second.id);

    expect(manager.register().zIndex).toBe(second.zIndex);
  });

  it('tracks total vs active counts separately', () => {
    const manager = new ModalStackManager();
    const first = manager.register();
    const second = manager.register();

    expect(manager.getTotalCount()).toBe(2);
    expect(manager.getActiveCount()).toBe(2);

    manager.setClosing(second.id, true);

    // Still mounted (animating out), but no longer "active".
    expect(manager.getTotalCount()).toBe(2);
    expect(manager.getActiveCount()).toBe(1);

    expect(manager.getDepth(first.id)).toBe(1);
  });
});

describe('modalStack - topmost resolution', () => {
  it('returns a null top when the stack is empty', () => {
    const manager = new ModalStackManager();
    expect(manager.getTopModal()).toEqual({ id: null, zIndex: 0 });
  });

  it('returns the highest registered modal', () => {
    const manager = new ModalStackManager();
    const first = manager.register();
    const second = manager.register();

    expect(manager.getTopModal()).toEqual({
      id: second.id,
      zIndex: second.zIndex,
    });

    manager.unregister(second.id);

    expect(manager.getTopModal().id).toBe(first.id);
  });

  it('hands ownership to the modal beneath a closing top modal', () => {
    // This is what makes Escape / overlay-click work while the top modal is
    // still animating out.
    const manager = new ModalStackManager();
    const first = manager.register();
    const second = manager.register();

    manager.setClosing(second.id, true);

    expect(manager.getTopModal().id).toBe(first.id);
  });
});

describe('modalStack - depth lookup', () => {
  it('is 1-based and follows stack order', () => {
    const manager = new ModalStackManager();
    const first = manager.register();
    const second = manager.register();

    expect(manager.getDepth(first.id)).toBe(1);
    expect(manager.getDepth(second.id)).toBe(2);
  });

  it('returns 0 for unknown ids', () => {
    const manager = new ModalStackManager();
    expect(manager.getDepth(999)).toBe(0);
  });
});

describe('modalStack - subscriptions', () => {
  it('notifies subscribers asynchronously and unsubscribes cleanly', async () => {
    const manager = new ModalStackManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    manager.register();
    // Notifications are batched into a microtask.
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    manager.register();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('modalStack - backdrop opacity', () => {
  it('is fully transparent at depth 0', () => {
    expect(calculateStackTargetOpacity(0)).toBe(0);
    expect(calculateLayerOpacity(0)).toBe(0);
  });

  it('uses the base opacity for a single modal', () => {
    expect(calculateStackTargetOpacity(1)).toBe(OVERLAY_BASE_OPACITY);
    expect(calculateLayerOpacity(1)).toBe(OVERLAY_BASE_OPACITY);
  });

  it('darkens progressively with depth', () => {
    const targets = [1, 2, 3, 4, 5].map(calculateStackTargetOpacity);

    for (let index = 1; index < targets.length; index += 1) {
      expect(targets[index]).toBeGreaterThan(targets[index - 1]);
    }
  });

  it('never exceeds the configured cap', () => {
    for (let depth = 1; depth <= 40; depth += 1) {
      expect(calculateStackTargetOpacity(depth)).toBeLessThanOrEqual(
        OVERLAY_MAX_OPACITY
      );
    }
  });

  it('keeps every layer within [0, 1]', () => {
    for (let depth = 0; depth <= 40; depth += 1) {
      const layer = calculateLayerOpacity(depth);
      expect(layer).toBeGreaterThanOrEqual(0);
      expect(layer).toBeLessThanOrEqual(1);
    }
  });

  it('composes layer by layer into the cumulative target', () => {
    // Perceived darkness composes multiplicatively: 1 - Π(1 - layer_i) must
    // equal the cumulative target, otherwise nested modals are mis-lit.
    for (let depth = 1; depth <= 5; depth += 1) {
      let remainingLight = 1;
      for (let layer = 1; layer <= depth; layer += 1) {
        remainingLight *= 1 - calculateLayerOpacity(layer);
      }

      expect(1 - remainingLight).toBeCloseTo(
        calculateStackTargetOpacity(depth),
        10
      );
    }
  });

  it('stops darkening once the cap is reached', () => {
    const capped = 40;
    expect(calculateStackTargetOpacity(capped)).toBe(OVERLAY_MAX_OPACITY);
    // Nothing left to paint at the capped depth, so the layer is transparent
    // rather than over-darkening the stack.
    expect(calculateLayerOpacity(capped)).toBe(0);
  });
});
