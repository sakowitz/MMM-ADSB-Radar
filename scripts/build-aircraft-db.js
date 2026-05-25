#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const readline = require("readline");

const DEFAULT_SOURCE = "https://opensky-network.org/datasets/metadata/aircraftDatabase.csv";

const args = parseArgs(process.argv.slice(2));
const source = args.source || DEFAULT_SOURCE;
const outDir = path.resolve(args.out || "aircraft-db");
const chunkLength = Math.max(1, Math.min(6, Number(args.chunkLength) || 2));

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const csvPath = /^https?:\/\//i.test(source) ?
    await downloadSource(source) :
    path.resolve(source);

  const result = await buildDatabase(csvPath);
  writeDatabase(result);

  if (csvPath.startsWith(os.tmpdir())) {
    fs.rmSync(csvPath, { force: true });
  }

  console.log(`Built ${result.records} aircraft records in ${result.chunkCount} chunks.`);
  console.log(`Output: ${outDir}`);
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];

    if (arg === "--source" && rawArgs[i + 1]) {
      parsed.source = rawArgs[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--out" && rawArgs[i + 1]) {
      parsed.out = rawArgs[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--chunk-length" && rawArgs[i + 1]) {
      parsed.chunkLength = rawArgs[i + 1];
      i += 1;
    }
  }

  return parsed;
}

function downloadSource(url) {
  const destination = path.join(os.tmpdir(), `mmm-adsb-aircraft-${Date.now()}.csv`);

  return new Promise((resolve, reject) => {
    downloadToFile(url, destination, 0, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(destination);
    });
  });
}

function downloadToFile(url, destination, redirects, callback) {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === "https:" ? https : http;
  const request = transport.get(parsedUrl, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      response.resume();

      if (redirects >= 5) {
        callback(new Error("Too many redirects while downloading aircraft database."));
        return;
      }

      const nextUrl = new URL(response.headers.location, parsedUrl).toString();
      downloadToFile(nextUrl, destination, redirects + 1, callback);
      return;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.resume();
      callback(new Error(`Aircraft database download returned HTTP ${response.statusCode}.`));
      return;
    }

    const output = fs.createWriteStream(destination);
    response.pipe(output);
    output.on("finish", () => output.close(callback));
    output.on("error", callback);
  });

  request.on("error", callback);
}

async function buildDatabase(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Source CSV not found: ${csvPath}`);
  }

  const chunks = {};
  let headers = null;
  let indexes = null;
  let records = 0;

  const reader = readline.createInterface({
    crlfDelay: Infinity,
    input: fs.createReadStream(csvPath)
  });

  for await (const line of reader) {
    if (!line.trim()) {
      continue;
    }

    const values = parseCsvLine(line);

    if (!headers) {
      headers = values.map((header) => header.trim().toLowerCase());
      indexes = resolveIndexes(headers);
      validateIndexes(indexes);
      continue;
    }

    const hex = cleanHex(valueAt(values, indexes.hex));
    if (!hex) {
      continue;
    }

    const aircraftType = firstString(valueAt(values, indexes.type));
    const registration = normalizeRegistration(valueAt(values, indexes.registration));

    if (!aircraftType && !registration) {
      continue;
    }

    const prefix = hex.slice(0, chunkLength);
    if (!chunks[prefix]) {
      chunks[prefix] = {};
    }

    chunks[prefix][hex] = [aircraftType, registration];
    records += 1;
  }

  return {
    chunks,
    chunkCount: Object.keys(chunks).length,
    records
  };
}

function resolveIndexes(headers) {
  return {
    hex: findHeader(headers, ["icao24", "icao", "hex", "addr"]),
    type: findHeader(headers, ["typecode", "icaoaircrafttype", "aircrafttype", "type"]),
    registration: findHeader(headers, ["registration", "reg", "tail"])
  };
}

function validateIndexes(indexes) {
  if (indexes.hex === -1) {
    throw new Error("Source CSV does not include an ICAO24/hex column.");
  }

  if (indexes.type === -1 && indexes.registration === -1) {
    throw new Error("Source CSV does not include aircraft type or registration columns.");
  }
}

function findHeader(headers, names) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

function writeDatabase(result) {
  fs.rmSync(outDir, { force: true, recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  Object.keys(result.chunks).sort().forEach((prefix) => {
    const chunkPath = path.join(outDir, `${prefix}.json`);
    fs.writeFileSync(chunkPath, `${JSON.stringify(result.chunks[prefix])}\n`);
  });

  const manifest = {
    source,
    generatedAt: new Date().toISOString(),
    chunkLength,
    fields: ["aircraftType", "registration"],
    records: result.records,
    chunks: result.chunkCount
  };

  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        value += "\"";
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      values.push(value);
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value);
  return values;
}

function valueAt(values, index) {
  return index >= 0 ? values[index] : "";
}

function cleanHex(value) {
  return String(value || "").replace(/^0x/i, "").trim().toUpperCase();
}

function normalizeRegistration(value) {
  return firstString(value).toUpperCase();
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}
