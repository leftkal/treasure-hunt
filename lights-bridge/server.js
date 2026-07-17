const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { loginDeviceByIp } = require("tp-link-tapo-connect");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || "";
const TAPO_EMAIL = process.env.TAPO_EMAIL || "";
const TAPO_PASSWORD = process.env.TAPO_PASSWORD || "";
const TAPO_BULB_IPS = (process.env.TAPO_BULB_IPS || process.env.TAPO_BULB_IP || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const BRIDGE_ALLOWED_ORIGINS = (process.env.BRIDGE_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const scenes = {
  1: { hue: 32, saturation: 88, brightness: 35 },
  2: { hue: 18, saturation: 88, brightness: 34 },
  3: { hue: 92, saturation: 76, brightness: 28 },
  4: { hue: 218, saturation: 86, brightness: 28 },
  5: { hue: 132, saturation: 72, brightness: 30 },
  6: { hue: 276, saturation: 78, brightness: 30 },
  7: { hue: 248, saturation: 85, brightness: 24 },
  8: { hue: 330, saturation: 84, brightness: 22 },
  9: { hue: 0, saturation: 0, brightness: 55 },
  final: { hue: 44, saturation: 82, brightness: 80 },
  idle: { hue: 28, saturation: 70, brightness: 20 },
};

let lastScene = scenes.idle;
const deviceCache = new Map();
const scheduledEffects = new Map();

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function getAllowedOrigin(request) {
  const origin = request.headers.origin || "";
  return BRIDGE_ALLOWED_ORIGINS.includes(origin) ? origin : "";
}

function sendJson(request, response, status, body) {
  const allowedOrigin = getAllowedOrigin(request);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigin || "*",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Bridge-Token",
    "Access-Control-Allow-Private-Network": "true",
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 32_768) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function isAuthorized(request) {
  if (getAllowedOrigin(request)) return true;
  return Boolean(BRIDGE_TOKEN && request.headers["x-bridge-token"] === BRIDGE_TOKEN);
}

async function getDevice(ip) {
  if (!deviceCache.has(ip)) {
    deviceCache.set(ip, loginDeviceByIp(TAPO_EMAIL, TAPO_PASSWORD, ip));
  }
  try {
    return await deviceCache.get(ip);
  } catch (error) {
    deviceCache.delete(ip);
    throw error;
  }
}

async function forEachBulb(action, ips = TAPO_BULB_IPS) {
  if (!TAPO_EMAIL || !TAPO_PASSWORD) throw new Error("Missing TAPO_EMAIL or TAPO_PASSWORD");
  if (!TAPO_BULB_IPS.length) throw new Error("Missing TAPO_BULB_IPS");
  const results = [];
  for (const ip of ips) {
    try {
      const device = await getDevice(ip);
      await action(device, ip);
      results.push({ ip, ok: true });
    } catch (error) {
      deviceCache.delete(ip);
      results.push({ ip, ok: false, error: error.message });
    }
  }
  return results;
}

function primaryBulbIps() {
  return TAPO_BULB_IPS.slice(0, 1);
}

function extraBulbIps() {
  return TAPO_BULB_IPS.slice(1);
}

async function applyScene(scene, ips = primaryBulbIps(), { remember = true } = {}) {
  if (remember) lastScene = scene;
  return forEachBulb(async (device) => {
    await device.turnOn();
    await device.setHSL(scene.hue, scene.saturation, scene.brightness);
  }, ips);
}

async function turnOnBulbs(ips) {
  return forEachBulb((device) => device.turnOn(), ips);
}

async function turnOffBulbs(ips) {
  return forEachBulb((device) => device.turnOff(), ips);
}

async function flashWrongCode() {
  const previousScene = lastScene;
  const red = { hue: 0, saturation: 100, brightness: 60 };
  const first = await applyScene(red, TAPO_BULB_IPS);
  windowlessDelay(850).then(() => applyScene(previousScene, TAPO_BULB_IPS).catch((error) => console.error("restore scene failed", error)));
  return first;
}

function clearScheduledEffect(entry) {
  const timers = scheduledEffects.get(entry) || [];
  timers.forEach((timer) => clearTimeout(timer));
  scheduledEffects.delete(entry);
}

function scheduleEntryEffect(entry, delayMs, action) {
  const timer = setTimeout(() => {
    const timers = scheduledEffects.get(entry) || [];
    scheduledEffects.set(entry, timers.filter((candidate) => candidate !== timer));
    Promise.resolve(action()).catch((error) => console.error(`entry ${entry} scheduled effect failed`, error));
  }, delayMs);
  scheduledEffects.set(entry, [...(scheduledEffects.get(entry) || []), timer]);
}

function scheduleSpecialEntryEffects(entry) {
  clearScheduledEffect(entry);
  const extras = extraBulbIps();
  if (entry === 2 && extras[0]) {
    scheduleEntryEffect(entry, 20_000, async () => {
      await turnOnBulbs([extras[0]]);
      scheduleEntryEffect(entry, 2_000, () => turnOffBulbs([extras[0]]));
    });
  } else if (entry === 3 && extras[1]) {
    scheduleEntryEffect(entry, 0, async () => {
      await turnOnBulbs([extras[1]]);
      scheduleEntryEffect(entry, 2_000, () => applyScene({ hue: 0, saturation: 100, brightness: 35 }, [extras[1]], { remember: false }));
      scheduleEntryEffect(entry, 4_000, () => turnOffBulbs([extras[1]]));
    });
  } else if (entry === 4) {
    scheduleEntryEffect(entry, 30_000, () => applyScene({ hue: 0, saturation: 100, brightness: 55 }, TAPO_BULB_IPS));
  }
}

function windowlessDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleEvent(payload) {
  const type = String(payload.type || "");
  if (type === "entry_unlocked") {
    const entry = Number(payload.entry || 0);
    if (!Number.isInteger(entry) || entry < 1 || entry > 9) throw new Error(`No scene configured for entry ${entry}`);
    scheduleSpecialEntryEffects(entry);
    return { event: type, entry, results: [] };
  }
  if (type === "wrong_code") {
    return { event: type, results: await flashWrongCode() };
  }
  if (type === "final_complete") {
    return { event: type, results: await applyScene(scenes.final, TAPO_BULB_IPS) };
  }
  if (type === "idle") {
    return { event: type, results: await applyScene(scenes.idle, TAPO_BULB_IPS) };
  }
  if (type === "off") {
    return { event: type, results: await turnOffBulbs(TAPO_BULB_IPS) };
  }
  throw new Error(`Unknown event type: ${type || "(empty)"}`);
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return sendJson(request, response, 204, {});

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(request, response, 200, {
      ok: true,
      bulbs: TAPO_BULB_IPS,
      configured: Boolean(BRIDGE_TOKEN && TAPO_EMAIL && TAPO_PASSWORD && TAPO_BULB_IPS.length),
    });
  }

  if (request.method !== "POST" || url.pathname !== "/event") {
    return sendJson(request, response, 404, { ok: false, error: "Not found" });
  }

  if (!isAuthorized(request)) {
    return sendJson(request, response, 401, { ok: false, error: "Unauthorized" });
  }

  try {
    const payload = await readBody(request);
    const result = await handleEvent(payload);
    return sendJson(request, response, 200, { ok: true, ...result });
  } catch (error) {
    return sendJson(request, response, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Treasure Hunt lights bridge listening on http://0.0.0.0:${PORT}`);
  console.log(`Bulbs: ${TAPO_BULB_IPS.join(", ") || "none configured"}`);
});
