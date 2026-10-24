// -----------------------------------------------------------------------------
// When the integration asks ComEd again, and who drives it: the container's
// own timer (Gladys#3198: the core may never call onPoll), the core's onPoll
// only as a fallback.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE } from '../src/device.js';
import { createWorld, last, runFor } from './helpers/world.js';

const dayAheadDates = (world) =>
  world.api.requests
    .filter((r) => r.url.searchParams.get('type') === 'daynexttoday')
    .map((r) => r.url.searchParams.get('date'));

test('about one feed request every 5 minutes, each new price read within 7 minutes', async () => {
  const world = await createWorld({ at: '2026-10-24T05:00:00Z' });
  const start = world.api.count('5minutefeed');
  await runFor(world, 3 * 60);
  const requests = world.api.count('5minutefeed') - start;
  assert.ok(requests >= 36 && requests <= 40, `${requests} requests in 3 hours`);
  // At 08:00 UTC (03:00 Chicago) the last price out is the one of 07:50 UTC;
  // the integration has it.
  assert.equal(world.app.market.snapshot().latest.at.toISOString(), '2026-10-24T07:50:00.000Z');
});

test("today's day-ahead prices once; tomorrow's from noon, every 30 minutes until out", async () => {
  const world = await createWorld({
    at: '2026-10-24T15:00:00Z', // 10:00 in Chicago
    tomorrowFrom: '2026-10-24T18:10:00Z', // out at 13:10
  });
  assert.deepEqual(dayAheadDates(world), ['20261024']);
  await runFor(world, 2 * 60); // noon
  assert.deepEqual(dayAheadDates(world), ['20261024', '20261025']);
  await runFor(world, 30); // 12:30
  assert.equal(dayAheadDates(world).length, 3);
  assert.equal(last(world.gladys, FEATURE.TOMORROW_AVAILABLE), 0);
  await runFor(world, 30); // 13:00, not out yet
  await runFor(world, 30); // 13:30, out
  assert.equal(dayAheadDates(world).length, 5);
  assert.equal(last(world.gladys, FEATURE.TOMORROW_AVAILABLE), 1);
  await runFor(world, 3 * 60);
  assert.equal(dayAheadDates(world).length, 5, 'known: not asked again');
});

test('a failure backs off: 1, 2, 5, 10 then every 15 minutes', async () => {
  const world = await createWorld({ at: '2026-10-24T05:00:00Z' });
  world.api.down = true;
  const start = world.api.count('5minutefeed');
  await runFor(world, 60);
  // 1, 3, 8, 18, 33, 48 minutes after the first failure (plus that one).
  const attempts = world.api.count('5minutefeed') - start;
  assert.ok(attempts >= 6 && attempts <= 8, `${attempts} attempts in an hour`);
  assert.equal(world.gladys.fake.connectionStatus?.connected ?? false, false);
});

test('the core poll is only a fallback when the timer stops', async () => {
  const world = await createWorld({ at: '2026-10-24T05:00:00Z' });
  const device = world.gladys.fake.discoveredDevices[0];
  const before = world.api.requests.length;
  await world.gladys.fake.poll(device);
  assert.equal(world.api.requests.length, before, 'the timer just ran');
  world.clock.advance(20 * 60 * 1000);
  await world.gladys.fake.poll(device);
  assert.ok(world.api.requests.length > before, 'the timer is late: onPoll runs a cycle');
});

test('the refresh action reads everything again and says what it got', async () => {
  const world = await createWorld();
  const before = world.api.count('5minutefeed');
  const ack = await world.gladys.fake.action('refresh');
  assert.equal(ack.success, true);
  assert.equal(world.api.count('5minutefeed'), before + 1);
  assert.equal(
    ack.data.message.en,
    "5-minute price: 2.9 ¢/kWh, current hour average: 2.7 ¢/kWh.\nTomorrow's day-ahead prices are published.",
  );
  assert.match(ack.data.message.fr, /Prix 5 minutes : 2,9 ¢\/kWh/);

  world.api.down = true;
  const failed = await world.gladys.fake.action('refresh');
  assert.equal(failed.success, true);
  assert.equal(
    failed.data.message.en,
    'ComEd cannot be reached (ComEd unreachable (ENOTFOUND)). The last known prices stay in use.',
  );
});
