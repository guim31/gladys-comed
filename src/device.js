// -----------------------------------------------------------------------------
// The one device: ComEd Hourly Pricing.
//
// Its external id is built on the program ("hourly-pricing"), the only
// identity the prices have. Feature keys are forever, like the ids built on
// them.
//
// Every feature is a read-only `currency/decimal` sensor in cents/kWh, the
// unit ComEd speaks: Gladys has no cent unit, so the unit is left out and
// the name carries "¢/kWh" (a "$" unit would read 2.9 $ for 2.9 ¢).
// "Tomorrow published" is an `input/binary`.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { NAMES } from './i18n.js';
import { roundHundredth, roundTenth } from './prices.js';

const DEVICE_TYPE = 'comed';
const PROGRAM = 'hourly-pricing';

export const FEATURE = {
  PRICE_5MIN: 'price_5min',
  HOUR_AVERAGE: 'hour_average',
  AVERAGE_TODAY: 'average_today',
  MIN_HOUR_TODAY: 'min_hour_today',
  MAX_HOUR_TODAY: 'max_hour_today',
  FORECAST_NOW: 'forecast_now',
  TOMORROW_AVERAGE: 'tomorrow_average',
  TOMORROW_MIN: 'tomorrow_min',
  TOMORROW_MAX: 'tomorrow_max',
  TOMORROW_AVAILABLE: 'tomorrow_available',
};

// Display bounds only (the core never applies them): real-time prices go
// negative, and spike well above 20 ¢ on hot summer afternoons.
const PRICE_BOUNDS = { min: -10, max: 50 };
const BINARY_BOUNDS = { min: 0, max: 1 };

/** @param {object} gladys */
export function deviceIds(gladys) {
  return gladys.externalIds(DEVICE_TYPE, PROGRAM);
}

/**
 * @param {object} gladys
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 */
export function buildDevice(gladys, config) {
  const ids = deviceIds(gladys);
  const names = NAMES[config.language] ?? NAMES.en;
  const sensor = (key, category, type, bounds) => ({
    name: names[key],
    external_id: ids.feature(key),
    category,
    type,
    ...bounds,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  });
  const price = (key) =>
    sensor(
      key,
      DEVICE_FEATURE_CATEGORIES.CURRENCY,
      DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
      PRICE_BOUNDS,
    );

  return {
    name: 'ComEd Hourly Pricing',
    external_id: ids.device,
    model: 'Hourly Pricing',
    // Polled once a minute by the core when it does (Gladys#3198: often not):
    // the container's own timer does the work, onPoll is the fallback.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [
      price(FEATURE.PRICE_5MIN),
      price(FEATURE.HOUR_AVERAGE),
      price(FEATURE.AVERAGE_TODAY),
      price(FEATURE.MIN_HOUR_TODAY),
      price(FEATURE.MAX_HOUR_TODAY),
      price(FEATURE.FORECAST_NOW),
      price(FEATURE.TOMORROW_AVERAGE),
      price(FEATURE.TOMORROW_MIN),
      price(FEATURE.TOMORROW_MAX),
      sensor(
        FEATURE.TOMORROW_AVAILABLE,
        DEVICE_FEATURE_CATEGORIES.INPUT,
        DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        BINARY_BOUNDS,
      ),
    ],
  };
}

/**
 * The states of the device for a snapshot. A value the snapshot does not
 * know is left out: the feature keeps its last state rather than receiving
 * a made-up one. A stale real-time feed publishes no "now" value.
 * @param {object} gladys
 * @param {ReturnType<ReturnType<import('./market.js').createMarket>['snapshot']>} snapshot
 */
export function buildStates(gladys, snapshot) {
  const ids = deviceIds(gladys);
  const states = [];
  const number = (key, value) =>
    states.push({ device_feature_external_id: ids.feature(key), state: value });

  if (!snapshot.stale) {
    number(FEATURE.PRICE_5MIN, roundTenth(snapshot.latest.price));
    if (snapshot.currentHour) {
      number(FEATURE.HOUR_AVERAGE, roundTenth(snapshot.currentHour.average));
    }
  }
  if (snapshot.todayAverage !== null) {
    number(FEATURE.AVERAGE_TODAY, roundHundredth(snapshot.todayAverage));
  }
  if (snapshot.todaySummary) {
    number(FEATURE.MIN_HOUR_TODAY, roundTenth(snapshot.todaySummary.min.average));
    number(FEATURE.MAX_HOUR_TODAY, roundTenth(snapshot.todaySummary.max.average));
  }
  if (snapshot.forecastNow) {
    number(FEATURE.FORECAST_NOW, roundTenth(snapshot.forecastNow.price));
  }
  if (snapshot.tomorrowSummary) {
    number(FEATURE.TOMORROW_AVERAGE, roundHundredth(snapshot.tomorrowSummary.average));
    number(FEATURE.TOMORROW_MIN, roundTenth(snapshot.tomorrowSummary.min.price));
    number(FEATURE.TOMORROW_MAX, roundTenth(snapshot.tomorrowSummary.max.price));
  }
  // Only once ComEd answered for today: before that, "not published" would be
  // a guess. The tomorrow values keep their last state until the next ones.
  if (snapshot.forecastToday.length > 0) {
    number(FEATURE.TOMORROW_AVAILABLE, snapshot.forecastTomorrow.length > 0 ? 1 : 0);
  }
  return states;
}
