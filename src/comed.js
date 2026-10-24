// -----------------------------------------------------------------------------
// ComEd Hourly Pricing API (public, no account, no key).
//
//   GET https://hourlypricing.comed.com/api?type=5minutefeed
//       JSON, newest first: [{ "millisUTC": "1792870200000", "price": "2.9" }]
//       The real-time 5-minute prices of the last 24 hours, in cents/kWh, as
//       strings; negative when the market is. A price is stamped at the END of
//       its 5 minutes, and is published about 5 minutes after that.
//   GET https://hourlypricing.comed.com/api?type=currenthouraverage
//       The same shape, one entry: the average of the 5-minute prices of the
//       hour in progress (those stamped after HH:00, up to HH+1:00 included),
//       rounded to a tenth. Not read: src/prices.js computes it from the
//       feed (test/prices.test.js checks it gives the same figure).
//   GET https://hourlypricing.comed.com/api?type=daynexttoday&date=YYYYMMDD
//       Not JSON but a JavaScript literal for a chart:
//       [[Date.UTC(2026,9,24,0,0,0), 2.9], [Date.UTC(2026,9,24,1,0,0), 2.5], ...]
//       The PJM day-ahead hourly prices of a Chicago day, in cents/kWh. Despite
//       "Date.UTC", the fields are the Chicago wall clock (month from 0) and
//       the hour is the one the price STARTS: 23 entries the day the clocks
//       go forward (no 02:00), 24 the day they go back (one 01:00). A day not
//       published yet answers "[]". Tomorrow's prices appear in the afternoon.
//
// Prices are the supply price only (what Hourly Pricing customers pay per kWh
// for energy), without delivery, capacity nor taxes.
// -----------------------------------------------------------------------------

import { chicagoHourStart } from './time.js';

export const API_URL = 'https://hourlypricing.comed.com/api';

const HOUR = 60 * 60 * 1000;
const USER_AGENT = 'gladys-comed (+https://github.com/guim31/gladys-comed)';

/** A failed request, with what the user can be told about it. */
export class ComedError extends Error {
  /**
   * @param {string} message
   * @param {{ kind: 'network' | 'http' | 'format', status?: number }} details
   */
  constructor(message, { kind, status }) {
    super(message);
    this.name = 'ComedError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @param {URL} url
 * @param {typeof fetch} fetch
 * @param {number} timeoutMs
 * @returns {Promise<string>} the body
 */
async function get(url, fetch, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
    throw new ComedError(`ComEd unreachable (${reason})`, { kind: 'network' });
  }
  if (!response.ok) {
    throw new ComedError(`ComEd answered HTTP ${response.status}`, {
      kind: 'http',
      status: response.status,
    });
  }
  try {
    return await response.text();
  } catch {
    throw new ComedError('ComEd sent an unreadable answer', { kind: 'format' });
  }
}

/**
 * The real-time 5-minute prices of the last 24 hours.
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<Array<{ at: Date, price: number }>>} oldest first
 */
export async function fetchFiveMinutePrices({ fetch = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('type', '5minutefeed');
  return parseFiveMinutePrices(await get(url, fetch, timeoutMs));
}

/**
 * Turn a 5-minute feed into samples, oldest first. Unreadable entries are
 * skipped one by one: a single malformed price must not hide the day.
 * @param {string} text
 */
export function parseFiveMinutePrices(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ComedError('ComEd sent an unreadable answer', { kind: 'format' });
  }
  if (!Array.isArray(body)) {
    throw new ComedError('ComEd sent an unexpected answer', { kind: 'format' });
  }
  const byTime = new Map();
  for (const entry of body) {
    const millis = Number(entry?.millisUTC);
    const price = typeof entry?.price === 'string' ? Number(entry.price) : NaN;
    if (
      !Number.isSafeInteger(millis) ||
      millis <= 0 ||
      entry.price === '' ||
      !Number.isFinite(price)
    ) {
      continue;
    }
    byTime.set(millis, { at: new Date(millis), price });
  }
  return [...byTime.values()].sort((a, b) => a.at - b.at);
}

/**
 * The day-ahead hourly prices of a Chicago day; [] when not published yet.
 * @param {string} day `YYYY-MM-DD`
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<Array<{ start: Date, end: Date, price: number }>>}
 */
export async function fetchDayAhead(day, { fetch = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('type', 'daynexttoday');
  url.searchParams.set('date', day.replaceAll('-', ''));
  return parseDayAhead(await get(url, fetch, timeoutMs), day);
}

const ENTRY =
  /\[\s*Date\.UTC\((\d{4}),(\d{1,2}),(\d{1,2}),(\d{1,2}),0,0\)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;

/**
 * Read the chart literal of `daynexttoday`. Only the hours of `day` are kept
 * (ComEd answers the day asked; anything else would be a surprise).
 * @param {string} text
 * @param {string} day `YYYY-MM-DD`
 */
export function parseDayAhead(text, day) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new ComedError('ComEd sent an unexpected answer', { kind: 'format' });
  }
  const byStart = new Map();
  for (const match of trimmed.matchAll(ENTRY)) {
    const [year, month, date, hour] = match.slice(1, 5).map(Number);
    const price = Number(match[5]);
    const entryDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    const start = entryDay === day ? chicagoHourStart(year, month + 1, date, hour) : null;
    if (start && Number.isFinite(price) && !byStart.has(start.getTime())) {
      byStart.set(start.getTime(), { start, end: new Date(start.getTime() + HOUR), price });
    }
  }
  if (byStart.size === 0 && trimmed.replace(/\s/g, '') !== '[]') {
    throw new ComedError('ComEd sent an unexpected answer', { kind: 'format' });
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}
