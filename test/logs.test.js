// -----------------------------------------------------------------------------
// Quiet logs: nothing at info for a normal cycle, a repeated failure written
// once (and its recovery once), and nothing secret in them.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';

/** Capture what the SDK logger writes (console.log / console.error). */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

const MINUTE = 60 * 1000;

test('a day of normal cycles writes nothing at info', async (t) => {
  const world = await createWorld({ at: '2026-10-23T19:50:00Z' });
  const lines = captureLogs(t);
  for (let i = 0; i < 24 * 60; i += 1) {
    world.clock.advance(MINUTE);
    await world.app.cycle();
  }
  await world.gladys.fake.widgetGet('prices');
  await world.gladys.fake.poll(world.gladys.fake.discoveredDevices[0]);
  assert.ok(world.api.count('5minutefeed') >= 12 * 24, 'the prices were read all day');
  assert.ok(world.gladys.fake.sceneEvents.length > 0, 'and the triggers fired');
  assert.deepEqual(lines, []);
});

test('the startup says ComEd answers, once', async (t) => {
  const lines = captureLogs(t);
  await createWorld();
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /\[INFO\] \[comed\] ComEd reachable: 174 5-minute prices today, day-ahead 24 hours today, 24 tomorrow/,
  );
});

test('an outage is one warning, its end one info line', async (t) => {
  const world = await createWorld({ at: '2026-10-24T05:00:00Z' });
  const lines = captureLogs(t);
  world.api.down = true;
  for (let i = 0; i < 6 * 60; i += 1) {
    world.clock.advance(MINUTE);
    await world.app.cycle();
  }
  world.api.down = false;
  for (let i = 0; i < 60; i += 1) {
    world.clock.advance(MINUTE);
    await world.app.cycle();
  }
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /\[WARN\].*ComEd refresh failed \(ComEd unreachable \(ENOTFOUND\)\)/);
  assert.match(lines[1], /\[INFO\].*ComEd answers again/);
});

test('a user action is one info line', async (t) => {
  const world = await createWorld();
  const lines = captureLogs(t);
  await world.gladys.fake.action('refresh');
  await world.gladys.fake.configUpdated({ language: 'de' });
  await world.gladys.fake.sceneAction('find_cheapest_window', { hours: '2', before: '07:00' });
  assert.equal(lines.length, 3, lines.join('\n'));
});

test('nothing secret in the logs, even in debug', async (t) => {
  const lines = captureLogs(t, 'debug');
  const world = await createWorld({ config: { language: 'es' } });
  world.api.down = true;
  world.clock.advance(61 * MINUTE);
  await world.app.cycle();
  await world.gladys.fake.action('refresh');
  assert.ok(lines.length > 3);
  const all = lines.join('\n');
  // The integration token the supervisor gives the container.
  assert.doesNotMatch(all, /fake-integration-token/);
  // No request URL either (a public API, but the rule stays: no address).
  assert.doesNotMatch(all, /https?:\/\//);
});

test("an afternoon outage, while tomorrow's prices are awaited, is still one warning", async (t) => {
  // From 12:00 in Chicago, tomorrow's prices are asked every 30 minutes: a
  // day-ahead request alone must not say "ComEd answers again".
  const world = await createWorld({
    at: '2026-10-24T17:00:00Z',
    tomorrowFrom: '2026-10-25T05:00:00Z',
  });
  const lines = captureLogs(t);
  world.api.down = true;
  const statuses = [];
  for (let i = 0; i < 3 * 60; i += 1) {
    world.clock.advance(MINUTE);
    await world.app.cycle();
    statuses.push(world.gladys.fake.connectionStatus.connected);
  }
  // Disconnected from the first failed read on, never "connected" again.
  const first = statuses.indexOf(false);
  assert.ok(first >= 0 && first < 15);
  assert.ok(statuses.slice(first).every((connected) => connected === false));
  assert.equal(lines.filter((l) => l.includes('[INFO]')).length, 0, lines.join('\n'));
  assert.equal(lines.filter((l) => /refresh failed/.test(l)).length, 1, lines.join('\n'));
});
