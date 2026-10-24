// -----------------------------------------------------------------------------
// The integration: registers every SDK handler on a GladysIntegration (or the
// SDK's fake Gladys in the tests) and runs the refresh cycle, so index.js stays
// a few lines and the tests drive the very same wiring.
//
// One cycle, every minute on the container's own timer (the core's onPoll is
// only a fallback, Gladys#3198):
//   1. ask ComEd again when the refresh policy says so (src/market.js);
//   2. publish the states of the device, if the user added it — only the
//      values that changed, plus a heartbeat (the SDK deduplicates);
//   3. on a new 5-minute price, fire the scene triggers it crosses; once a
//      day, say tomorrow's day-ahead prices are out.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { buildDevice, buildStates, deviceIds } from './device.js';
import { MESSAGES, TEXT } from './i18n.js';
import { createIssueLog } from './issues.js';
import { createMarket } from './market.js';
import { createSceneLedger } from './ledger.js';
import { hourOf, roundTenth } from './prices.js';
import { SCENE_ACTION, findCheapestWindow } from './scenes.js';
import { addDays, chicagoHour } from './time.js';
import { eventsForPrice, tomorrowEvent } from './triggers.js';
import { buildPricesContent, WIDGET } from './widget.js';

const logger = createLogger({ name: 'comed' });

const MINUTE = 60 * 1000;
// A value that does not change (the day's low, tomorrow's average) is sent
// again every 6 hours: without a recent value, Gladys shows "no recent value".
export const HEARTBEAT_MS = 6 * 60 * MINUTE;
// The core's onPoll runs a cycle only when the timer missed one.
const POLL_FALLBACK_MS = 90 * 1000;
// A 5-minute price read this long after its stamp (the container started
// late, ComEd was down) fires no trigger: it only becomes the new baseline.
export const LATE_EVENT_MS = 15 * MINUTE;
// Two prices further apart than this are not compared (a gap in the feed).
export const MAX_GAP_MS = 15 * MINUTE;
// The hourly average is compared with the thresholds from its third price on
// (HH:15): at HH:05 it is a single 5-minute price, and would fire and fire
// back within the hour.
export const MIN_PRICES_JUDGED = 3;
// tomorrow_prices_published goes out until 22:59 (Chicago) only.
export const ANNOUNCE_UNTIL_HOUR = 23;

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the minute timer
 * @param {string} [options.dataDir] where the scene ledger is kept
 */
export function createApp(gladys, options = {}) {
  const now = options.now ?? (() => Date.now());
  const market = createMarket({ fetch: options.fetch, now });
  const ledger = createSceneLedger(options.dataDir ?? '/data');
  const issues = createIssueLog(logger);
  const timers = options.timers ?? true;

  let config = normalizeConfig();
  let timer = null;
  let stopped = false;
  let running = null;
  let lastCycleAt = null;
  let lastStatus = null;
  let announced = false;
  // Set once the configuration and the scene ledger are loaded.
  let initialized = false;
  let initializing = Promise.resolve();

  const deviceCreated = () =>
    (gladys.devices ?? []).some((device) => device.external_id === deviceIds(gladys).device);

  async function setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === lastStatus) {
      return;
    }
    try {
      await gladys.setConnectionStatus(connected, message);
      lastStatus = key;
    } catch (err) {
      // Sent again on the next cycle.
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  /** Nudge the open dashboards; dropped silently while disconnected. */
  function refreshWidget() {
    try {
      gladys.requestWidgetRefresh(WIDGET.PRICES);
    } catch (err) {
      logger.debug(`Widget refresh not sent (${err.message})`);
    }
  }

  /**
   * @param {string} reason
   * @param {{ force?: boolean }} [options] the user's action: everything is
   *   read again, and a failure is thrown
   */
  async function refresh(reason, { force = false } = {}) {
    logger.debug(`Reading the prices (${reason})`);
    try {
      const { changed, dayAheadError } = await market.refresh({ force });
      const snapshot = market.snapshot();
      if (dayAheadError) {
        issues.fail('day-ahead', `ComEd day-ahead prices not read (${dayAheadError.message})`);
      } else {
        issues.ok('day-ahead', 'ComEd day-ahead prices read again');
      }
      const summary =
        `${snapshot.todaySamples.length} 5-minute prices today, ` +
        `day-ahead ${snapshot.forecastToday.length} hours today, ` +
        `${snapshot.forecastTomorrow.length} tomorrow`;
      if (!announced) {
        logger.info(`ComEd reachable: ${summary}`);
        announced = true;
      } else {
        logger.debug(`Prices read: ${summary}${changed ? ', new prices' : ''}`);
      }
      issues.ok('api', `ComEd answers again: ${summary}`);
      if (snapshot.stale) {
        issues.fail('stale', 'ComEd publishes no recent 5-minute price');
        await setStatus(false, TEXT.stale);
      } else {
        issues.ok('stale', 'ComEd publishes the 5-minute prices again');
        await setStatus(true);
      }
      if (changed) {
        refreshWidget();
      }
    } catch (err) {
      issues.fail('api', `ComEd refresh failed (${err.message}), last known prices kept`);
      await setStatus(false, TEXT.unreachable);
      if (force) {
        throw err;
      }
    }
  }

  async function publishStates(snapshot) {
    if (!deviceCreated()) {
      return;
    }
    try {
      const { count } = await gladys.publishChangedStates(buildStates(gladys, snapshot), {
        heartbeat: HEARTBEAT_MS,
      });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      issues.ok('states', 'States accepted by Gladys again');
    } catch (err) {
      issues.fail('states', `Publishing the states failed (${err.message})`);
    }
  }

  async function firePriceEvents(snapshot) {
    const { latest, currentHour } = snapshot;
    if (!latest || !currentHour) {
      return;
    }
    const at = latest.at.getTime();
    const previous = ledger.previous;
    if (previous !== null && at <= previous.at) {
      return;
    }
    const comparable =
      previous !== null && at - previous.at <= MAX_GAP_MS && now() - at <= LATE_EVENT_MS;
    // An average of one or two prices is a 5-minute price, not the hour's:
    // until the third, the thresholds keep judging the last average (a
    // baseline takes it as it is).
    const judged = currentHour.count >= MIN_PRICES_JUDGED || !comparable;
    const current = {
      at: latest.at,
      price: roundTenth(latest.price),
      average: judged ? roundTenth(currentHour.average) : previous.average,
      hourStart: hourOf(latest.at),
    };
    if (comparable) {
      const hour = current.hourStart.getTime();
      const events = eventsForPrice(previous, current);
      for (const event of events) {
        if (event.key !== 'negative_price' && ledger.firedThisHour(hour, event.id)) {
          continue;
        }
        try {
          await gladys.publishSceneEvent(event.key, event.data);
          ledger.markFired(hour, event.id);
          logger.debug(`Scene event ${event.id} (${event.data.time})`);
          issues.ok('scene', 'Scene events accepted by Gladys again');
        } catch (err) {
          // Not tried again: the next price is compared with this one.
          issues.fail('scene', `Firing the scene event ${event.key} failed (${err.message})`);
        }
      }
    } else {
      logger.debug(`5-minute price of ${latest.at.toISOString()} taken as the baseline`);
    }
    await ledger.setPrevious({ at, price: current.price, average: current.average });
  }

  async function announceTomorrow(snapshot) {
    const day = addDays(snapshot.today);
    if (snapshot.forecastTomorrow.length === 0 || ledger.announced(day)) {
      return;
    }
    // An afternoon notification: prices first seen late at night (installed
    // at 23:50, /data lost) are recorded silently.
    if (chicagoHour(snapshot.at) >= ANNOUNCE_UNTIL_HOUR) {
      await ledger.markAnnounced(day);
      return;
    }
    const event = tomorrowEvent(snapshot.forecastTomorrow);
    try {
      await gladys.publishSceneEvent(event.key, event.data);
      await ledger.markAnnounced(day);
      logger.debug(`Scene event ${event.key} (${day})`);
      issues.ok('scene', 'Scene events accepted by Gladys again');
    } catch (err) {
      // Tried again on the next cycle.
      issues.fail('scene', `Firing the scene event ${event.key} failed (${err.message})`);
    }
  }

  async function runCycle({ force = false } = {}) {
    lastCycleAt = now();
    const reason = force ? 'asked by the user' : market.dueReason();
    if (reason) {
      await refresh(reason, { force });
    }
    if (gladys.connected === false) {
      logger.debug('Gladys unreachable: nothing published');
      return;
    }
    const snapshot = market.snapshot();
    await publishStates(snapshot);
    await firePriceEvents(snapshot);
    await announceTomorrow(snapshot);
  }

  /**
   * One cycle; a second caller waits for the one in progress. A forced
   * refresh (the user's action) waits for it, then runs its own.
   */
  async function cycle(cycleOptions = {}) {
    while (running && cycleOptions.force) {
      await running.catch(() => {});
    }
    if (running) {
      return running;
    }
    running = runCycle(cycleOptions);
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  // The timer ticks 2 s after every minute.
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    const delay = MINUTE - (now() % MINUTE) + 2000;
    timer = setTimeout(async () => {
      timer = null;
      try {
        await cycle();
      } catch (err) {
        logger.error(`Refresh cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, delay);
  }

  async function publishDevice() {
    await gladys.publishDiscoveredDevices([buildDevice(gladys, config)]);
  }

  // --- Handlers ---------------------------------------------------------------

  gladys.onScanRequest(async () => {
    logger.debug('onScanRequest -> publishing the device');
    await publishDevice();
  });

  // The fallback: the core polls the device (when it does, Gladys#3198).
  gladys.onPoll(async () => {
    // Not before the scene ledger is loaded: an empty ledger would fire
    // events again.
    if (!initialized) {
      logger.debug('onPoll skipped: not initialized yet');
      return;
    }
    if (lastCycleAt !== null && now() - lastCycleAt < POLL_FALLBACK_MS) {
      logger.debug('onPoll skipped: the timer is running');
      return;
    }
    await cycle();
  });

  // The device was just added: the SDK forgot what it had published (Gladys
  // drops the states of a feature that did not exist yet), send it all now.
  const onDeviceChange = async () => {
    gladys.forgetPublishedStates();
    await publishStates(market.snapshot());
    refreshWidget();
  };
  gladys.onDeviceCreated(onDeviceChange);
  gladys.onDeviceUpdated(onDeviceChange);

  gladys.onAction('refresh', async () => {
    logger.info('Action refresh <- reading the prices now');
    try {
      await cycle({ force: true });
    } catch (err) {
      return MESSAGES.refreshFailed(err.message);
    }
    const snapshot = market.snapshot();
    const fresh = !snapshot.stale;
    return MESSAGES.refreshed({
      price: fresh ? snapshot.latest.price : null,
      average: fresh && snapshot.currentHour ? snapshot.currentHour.average : null,
      tomorrow: snapshot.forecastTomorrow.length > 0,
    });
  });

  gladys.onSceneAction(SCENE_ACTION.CHEAPEST_WINDOW, async (fields) => {
    await initializing;
    // Nothing known yet (the container just started, ComEd was down): one try.
    if (market.snapshot().forecast.length === 0) {
      await cycle();
    }
    const result = findCheapestWindow(market.snapshot(), fields);
    logger.info(
      `Scene action ${SCENE_ACTION.CHEAPEST_WINDOW} (${fields?.hours} h before ${fields?.before}) -> ` +
        (result.found ? `${result.start_time}-${result.end_time}` : 'no window'),
    );
    return result;
  });

  gladys.onWidgetGet(WIDGET.PRICES, async ({ language }) =>
    buildPricesContent({ snapshot: market.snapshot(), language }),
  );

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    config = normalizeConfig(newConfig);
    // The language only names the features of a device not added yet.
    await publishDevice();
  });

  gladys.on('connected', async () => {
    let done;
    if (!initialized) {
      initializing = new Promise((resolve) => {
        done = resolve;
      });
    }
    try {
      // Whatever was shown before the connection dropped, say it again.
      lastStatus = null;
      await ledger.load();
      config = normalizeConfig(await gladys.getConfig());
      initialized = true;
      done?.();
      await publishDevice();
      stopped = false;
      schedule();
      await cycle();
      // The nudges sent while the socket was down were dropped.
      refreshWidget();
    } catch (err) {
      logger.error(`Post-connection initialization failed (${err.message})`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    } finally {
      done?.();
    }
  });

  return {
    market,
    cycle,
    get config() {
      return config;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
