const NodeHelper = require("node_helper");
const Log = require("logger");
const http = require("http");
const https = require("https");

const ADSBRadarNotifications = {
  CONFIG: "MMM_ADSB_RADAR_CONFIG",
  REQUEST: "MMM_ADSB_RADAR_REQUEST",
  UPDATE: "MMM_ADSB_RADAR_UPDATE",
  ERROR: "MMM_ADSB_RADAR_ERROR"
};

const DEFAULT_CENTER = {
  lat: 39.8283,
  lon: -98.5795
};

module.exports = NodeHelper.create({
  requiresVersion: "2.1.0",

  start: function () {
    this.configs = {};
  },

  socketNotificationReceived: function (notification, payload) {
    if (!payload || !payload.instanceId) {
      return;
    }

    if (notification === ADSBRadarNotifications.CONFIG) {
      this.configs[payload.instanceId] = payload.config || {};
      return;
    }

    if (notification === ADSBRadarNotifications.REQUEST) {
      this.loadAircraft(payload.instanceId).catch((error) => {
        Log.error(`${this.name}: ${error.message}`);
        this.sendSocketNotification(ADSBRadarNotifications.ERROR, {
          instanceId: payload.instanceId,
          message: error.message
        });
      });
    }
  },

  loadAircraft: async function (instanceId) {
    const config = this.configs[instanceId] || {};
    const demo = this.shouldUseDemo(config);
    const center = this.resolveCenter(config, demo);

    if (!center) {
      throw new Error("Set centerLat and centerLon for the radar location.");
    }

    let feed;
    let status;

    if (demo) {
      feed = this.makeDemoFeed(config, center);
      status = "Demo traffic";
    } else {
      if (!config.receiverUrl) {
        throw new Error("Set receiverUrl or enable demoMode.");
      }
      feed = await this.fetchJson(config.receiverUrl, config.timeoutMs || 8000);
      status = "Live receiver";
    }

    const feedAircraft = this.extractAircraft(feed);
    const normalized = this.normalizeAircraft(feedAircraft, config, center);
    const aircraft = this.filterAircraft(normalized, config);

    this.sendSocketNotification(ADSBRadarNotifications.UPDATE, {
      instanceId,
      status,
      aircraft: aircraft.slice(0, config.maxAircraft || 28),
      stats: {
        source: demo ? "demo" : "live",
        totalFeedAircraft: feedAircraft.length,
        inRange: aircraft.length,
        messages: feed.messages || null,
        feedTime: feed.now || null,
        generatedAt: Date.now()
      }
    });
  },

  shouldUseDemo: function (config) {
    if (config.demoMode === true) {
      return true;
    }

    if (config.demoMode === false) {
      return false;
    }

    return !config.receiverUrl;
  },

  resolveCenter: function (config, demo) {
    const lat = this.numberOrNull(config.centerLat);
    const lon = this.numberOrNull(config.centerLon);

    if (lat !== null && lon !== null) {
      return { lat, lon };
    }

    if (demo) {
      return DEFAULT_CENTER;
    }

    return null;
  },

  extractAircraft: function (feed) {
    if (!feed) {
      return [];
    }

    if (Array.isArray(feed.aircraft)) {
      return feed.aircraft;
    }

    if (Array.isArray(feed)) {
      return feed;
    }

    const flights = feed.flights && typeof feed.flights === "object" ? feed.flights : feed;

    if (!flights || Array.isArray(flights) || typeof flights !== "object") {
      return [];
    }

    return Object.entries(flights)
      .map(([key, value]) => this.normalizeFr24Entry(key, value))
      .filter(Boolean);
  },

  normalizeFr24Entry: function (key, value) {
    if (Array.isArray(value)) {
      return this.normalizeFr24Array(key, value);
    }

    if (!value || typeof value !== "object") {
      return null;
    }

    const lat = this.firstNumber(value.lat, value.latitude);
    const lon = this.firstNumber(value.lon, value.long, value.lng, value.longitude);

    if (lat === null || lon === null) {
      return null;
    }

    return {
      hex: this.cleanHex(value.hex || value.id || key),
      flight: this.firstString(value.flight, value.callsign, value.call, value.name),
      lat,
      lon,
      alt_baro: this.firstNumber(value.alt_baro, value.alt, value.altitude),
      alt_geom: this.numberOrNull(value.alt_geom),
      gs: this.firstNumber(value.gs, value.speed, value.spd),
      track: this.firstNumber(value.track, value.heading, value.bearing),
      squawk: value.squawk || value.sqw || "",
      seen: this.firstNumber(value.seen, value.seen_pos, this.seenFromTimestamp(value.timestamp || value.time || value.updated))
    };
  },

  normalizeFr24Array: function (key, value) {
    const lat = this.numberOrNull(value[1]);
    const lon = this.numberOrNull(value[2]);

    if (lat === null || lon === null) {
      return null;
    }

    return {
      hex: this.cleanHex(value[0] || key),
      flight: this.firstString(value[8], value[9], value[16]),
      lat,
      lon,
      track: this.numberOrNull(value[3]),
      alt_baro: this.numberOrNull(value[4]),
      gs: this.numberOrNull(value[5]),
      squawk: value[6] || "",
      seen: this.seenFromTimestamp(value[10]) || 0
    };
  },

  normalizeAircraft: function (aircraft, config, center) {
    return aircraft
      .map((item) => {
        const lat = this.numberOrNull(item.lat);
        const lon = this.numberOrNull(item.lon);

        if (lat === null || lon === null) {
          return null;
        }

        const distanceNm = this.distanceNm(center.lat, center.lon, lat, lon);
        const seen = this.firstNumber(item.seen_pos, item.seen) || 0;
        const altitudeFt = this.altitude(item);
        const track = this.firstNumber(item.track, item.true_heading, item.nav_heading, item.mag_heading);

        return {
          hex: item.hex || "",
          flight: this.firstString(item.flight, item.callsign),
          lat,
          lon,
          altitudeFt,
          speedKt: this.firstNumber(item.gs, item.tas, item.ias),
          track,
          bearing: this.bearing(center.lat, center.lon, lat, lon),
          distanceNm,
          seen,
          isStale: seen > Math.min(config.maxSeenSeconds || 45, 20),
          squawk: item.squawk || "",
          emergency: this.isEmergency(item)
        };
      })
      .filter(Boolean);
  },

  filterAircraft: function (aircraft, config) {
    const rangeNm = Number(config.rangeNm) || 30;
    const maxSeenSeconds = Number(config.maxSeenSeconds) || 45;
    const minAltitudeFt = this.numberOrNull(config.minAltitudeFt);
    const maxAltitudeFt = this.numberOrNull(config.maxAltitudeFt);

    return aircraft
      .filter((item) => item.distanceNm <= rangeNm)
      .filter((item) => item.seen <= maxSeenSeconds)
      .filter((item) => minAltitudeFt === null || item.altitudeFt === null || item.altitudeFt >= minAltitudeFt)
      .filter((item) => maxAltitudeFt === null || item.altitudeFt === null || item.altitudeFt <= maxAltitudeFt)
      .sort((a, b) => {
        if (a.emergency && !b.emergency) {
          return -1;
        }
        if (!a.emergency && b.emergency) {
          return 1;
        }
        return a.distanceNm - b.distanceNm;
      });
  },

  fetchJson: function (url, timeoutMs, redirects = 0) {
    return new Promise((resolve, reject) => {
      let parsedUrl;

      try {
        parsedUrl = new URL(url);
      } catch (error) {
        reject(new Error(`Invalid receiverUrl: ${url}`));
        return;
      }

      const transport = parsedUrl.protocol === "https:" ? https : http;
      const request = transport.get(parsedUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          if (redirects >= 3) {
            reject(new Error("Too many redirects while loading ADS-B feed."));
            return;
          }
          const nextUrl = new URL(response.headers.location, parsedUrl).toString();
          this.fetchJson(nextUrl, timeoutMs, redirects + 1).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`ADS-B feed returned HTTP ${response.statusCode}.`));
          return;
        }

        response.setEncoding("utf8");
        let raw = "";

        response.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > 5 * 1024 * 1024) {
            request.destroy(new Error("ADS-B feed is larger than expected."));
          }
        });

        response.on("end", () => {
          try {
            resolve(this.parseFeed(raw));
          } catch (error) {
            reject(new Error("ADS-B feed did not return valid JSON."));
          }
        });
      });

      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error("Timed out while loading ADS-B feed."));
      });

      request.on("error", reject);
    });
  },

  parseFeed: function (raw) {
    const trimmed = String(raw || "").trim();
    const jsonpMatch = trimmed.match(/^[A-Za-z_$][\w$]*\(([\s\S]*)\);?$/);
    const json = jsonpMatch ? jsonpMatch[1] : trimmed;
    return JSON.parse(json);
  },

  makeDemoFeed: function (config, center) {
    const rangeNm = Number(config.rangeNm) || 30;
    const now = Date.now() / 1000;
    const callsigns = ["AAL214", "DAL94", "UAL530", "SWA1827", "JBU616", "FDX73", "UPS118", "N42MM", "ASA808", "BAW21"];
    const aircraft = callsigns.map((flight, index) => {
      const orbit = (now / (24 + index * 3) + index * 37) % 360;
      const distance = rangeNm * (0.16 + (index % 7) * 0.1);
      const point = this.destinationPoint(center.lat, center.lon, orbit, distance);
      const track = (orbit + 80 + index * 11) % 360;

      return {
        hex: `D${(10000 + index * 137).toString(16).toUpperCase()}`,
        flight,
        lat: point.lat,
        lon: point.lon,
        alt_baro: 2500 + index * 3100,
        gs: 135 + index * 29,
        track,
        seen: index % 4,
        seen_pos: index % 5
      };
    });

    return {
      now,
      messages: Math.round(now) % 100000,
      aircraft
    };
  },

  altitude: function (aircraft) {
    if (aircraft.alt_baro === "ground") {
      return 0;
    }

    return this.firstNumber(aircraft.alt_baro, aircraft.alt_geom);
  },

  isEmergency: function (aircraft) {
    const emergency = typeof aircraft.emergency === "string" ? aircraft.emergency.toLowerCase() : "";
    return emergency && emergency !== "none" || ["7500", "7600", "7700"].includes(String(aircraft.squawk || ""));
  },

  cleanHex: function (value) {
    return String(value || "").replace(/^x/i, "").trim().toUpperCase();
  },

  firstString: function (...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  },

  firstNumber: function (...values) {
    for (const value of values) {
      const number = this.numberOrNull(value);
      if (number !== null) {
        return number;
      }
    }
    return null;
  },

  numberOrNull: function (value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  },

  seenFromTimestamp: function (value) {
    const timestamp = this.numberOrNull(value);

    if (timestamp === null) {
      return null;
    }

    const seconds = timestamp > 10000000000 ? timestamp / 1000 : timestamp;
    return Math.max(0, Date.now() / 1000 - seconds);
  },

  distanceNm: function (lat1, lon1, lat2, lon2) {
    const earthRadiusNm = 3440.065;
    const phi1 = this.toRadians(lat1);
    const phi2 = this.toRadians(lat2);
    const deltaPhi = this.toRadians(lat2 - lat1);
    const deltaLambda = this.toRadians(lon2 - lon1);
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusNm * c;
  },

  bearing: function (lat1, lon1, lat2, lon2) {
    const phi1 = this.toRadians(lat1);
    const phi2 = this.toRadians(lat2);
    const deltaLambda = this.toRadians(lon2 - lon1);
    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    return (this.toDegrees(Math.atan2(y, x)) + 360) % 360;
  },

  destinationPoint: function (lat, lon, bearing, distanceNm) {
    const earthRadiusNm = 3440.065;
    const angularDistance = distanceNm / earthRadiusNm;
    const theta = this.toRadians(bearing);
    const phi1 = this.toRadians(lat);
    const lambda1 = this.toRadians(lon);
    const phi2 = Math.asin(
      Math.sin(phi1) * Math.cos(angularDistance) +
      Math.cos(phi1) * Math.sin(angularDistance) * Math.cos(theta)
    );
    const lambda2 = lambda1 + Math.atan2(
      Math.sin(theta) * Math.sin(angularDistance) * Math.cos(phi1),
      Math.cos(angularDistance) - Math.sin(phi1) * Math.sin(phi2)
    );

    return {
      lat: this.toDegrees(phi2),
      lon: ((this.toDegrees(lambda2) + 540) % 360) - 180
    };
  },

  toRadians: function (degrees) {
    return (degrees * Math.PI) / 180;
  },

  toDegrees: function (radians) {
    return (radians * 180) / Math.PI;
  }
});
