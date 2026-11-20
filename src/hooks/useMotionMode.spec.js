// UI tier: the shared hook every motion-aware component now reads instead of asking
// the device directly. The runtime store itself is covered in the Node tier
// (tests/constants/motion.test.js); this proves React sees its changes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMotionMode, useReducedMotionPreference } from './useMotionMode';
import {
  resetMotionMode,
  setMotionMode,
} from '../utils/visuals/motionPreference';

afterEach(() => {
  resetMotionMode();
  vi.restoreAllMocks();
});

describe('useMotionMode', () => {
  it('reflects the published mode and re-renders when it changes', () => {
    const { result } = renderHook(() => useMotionMode());

    act(() => setMotionMode('full'));
    expect(result.current).toBe('full');

    act(() => setMotionMode('reduced'));
    expect(result.current).toBe('reduced');

    act(() => setMotionMode('off'));
    expect(result.current).toBe('off');
  });

  it('falls back to the device setting until a mode is published', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const { result } = renderHook(() => useMotionMode());
    expect(result.current).toBe('reduced');
  });
});

describe('useReducedMotionPreference', () => {
  it('is true for reduced AND off, false only for full', () => {
    const { result } = renderHook(() => useReducedMotionPreference());

    act(() => setMotionMode('full'));
    expect(result.current).toBe(false);

    act(() => setMotionMode('reduced'));
    expect(result.current).toBe(true);

    act(() => setMotionMode('off'));
    expect(result.current).toBe(true);
  });

  it('lets an explicit Full override a device that asks for reduced motion', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const { result } = renderHook(() => useReducedMotionPreference());
    expect(result.current).toBe(true);

    act(() => setMotionMode('full'));
    expect(result.current).toBe(false);
  });
});
