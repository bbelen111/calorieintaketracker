import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBezierPaths,
  buildGapAwarePathRuns,
  GAP_DASH_PATTERN,
} from '../../src/utils/visuals/bezierPath.js';

const pt = (x, y, extra = {}) => ({ x, y, ...extra });

test('buildGapAwarePathRuns keeps untagged points in a single solid run', () => {
  const runs = buildGapAwarePathRuns([pt(0, 10), pt(10, 20), pt(20, 15)]);

  assert.equal(runs.length, 1);
  assert.equal(runs[0].dashArray, null);
  assert.equal(runs[0].points.length, 3);
});

test('buildGapAwarePathRuns skips null padding slots', () => {
  const runs = buildGapAwarePathRuns([null, pt(5, 10), null, pt(15, 12), null]);

  assert.equal(runs.length, 1);
  assert.equal(runs[0].points.length, 2);
});

test('short gaps bridge as solid runs ending on the closing real point', () => {
  const runs = buildGapAwarePathRuns([
    pt(0, 10), // real
    pt(10, 11, { isInterpolated: true, gapLength: 3 }),
    pt(20, 12, { isInterpolated: true, gapLength: 3 }),
    pt(30, 13), // real
  ]);

  assert.equal(runs.length, 3);

  // First run: the leading real point alone.
  assert.equal(runs[0].points.length, 1);
  assert.deepEqual(runs[0].points[0], { x: 0, y: 10 });

  // Second run: bridge points plus the closing real point, solid.
  assert.equal(runs[1].dashArray, null);
  assert.equal(runs[1].points.length, 3);

  // Third run: the solid run continuing from the shared closing point.
  assert.equal(runs[2].dashArray, null);
  assert.deepEqual(runs[2].points, [{ x: 30, y: 13 }]);
});

test('medium gaps (8-14 days) bridge with the dash pattern', () => {
  const slots = [pt(0, 10)];
  for (let i = 1; i <= 9; i += 1) {
    slots.push(pt(i * 10, 11, { isInterpolated: true, gapLength: 9 }));
  }
  slots.push(pt(100, 12));

  const runs = buildGapAwarePathRuns(slots);
  assert.equal(runs.length, 3);
  assert.equal(runs[1].dashArray, GAP_DASH_PATTERN);
  assert.equal(runs[1].points.length, 10); // 9 interpolated + closing real
});

test('wide gaps (>14 days) split the line instead of bridging', () => {
  const runs = buildGapAwarePathRuns([
    pt(0, 10),
    pt(10, 11),
    // 20-day gap: interpolated slots must be dropped entirely
    pt(20, 12, { isInterpolated: true, gapLength: 20 }),
    pt(30, 13, { isInterpolated: true, gapLength: 20 }),
    pt(40, 14),
    pt(50, 15),
  ]);

  assert.equal(runs.length, 2);
  assert.equal(runs[0].points.length, 2);
  assert.equal(runs[1].points.length, 2);
  runs.forEach((run) => assert.equal(run.dashArray, null));
});

test('a trailing bridge without a closing real point is discarded', () => {
  const runs = buildGapAwarePathRuns([
    pt(0, 10),
    pt(10, 11, { isInterpolated: true, gapLength: 2 }),
  ]);

  assert.equal(runs.length, 1);
  assert.equal(runs[0].points.length, 1);
});

test('buildBezierPaths supports directional edge extension', () => {
  const pts = [pt(10, 5), pt(90, 15)];

  const left = buildBezierPaths(pts, {
    chartWidth: 100,
    chartHeight: 50,
    extendToEdges: 'left',
  });
  assert.match(left.pathData, /^M 0 5 L 10 5/);
  assert.ok(!left.pathData.includes('L 100'));
  assert.match(left.areaData, /^M 0 50 L 0 5 L 10 5/);
  assert.match(left.areaData, /L 90 50 Z$/);

  const right = buildBezierPaths(pts, {
    chartWidth: 100,
    chartHeight: 50,
    extendToEdges: 'right',
  });
  assert.match(right.pathData, /^M 10 5 /);
  assert.match(right.pathData, /L 100 15$/);
  assert.match(right.areaData, /^M 10 50 L 10 5/);
  assert.match(right.areaData, /L 100 15 L 100 50 Z$/);

  const both = buildBezierPaths(pts, {
    chartWidth: 100,
    chartHeight: 50,
    extendToEdges: 'both',
  });
  assert.match(both.pathData, /^M 0 5 L 10 5/);
  assert.match(both.pathData, /L 100 15$/);

  // Boolean inputs keep their original behaviour.
  const legacyTrue = buildBezierPaths(pts, {
    chartWidth: 100,
    chartHeight: 50,
    extendToEdges: true,
  });
  assert.equal(legacyTrue.pathData, both.pathData);

  const none = buildBezierPaths(pts, { chartWidth: 100, chartHeight: 50 });
  assert.match(none.areaData, /L 90 50 Z$/);
});
