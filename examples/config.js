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
    centerLat: 39.8283,
    centerLon: -98.5795,
    rangeNm: 40,
    demoMode: true
  }
};

const localReceiver = {
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    source: "receiver",
    receiverUrl: "http://your-receiver.local:8754/flights.json",
    centerLat: 47.6062,
    centerLon: -122.3321,
    rangeNm: 35,
    demoMode: false,
    mode: "hybrid"
  }
};

const receiverWithOnlineFallback = {
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    source: "auto",
    receiverUrl: "http://your-receiver.local:8754/flights.json",
    onlineProvider: "airplanesLive",
    centerLat: 47.6062,
    centerLon: -122.3321,
    rangeNm: 35,
    fetchInterval: 15000,
    demoMode: false,
    mode: "hybrid"
  }
};

const onlineOnly = {
  module: "MMM-ADSB-Radar",
  position: "top_right",
  config: {
    source: "online",
    onlineProvider: "airplanesLive",
    centerLat: 47.6062,
    centerLon: -122.3321,
    rangeNm: 35,
    fetchInterval: 15000,
    demoMode: false,
    mode: "hybrid"
  }
};

module.exports = {
  demoTraffic,
  localReceiver,
  onlineOnly,
  receiverWithOnlineFallback
};
