// -----------------------------------------------------------------------------
// The price widget: what the card shows, within the core's vocabulary and
// budget (validateWidgetContent is the SDK's copy of the core checks).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET } from '../src/widget.js';
import { createWorld } from './helpers/world.js';

async function content(world, language = 'en') {
  const ack = await world.gladys.fake.widgetGet(WIDGET.PRICES, { language });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

const byType = (c, type) => c.components.filter((component) => component.type === type);

test("today's curve, the prices now and tomorrow's", async () => {
  const world = await createWorld();
  const c = await content(world);
  assert.deepEqual(validateWidgetContent(c), []);
  assert.ok(c.components.length <= 8);
  assert.ok(byType(c, 'text').length <= 2);
  assert.deepEqual(
    byType(c, 'value').map((v) => [v.label, v.value, v.unit]),
    [
      ['Last 5 minutes', 2.9, '¢/kWh'],
      ['This hour', 2.7, '¢/kWh'],
      ["Today's average", 2.51, '¢/kWh'],
    ],
  );
  const [chart] = byType(c, 'chart');
  assert.equal(chart.chart_type, 'stepline');
  assert.deepEqual(
    chart.series.map((s) => [s.name, s.points.length]),
    [
      ['Real-time (5 min)', 174],
      ['Day-ahead', 48],
    ],
  );
  // The 00:05 price covers 00:00 to 00:05.
  assert.equal(chart.series[0].points[0].t, '2026-10-24T05:00:00.000Z');
  assert.deepEqual(
    chart.annotations.map((a) => a.label),
    ['Min 00:00', 'Max 07:00'],
  );
  const [status] = byType(c, 'status');
  assert.deepEqual(
    status.items.map((i) => [i.label, i.value]),
    [
      ['Cheapest hour left', '14:00 · 2.7 ¢/kWh'],
      ['Cheapest tomorrow', '10:00 · 2.1 ¢/kWh'],
      ["Tomorrow's average", '3.6 ¢/kWh'],
    ],
  );
});

test('in the morning, tomorrow is expected; the texts follow the language', async () => {
  const world = await createWorld({ at: '2026-10-24T14:00:00Z' }); // 09:00
  const c = await content(world, 'fr');
  assert.deepEqual(validateWidgetContent(c), []);
  assert.equal(byType(c, 'text')[0].text.startsWith('ComEd Hourly Pricing, prix'), true);
  const [status] = byType(c, 'status');
  assert.deepEqual(status.items.at(-1), {
    label: 'Demain',
    value: "Dans l'après-midi",
    icon: 'clock',
    color: 'neutral',
  });
  assert.match(status.items[0].value, /^\d\d:00 · \d+,\d ¢\/kWh$/);
});

test('a stale feed shows the last price, not a "now"', async () => {
  const world = await createWorld();
  world.clock.advance(45 * 60 * 1000);
  world.api.down = true;
  const c = await content(world);
  assert.deepEqual(validateWidgetContent(c), []);
  assert.deepEqual(
    byType(c, 'value').map((v) => v.label),
    ["Today's average"],
  );
  assert.deepEqual(byType(c, 'status')[0].items[0], {
    label: 'Last price',
    value: '14:30 · 2.9 ¢/kWh',
    icon: 'alert-triangle',
    color: 'warning',
  });
});

test('nothing received yet: one line', async () => {
  const world = await createWorld({ connect: false });
  world.api.down = true;
  await world.gladys.connect();
  const c = await content(world);
  assert.deepEqual(validateWidgetContent(c), []);
  assert.equal(c.components.length, 1);
  assert.match(c.components[0].text, /No price received from ComEd yet/);
});
