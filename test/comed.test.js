// -----------------------------------------------------------------------------
// The ComEd client, on real answers recorded on 24 October 2026 (and the
// day-ahead prices of the two DST days of 2025).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ComedError,
  fetchDayAhead,
  fetchFiveMinutePrices,
  parseDayAhead,
  parseFiveMinutePrices,
} from '../src/comed.js';
import { chicagoTime } from '../src/time.js';
import { fixture } from './helpers/world.js';

test('the 5-minute feed: 24 hours of prices, oldest first, negative ones included', () => {
  const samples = parseFiveMinutePrices(fixture('five-minute-feed.json'));
  assert.equal(samples.length, 287);
  assert.equal(samples[0].at.toISOString(), '2026-10-23T19:40:00.000Z');
  assert.equal(samples.at(-1).at.toISOString(), '2026-10-24T19:30:00.000Z');
  assert.equal(samples.at(-1).price, 2.9);
  assert.ok(samples.every((s, i) => i === 0 || s.at > samples[i - 1].at));
  assert.equal(Math.min(...samples.map((s) => s.price)), -1.6);
});

test('a malformed entry is skipped, not the whole feed', () => {
  const samples = parseFiveMinutePrices(
    JSON.stringify([
      { millisUTC: '1792870200000', price: '2.9' },
      { millisUTC: 'soon', price: '2.8' },
      { millisUTC: '1792869600000', price: '' },
      { millisUTC: '1792869300000', price: 'n/a' },
      { millisUTC: '1792869000000', price: '-0.4' },
      null,
    ]),
  );
  assert.deepEqual(
    samples.map((s) => s.price),
    [-0.4, 2.9],
  );
  assert.throws(() => parseFiveMinutePrices('<html>maintenance</html>'), { kind: 'format' });
  assert.throws(() => parseFiveMinutePrices('{"error":1}'), { kind: 'format' });
});

test('the day-ahead prices: Chicago wall clock, hour starting', () => {
  const slots = parseDayAhead(fixture('day-ahead-2026-10-24.txt'), '2026-10-24');
  assert.equal(slots.length, 24);
  // 00:00 CDT is 05:00 UTC.
  assert.equal(slots[0].start.toISOString(), '2026-10-24T05:00:00.000Z');
  assert.equal(slots[0].price, 2.9);
  assert.equal(chicagoTime(slots[18].start), '18:00');
  assert.equal(slots[18].price, 8.6);
  assert.equal(slots[23].end.toISOString(), '2026-10-25T05:00:00.000Z');
});

test('the day the clocks go forward has 23 hours, the day they go back 25', () => {
  const spring = parseDayAhead(fixture('day-ahead-2025-03-09.txt'), '2025-03-09');
  assert.equal(spring.length, 23);
  assert.deepEqual(
    spring.slice(0, 3).map((s) => chicagoTime(s.start)),
    ['00:00', '01:00', '03:00'],
  );
  // Contiguous: 01:00 CST is followed by 03:00 CDT.
  assert.equal(spring[1].end.getTime(), spring[2].start.getTime());

  // ComEd sends a single 01:00 for the 25-hour day: both 01:00 take its
  // price, and the night stays contiguous.
  const autumn = parseDayAhead(fixture('day-ahead-2025-11-02.txt'), '2025-11-02');
  assert.equal(autumn.length, 25);
  assert.equal(autumn[1].start.toISOString(), '2025-11-02T06:00:00.000Z');
  assert.equal(autumn[2].start.toISOString(), '2025-11-02T07:00:00.000Z');
  assert.equal(autumn[2].price, autumn[1].price);
  assert.equal(autumn[3].start.toISOString(), '2025-11-02T08:00:00.000Z');
  assert.ok(autumn.every((s, i) => i === 0 || s.start.getTime() === autumn[i - 1].end.getTime()));
});

test('a day not published yet is an empty list, an odd answer an error', () => {
  assert.deepEqual(parseDayAhead(fixture('day-ahead-2026-10-26.txt'), '2026-10-26'), []);
  assert.throws(() => parseDayAhead('Servlet Feed 2.95-SGalertsSync', '2026-10-26'), {
    kind: 'format',
  });
  assert.throws(() => parseDayAhead('[[1, 2]]', '2026-10-26'), { kind: 'format' });
  // Another day than the one asked for is not taken.
  assert.throws(() => parseDayAhead(fixture('day-ahead-2026-10-24.txt'), '2026-10-25'), {
    kind: 'format',
  });
});

test('the requests: the URL, the user agent, and the failures', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url: String(url), agent: init.headers['User-Agent'] });
    return new Response(fixture('day-ahead-2026-10-25.txt'), { status: 200 });
  };
  const slots = await fetchDayAhead('2026-10-25', { fetch });
  assert.equal(slots.length, 24);
  assert.equal(seen[0].url, 'https://hourlypricing.comed.com/api?type=daynexttoday&date=20261025');
  assert.match(seen[0].agent, /^gladys-comed /);

  await assert.rejects(
    fetchFiveMinutePrices({ fetch: async () => new Response('busy', { status: 503 }) }),
    (err) => err instanceof ComedError && err.kind === 'http' && err.status === 503,
  );
  await assert.rejects(
    fetchFiveMinutePrices({
      fetch: async () => {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      },
    }),
    { kind: 'network', message: 'ComEd unreachable (ECONNRESET)' },
  );
});
