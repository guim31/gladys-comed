// -----------------------------------------------------------------------------
// Scene action (manifest `scene_actions`, Gladys 5.1+): find the cheapest run
// of N consecutive hours that ends before a given time, on the day-ahead
// prices (the only prices known in advance).
//
// "The dishwasher must be done by 07:00: when is it cheapest to run it for 2
// hours?" The scene calls the action in the evening, then reads the outputs:
// `starts_now` to start the appliance right away, or `start_time` for a
// message, `minutes_to_start` for a wait. The real-time price billed may
// differ from the day-ahead one: the docs say so.
//
// The window may begin in the hour in progress only during its first
// minutes (STARTED_GRACE_MS). It must end before the deadline, the next
// HH:00 of the Chicago clock, and lie within the known prices (today and,
// from the afternoon, tomorrow): only when the deadline is beyond them are
// all the known hours searched. A deadline too close gives found: false.
// -----------------------------------------------------------------------------

import { cheapestWindow, roundTenth } from './prices.js';
import { chicagoHour, chicagoTime } from './time.js';

export const SCENE_ACTION = { CHEAPEST_WINDOW: 'find_cheapest_window' };

export const ACTION_HOURS = [1, 2, 3, 4, 5, 6, 8];
/** "any", or a deadline every full hour. */
export const DEADLINES = [
  'any',
  ...Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`),
];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
export const STARTED_GRACE_MS = 10 * MINUTE;

/** The outputs when no window fits: every key, so a scene can test `found`. */
const NOT_FOUND = {
  found: false,
  starts_now: false,
  start_time: '',
  end_time: '',
  average_price: 0,
  minutes_to_start: 0,
};

/**
 * The next instant after `at` when the Chicago clock shows `before`
 * (`HH:00`). The day the clocks go forward, an hour that does not exist
 * (02:00) becomes the first hour after it.
 * @param {Date} at
 * @param {string} before `HH:00`
 * @returns {number} ms
 */
export function nextDeadline(at, before) {
  const target = Number(before.slice(0, 2));
  let previous = chicagoHour(at);
  let instant = Math.floor(at.getTime() / HOUR) * HOUR;
  for (let step = 0; step < 50; step += 1) {
    instant += HOUR;
    const hour = chicagoHour(new Date(instant));
    const skipped = previous < target && hour > target;
    if (hour === target || skipped) {
      return instant;
    }
    previous = hour;
  }
  return instant;
}

/**
 * @param {{ at: Date, forecast: Array<{ start: Date, end: Date, price: number }> }} snapshot
 * @param {{ hours?: unknown, before?: unknown }} fields as sent by the core
 */
export function findCheapestWindow(snapshot, fields) {
  const hours = Number(fields?.hours);
  if (!ACTION_HOURS.includes(hours)) {
    throw new Error(`Unknown number of hours: ${fields?.hours}`);
  }
  const before = fields?.before ?? 'any';
  if (!DEADLINES.includes(before)) {
    throw new Error(`Unknown deadline: ${before}`);
  }
  const { at, forecast } = snapshot;
  if (forecast.length === 0) {
    return { ...NOT_FOUND };
  }

  let candidates = forecast.filter(
    (slot) => slot.start.getTime() >= at.getTime() - STARTED_GRACE_MS && slot.end > at,
  );
  if (before !== 'any') {
    const deadline = nextDeadline(at, before);
    const lastEnd = Math.max(...forecast.map((slot) => slot.end.getTime()));
    // Beyond the known prices (tomorrow not published yet): the known hours.
    if (deadline <= lastEnd) {
      candidates = candidates.filter((slot) => slot.end.getTime() <= deadline);
    }
  }

  const window = cheapestWindow(candidates, hours);
  if (!window) {
    return { ...NOT_FOUND };
  }
  const wait = Math.max(0, window.start.getTime() - at.getTime());
  return {
    found: true,
    starts_now: wait === 0,
    start_time: chicagoTime(window.start),
    end_time: chicagoTime(window.end),
    average_price: roundTenth(window.average),
    minutes_to_start: Math.ceil(wait / MINUTE),
  };
}
