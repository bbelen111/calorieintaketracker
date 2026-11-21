import assert from 'node:assert/strict';
import test from 'node:test';

// Pin a DST-observing zone for this file (each node --test file runs in its
// own process, so this cannot leak). Node honours a runtime TZ change.
process.env.TZ = 'America/New_York';

const { buildLocalDayReadWindow, toLocalDateKey } =
  await import('../../src/utils/healthConnectWindow.js');

const HOUR = 3_600_000;
const span = (window) =>
  Date.parse(window.endDate) - Date.parse(window.startDate);

test('a local day window is [00:00, next 00:00), not a fixed 24 h', () => {
  const later = new Date('2026-12-01T12:00:00Z');
  assert.equal(span(buildLocalDayReadWindow('2026-06-10', later)), 24 * HOUR);
  // 2026-03-08: US spring-forward day is 23 hours long
  assert.equal(span(buildLocalDayReadWindow('2026-03-08', later)), 23 * HOUR);
  // 2026-11-01: fall-back day is 25 hours long
  assert.equal(span(buildLocalDayReadWindow('2026-11-01', later)), 25 * HOUR);
  assert.equal(
    new Date(buildLocalDayReadWindow('2026-06-10', later).startDate).getHours(),
    0
  );
});

test('today is clipped to now; future / invalid days are null', () => {
  const now = new Date(2026, 5, 10, 9, 30);
  const window = buildLocalDayReadWindow('2026-06-10', now);
  assert.equal(Date.parse(window.endDate), now.getTime());
  assert.equal(buildLocalDayReadWindow('2026-06-11', now), null);
  assert.equal(buildLocalDayReadWindow('2026-02-31', now), null);
  assert.equal(buildLocalDayReadWindow('bad', now), null);
});

test('toLocalDateKey uses the local calendar day', () => {
  // 03:30 UTC on Jun 10 is still Jun 9 in New York
  assert.equal(toLocalDateKey('2026-06-10T03:30:00Z'), '2026-06-09');
  assert.equal(toLocalDateKey('not a date'), null);
});
