// -----------------------------------------------------------------------------
// The scene action: the cheapest hours before a deadline, on the real
// day-ahead prices of 24 and 25 October 2026.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCheapestWindow, nextDeadline, SCENE_ACTION } from '../src/scenes.js';
import { createWorld } from './helpers/world.js';

const run = async (world, fields) => {
  const ack = await world.gladys.fake.sceneAction(SCENE_ACTION.CHEAPEST_WINDOW, fields);
  assert.equal(ack.success, true, ack.error);
  return ack.data.outputs;
};

test('in the afternoon, tomorrow morning counts', async () => {
  const world = await createWorld(); // 14:36 in Chicago
  assert.deepEqual(await run(world, { hours: '3', before: '07:00' }), {
    found: true,
    starts_now: false,
    start_time: '01:00',
    end_time: '04:00',
    average_price: 2.3,
    minutes_to_start: 624,
  });
  // No deadline: the whole of tomorrow.
  const any = await run(world, { hours: '1', before: 'any' });
  assert.equal(any.start_time, '10:00');
});

test('in the morning, the deadline within today; too close is not found', async () => {
  const world = await createWorld({ at: '2026-10-24T14:00:00Z' }); // 09:00
  const outputs = await run(world, { hours: '2', before: '12:00' });
  assert.equal(outputs.found, true);
  assert.equal(outputs.start_time, '09:00');
  assert.equal(outputs.starts_now, true);
  assert.equal(outputs.minutes_to_start, 0);
  assert.equal((await run(world, { hours: '4', before: '11:00' })).found, false);
  // Beyond the known prices (tomorrow not out): all of today's hours.
  assert.equal((await run(world, { hours: '1', before: '07:00' })).start_time, '09:00');
});

test('an unknown choice is an error; no price at all is "not found"', () => {
  const snapshot = { at: new Date(), forecast: [] };
  assert.throws(() => findCheapestWindow(snapshot, { hours: '7', before: 'any' }));
  assert.throws(() => findCheapestWindow(snapshot, { hours: '2', before: '07:30' }));
  assert.equal(findCheapestWindow(snapshot, { hours: '2', before: 'any' }).found, false);
});

test('the deadline is the next time the Chicago clock shows it', () => {
  const at = new Date('2026-10-24T19:36:00Z'); // 14:36 CDT
  assert.equal(new Date(nextDeadline(at, '07:00')).toISOString(), '2026-10-25T12:00:00.000Z');
  assert.equal(new Date(nextDeadline(at, '15:00')).toISOString(), '2026-10-24T20:00:00.000Z');
  // 8 March 2026: 02:00 does not exist, 03:00 CDT takes its place.
  const spring = new Date('2026-03-08T06:30:00Z'); // 00:30 CST
  assert.equal(new Date(nextDeadline(spring, '02:00')).toISOString(), '2026-03-08T08:00:00.000Z');
});
