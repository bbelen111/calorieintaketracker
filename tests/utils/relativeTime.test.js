import test from 'node:test';
import assert from 'node:assert/strict';

import { formatRelativeTime } from '../../src/utils/formatting/relativeTime.js';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const ago = (ms) => new Date(NOW.getTime() - ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

test('formatRelativeTime: under 45 seconds reads as just now', () => {
  assert.equal(formatRelativeTime(ago(0), NOW), 'just now');
  assert.equal(formatRelativeTime(ago(44 * SECOND), NOW), 'just now');
});

test('formatRelativeTime: minutes, hours and days', () => {
  assert.equal(formatRelativeTime(ago(2 * MINUTE), NOW), '2 min ago');
  assert.equal(formatRelativeTime(ago(59 * MINUTE), NOW), '59 min ago');
  assert.equal(formatRelativeTime(ago(60 * MINUTE), NOW), '1 h ago');
  assert.equal(formatRelativeTime(ago(5 * HOUR), NOW), '5 h ago');
  assert.equal(formatRelativeTime(ago(24 * HOUR), NOW), '1 d ago');
  assert.equal(formatRelativeTime(ago(72 * HOUR), NOW), '3 d ago');
});

test('formatRelativeTime: accepts epoch milliseconds', () => {
  assert.equal(
    formatRelativeTime(ago(10 * MINUTE).getTime(), NOW),
    '10 min ago'
  );
});

test('formatRelativeTime: a moment slightly in the future reads as just now', () => {
  assert.equal(
    formatRelativeTime(new Date(NOW.getTime() + 5 * SECOND), NOW),
    'just now'
  );
});

test('formatRelativeTime: unusable input yields null, never NaN text', () => {
  assert.equal(formatRelativeTime(null, NOW), null);
  assert.equal(formatRelativeTime(undefined, NOW), null);
  assert.equal(formatRelativeTime('soon', NOW), null);
  assert.equal(formatRelativeTime(new Date('nope'), NOW), null);
});
