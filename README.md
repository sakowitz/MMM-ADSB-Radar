# MMM-ADSB-Radar

A MagicMirror module for a Tiny Desk Radar-style ADS-B view: nearby aircraft plotted on a classic radar scope, with an optional list view and built-in demo traffic.

It is designed for common local receiver feeds such as Flightradar24 Pi24, dump1090, readsb, tar1090, and graphs1090 endpoints.

## Install

Copy this folder into your MagicMirror `modules` directory:

```bash
MagicMirror/modules/MMM-ADSB-Radar
```

Then add the module to `MagicMirror/config/config.js`.

## Quick Start With Demo Traffic

```js
{
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    centerLat: 39.8283,
    centerLon: -98.5795,
    rangeNm: 40,
    demoMode: true
  }
}
```

## Live Receiver Example

```js
{
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    receiverUrl: "http://raspberrypi.local/tar1090/data/aircraft.json",
    centerLat: 47.6062,
    centerLon: -122.3321,
    rangeNm: 35,
    demoMode: false,
    mode: "hybrid",
    airports: [
      { code: "KSMF", name: "Sacramento Intl", lat: 38.6954, lon: -121.5908 },
      { code: "KSAC", name: "Sacramento Exec", lat: 38.5129, lon: -121.4933 },
      { code: "KMHR", name: "Mather", lat: 38.5553, lon: -121.2972 },
      { code: "KMCC", name: "McClellan", lat: 38.6676, lon: -121.4006 }
    ]
  }
}
```

## Flightradar24 Pi24 Setup

For a Raspberry Pi running Flightradar24's Pi24 image with an RTL-SDR dongle, start with the local `fr24feed` JSON endpoint:

```js
{
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    receiverUrl: "http://pi24.local:8754/flights.json",
    centerLat: 47.6062,
    centerLon: -122.3321,
    rangeNm: 35,
    demoMode: false,
    mode: "hybrid"
  }
}
```

Replace `pi24.local` with the Pi's hostname or IP address. If your MagicMirror runs on the same Pi as Pi24, use:

```text
http://localhost:8754/flights.json
```

If you prefer the dump1090-style `aircraft.json` feed, enable the dump1090 HTTP interface in the Pi24 web settings and use an endpoint like:

```text
http://pi24.local:8888/data/aircraft.json
```

In Pi24, the web settings are usually available at:

```text
http://pi24.local:8754/settings.html
```

For the dump1090 HTTP interface, add this to the dump1090 process arguments:

```text
--net --net-http-port 8888
```

If you enable dump1090 networking, make sure Pi24's RAW and BaseStation feeds are not fighting for the same ports.

Other common feed URLs to try:

```text
http://raspberrypi.local/data/aircraft.json
http://raspberrypi.local:8754/flights.json
http://raspberrypi.local:8888/data/aircraft.json
http://adsbexchange.local/tar1090/data/aircraft.json
http://readsb.local/tar1090/data/aircraft.json
```

## Config

| Option | Default | Notes |
| --- | --- | --- |
| `receiverUrl` | `""` | URL for a Pi24 `flights.json`, dump1090/readsb/tar1090 `aircraft.json`, or JSONP `flights.js` feed. |
| `centerLat` / `centerLon` | `null` | Radar center. Required for live feeds. |
| `rangeNm` | `30` | Radar range in nautical miles. |
| `fetchInterval` | `15000` | Feed refresh interval in milliseconds. |
| `maxSeenSeconds` | `45` | Hide aircraft whose position is older than this. |
| `maxAircraft` | `28` | Maximum aircraft to render. |
| `mode` | `"hybrid"` | `"radar"`, `"list"`, or `"hybrid"`. |
| `radarSize` | `360` | Radar diameter in pixels. |
| `animationSpeed` | `0` | MagicMirror DOM fade speed in milliseconds. Keep at `0` to avoid blink on refresh. |
| `showLabels` | `true` | Show callsign and distance labels on the scope. |
| `showStats` | `true` | Show aircraft count, range, and update time. |
| `showList` | `true` | Show the nearby aircraft list in hybrid mode. |
| `listWidth` | `220` | Width of the side list in pixels. |
| `listMaxHeight` | `null` | Maximum side-list height. Defaults to the radar diameter. Extra rows are hidden behind a bottom fade. |
| `showRangeLabels` | `true` | Show range labels at the top of each radar ring. |
| `rangeLabelCount` | `4` | Number of labeled range rings. |
| `showTrails` | `true` | Leave short position trails behind aircraft. |
| `trailMaxPoints` | `4` | Number of previous position dots retained per aircraft. |
| `trailMaxAgeMs` | `90000` | Maximum age of aircraft trail dots. |
| `showLeaderLines` | `true` | Legacy switch for heading vectors. Set to `false` to hide them. |
| `showLabelConnectors` | `true` | Show faint connector lines from aircraft targets to labels. |
| `showHeadingVectors` | `true` | Show ATC-style heading vectors from each aircraft target. |
| `headingVectorMinPx` | `10` | Minimum heading-vector length in pixels. |
| `headingVectorMaxPx` | `46` | Maximum heading-vector length in pixels. |
| `headingVectorKtPerPixel` | `12` | Speed scaling for heading vectors. Lower numbers make longer vectors. |
| `showAirports` | `true` | Show configured airport markers on the radar scope. |
| `airports` | `[]` | Airports to plot as `{ code, name, lat, lon }`. |
| `demoMode` | `"auto"` | `true` forces demo, `false` forces live, `"auto"` demos only when `receiverUrl` is blank. |
| `units` | `"imperial"` | Use `"metric"` for km, meters, and km/h. |
| `minAltitudeFt` / `maxAltitudeFt` | `null` | Optional altitude filters. |
| `colors` | object | Override scope, sweep, aircraft, text, muted, and accent colors. |

## Notes

- The module uses `node_helper.js` so the feed is requested from the MagicMirror backend. That avoids browser CORS issues and keeps the display code focused on rendering.
- No npm package install is required.
- Demo mode picks a neutral default center if you do not set one.
- A Pi 3 can read and feed ADS-B data, but running MagicMirror and Pi24 on the same board may feel tight. If your mirror is on another device, point `receiverUrl` at the Pi24 receiver across your LAN.
- Airport markers are intentionally manual for now, so you can keep the scope uncluttered.

## Next Ideas

- Route/from-to display when a local aircraft database or route API is available.
- Touch or remote-control mode switching.
- A physical build profile for a larger square or round display using the same visual language.
