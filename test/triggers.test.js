// -----------------------------------------------------------------------------
// The scene triggers, on the real prices of 24 October 2026 (negative ones
// at night, a 20.6 ¢ spike at 07:10) and on crafted runs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSceneLedger } from '../src/ledger.js';
import { eventsForPrice, tomorrowEvent, TRIGGER } from '../src/triggers.js';
import { parseDayAhead } from '../src/comed.js';
import { createWorld, fixture, runFor } from './helpers/world.js';

const MINUTE = 60 * 1000;
const events = (world, key) => world.gladys.fake.sceneEvents.filter((e) => e.key === key);
const summary = (list) =>
  list.map((e) =>
    [e.data.time, e.data.threshold, e.data.hour_average].filter((x) => x !== undefined).join(' '),
  );

test('a crossing fires, staying on the same side does not', () => {
  const hourStart = new Date('2026-10-24T08:00:00Z');
  const at = new Date('2026-10-24T08:20:00Z');
  const fired = eventsForPrice(
    { at: 0, price: 3.1, average: 5.2 },
    { at, price: -0.3, average: 2.8, hourStart },
  );
  assert.deepEqual(
    fired.map((e) => e.id),
    ['below:3', 'below:4', 'below:5', 'negative'],
  );
  assert.deepEqual(fired[0].data, {
    threshold: '3',
    hour_average: 2.8,
    price: -0.3,
    hour_start: '03:00',
    time: '03:20',
  });
  assert.deepEqual(
    eventsForPrice({ at: 0, price: -1, average: 2.5 }, { at, price: -2, average: 2.6, hourStart }),
    [],
  );
  // Exactly on the threshold is not under it.
  assert.deepEqual(
    eventsForPrice({ at: 0, price: 1, average: 2 }, { at, price: 1, average: 1.9, hourStart }).map(
      (e) => e.id,
    ),
    ['below:2'],
  );
});

test('a real night and morning: negative prices, a spike, the thresholds both ways', async () => {
  const world = await createWorld({ at: '2026-10-24T05:00:00Z' }); // midnight in Chicago
  await runFor(world, 10 * 60); // to 10:00

  assert.deepEqual(summary(events(world, TRIGGER.NEGATIVE)), [
    '00:25 0.9',
    '00:35 0.8',
    '00:45 0.6',
    '00:55 0.5',
    '01:05 0.6',
    '01:15 -0.6',
    '03:15 1',
    '03:25 0.7',
    '07:30 10.3',
    '08:40 1.8',
  ]);
  // The 07:00 hour: 7.2 at 07:05 is a single price, not judged; 07:15 is
  // the first average judged (10.4), the spike is in it.
  const above = summary(events(world, TRIGGER.ABOVE)).filter((e) => e.startsWith('07:'));
  assert.deepEqual(above, [
    '07:15 4 10.4',
    '07:15 5 10.4',
    '07:15 6 10.4',
    '07:15 8 10.4',
    '07:15 10 10.4',
    '07:25 12 12.6',
  ]);
  const below = summary(events(world, TRIGGER.BELOW)).filter((e) => e.startsWith('07:'));
  assert.deepEqual(below, ['07:20 10 8.6', '07:30 12 10.3', '07:45 8 7.8']);
  // Every event carries the hour it belongs to.
  for (const event of world.gladys.fake.sceneEvents) {
    assert.equal(event.data.hour_start, `${event.data.time.slice(0, 2)}:00`);
  }
});

test('an average wobbling around a threshold fires once an hour', async () => {
  const world = await createWorld({ at: '2026-10-24T05:00:00Z' });
  const base = new Date('2026-10-24T20:00:00Z').getTime(); // 15:00 in Chicago
  world.api.feed = [];
  const prices = [3, 3, 3, 1.4, 4.6, 1.4, 4.6, 1.4];
  prices.forEach((price, i) => {
    world.api.feed.push({ millisUTC: String(base + (i + 1) * 5 * MINUTE), price: String(price) });
  });
  world.clock.set(base + 5 * MINUTE);
  await runFor(world, 50);
  // Averages: 3 (judged at 15:15), 2.6, 3, 2.7, 3.1, 2.9: under 3 at 15:20,
  // back over at 15:30, under again at 15:35 -> one "below 3" only.
  assert.deepEqual(summary(events(world, TRIGGER.BELOW)), ['15:20 3 2.6']);
  assert.deepEqual(summary(events(world, TRIGGER.ABOVE)), []);
});

test('a restart does not fire again; a price read late is only a baseline', async () => {
  const world = await createWorld({ at: '2026-10-24T05:00:00Z' });
  await runFor(world, 35); // the price of 00:25 (negative) is out at 00:31
  assert.deepEqual(summary(events(world, TRIGGER.NEGATIVE)), ['00:25 0.9']);

  // Same /data, the container restarts a minute later.
  const again = await createWorld({ at: '2026-10-24T05:36:00Z', dataDir: world.dataDir });
  assert.equal(again.gladys.fake.sceneEvents.length, 0);
  await runFor(again, 10); // 00:35 is negative again, after a positive 00:30
  assert.deepEqual(summary(events(again, TRIGGER.NEGATIVE)), ['00:35 0.8']);

  // A container started long after its last price: the first one is a baseline.
  const late = await createWorld({ at: '2026-10-24T06:58:00Z', dataDir: world.dataDir });
  assert.equal(late.gladys.fake.sceneEvents.length, 0);
});

test("tomorrow's prices are announced once, in the afternoon", async () => {
  const world = await createWorld({
    at: '2026-10-24T17:00:00Z', // noon in Chicago
    tomorrowFrom: '2026-10-24T18:20:00Z',
  });
  assert.equal(events(world, TRIGGER.TOMORROW_PUBLISHED).length, 0);
  await runFor(world, 90);
  const [announce] = events(world, TRIGGER.TOMORROW_PUBLISHED);
  assert.deepEqual(announce.data, {
    average_price: 3.6,
    min_price: 2.1,
    cheapest_time: '10:00',
    max_price: 9.9,
    priciest_time: '18:00',
    cheapest_3h_start: '09:00',
  });
  await runFor(world, 60);
  assert.equal(events(world, TRIGGER.TOMORROW_PUBLISHED).length, 1);

  const restarted = await createWorld({ at: '2026-10-24T20:00:00Z', dataDir: world.dataDir });
  assert.equal(events(restarted, TRIGGER.TOMORROW_PUBLISHED).length, 0);
});

test('prices first seen after 23:00 are not announced', async () => {
  const world = await createWorld({ at: '2026-10-25T04:10:00Z' }); // 23:10 in Chicago
  assert.equal(events(world, TRIGGER.TOMORROW_PUBLISHED).length, 0);
  assert.equal(tomorrowEvent([]), null);
  const slots = parseDayAhead(fixture('day-ahead-2026-10-25.txt'), '2026-10-25');
  assert.equal(tomorrowEvent(slots).key, TRIGGER.TOMORROW_PUBLISHED);
});

test('a lost or broken ledger starts afresh', async () => {
  const ledger = createSceneLedger('/nonexistent/forbidden');
  await ledger.load();
  assert.equal(ledger.previous, null);
  await ledger.setPrevious({ at: 1, price: 2, average: 3 });
  assert.deepEqual(ledger.previous, { at: 1, price: 2, average: 3 });
});
