"use strict";

const Module = require("node:module");
const path = require("node:path");

const stubs = {
  logger: path.resolve(__dirname, "_stubs/logger.js"),
  node_helper: path.resolve(__dirname, "_stubs/node_helper.js")
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (stubs[request]) return stubs[request];
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
