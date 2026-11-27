import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeCoverCrop,
  fitWithinMaxEdge,
} from '../../src/utils/visuals/cameraFrame.js';

describe('computeCoverCrop', () => {
  it('trims the sides of a frame wider than the viewport', () => {
    assert.deepEqual(computeCoverCrop(1600, 900, 300, 300), {
      x: 350,
      y: 0,
      width: 900,
      height: 900,
    });
  });

  it('trims top and bottom of a portrait frame in a landscape viewport', () => {
    assert.deepEqual(computeCoverCrop(1440, 1920, 320, 240), {
      x: 0,
      y: 420,
      width: 1440,
      height: 1080,
    });
  });

  it('keeps the whole frame when the aspects match', () => {
    assert.deepEqual(computeCoverCrop(800, 600, 400, 300), {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it('keeps the whole frame when the viewport has no size', () => {
    assert.deepEqual(computeCoverCrop(800, 600, 0, 0), {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it('returns null before the video has a frame', () => {
    assert.equal(computeCoverCrop(0, 0, 320, 240), null);
    assert.equal(computeCoverCrop(undefined, undefined, 320, 240), null);
  });
});

describe('fitWithinMaxEdge', () => {
  it('scales the longest edge down to the limit', () => {
    assert.deepEqual(fitWithinMaxEdge(2048, 1024, 1024), {
      width: 1024,
      height: 512,
    });
    assert.deepEqual(fitWithinMaxEdge(900, 1800, 600), {
      width: 300,
      height: 600,
    });
  });

  it('never scales up', () => {
    assert.deepEqual(fitWithinMaxEdge(640, 480, 1024), {
      width: 640,
      height: 480,
    });
  });
});
