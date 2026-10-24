// -----------------------------------------------------------------------------
// The computations on prices, checked against what ComEd itself publishes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFiveMinutePrices } from '../src/comed.js';
import {
  cheapestWindow,
  hourOf,
  hourlyAverages,
  roundTenth,
  samplesOfDay,
  summarize,
} from '../src/prices.js';
import { fixture } from './helpers/world.js';

const samples = parseFiveMinutePrices(fixture('five-minute-feed.json'));

test('the current hour average is the one ComEd publishes', () => {
  // Recorded at the same moment as the feed: 14:36:55 in Chicago.
  const [official] = JSON.parse(fixture('current-hour-average.json'));
  const hours = hourlyAverages(samples);
  const current = hours.at(-1);
  assert.equal(current.start.toISOString(), '2026-10-24T19:00:00.000Z');
  // 14:05 to 14:30: six prices.
  assert.equal(current.count, 6);
  assert.equal(roundTenth(current.average), Number(official.price));
  assert.equal(official.millisUTC, String(samples.at(-1).at.getTime()));
});

test('a price stamped HH:00 closes the hour before', () => {
  assert.equal(hourOf(new Date('2026-10-24T19:00:00Z')).toISOString(), '2026-10-24T18:00:00.000Z');
  assert.equal(hourOf(new Date('2026-10-24T19:05:00Z')).toISOString(), '2026-10-24T19:00:00.000Z');
  const hours = hourlyAverages(samples);
  assert.ok(hours.slice(1, -1).every((hour) => hour.count === 12));
});

test('the prices of a Chicago day', () => {
  const today = samplesOfDay(samples, '2026-10-24');
  // 00:05 to 14:30 CDT.
  assert.equal(today.length, 14 * 12 + 6);
  assert.equal(today[0].at.toISOString(), '2026-10-24T05:05:00.000Z');
  const summary = summarize(hourlyAverages(today), (hour) => hour.average);
  assert.equal(roundTenth(summary.min.average), 0.6);
  // The midnight hour, negative prices half of it.
  assert.equal(summary.min.start.toISOString(), '2026-10-24T05:00:00.000Z');
});

test('the cheapest window wants consecutive hours; the earliest wins a tie', () => {
  const at = (h) => new Date(Date.UTC(2026, 9, 24, h));
  const slot = (h, price) => ({ start: at(h), end: at(h + 1), price });
  const slots = [
    slot(0, 5),
    slot(1, 1),
    slot(2, 1),
    slot(4, 0),
    slot(5, 3),
    slot(6, 1),
    slot(7, 1),
  ];
  assert.deepEqual(cheapestWindow(slots, 2), { start: at(1), end: at(3), average: 1 });
  assert.equal(cheapestWindow(slots, 8), null);
  assert.equal(roundTenth(2.65), 2.7);
  assert.equal(roundTenth(-0.05), -0.1);
});
