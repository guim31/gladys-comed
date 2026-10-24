# ComEd Hourly Pricing

The real-time electricity prices of **ComEd Hourly Pricing** in Gladys: the
5-minute price, the average of the current hour (the price you are billed), the
day's lows and highs, tomorrow's day-ahead prices, a price chart, scene triggers
and a scene action to run your appliances when electricity is cheapest.

The prices come from the public API of [ComEd](https://hourlypricing.comed.com).
This integration is not affiliated with ComEd. It was tested against the live
ComEd API, but not yet on a real Gladys of an Hourly Pricing customer: feedback
welcome.

## Overview

Hourly Pricing is an optional rate of ComEd (Commonwealth Edison, Northern
Illinois): instead of a fixed price, the supply price follows the PJM wholesale
market hour by hour. ComEd publishes, without account or key:

- a **real-time price every 5 minutes**;
- the **day-ahead prices**: one price per hour, set the day before by the PJM
  market. Tomorrow's arrive in the afternoon. They are a forecast: what you are
  billed is the real-time hourly average.

All prices are the **supply price in cents per kWh** (¢/kWh), like on the ComEd
website and in the Home Assistant `comed_hourly_pricing` integration: delivery,
capacity charges and taxes are not included. They can be negative.

The hours are **Chicago time**, whatever the timezone of your Gladys.

## Requirements

- Gladys Assistant 5.1.0 or later.
- Internet access from Gladys to `hourlypricing.comed.com`.
- Nothing else: no account, no API key, no hardware. You do not even need to be a
  ComEd customer to follow the prices.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-comed`.
2. Open the integration, choose the language of the feature names, save.
3. Open the **Discovery** tab and add the **ComEd Hourly Pricing** device.
4. Add the **ComEd electricity prices** widget to a dashboard.

## Configuration

- **Language of the feature names**: English, French, German or Spanish. It
  names the features when the device is added; the names do not change
  afterwards.
- The **Refresh the prices now** button reads ComEd at once and shows the latest
  5-minute price, the current hour average and whether tomorrow's prices are out.

## The ComEd device

Every feature is a read-only sensor in ¢/kWh, kept in the history:

| Feature                                 | What it is                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| 5-minute price                          | The last real-time price, published about 6 minutes after its 5 minutes          |
| Current hour average                    | The average of the 5-minute prices of the hour so far: the billed price          |
| Average price today                     | The average of today's 5-minute prices                                           |
| Lowest / highest hourly price today     | The lowest and highest hourly average since midnight (an hour counts from HH:15) |
| Day-ahead price this hour               | The forecast for the current hour                                                |
| Tomorrow's day-ahead average, low, high | Tomorrow's forecast, from the afternoon                                          |
| Tomorrow's prices published             | 1 once tomorrow's day-ahead prices are out, 0 before                             |

Tomorrow's average, low and high keep their last value until the next day's
prices come out: check **Tomorrow's prices published** before using them in the
morning.

When ComEd stops publishing 5-minute prices for 30 minutes, the integration
stops updating the 5-minute price and the current hour average, and says so in
the configuration screen.

## Dashboard widget

The **ComEd electricity prices** widget shows:

- the last 5-minute price, the current hour average and today's average;
- a chart of today's real-time 5-minute prices and of the day-ahead prices of
  today and tomorrow, with today's cheapest and most expensive hours marked;
- the cheapest day-ahead hour left today, tomorrow's cheapest hour and average,
  or when tomorrow's prices are expected.

It works even before the device is added.

## Scene triggers

### The hourly price drops below a threshold

Fires when the **average of the current hour** goes under the threshold you
choose (0 to 20 ¢/kWh), having been at or above it. The average is judged from
its third 5-minute price (HH:15): at HH:05 it is a single price, too volatile. It
fires at most once an hour per threshold. Variables: the hour average, the
5-minute price, the hour (HH:MM) and the time of the price.

### The hourly price rises above a threshold

The same, upward: to stop a heat pump or a charger during a price spike.

### The price turns negative

Fires when a 5-minute price goes below zero after one at or above zero. Same
variables.

### Tomorrow's prices are published

Fires once a day, in the afternoon, when ComEd publishes tomorrow's day-ahead
prices (not after 23:00). Variables: average, lowest and highest price, the
cheapest and most expensive hours, and the start of the cheapest 3 hours.

## Scene action

**Find the cheapest hours before a deadline** looks, in the day-ahead prices,
for the cheapest run of 1 to 8 consecutive hours from now that ends before the
chosen hour (Chicago time), or without a deadline. Outputs: whether a window was
found, whether it starts now, its start and end (HH:MM), its average price and
the minutes until it starts. In the morning, before tomorrow's prices are out,
only today's hours are searched.

## Scene examples

- **Dishwasher**: every evening at 21:00, find the cheapest 2 hours before 07:00;
  if the window starts now, start the smart plug, otherwise wait
  `minutes_to_start` minutes.
- **Price spike**: when the hourly price rises above 10 ¢/kWh, switch off the
  water heater and send a message; switch it on again when it drops below 5.
- **Negative prices**: when the price turns negative, start the electric car
  charger.

## Refresh and API usage

The integration reads the 5-minute feed (the last 24 hours, about 13 kB) when
the next price should be out: about once every 5 minutes, every 10 minutes at
least. Today's day-ahead prices are read once a day, tomorrow's every 30 minutes
from noon until they are out. After a failure it waits 1, 2, 5, 10 then 15
minutes. It is about 300 small requests a day to a public API that asks for no
key.

## Troubleshooting

- **No value, "ComEd cannot be reached"**: check that Gladys can reach
  `hourlypricing.comed.com`; the last known prices stay in use meanwhile.
- **"no 5-minute price for 30 minutes"**: ComEd stopped publishing; it happens
  during their maintenance. The integration carries on by itself.
- **A trigger did not fire**: the hourly average is judged from HH:15, and a
  threshold must be crossed (an hour that starts and stays under it after
  another under it fires nothing).
- Set `LOG_LEVEL=debug` to see every request in the integration logs.

## Limitations

- Developed without being a ComEd customer: the prices are checked against the
  ComEd website and API, not against a bill.
- Supply price only: no delivery, capacity or taxes, so not your full cost per
  kWh.
- The day-ahead prices are a forecast; the scene action plans on them, the
  real-time price may differ.
- The day the clocks go back, ComEd publishes one 01:00 day-ahead price for the two 01:00 hours: both get it. The 24-hour feed may also miss the first hour of that 25-hour day.
