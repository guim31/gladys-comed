// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`, Gladys 5.1+).
//
// What the device states cannot say: "it happens NOW". Each new 5-minute
// price is compared with the one before it:
//
//   hour_average_below   the average of the hour in progress (the billed
//                        price) goes under a threshold: it was at or above it
//                        with the previous price;
//   hour_average_above   it goes over a threshold;
//   negative_price       the 5-minute price turns negative;
//   tomorrow_prices_published  tomorrow's day-ahead prices are out (fired by
//                        src/app.js, once a day).
//
// At HH:05 the average restarts from one price: src/app.js judges it from
// its third price (HH:15) on, against the last average judged, often the one
// of the hour before, so a cheap hour that follows a cheap hour fires
// nothing. An average that wobbles around a threshold fires at most once an
// hour per threshold and direction.
//
// The core filters scene events on equality and membership only, so the
// scene author picks the threshold in a required select, and the integration
// fires one event per threshold crossed: an average falling from 5.2 to 2.8
// sends "below" for 5, 4 and 3.
// -----------------------------------------------------------------------------

import { cheapestWindow, roundTenth, summarize } from './prices.js';
import { chicagoTime } from './time.js';

export const TRIGGER = {
  BELOW: 'hour_average_below',
  ABOVE: 'hour_average_above',
  NEGATIVE: 'negative_price',
  TOMORROW_PUBLISHED: 'tomorrow_prices_published',
};

/** The thresholds the scene author can pick (cents/kWh), as in the manifest. */
export const THRESHOLDS = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '15', '20'];

/**
 * The events a new 5-minute price fires.
 * @param {{ at: Date, price: number, average: number }} previous
 * @param {{ at: Date, price: number, average: number | null, hourAverage?: number, hourStart: Date }} current
 *   `average` is the hourly average judged (null: not yet), `hourAverage`
 *   the running one, sent in the event data
 * @returns {Array<{ key: string, data: object, id: string }>} `id` tells
 *   apart the events to fire once an hour
 */
export function eventsForPrice(previous, current) {
  const events = [];
  const common = {
    hour_average: current.hourAverage ?? current.average,
    price: current.price,
    hour_start: chicagoTime(current.hourStart),
    time: chicagoTime(current.at),
  };
  // No average judged yet on one side (a baseline at HH:05): no threshold.
  const judged = previous.average !== null && current.average !== null;
  for (const threshold of judged ? THRESHOLDS : []) {
    const limit = Number(threshold);
    if (current.average < limit && previous.average >= limit) {
      events.push({ key: TRIGGER.BELOW, id: `below:${threshold}`, data: { threshold, ...common } });
    }
    if (current.average > limit && previous.average <= limit) {
      events.push({ key: TRIGGER.ABOVE, id: `above:${threshold}`, data: { threshold, ...common } });
    }
  }
  if (current.price < 0 && previous.price >= 0) {
    events.push({ key: TRIGGER.NEGATIVE, id: 'negative', data: common });
  }
  return events;
}

/**
 * The event saying tomorrow's day-ahead prices are out.
 * @param {Array<{ start: Date, end: Date, price: number }>} slots
 * @returns {{ key: string, data: object } | null}
 */
export function tomorrowEvent(slots) {
  const summary = summarize(slots);
  if (!summary) {
    return null;
  }
  const window = cheapestWindow(slots, 3);
  return {
    key: TRIGGER.TOMORROW_PUBLISHED,
    data: {
      average_price: roundTenth(summary.average),
      min_price: roundTenth(summary.min.price),
      cheapest_time: chicagoTime(summary.min.start),
      max_price: roundTenth(summary.max.price),
      priciest_time: chicagoTime(summary.max.start),
      cheapest_3h_start: window ? chicagoTime(window.start) : '',
    },
  };
}
