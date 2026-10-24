// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake ComEd API serving the
// real fixtures, a settable clock and a temporary /data, with the
// integration wired on top through createApp — the very wiring index.js uses.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const fixture = (name) =>
  readFileSync(new URL(`../fixtures/comed/${name}`, import.meta.url), 'utf8');

/** The real 5-minute feed, read at RECORDED_AT (newest first, as ComEd sends it). */
export const FEED = JSON.parse(fixture('five-minute-feed.json'));
/** The moment the fixtures were recorded: 24 October 2026, 14:36:55 in Chicago (CDT). */
export const RECORDED_AT = '2026-10-24T19:36:55Z';

const DAY_AHEAD = {
  20261024: fixture('day-ahead-2026-10-24.txt'),
  20261025: fixture('day-ahead-2026-10-25.txt'),
  20261026: fixture('day-ahead-2026-10-26.txt'),
  20250309: fixture('day-ahead-2025-03-09.txt'),
  20251102: fixture('day-ahead-2025-11-02.txt'),
};

/** A 5-minute price is published about 6 minutes after its stamp. */
export const PUBLICATION_LAG_MS = 6 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/**
 * A fake ComEd API. The feed serves the real samples (plus `api.extra`) that
 * are published at the clock's time; the day-ahead prices of 25 October are
 * hidden before `api.tomorrowFrom`. `api.down` makes every request fail like
 * an unreachable host.
 * @param {() => number} now
 */
export function createFakeApi(now, { tomorrowFrom } = {}) {
  const api = {
    down: false,
    tomorrowFrom,
    /** Extra samples `{ millisUTC: string, price: string }`, e.g. a crafted run. */
    extra: [],
    /** Replace the whole feed when set. */
    feed: null,
    requests: [],
    answer(url) {
      const type = url.searchParams.get('type');
      if (type === '5minutefeed') {
        const all = api.feed ?? [...FEED, ...api.extra];
        const body = all
          .filter((entry) => {
            const at = Number(entry.millisUTC);
            return at + PUBLICATION_LAG_MS <= now() && at > now() - DAY;
          })
          .sort((a, b) => Number(b.millisUTC) - Number(a.millisUTC));
        return { status: 200, body: JSON.stringify(body), type: 'application/json' };
      }
      if (type === 'daynexttoday') {
        const date = url.searchParams.get('date');
        let body = DAY_AHEAD[date] ?? '[]\n';
        if (
          date === '20261025' &&
          api.tomorrowFrom &&
          now() < new Date(api.tomorrowFrom).getTime()
        ) {
          body = '[]\n';
        }
        return { status: 200, body, type: 'text/html;charset=ISO-8859-1' };
      }
      return { status: 200, body: 'Servlet Feed 2.95-SGalertsSync', type: 'text/html' };
    },
    async fetch(url, init) {
      const parsed = new URL(url);
      api.requests.push({ url: parsed, headers: init?.headers });
      if (api.down) {
        throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
      }
      const { status, body, type } = api.answer(parsed);
      return new Response(body, { status, headers: { 'Content-Type': type } });
    },
    count(type) {
      return api.requests.filter((r) => !type || r.url.searchParams.get('type') === type).length;
    },
  };
  return api;
}

/** A clock the test moves by hand. */
export function createClock(iso = RECORDED_AT) {
  let current = new Date(iso).getTime();
  return {
    now: () => current,
    set(next) {
      current = new Date(next).getTime();
    },
    advance(ms) {
      current += ms;
    },
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {boolean} [options.created] the user already added the device
 * @param {string} [options.at] the clock, ISO
 * @param {string} [options.tomorrowFrom] tomorrow's day-ahead prices appear then
 * @param {boolean} [options.connect]
 * @param {string} [options.dataDir]
 */
export async function createWorld({
  config = {},
  created = true,
  at = RECORDED_AT,
  tomorrowFrom,
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-comed-')),
} = {}) {
  const clock = createClock(at);
  const api = createFakeApi(clock.now, { tomorrowFrom });
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, { fetch: api.fetch, now: clock.now, timers: false, dataDir });
  const world = { gladys, api, clock, app, dataDir };
  if (created) {
    // The device as the user added it, before the integration connects.
    const { buildDevice } = await import('../../src/device.js');
    const { normalizeConfig } = await import('../../src/config.js');
    gladys.fake.devices = [buildDevice(gladys, normalizeConfig(config))];
  }
  if (connect) {
    await gladys.connect();
  }
  return world;
}

/** Run one cycle a minute from the current clock, for `minutes`. */
export async function runFor(world, minutes) {
  for (let i = 0; i < minutes; i += 1) {
    world.clock.advance(60 * 1000);
    await world.app.cycle();
  }
}

/** External id of a feature of the ComEd device. */
export const featureId = (gladys, key) =>
  gladys.externalIds('comed', 'hourly-pricing').feature(key);

/** The last state of a feature. */
export function last(gladys, key) {
  const id = featureId(gladys, key);
  const states = gladys.fake.states.filter((s) => s.device_feature_external_id === id);
  const state = states.at(-1);
  return state === undefined ? undefined : (state.text ?? state.state);
}
