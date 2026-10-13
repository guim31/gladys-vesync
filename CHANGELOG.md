# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-13

### Added

- Levoit air purifiers through the VeSync cloud (Core 200S, 300S, 400S, 600S,
  Vital 100S, 200S, EverestAir, Sprout Air): on/off, mode (auto, manual,
  sleep, pet, turbo), fan speed, PM2.5, filter life, child lock, display.
- Levoit humidifiers (Classic 200S, 300S, Dual 200S, LV600S, OasisMist 450S,
  1000S, Superior 6000S, Sprout): on/off, measured humidity, target humidity,
  mode, mist level, water tank state.
- Etekcity plugs: on/off for the ESW10; on/off, power, voltage and energy of
  the day for the 10 A (ESW01, ESW03) and 15 A ones.
- Scene triggers "Purifier filter to replace" (threshold set in the
  configuration) and "Humidifier tank empty", fired once each time.
- "VeSync air quality" dashboard widget: PM2.5 and humidity tiles, one status
  row per device (air quality, mode, empty tank, worn filter, offline).
- "Test the connection" button: what the account holds, the models not
  supported, the account's region; the error in red when it fails.
- The devices are read every minute by default (adjustable), only the changes
  are sent to Gladys, and the session is kept in `/data` across restarts.
- Feature names and mode lists in English, French, German and Spanish;
  documentation in the four languages.

[Unreleased]: https://github.com/guim31/gladys-vesync/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-vesync/releases/tag/v1.0.1
