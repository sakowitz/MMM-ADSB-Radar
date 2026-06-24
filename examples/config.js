/*
 * MMM-ADSB-Radar example MagicMirror module configs.
 *
 * Copy one of these objects into the `modules` array in:
 *
 *   ~/MagicMirror/config/config.js
 *
 * Keep your real receiver URL, latitude, longitude, airport list, colors,
 * and other personal settings in MagicMirror's config/config.js. Do not edit
 * tracked files inside the module folder for user-specific settings.
 */

const demoTraffic = {
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    mode: "hybrid",
    demoMode: true,
    centerLat: 37.6213,
    centerLon: -122.379,
    rangeNm: 35,
    showAirports: true,
    airports: [
      { code: "SFO", name: "San Francisco Intl", lat: 37.6213, lon: -122.379 },
      { code: "OAK", name: "Oakland Intl", lat: 37.7213, lon: -122.2207 },
      { code: "SJC", name: "San Jose Intl", lat: 37.3639, lon: -121.9289 }
    ]
  }
};

const localReceiver = {
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    mode: "hybrid",
    demoMode: false,
    centerLat: 37.6213,
    centerLon: -122.379,
    rangeNm: 35,
    showAirports: true,
    airports: [
      { code: "SFO", name: "San Francisco Intl", lat: 37.6213, lon: -122.379 },
      { code: "OAK", name: "Oakland Intl", lat: 37.7213, lon: -122.2207 },
      { code: "SJC", name: "San Jose Intl", lat: 37.3639, lon: -121.9289 }
    ],
    source: "receiver",
    receiverUrl: "http://your-receiver.local:8754/flights.json"
  }
};

const receiverWithOnlineFallback = {
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    mode: "hybrid",
    demoMode: false,
    centerLat: 37.6213,
    centerLon: -122.379,
    rangeNm: 35,
    showAirports: true,
    airports: [
      { code: "SFO", name: "San Francisco Intl", lat: 37.6213, lon: -122.379 },
      { code: "OAK", name: "Oakland Intl", lat: 37.7213, lon: -122.2207 },
      { code: "SJC", name: "San Jose Intl", lat: 37.3639, lon: -121.9289 }
    ],
    source: "auto",
    receiverUrl: "http://your-receiver.local:8754/flights.json",
    onlineProvider: "airplanesLive",
    fetchInterval: 180000
  }
};

const onlineOnly = {
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    mode: "hybrid",
    demoMode: false,
    centerLat: 37.6213,
    centerLon: -122.379,
    rangeNm: 35,
    showAirports: true,
    airports: [
      { code: "SFO", name: "San Francisco Intl", lat: 37.6213, lon: -122.379 },
      { code: "OAK", name: "Oakland Intl", lat: 37.7213, lon: -122.2207 },
      { code: "SJC", name: "San Jose Intl", lat: 37.3639, lon: -121.9289 }
    ],
    source: "online",
    onlineProvider: "airplanesLive",
    fetchInterval: 15000
  }
};

module.exports = {
  demoTraffic,
  localReceiver,
  onlineOnly,
  receiverWithOnlineFallback
};
