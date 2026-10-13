# VeSync (Levoit) for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that drives the
devices of the **VeSync** app through the VeSync cloud: **Levoit air purifiers and
humidifiers**, and **Etekcity smart plugs**. It is a port to Node.js of
[pyvesync](https://github.com/webdjoe/pyvesync), the library of the Home Assistant `vesync`
integration.

> **Developed without the hardware: feedback welcome.** No VeSync device nor account was
> available: the requests are compared field by field with the ones pyvesync records in its
> tests, and the answers come from pyvesync's and Home Assistant's test fixtures. Please
> [open an issue](https://github.com/guim31/gladys-vesync/issues) with what works and what does
> not.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md).

## Features

- **Air purifiers** — Core 200S, 300S, 400S, 600S, Vital 100S, 200S, EverestAir, Sprout Air:
  on/off, mode (auto, manual, sleep, pet, turbo, depending on the model), fan speed, PM2.5,
  filter life, child lock, display.
- **Humidifiers** — Classic 200S, 300S, Dual 200S, LV600S, OasisMist 450S, 1000S, Superior 6000S,
  Sprout: on/off, measured humidity, target humidity (30 to 80 %), mode, mist level, water tank
  state.
- **Plugs** — Etekcity ESW10 (on/off), 10 A ESW01/ESW03 and 15 A ESW15 (on/off, power, voltage,
  energy of the day).
- **Scene triggers** — "Purifier filter to replace" (threshold in the configuration) and
  "Humidifier tank empty", each fired once per change, with the device name as a variable.
- **Dashboard widget** — "VeSync air quality": PM2.5 and humidity tiles, one status row per device
  (air quality, mode, empty tank, worn filter, offline).
- **Test the connection** — what the account holds, the models not supported, the account's
  region; the error in red when it fails.
- Feature names and texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- A VeSync account (e-mail and password) with the devices set up in the VeSync app.
- Internet access from Gladys (`smartapi.vesync.eu`, `smartapi.vesync.com`).

## Installation

In Gladys: **Integrations → Install from GitHub**, then paste
`https://github.com/guim31/gladys-vesync`. Enter the VeSync e-mail and password in the
Configuration tab, click **Test the connection**, and add the devices from the **Discover** tab.

## How it works

- **Login** in two steps, as the app does: the e-mail and the MD5 of the password for an
  authorization code (`authByPWDOrOTM`), the code for a token (`loginByAuthorizeCode4Vesync`). An
  account on the other regional server answers a cross-region error: the exchange is retried
  there. The token is kept in `/data/vesync-session.json` (mode 600) across restarts and renewed
  when it expires.
- **Devices** from `/cloud/v1/deviceManaged/devices`; purifiers, humidifiers and the ESW10 through
  `bypassV2` (`getPurifierStatus`, `getHumidifierStatus`, `setSwitch`, `setLevel`...), the 10 A
  and 15 A plugs through `deviceDetail` / `deviceStatus`.
- **Refresh**: the container reads the devices added to Gladys on its own timer, every
  60 seconds by default (the pace of the Home Assistant integration; VeSync publishes no quota),
  one after the other; the core's poll is only a fallback (Gladys#3198). Only the changed states
  are published, each one again after 12 hours.
- An offline device turns its badge **unreachable**; a cloud that does not answer sets the
  connection status; a refused password stops every request until the configuration changes.
- **Logs** are quiet: the start, the losses and returns, one line per command. `LOG_LEVEL=debug`
  shows the rest. Never the password, its hash, the token nor the e-mail.

## Limitations

- Developed without the hardware (see above).
- Not supported: fans, bulbs, wall switches, air fryers, thermostats, the LV-PUR131S and
  LV-RH131S purifiers, 7 A, outdoor and partner-brand plugs. Simple to add later when someone can
  test them.
- No timers, schedules, night light, warm mist, drying, filter reset.
- Gladys has no humidity setpoint: the target humidity is a list of values (`text/select`). The
  modes are lists too: the 5.2 front shows `fan/mode` without honouring per-device options.
- Cloud only: without Internet, nothing works.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test, against the SDK's fake Gladys and a fake VeSync cloud
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js                  SDK wiring (src/app.js registers the handlers)
src/app.js                handlers → hub
src/hub.js                device list, own polling timer, states, commands, triggers, statuses
src/devices/              purifier.js, humidifier.js, outlet.js: features, parsing, commands
src/vesync/client.js      VeSync cloud client (login, device list, bypassV2, v1 outlets)
src/vesync/models.js      supported models and their API family
src/vesync/errors.js      VeSync error codes
src/vesync/session.js     the session kept in /data
src/widgets.js            "VeSync air quality" widget
src/scenes.js             scene triggers
src/i18n.js               texts in four languages
scripts/probe.mjs         read-only check of a real account (nothing sensitive printed)
test/fixtures/            pyvesync (MIT) and Home Assistant (Apache-2.0) recorded answers
```

`test/gladys-rules.test.js` checks every device against the category/type table extracted from
the Gladys core; `test/client.test.js` compares every request with pyvesync's recorded ones.

To check the client against the real service, without Gladys and without changing anything on
the devices:

```bash
VESYNC_EMAIL="you@example.com" VESYNC_PASSWORD="…" VESYNC_REGION=eu node scripts/probe.mjs
```

Releases are made by the **Release** workflow (Actions → Release); never edit the versions by
hand. A hand-pushed `vX.Y.Z` tag also builds the image and the GitHub Release, but then `version`
in `package.json` and in the manifest (with the `docker_image` tag) must be bumped and committed
before tagging. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [pyvesync](https://github.com/webdjoe/pyvesync) by Mark Perdue and contributors (MIT): the
  VeSync cloud protocol (login, request fields, error codes, models and their API families) is
  ported from it, and `test/fixtures/pyvesync/` holds the answers and requests of its test suite.
- Home Assistant's
  [`vesync`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/vesync)
  integration (Apache-2.0): the reference behaviour (one read a minute, energy of the day, the
  sensors exposed) and the answers in `test/fixtures/home-assistant/`.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by VeSync, Levoit or Etekcity. The
names are the trademarks of their owners.

## License

Apache-2.0
