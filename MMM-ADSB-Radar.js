/* global Module, Log */

const ADSBRadarNotifications = {
  CONFIG: "MMM_ADSB_RADAR_CONFIG",
  REQUEST: "MMM_ADSB_RADAR_REQUEST",
  UPDATE: "MMM_ADSB_RADAR_UPDATE",
  ERROR: "MMM_ADSB_RADAR_ERROR"
};

Module.register("MMM-ADSB-Radar", {
  requiresVersion: "2.1.0",

  defaults: {
    receiverUrl: "",
    centerLat: null,
    centerLon: null,
    rangeNm: 30,
    fetchInterval: 15000,
    maxSeenSeconds: 45,
    maxAircraft: 28,
    minAltitudeFt: null,
    maxAltitudeFt: null,
    mode: "hybrid",
    title: "ADS-B Radar",
    radarSize: 360,
    animationSpeed: 700,
    showLabels: true,
    showStats: true,
    showList: true,
    showTrails: true,
    demoMode: "auto",
    units: "imperial",
    colors: {
      scope: "#061815",
      ring: "rgba(125, 255, 210, 0.26)",
      sweep: "rgba(86, 255, 190, 0.28)",
      aircraft: "#78ffd6",
      aircraftStale: "#ffcf70",
      text: "#d9fff6",
      muted: "#86b8ab",
      accent: "#ffe07a"
    }
  },

  start: function () {
    this.instanceId = this.identifier || `${this.name}-${Date.now()}`;
    this.aircraft = [];
    this.stats = {};
    this.status = "Starting radar";
    this.error = null;
    this.lastUpdated = null;
    this.fetchTimer = null;
    this.trails = {};

    this.sendConfig();
    this.scheduleFetch(100);
  },

  getStyles: function () {
    return [this.file("MMM-ADSB-Radar.css")];
  },

  getHeader: function () {
    return this.config.title || this.data.header;
  },

  suspend: function () {
    clearTimeout(this.fetchTimer);
    this.fetchTimer = null;
  },

  resume: function () {
    this.sendConfig();
    this.scheduleFetch(100);
  },

  sendConfig: function () {
    this.sendSocketNotification(ADSBRadarNotifications.CONFIG, {
      instanceId: this.instanceId,
      config: this.config
    });
  },

  scheduleFetch: function (delay) {
    clearTimeout(this.fetchTimer);
    this.fetchTimer = setTimeout(() => {
      this.sendSocketNotification(ADSBRadarNotifications.REQUEST, {
        instanceId: this.instanceId
      });
    }, typeof delay === "number" ? delay : this.config.fetchInterval);
  },

  socketNotificationReceived: function (notification, payload) {
    if (!payload || payload.instanceId !== this.instanceId) {
      return;
    }

    if (notification === ADSBRadarNotifications.UPDATE) {
      this.error = null;
      this.status = payload.status || "Radar updated";
      this.stats = payload.stats || {};
      this.lastUpdated = new Date(Date.now());
      this.aircraft = this.prepareAircraft(payload.aircraft || []);
      this.updateTrails(this.aircraft);
      this.updateDom(this.config.animationSpeed);
      this.scheduleFetch();
      return;
    }

    if (notification === ADSBRadarNotifications.ERROR) {
      this.error = payload.message || "Unable to load ADS-B feed";
      this.status = "Feed unavailable";
      this.stats = payload.stats || {};
      this.updateDom(this.config.animationSpeed);
      this.scheduleFetch(Math.max(this.config.fetchInterval, 30000));
    }
  },

  prepareAircraft: function (aircraft) {
    return aircraft
      .filter((item) => typeof item.distanceNm === "number" && item.distanceNm <= this.config.rangeNm)
      .sort((a, b) => a.distanceNm - b.distanceNm)
      .slice(0, this.config.maxAircraft);
  },

  updateTrails: function (aircraft) {
    if (!this.config.showTrails) {
      this.trails = {};
      return;
    }

    const activeKeys = {};
    const now = Date.now();

    aircraft.forEach((plane) => {
      const key = plane.hex || plane.flight;
      if (!key) {
        return;
      }

      activeKeys[key] = true;
      if (!this.trails[key]) {
        this.trails[key] = [];
      }

      this.trails[key].push({
        bearing: plane.bearing,
        distanceNm: plane.distanceNm,
        timestamp: now
      });

      this.trails[key] = this.trails[key]
        .filter((point) => now - point.timestamp < 180000)
        .slice(-7);
    });

    Object.keys(this.trails).forEach((key) => {
      if (!activeKeys[key]) {
        this.trails[key] = this.trails[key].filter((point) => now - point.timestamp < 90000);
      }

      if (this.trails[key].length === 0) {
        delete this.trails[key];
      }
    });
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = `mmm-adsb-radar mmm-adsb-radar--${this.config.mode}`;
    this.applyTheme(wrapper);

    wrapper.appendChild(this.buildTopBar());

    if (this.error) {
      wrapper.appendChild(this.buildMessage(this.error));
    }

    if (this.config.mode !== "list") {
      wrapper.appendChild(this.buildRadar());
    }

    if (this.config.mode !== "radar" && this.config.showList) {
      wrapper.appendChild(this.buildAircraftList());
    }

    return wrapper;
  },

  applyTheme: function (element) {
    const colors = this.config.colors || {};
    element.style.setProperty("--adsb-scope", colors.scope || this.defaults.colors.scope);
    element.style.setProperty("--adsb-ring", colors.ring || this.defaults.colors.ring);
    element.style.setProperty("--adsb-sweep", colors.sweep || this.defaults.colors.sweep);
    element.style.setProperty("--adsb-plane", colors.aircraft || this.defaults.colors.aircraft);
    element.style.setProperty("--adsb-plane-stale", colors.aircraftStale || this.defaults.colors.aircraftStale);
    element.style.setProperty("--adsb-text", colors.text || this.defaults.colors.text);
    element.style.setProperty("--adsb-muted", colors.muted || this.defaults.colors.muted);
    element.style.setProperty("--adsb-accent", colors.accent || this.defaults.colors.accent);
    element.style.setProperty("--adsb-size", `${this.config.radarSize}px`);
  },

  buildTopBar: function () {
    const bar = document.createElement("div");
    bar.className = "adsb-topbar";

    const status = document.createElement("div");
    status.className = "adsb-status";
    status.textContent = this.statusText();
    bar.appendChild(status);

    if (this.config.showStats) {
      const stats = document.createElement("div");
      stats.className = "adsb-stats";
      stats.appendChild(this.statPill(`${this.aircraft.length}`, "aircraft"));
      stats.appendChild(this.statPill(`${this.config.rangeNm} nm`, "range"));

      if (this.lastUpdated) {
        stats.appendChild(this.statPill(this.formatTime(this.lastUpdated), "updated"));
      }

      bar.appendChild(stats);
    }

    return bar;
  },

  buildMessage: function (message) {
    const element = document.createElement("div");
    element.className = "adsb-message";
    element.textContent = message;
    return element;
  },

  buildRadar: function () {
    const scope = document.createElement("div");
    scope.className = "adsb-scope";
    scope.setAttribute("aria-label", "Nearby aircraft radar scope");

    const sweep = document.createElement("div");
    sweep.className = "adsb-sweep";
    scope.appendChild(sweep);

    const crosshair = document.createElement("div");
    crosshair.className = "adsb-crosshair";
    scope.appendChild(crosshair);

    const ownship = document.createElement("div");
    ownship.className = "adsb-ownship";
    scope.appendChild(ownship);

    Object.keys(this.trails).forEach((key) => {
      this.trails[key].forEach((point, index) => {
        const trail = document.createElement("div");
        const position = this.pointOnScope(point);
        trail.className = "adsb-trail";
        trail.style.left = `${position.x}%`;
        trail.style.top = `${position.y}%`;
        trail.style.opacity = `${(index + 1) / (this.trails[key].length + 1)}`;
        scope.appendChild(trail);
      });
    });

    this.aircraft.forEach((plane) => {
      const marker = this.buildAircraftMarker(plane);
      if (marker) {
        scope.appendChild(marker);
      }
    });

    if (this.aircraft.length === 0 && !this.error) {
      const empty = document.createElement("div");
      empty.className = "adsb-empty";
      empty.textContent = "No aircraft in range";
      scope.appendChild(empty);
    }

    return scope;
  },

  buildAircraftMarker: function (plane) {
    const position = this.pointOnScope(plane);
    if (!position) {
      return null;
    }

    const marker = document.createElement("div");
    marker.className = "adsb-aircraft";
    if (plane.isStale) {
      marker.classList.add("adsb-aircraft--stale");
    }
    if (plane.emergency) {
      marker.classList.add("adsb-aircraft--emergency");
    }

    const heading = plane.track || plane.bearing || 0;
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    marker.style.transform = `translate(-50%, -50%) rotate(${heading}deg)`;
    marker.title = this.aircraftTitle(plane);

    const icon = document.createElement("div");
    icon.className = "adsb-aircraft-icon";
    marker.appendChild(icon);

    if (this.config.showLabels) {
      const label = document.createElement("div");
      label.className = "adsb-aircraft-label";
      label.textContent = this.aircraftLabel(plane);
      label.style.transform = `rotate(${-heading}deg)`;
      marker.appendChild(label);
    }

    return marker;
  },

  buildAircraftList: function () {
    const list = document.createElement("div");
    list.className = "adsb-list";

    if (this.aircraft.length === 0) {
      const empty = document.createElement("div");
      empty.className = "adsb-list-empty";
      empty.textContent = this.error ? "Waiting for feed" : "No nearby aircraft";
      list.appendChild(empty);
      return list;
    }

    this.aircraft.slice(0, 8).forEach((plane) => {
      const row = document.createElement("div");
      row.className = "adsb-row";
      if (plane.emergency) {
        row.classList.add("adsb-row--emergency");
      }

      const callsign = document.createElement("div");
      callsign.className = "adsb-row-callsign";
      callsign.textContent = plane.flight || plane.hex || "Unknown";
      row.appendChild(callsign);

      const details = document.createElement("div");
      details.className = "adsb-row-details";
      details.textContent = [
        this.formatDistance(plane.distanceNm),
        this.formatAltitude(plane.altitudeFt),
        this.formatSpeed(plane.speedKt)
      ]
        .filter(Boolean)
        .join(" | ");
      row.appendChild(details);

      list.appendChild(row);
    });

    return list;
  },

  pointOnScope: function (plane) {
    if (typeof plane.bearing !== "number" || typeof plane.distanceNm !== "number") {
      return null;
    }

    const radius = Math.min(plane.distanceNm / this.config.rangeNm, 1) * 47;
    const radians = (plane.bearing * Math.PI) / 180;

    return {
      x: 50 + Math.sin(radians) * radius,
      y: 50 - Math.cos(radians) * radius
    };
  },

  statusText: function () {
    if (this.error) {
      return "Feed unavailable";
    }

    if (this.stats && this.stats.source === "demo") {
      return "Demo traffic";
    }

    return this.status || "Watching the sky";
  },

  statPill: function (value, label) {
    const pill = document.createElement("div");
    pill.className = "adsb-stat";

    const statValue = document.createElement("span");
    statValue.className = "adsb-stat-value";
    statValue.textContent = value;
    pill.appendChild(statValue);

    const statLabel = document.createElement("span");
    statLabel.className = "adsb-stat-label";
    statLabel.textContent = label;
    pill.appendChild(statLabel);

    return pill;
  },

  aircraftLabel: function (plane) {
    const name = plane.flight || plane.hex || "ID";
    const distance = this.formatDistance(plane.distanceNm);
    return `${name} ${distance}`;
  },

  aircraftTitle: function (plane) {
    return [
      plane.flight || plane.hex || "Unknown aircraft",
      this.formatDistance(plane.distanceNm),
      this.formatAltitude(plane.altitudeFt),
      this.formatSpeed(plane.speedKt)
    ]
      .filter(Boolean)
      .join(" | ");
  },

  formatDistance: function (distanceNm) {
    if (typeof distanceNm !== "number") {
      return "";
    }

    if (this.config.units === "metric") {
      return `${Math.round(distanceNm * 1.852)} km`;
    }

    return `${distanceNm.toFixed(distanceNm < 10 ? 1 : 0)} nm`;
  },

  formatAltitude: function (altitudeFt) {
    if (typeof altitudeFt !== "number") {
      return "";
    }

    if (this.config.units === "metric") {
      return `${Math.round(altitudeFt * 0.3048 / 100) * 100} m`;
    }

    return `${Math.round(altitudeFt / 100) * 100} ft`;
  },

  formatSpeed: function (speedKt) {
    if (typeof speedKt !== "number") {
      return "";
    }

    if (this.config.units === "metric") {
      return `${Math.round(speedKt * 1.852)} km/h`;
    }

    return `${Math.round(speedKt)} kt`;
  },

  formatTime: function (date) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
});
