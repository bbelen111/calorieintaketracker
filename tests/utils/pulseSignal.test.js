import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimatePulseFromSignal,
  isFingerCovering,
  resampleUniform,
} from '../../src/utils/calculations/pulseSignal.js';

// Deterministic pseudo-noise so the test never flakes.
const noise = (seed) => {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x / 2147483647 - 0.5) * 2;
  };
};

const buildTrace = ({
  bpm,
  seconds,
  fps = 30,
  jitterMs = 4,
  noiseAmp = 0.3,
  drift = 0.05,
}) => {
  const rand = noise(42);
  const samples = [];
  for (let i = 0; i < seconds * fps; i += 1) {
    const t = (i * 1000) / fps + rand() * jitterMs;
    const beat = Math.sin((2 * Math.PI * bpm * t) / 60000);
    samples.push({
      t,
      v: 180 + 2 * beat + noiseAmp * rand() + drift * (t / 1000),
    });
  }
  return samples;
};

test('estimates a clean resting pulse within 2 bpm', () => {
  for (const bpm of [48, 62, 72, 95]) {
    const result = estimatePulseFromSignal(buildTrace({ bpm, seconds: 25 }));
    assert.ok(result.bpm != null, `no reading for ${bpm}`);
    assert.ok(Math.abs(result.bpm - bpm) <= 2, `${bpm} -> ${result.bpm}`);
    assert.ok(result.quality >= 0.5);
  }
});

test('refuses a reading that is too short or pure noise', () => {
  assert.equal(
    estimatePulseFromSignal(buildTrace({ bpm: 70, seconds: 10 })).bpm,
    null
  );
  const rand = noise(7);
  const pureNoise = Array.from({ length: 30 * 25 }, (_, i) => ({
    t: (i * 1000) / 30,
    v: 180 + 3 * rand(),
  }));
  assert.equal(estimatePulseFromSignal(pureNoise).bpm, null);
  assert.equal(estimatePulseFromSignal([]).bpm, null);
});

test('resampleUniform interpolates onto a fixed grid', () => {
  const out = resampleUniform(
    [
      { t: 0, v: 0 },
      { t: 100, v: 10 },
    ],
    20
  );
  assert.deepEqual(out, [0, 5, 10]);
});

test('finger coverage needs a bright, red-dominant frame', () => {
  assert.equal(isFingerCovering({ red: 200, green: 40, blue: 30 }), true);
  assert.equal(isFingerCovering({ red: 200, green: 180, blue: 170 }), false);
  assert.equal(isFingerCovering({ red: 60, green: 10, blue: 10 }), false);
});
