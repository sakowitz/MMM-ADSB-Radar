"use strict";

module.exports = {
  create (definition) {
    return Object.assign({
      name: "MMM-ADSB-Radar",
      sendSocketNotification (notification, payload) {
        if (typeof this.onSocketNotificationSent === "function") {
          this.onSocketNotificationSent(notification, payload);
        }
      }
    }, definition);
  }
};
