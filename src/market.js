// -----------------------------------------------------------------------------
// The prices the integration knows, and when to ask ComEd again.
//
// Real-time feed (one request, the last 24 hours, ~13 kB):
//   - when the next 5-minute price should be out: its stamp is 5 minutes
//     after the last one, and ComEd publishes a price about 6 minutes after
//     its stamp (measured: the 14:30 price was out at 14:36:30, Chicago);
//     every 2 minutes while it is late, so about one request in 5 minutes;
//   - every 10 minutes whatever happens, every 5 minutes when the feed has
//     been stale for 30 minutes (ComEd down);
//   - after a failure, again after 1, 2, 5, 10 then 15 minutes.
// Day-ahead prices (one request per Chicago day, ~1 kB):
//   - today's, once (again every 15 minutes while missing);
//   - tomorrow's, from 12:00 (Chicago) every 30 minutes until published.
// What was read last stays in use while a request fails.
// -----------------------------------------------------------------------------

import { fetchDayAhead, fetchFiveMinutePrices } from './comed.js';
import { hourOf, hourlyAverages, samplesOfDay, slotAt, startingOn, summarize } from './prices.js';
import { addDays, chicagoDay, chicagoHour } from './time.js';

const MINUTE = 60 * 1000;
export const FEED_REFRESH_MS = 10 * MINUTE;
export const FEED_STALE_REFRESH_MS = 5 * MINUTE;
export const FEED_LATE_RETRY_MS = 2 * MINUTE;
/** The next 5-minute price is expected this long after the last stamp. */
export const FEED_EXPECTED_MS = (5 + 7) * MINUTE;
export const FEED_STALE_MS = 30 * MINUTE;
const FEED_BACKOFF_MS = [1, 2, 5, 10, 15].map((minutes) => minutes * MINUTE);
export const TODAY_RETRY_MS = 15 * MINUTE;
export const TOMORROW_RETRY_MS = 30 * MINUTE;
/** Chicago hour from which tomorrow's day-ahead prices are awaited. */
export const TOMORROW_FROM_HOUR = 12;

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 */
export function createMarket({ fetch = globalThis.fetch, now = () => Date.now() } = {}) {
  let samples = [];
  let feedSuccessAt = null;
  let feedAttemptAt = null;
  let feedFailures = 0;
  // Chicago day -> day-ahead slots (an empty list: asked, not published).
  const dayAhead = new Map();
  // Chicago day -> last attempt (ms), for the day-ahead retries.
  const dayAheadAttemptAt = new Map();

  const latest = () => samples.at(-1) ?? null;

  /** Whether the feed is due at `at`, and why (for the debug log). */
  function feedDueReason(at) {
    if (feedAttemptAt === null) {
      return 'first refresh';
    }
    const since = at - feedAttemptAt;
    if (feedFailures > 0) {
      const wait = FEED_BACKOFF_MS[Math.min(feedFailures, FEED_BACKOFF_MS.length) - 1];
      return since >= wait ? 'retry after a failure' : null;
    }
    if (since >= FEED_REFRESH_MS) {
      return '10-minute refresh';
    }
    const last = latest();
    const age = last ? at - last.at.getTime() : Infinity;
    if (age >= FEED_STALE_MS) {
      return since >= FEED_STALE_REFRESH_MS ? 'feed stale' : null;
    }
    if (age >= FEED_EXPECTED_MS && since >= FEED_LATE_RETRY_MS) {
      return 'next price due';
    }
    return null;
  }

  /** The Chicago days whose day-ahead prices are due at `at`. */
  function dayAheadDue(at) {
    const date = new Date(at);
    const today = chicagoDay(date);
    const due = [];
    const wanted = [[today, TODAY_RETRY_MS]];
    if (chicagoHour(date) >= TOMORROW_FROM_HOUR) {
      wanted.push([addDays(today), TOMORROW_RETRY_MS]);
    }
    for (const [day, retry] of wanted) {
      const known = dayAhead.get(day);
      const attempt = dayAheadAttemptAt.get(day);
      if (
        (known === undefined || known.length === 0) &&
        (attempt === undefined || at - attempt >= retry)
      ) {
        due.push(day);
      }
    }
    return due;
  }

  return {
    get lastSuccessAt() {
      return feedSuccessAt;
    },

    /** @returns {string | null} why a refresh is due now, or null */
    dueReason() {
      const at = now();
      const feed = feedDueReason(at);
      const days = dayAheadDue(at);
      if (feed) {
        return feed;
      }
      return days.length > 0 ? `day-ahead prices of ${days.join(', ')}` : null;
    },

    /**
     * Read what is due (everything when `force`).
     * @param {{ force?: boolean }} [options]
     * @returns {Promise<{ changed: boolean, newSample: boolean }>}
     * @throws {import('./comed.js').ComedError} the real-time feed failed;
     *   a day-ahead failure is reported in `dayAheadError`, not thrown
     */
    async refresh({ force = false } = {}) {
      const at = now();
      let changed = false;
      let newSample = false;
      let dayAheadError = null;

      for (const day of force ? dayAheadDueForce(at) : dayAheadDue(at)) {
        dayAheadAttemptAt.set(day, at);
        try {
          const slots = await fetchDayAhead(day, { fetch });
          changed ||= fingerprint(dayAhead.get(day) ?? []) !== fingerprint(slots);
          dayAhead.set(day, slots);
        } catch (err) {
          dayAheadError = err;
        }
      }
      // Forget the days before yesterday.
      for (const day of dayAhead.keys()) {
        if (day < addDays(chicagoDay(new Date(at)), -1)) {
          dayAhead.delete(day);
          dayAheadAttemptAt.delete(day);
        }
      }

      if (force || feedDueReason(at)) {
        feedAttemptAt = at;
        try {
          const fresh = await fetchFiveMinutePrices({ fetch });
          const before = latest()?.at.getTime() ?? 0;
          newSample = (fresh.at(-1)?.at.getTime() ?? 0) > before;
          changed ||= newSample;
          samples = fresh.length > 0 || samples.length === 0 ? fresh : samples;
          feedSuccessAt = at;
          feedFailures = 0;
        } catch (err) {
          feedFailures += 1;
          err.dayAheadError = dayAheadError;
          throw err;
        }
      }
      return { changed, newSample, dayAheadError };
    },

    /**
     * Everything the device, the widget, the triggers and the scene action
     * read, at `at`.
     * @param {Date} [at]
     */
    snapshot(at = new Date(now())) {
      const today = chicagoDay(at);
      const tomorrow = addDays(today);
      const last = latest();
      const hours = hourlyAverages(samples);
      const todayHours = startingOn(hours, today);
      const todaySamples = samplesOfDay(samples, today);
      const currentHour = last
        ? (hours.find((hour) => hour.start.getTime() === hourOf(last.at).getTime()) ?? null)
        : null;
      const forecast = [...(dayAhead.get(today) ?? []), ...(dayAhead.get(tomorrow) ?? [])];
      const forecastToday = dayAhead.get(today) ?? [];
      const forecastTomorrow = dayAhead.get(tomorrow) ?? [];
      return {
        at,
        today,
        latest: last,
        // The 5-minute price is too old to be "now" (ComEd stopped publishing).
        stale: last === null || at.getTime() - last.at.getTime() >= FEED_STALE_MS,
        currentHour,
        todaySamples,
        todayHours,
        todayAverage: summarize(todaySamples)?.average ?? null,
        todaySummary: summarize(todayHours, (hour) => hour.average),
        forecast,
        forecastToday,
        forecastNow: slotAt(forecastToday, at),
        // The cheapest forecast hour of today not over yet.
        forecastRemaining: summarize(forecastToday.filter((slot) => slot.end > at)),
        forecastTomorrow,
        tomorrowSummary: summarize(forecastTomorrow),
      };
    },
  };

  /** A forced refresh asks again for every day that is not known. */
  function dayAheadDueForce(at) {
    const date = new Date(at);
    const today = chicagoDay(date);
    const days = [today];
    if (chicagoHour(date) >= TOMORROW_FROM_HOUR) {
      days.push(addDays(today));
    }
    return days.filter((day) => (dayAhead.get(day)?.length ?? 0) === 0);
  }
}

function fingerprint(list) {
  return JSON.stringify(list.map((slot) => [slot.start.getTime(), slot.price]));
}
