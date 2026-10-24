// -----------------------------------------------------------------------------
// The device and its states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE } from '../src/device.js';
import { createWorld, featureId, last } from './helpers/world.js';

test('one read-only device, its names in the language of the configuration', async () => {
  const { gladys } = await createWorld({ config: { language: 'en' } });
  const [device] = gladys.fake.discoveredDevices;
  assert.ok(device.external_id.endsWith(':comed:hourly-pricing'));
  assert.equal(device.features.length, Object.keys(FEATURE).length);
  assert.ok(device.features.every((f) => f.read_only === true));
  const names = device.features.map((f) => f.name);
  assert.ok(names.includes('Current hour average (¢/kWh)'));
  // No "$" unit: it would read 2.9 $ for 2.9 cents.
  assert.ok(device.features.every((f) => f.unit === undefined));
});

test('the states of the moment the fixtures were recorded', async () => {
  const { gladys } = await createWorld();
  assert.deepEqual(
    Object.fromEntries(Object.values(FEATURE).map((key) => [key, last(gladys, key)])),
    {
      price_5min: 2.9,
      // What ComEd's own currenthouraverage said at that moment.
      hour_average: 2.7,
      average_today: 2.51,
      min_hour_today: 0.6,
      max_hour_today: 6.5,
      forecast_now: 2.7,
      tomorrow_average: 3.59,
      tomorrow_min: 2.1,
      tomorrow_max: 9.9,
      tomorrow_available: 1,
    },
  );
});

test('nothing is published before the device is added; everything once it is', async () => {
  const world = await createWorld({ created: false });
  const { gladys } = world;
  assert.equal(gladys.fake.states.length, 0);
  const refreshes = gladys.fake.widgetRefreshes.length;
  gladys.fake.devices = [gladys.fake.discoveredDevices[0]];
  await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
  assert.equal(gladys.fake.states.length, Object.keys(FEATURE).length);
  assert.equal(gladys.fake.widgetRefreshes.length, refreshes + 1);
  // And again, whole, if the user adds it a second time.
  await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
  assert.equal(gladys.fake.states.length, 2 * Object.keys(FEATURE).length);
});

test('a stale feed publishes no 5-minute price and says so', async () => {
  const world = await createWorld();
  const { gladys } = world;
  const id = featureId(gladys, FEATURE.PRICE_5MIN);
  const count = () => gladys.fake.states.filter((s) => s.device_feature_external_id === id).length;
  const before = count();
  world.api.feed = [];
  world.clock.advance(7 * 60 * 60 * 1000); // past the heartbeat
  await world.app.cycle();
  assert.equal(count(), before);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /no 5-minute price for 30 minutes/);
});
