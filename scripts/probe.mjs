// -----------------------------------------------------------------------------
// Read the real ComEd prices, read-only, through the client the integration
// uses — to run from a machine that has the network:
//
//   node scripts/probe.mjs
//
// No account, no key, nothing sensitive: public prices.
// -----------------------------------------------------------------------------

import { fetchDayAhead, fetchFiveMinutePrices } from '../src/comed.js';
import { hourlyAverages, roundTenth, summarize } from '../src/prices.js';
import { addDays, chicagoDay, chicagoTime } from '../src/time.js';

try {
  const started = Date.now();
  const samples = await fetchFiveMinutePrices();
  const last = samples.at(-1);
  const hour = hourlyAverages(samples).at(-1);
  console.log(
    `5-minute feed: ${samples.length} prices in ${Date.now() - started} ms, last ` +
      `${last ? `${last.price} ¢/kWh at ${chicagoTime(last.at)}` : 'none'}, current hour ` +
      `average ${hour ? roundTenth(hour.average) : '-'} ¢/kWh (${hour?.count ?? 0} prices)`,
  );
  const today = chicagoDay(new Date());
  for (const day of [today, addDays(today)]) {
    const slots = await fetchDayAhead(day);
    const summary = summarize(slots);
    console.log(
      `day-ahead ${day}: ${slots.length} hours` +
        (summary
          ? `, avg ${roundTenth(summary.average)}, min ${summary.min.price} at ` +
            `${chicagoTime(summary.min.start)}, max ${summary.max.price} at ` +
            `${chicagoTime(summary.max.start)}`
          : ''),
    );
  }
} catch (err) {
  console.log(`FAILED (${err.kind ?? 'error'}) ${err.message}`);
  process.exit(1);
}
