# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-24

### Added

- The ComEd Hourly Pricing device: the real-time 5-minute price, the average of
  the current hour (the billed price), today's average, lowest and highest hourly
  price, the day-ahead price of the current hour, tomorrow's day-ahead average,
  low and high, and "tomorrow's prices published". Supply price in ¢/kWh, Chicago
  time, from the public ComEd API: no account or key.
- The "ComEd electricity prices" dashboard widget: today's 5-minute prices and the
  day-ahead prices of today and tomorrow in a chart, the prices now, the cheapest
  hours.
- Scene triggers: the hourly price drops below or rises above a threshold, the
  price turns negative, tomorrow's prices are published.
- Scene action: find the cheapest run of N hours before a deadline, on the
  day-ahead prices.
- A "Refresh the prices now" button in the configuration.
- Feature names, texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-comed/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-comed/releases/tag/v1.0.0
