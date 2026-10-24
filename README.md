# ComEd Hourly Pricing for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for **ComEd Hourly
Pricing**, the real-time electricity rate of ComEd (Commonwealth Edison, Northern
Illinois): the 5-minute price, the average of the current hour (the price Hourly
Pricing customers are billed), the day's lows and highs, tomorrow's day-ahead prices,
a price chart, scene triggers and a scene action to run appliances when electricity
is cheapest. No account, no API key.

Tested against the live ComEd API; not yet on the Gladys of a real Hourly Pricing
customer: feedback welcome. Not affiliated with ComEd.

## Features

- **One device, read-only**, in ¢/kWh (supply price, Chicago time): 5-minute price,
  current hour average, today's average, lowest and highest hourly price today,
  day-ahead price of the current hour, tomorrow's day-ahead average, low and high,
  "tomorrow's prices published".
- **Dashboard widget** "ComEd electricity prices": tiles for the 5-minute price, the
  hour average and today's average, a step chart of today's 5-minute prices and of
  the day-ahead prices of today and tomorrow, the cheapest hours.
- **Scene triggers**: "The hourly price drops below a threshold", "The hourly price
  rises above a threshold" (0 to 20 ¢/kWh, on the average of the current hour, at
  most once an hour), "The price turns negative", "Tomorrow's prices are published"
  (in the afternoon, with tomorrow's summary).
- **Scene action** "Find the cheapest hours before a deadline": the cheapest run of N
  hours finished before a given time, on the day-ahead prices (`starts_now`,
  `start_time`, `minutes_to_start`...).
- Feature names, widget and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- Internet access from Gladys to `hourlypricing.comed.com`.

## Installation

In Gladys: **Integrations → Install from GitHub**, enter
`https://github.com/guim31/gladys-comed`. Add the ComEd Hourly Pricing device from
the **Discovery** tab, and the "ComEd electricity prices" widget on a dashboard.

The user documentation, in four languages, is in [`docs/`](docs/en.md).

## How it works

The container reads `GET https://hourlypricing.comed.com/api?type=5minutefeed` (the
5-minute prices of the last 24 hours) when the next price should be out, about once
every 5 minutes, and `?type=daynexttoday&date=YYYYMMDD` for the day-ahead prices of
today and, from noon (Chicago), tomorrow. The current hour average is computed from
the feed exactly as ComEd's `currenthouraverage` does (checked on real answers). A
timer in the container refreshes the states every minute (the core's `onPoll` is
only a fallback, Gladys#3198), publishes only what changed (plus a 6-hour heartbeat)
and compares each new 5-minute price with the previous one for the scene triggers.
The last known prices stay in use while ComEd is unreachable.

## Limitations

- Supply price only, as ComEd publishes it: no delivery, capacity charges or taxes.
- The day-ahead prices are a forecast; the bill uses the real-time hourly average.
- Hours in Chicago time, whatever the timezone of Gladys.
- Read-only: the integration controls nothing.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test, against the SDK's fake Gladys and a fake ComEd API
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
node scripts/probe.mjs                            # the real prices (network)
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture and the project rules.

## Credits

- Prices: [ComEd Hourly Pricing](https://hourlypricing.comed.com) public API. The
  test fixtures in `test/fixtures/comed/` are real answers of this API.
- The design follows the Home Assistant `comed_hourly_pricing` integration (Apache
  2.0), read for the API; no code is copied.
- Cover: the ComEd logo from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:ComEd_logo.png)
  (public domain, source Exelon), a trademark of Commonwealth Edison Company.
- The structure, triggers, scene action and widget come from
  [gladys-pvpc](https://github.com/guim31/gladys-pvpc).

## License

[Apache-2.0](LICENSE). ComEd and Hourly Pricing are names of their owners; this
project is not affiliated with Commonwealth Edison Company or Exelon.
