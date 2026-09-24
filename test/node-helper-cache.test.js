"use strict";

const assert = require("node:assert/strict");
const {beforeEach, describe, it} = require("node:test");
const path = require("node:path");

const helper = require(path.resolve(__dirname, "../node_helper.js"));
const instanceId = "module_6_MMM-ADSB-Radar";

function result(generatedAt = Date.now()) {
  return {
    status: "Live receiver",
    aircraft: [{hex: "abc123"}],
    stats: {generatedAt, source: "receiver"}
  };
}

describe("shared ADS-B receiver cache", () => {
  let notifications;

  beforeEach(() => {
    notifications = [];
    helper.start();
    helper.configs[instanceId] = {fetchInterval: 15000};
    helper.scheduleRefresh = () => {};
    helper.onSocketNotificationSent = (notification, payload) => {
      notifications.push({notification, payload});
    };
  });

  it("serves repeated display requests from one receiver load", async () => {
    let loadCount = 0;
    helper.loadAircraft = async () => {
      loadCount += 1;
      return result();
    };

    await helper.refreshAircraft(instanceId);
    await helper.refreshAircraft(instanceId);

    assert.equal(loadCount, 1);
    assert.equal(notifications.length, 2);
    assert.equal(notifications[0].payload.cacheStatus, "fresh");
    assert.equal(notifications[1].payload.cacheStatus, "hit");
  });

  it("coalesces simultaneous receiver requests", async () => {
    let loadCount = 0;
    let finishLoad;
    helper.loadAircraft = () => {
      loadCount += 1;
      return new Promise((resolve) => {
        finishLoad = () => resolve(result());
      });
    };

    const first = helper.refreshAircraft(instanceId);
    const second = helper.refreshAircraft(instanceId);
    finishLoad();
    await Promise.all([first, second]);

    assert.equal(loadCount, 1);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].payload.cacheStatus, "fresh");
  });

  it("returns the last successful snapshot when the receiver fails", async () => {
    const cachedResult = result(Date.now() - 30000);
    helper.aircraftCache[instanceId] = {
      fetchedAt: Date.now() - 30000,
      result: cachedResult
    };
    helper.loadAircraft = async () => {
      throw new Error("receiver offline");
    };

    await helper.refreshAircraft(instanceId);

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].payload.cacheStatus, "stale");
    assert.equal(notifications[0].payload.stats.receiverError, "receiver offline");
  });

  it("invalidates cached data when the module configuration changes", () => {
    helper.storeConfig(instanceId, {rangeNm: 16});
    helper.aircraftCache[instanceId] = {fetchedAt: Date.now(), result: result()};

    helper.storeConfig(instanceId, {rangeNm: 20});

    assert.equal(helper.aircraftCache[instanceId], undefined);
  });
});
