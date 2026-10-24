// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): today's prices and the
// price now.
//
// Inline values, not device-bound tiles: the widget works before the device is
// added, and an inline tile shows "¢/kWh" where a device tile could not.
// Layout, within the core budget (8 components, 2 texts, one status):
//   caption   what the price is (supply price, ¢/kWh, Chicago time)
//   tiles     last 5-minute price, current hour average, today's average
//   chart     today's real-time 5-minute prices, and the day-ahead prices of
//             today and tomorrow (step lines: a price holds for its period),
//             today's cheapest and dearest hours marked, "now" drawn by the
//             core
//   status    cheapest day-ahead hour left today, tomorrow's cheapest hour
//             and average (or when they are expected)
// -----------------------------------------------------------------------------

import { WIDGET_CHART_TYPES, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { decimal, pick, TEXT } from './i18n.js';
import { FIVE_MINUTES, roundHundredth, roundTenth } from './prices.js';
import { chicagoTime } from './time.js';

export const WIDGET = { PRICES: 'prices' };
const UNIT = '¢/kWh';
// The core keeps 300 points a series: a 25-hour day has exactly 300 prices.
const MAX_POINTS = 300;

/**
 * Seconds until the next 5-minute price should be there, within the core
 * bounds.
 * @param {Date} at
 */
function ttlSeconds(at) {
  const toNext = 300 - Math.floor((at.getTime() % FIVE_MINUTES) / 1000);
  return Math.min(300, Math.max(30, toNext + 60));
}

/**
 * @param {object} options
 * @param {ReturnType<ReturnType<import('./market.js').createMarket>['snapshot']>} options.snapshot
 * @param {string} options.language the user's language, sent by the core
 */
export function buildPricesContent({ snapshot, language }) {
  const t = (text) => pick(text, language);
  const { latest, stale, currentHour, todaySamples, todaySummary, forecast } = snapshot;

  if (latest === null && forecast.length === 0) {
    return {
      ttl_seconds: 120,
      components: [{ type: 'text', variant: 'body', text: t(TEXT.noPrices) }],
    };
  }

  const components = [{ type: 'text', variant: 'caption', text: t(TEXT.caption) }];
  const tile = (label, value, icon) => {
    if (value !== null && value !== undefined) {
      components.push({ type: 'value', label: t(label), value, unit: UNIT, icon });
    }
  };
  if (latest && !stale) {
    tile(TEXT.fiveMinutes, roundTenth(latest.price), 'zap');
    tile(TEXT.hourAverage, currentHour ? roundTenth(currentHour.average) : null, 'clock');
  }
  tile(
    TEXT.todayAverage,
    snapshot.todayAverage === null ? null : roundHundredth(snapshot.todayAverage),
    'activity',
  );

  const series = [];
  if (todaySamples.length > 0) {
    series.push({
      name: t(TEXT.realTime),
      // A 5-minute price is stamped at the end of its 5 minutes.
      points: todaySamples.slice(-MAX_POINTS).map((sample) => ({
        t: new Date(sample.at.getTime() - FIVE_MINUTES).toISOString(),
        v: roundTenth(sample.price),
      })),
    });
  }
  if (forecast.length > 0) {
    series.push({
      name: t(TEXT.dayAhead),
      points: forecast.map((slot) => ({ t: slot.start.toISOString(), v: roundTenth(slot.price) })),
    });
  }
  const annotations = [];
  if (todaySummary) {
    annotations.push(
      {
        t: todaySummary.min.start.toISOString(),
        value: roundTenth(todaySummary.min.average),
        label: `${t(TEXT.min)} ${chicagoTime(todaySummary.min.start)}`,
        color: WIDGET_COLORS.SUCCESS,
      },
      {
        t: todaySummary.max.start.toISOString(),
        value: roundTenth(todaySummary.max.average),
        label: `${t(TEXT.max)} ${chicagoTime(todaySummary.max.start)}`,
        color: WIDGET_COLORS.DANGER,
      },
    );
  }
  if (series.length > 0) {
    components.push({
      type: 'chart',
      chart_type: WIDGET_CHART_TYPES.STEPLINE,
      unit: UNIT,
      series,
      annotations,
      now_marker: true,
    });
  }

  const items = [];
  const cheapest = (summary) =>
    `${chicagoTime(summary.min.start)} · ${decimal(summary.min.price, language)} ${UNIT}`;
  if (stale && latest) {
    items.push({
      label: t(TEXT.lastPrice),
      value: `${chicagoTime(latest.at)} · ${decimal(latest.price, language)} ${UNIT}`,
      icon: 'alert-triangle',
      color: WIDGET_COLORS.WARNING,
    });
  }
  if (snapshot.forecastRemaining) {
    items.push({
      label: t(TEXT.cheapestLeft),
      value: cheapest(snapshot.forecastRemaining),
      icon: 'trending-down',
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  if (snapshot.tomorrowSummary) {
    items.push(
      {
        label: t(TEXT.cheapestTomorrow),
        value: cheapest(snapshot.tomorrowSummary),
        icon: 'trending-down',
        color: WIDGET_COLORS.SUCCESS,
      },
      {
        label: t(TEXT.tomorrowAverage),
        value: `${decimal(snapshot.tomorrowSummary.average, language)} ${UNIT}`,
        icon: 'activity',
        color: WIDGET_COLORS.INFO,
      },
    );
  } else {
    items.push({
      label: t(TEXT.tomorrow),
      value: t(TEXT.tomorrowPending),
      icon: 'clock',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({ type: 'status', items });

  return { ttl_seconds: ttlSeconds(snapshot.at), components };
}
