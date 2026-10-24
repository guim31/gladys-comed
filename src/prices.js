// -----------------------------------------------------------------------------
// Pure computations on prices: no I/O, no clock. Everything the device, the
// widget, the triggers and the scene action read comes from here.
//
//   samples   real-time 5-minute prices `{ at: Date, price }`, `at` being the
//             END of the 5 minutes (ComEd's stamp);
//   hours     real-time hourly averages `{ start, end, average, count }`: what
//             Hourly Pricing customers are billed, the average of the twelve
//             5-minute prices stamped after HH:00 up to HH+1:00 included;
//   slots     day-ahead hourly prices `{ start, end, price }` (the forecast).
// -----------------------------------------------------------------------------

import { chicagoDay } from './time.js';

const HOUR = 60 * 60 * 1000;
export const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * The start of the hour a 5-minute price counts in: the one its 5 minutes
 * fall in (a price stamped 15:00 closes the 14:00 hour).
 * @param {Date} at
 */
export function hourOf(at) {
  return new Date(Math.floor((at.getTime() - 1) / HOUR) * HOUR);
}

/**
 * Group the samples into hourly averages, oldest first.
 * @param {Array<{ at: Date, price: number }>} samples sorted
 */
export function hourlyAverages(samples) {
  const hours = new Map();
  for (const sample of samples) {
    const start = hourOf(sample.at).getTime();
    const hour = hours.get(start) ?? {
      start: new Date(start),
      end: new Date(start + HOUR),
      sum: 0,
      count: 0,
    };
    hour.sum += sample.price;
    hour.count += 1;
    hours.set(start, hour);
  }
  return [...hours.values()].map(({ start, end, sum, count }) => ({
    start,
    end,
    average: sum / count,
    count,
  }));
}

/**
 * The samples whose 5 minutes belong to the Chicago day `day`.
 * @param {Array<{ at: Date }>} samples
 * @param {string} day `YYYY-MM-DD`
 */
export function samplesOfDay(samples, day) {
  return samples.filter((sample) => chicagoDay(hourOf(sample.at)) === day);
}

/**
 * The hours or slots starting on the Chicago day `day`.
 * @param {Array<{ start: Date }>} list
 * @param {string} day `YYYY-MM-DD`
 */
export function startingOn(list, day) {
  return list.filter((item) => chicagoDay(item.start) === day);
}

/**
 * Average, cheapest and most expensive entry. On a tie the earliest wins:
 * the one a scene can still use.
 * @param {Array} list
 * @param {(item: any) => number} value
 * @returns {{ average: number, min: any, max: any } | null}
 */
export function summarize(list, value = (item) => item.price) {
  if (list.length === 0) {
    return null;
  }
  let min = list[0];
  let max = list[0];
  let sum = 0;
  for (const item of list) {
    sum += value(item);
    if (value(item) < value(min)) {
      min = item;
    }
    if (value(item) > value(max)) {
      max = item;
    }
  }
  return { average: sum / list.length, min, max };
}

/**
 * The slot running at `at`.
 * @param {Array<{ start: Date, end: Date }>} slots
 * @param {Date} at
 */
export function slotAt(slots, at) {
  return slots.find((slot) => slot.start <= at && at < slot.end) ?? null;
}

/**
 * The cheapest run of `hours` consecutive slots (no gap between them).
 * On a tie the earliest run wins.
 * @param {Array<{ start: Date, end: Date, price: number }>} slots sorted
 * @param {number} hours
 * @returns {{ start: Date, end: Date, average: number } | null}
 */
export function cheapestWindow(slots, hours) {
  let best = null;
  for (let first = 0; first + hours <= slots.length; first += 1) {
    const run = slots.slice(first, first + hours);
    const contiguous = run.every(
      (slot, index) => index === 0 || slot.start.getTime() === run[index - 1].end.getTime(),
    );
    if (!contiguous) {
      continue;
    }
    const average = run.reduce((sum, slot) => sum + slot.price, 0) / hours;
    if (best === null || average < best.average - 1e-9) {
      best = { start: run[0].start, end: run[hours - 1].end, average };
    }
  }
  return best;
}

/**
 * Round to a tenth of a cent, like ComEd shows its prices (and its hourly
 * average). The epsilon keeps 2.65 from becoming 2.6 through 2.6499999.
 * @param {number} value
 */
export function roundTenth(value) {
  return Math.round((value + Math.sign(value) * 1e-9) * 10) / 10;
}

/**
 * Round an average over many hours to a hundredth of a cent.
 * @param {number} value
 */
export function roundHundredth(value) {
  return Math.round((value + Math.sign(value) * 1e-9) * 100) / 100;
}
