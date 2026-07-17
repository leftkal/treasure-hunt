const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
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
const SOUNDS_DIR = process.env.SOUNDS_DIR || path.resolve(__dirname, "../sounds");
const BLUEALSA_DEVICE = process.env.BLUEALSA_DEVICE || "bluealsa";
const BT_SPEAKER_MAC = (process.env.BT_SPEAKER_MAC === undefined ? "02:3C:A2:63:BF:ED" : process.env.BT_SPEAKER_MAC).trim();
const BT_RECONNECT_BEFORE_PLAY = parseBooleanEnv(process.env.BT_RECONNECT_BEFORE_PLAY, true);
const BT_RECONNECT_INTERVAL_MS = Number(process.env.BT_RECONNECT_INTERVAL_MS || 20_000);
const ALL_BULBS_FAILED_SOUND = "You are making it to.mp3";
const FLERT1_SOUND = "flert1.m4a";
const FLERT2_SOUND = "flert2.m4a";
const FLERT1_DELAY_MS = 60_000;
const FLERT2_DELAY_MS = 80_000;
const ENTRY8_VOICE_SOUND = "I ve been watching y.mp3";
const ENTRY9_VOICE_SOUND = "The good thing about.mp3";
const VOICE_LIKE_SOUND_NAMES = new Set([
  ALL_BULBS_FAILED_SOUND,
  ENTRY8_VOICE_SOUND,
  ENTRY9_VOICE_SOUND,
  "The time will come f.mp3",
  "The good thing about.mp3",
  "I ve been watching y.mp3",
]);
const SPECIAL_SOUND_NAMES = new Set([FLERT1_SOUND, FLERT2_SOUND, ...VOICE_LIKE_SOUND_NAMES]);
const ALL_BULBS_FAILED_SOUND_THROTTLE_MS = 10 * 60 * 1000;
const NORMAL_SOUND_MAX_MS = 7_000;
const FLERT_LIGHT_MAX_MS = 0;
const FLICKER_MS = 2_000;
const RED_SCENE = { hue: 0, saturation: 100, brightness: 55 };
const BULB_IPS = {
  kitchen: "192.168.1.71",
  bedroom1: "192.168.1.89",
  livingRoom: "192.168.1.229",
  bedroom2: "192.168.1.159",
};
const NORMAL_SOUND_DELAYS_MS = new Map([
  [2, 10_000],
  [3, 20_000],
  [5, 20_000],
  [6, 50_000],
  [7, 40_000],
  [9, 90_000],
]);
const NORMAL_SOUND_ENTRIES = [...NORMAL_SOUND_DELAYS_MS.keys()];

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
let lastAllBulbsFailedSoundAt = 0;
let bluetoothReconnectInFlight = false;
let bluetoothReconnectLoggedUnavailable = false;

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

function parseBooleanEnv(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function reconnectBluetoothSpeaker() {
  if (!BT_RECONNECT_BEFORE_PLAY || !BT_SPEAKER_MAC) return;
  void runBluetoothReconnectAttempt();
}

function runBluetoothReconnectAttempt() {
  return new Promise((resolve) => {
    if (!BT_SPEAKER_MAC || bluetoothReconnectInFlight) return resolve(false);
    bluetoothReconnectInFlight = true;
    const reconnect = spawn("bluetoothctl", ["connect", BT_SPEAKER_MAC], {
      stdio: "ignore",
    });
    reconnect.on("error", (error) => {
      console.error("bluetooth speaker reconnect failed to start", error.message);
      bluetoothReconnectInFlight = false;
      resolve(false);
    });
    reconnect.on("close", () => {
      bluetoothReconnectInFlight = false;
      resolve(true);
    });
  });
}

function checkBluetoothSpeakerConnection() {
  return new Promise((resolve) => {
    if (!BT_SPEAKER_MAC) return resolve({ attempted: false, connected: false });

    const bluetoothctl = spawn("bluetoothctl", ["info", BT_SPEAKER_MAC], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let started = true;

    bluetoothctl.on("error", (error) => {
      started = false;
      if (!bluetoothReconnectLoggedUnavailable) {
        bluetoothReconnectLoggedUnavailable = true;
        console.error("bluetoothctl unavailable; skipping automatic speaker reconnects", error.message);
      }
      resolve({ attempted: false, connected: false, error: error.message });
    });

    bluetoothctl.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    bluetoothctl.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    bluetoothctl.on("close", (code) => {
      if (!started) return;
      const connected = /Connected:\s*yes/i.test(stdout);
      resolve({ attempted: true, connected, code, stderr: stderr.trim() });
    });
  });
}

async function keepBluetoothSpeakerConnected() {
  if (!BT_SPEAKER_MAC || bluetoothReconnectInFlight) return;
  const status = await checkBluetoothSpeakerConnection();
  if (!status.attempted) return;
  if (status.connected) return;
  await runBluetoothReconnectAttempt();
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

function listNormalSounds() {
  try {
    return fs
      .readdirSync(SOUNDS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(m4a|mp3)$/i.test(name) && !SPECIAL_SOUND_NAMES.has(name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    console.error(`sound directory unavailable: ${SOUNDS_DIR}`, error.message);
    return [];
  }
}

function soundForEntry(entry) {
  const normalSounds = listNormalSounds();
  if (!normalSounds.length) return "";
  const soundEntryIndex = NORMAL_SOUND_ENTRIES.indexOf(entry);
  return normalSounds[(soundEntryIndex < 0 ? 0 : soundEntryIndex) % normalSounds.length];
}

function playSound(fileName, { maxMs = 0, onEnd } = {}) {
  if (!fileName) return;
  const filePath = path.join(SOUNDS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`sound file missing: ${filePath}`);
    if (onEnd) onEnd();
    return;
  }

  reconnectBluetoothSpeaker();

  const ffmpeg = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", filePath, "-f", "wav", "-"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const aplay = spawn("aplay", ["-D", BLUEALSA_DEVICE], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  let ffmpegError = "";
  let aplayError = "";
  let ended = false;
  let maxTimer = null;

  function finish() {
    if (ended) return;
    ended = true;
    if (maxTimer) clearTimeout(maxTimer);
    if (onEnd) onEnd();
  }

  if (maxMs > 0) {
    maxTimer = setTimeout(() => {
      if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
      if (!aplay.killed) aplay.kill("SIGTERM");
      finish();
    }, maxMs);
  }

  ffmpeg.stdout.pipe(aplay.stdin);
  ffmpeg.on("error", (error) => console.error(`ffmpeg failed to start for ${fileName}`, error));
  aplay.on("error", (error) => console.error(`aplay failed to start for ${fileName}`, error));
  ffmpeg.stdout.on("error", (error) => console.error(`ffmpeg stdout error for ${fileName}`, error));
  aplay.stdin.on("error", (error) => console.error(`aplay stdin error for ${fileName}`, error));
  ffmpeg.stderr.on("data", (chunk) => { ffmpegError += chunk.toString(); });
  aplay.stderr.on("data", (chunk) => { aplayError += chunk.toString(); });
  ffmpeg.on("close", (code) => {
    if (code !== 0) console.error(`ffmpeg exited with ${code} for ${fileName}: ${ffmpegError.trim()}`);
    if (!aplay.stdin.destroyed) aplay.stdin.end();
  });
  aplay.on("close", (code) => {
    if (code !== 0) console.error(`aplay exited with ${code} for ${fileName}: ${aplayError.trim()}`);
    finish();
  });
}

function maybePlayAllBulbsFailedSound(results) {
  if (!Array.isArray(results) || !results.length || !results.every((result) => result && result.ok === false)) return;
  const now = Date.now();
  if (now - lastAllBulbsFailedSoundAt < ALL_BULBS_FAILED_SOUND_THROTTLE_MS) return;
  lastAllBulbsFailedSoundAt = now;
  playSound(ALL_BULBS_FAILED_SOUND);
}

function extraBulbIps() {
  return TAPO_BULB_IPS.slice(1);
}

function configuredIp(ip) {
  return TAPO_BULB_IPS.includes(ip) ? ip : "";
}

function firstConfiguredIp(ips) {
  return ips.find((ip) => TAPO_BULB_IPS.includes(ip)) || "";
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

async function temporaryLightEffect(ips, scene, durationMs = FLICKER_MS, scheduleKey = "temporary-cleanup") {
  if (!ips.length) return [];
  const first = await forEachBulb(async (device) => {
    await device.turnOn();
    await device.setHSL(scene.hue, scene.saturation, scene.brightness);
  }, ips);
  scheduleEntryEffect(scheduleKey, durationMs, async () => {
    await turnOffBulbs(ips);
  });
  return first;
}

function playSoundWithLight(fileName, ips, scene = RED_SCENE, maxMs = FLERT_LIGHT_MAX_MS) {
  if (!ips.length) {
    playSound(fileName, { maxMs });
    return;
  }
  void forEachBulb(async (device) => {
    await device.turnOn();
    await device.setHSL(scene.hue, scene.saturation, scene.brightness);
  }, ips).then((results) => maybePlayAllBulbsFailedSound(results));
  playSound(fileName, {
    maxMs,
    onEnd: () => {
      void turnOffBulbs(ips).then((results) => maybePlayAllBulbsFailedSound(results));
    },
  });
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
    Promise.resolve(action())
      .then((results) => maybePlayAllBulbsFailedSound(results))
      .catch((error) => console.error(`entry ${entry} scheduled effect failed`, error));
  }, delayMs);
  scheduledEffects.set(entry, [...(scheduledEffects.get(entry) || []), timer]);
}

function scheduleSpecialEntryEffects(entry) {
  clearScheduledEffect(entry);
  if (NORMAL_SOUND_DELAYS_MS.has(entry)) {
    scheduleEntryEffect(entry, NORMAL_SOUND_DELAYS_MS.get(entry), () => playSound(soundForEntry(entry), { maxMs: NORMAL_SOUND_MAX_MS }));
  }
  const firstFlickerIp = firstConfiguredIp([BULB_IPS.bedroom1, BULB_IPS.kitchen]);
  const bedroom1Ip = configuredIp(BULB_IPS.bedroom1);
  const bedroom2Ip = configuredIp(BULB_IPS.bedroom2);
  const bedroomIps = [bedroom1Ip, bedroom2Ip].filter(Boolean);
  const livingRoomIp = configuredIp(BULB_IPS.livingRoom);
  if (entry === 2 && firstFlickerIp) {
    scheduleEntryEffect(entry, 20_000, () => temporaryLightEffect([firstFlickerIp], RED_SCENE, FLICKER_MS, entry));
  } else if (entry === 3 && bedroom2Ip) {
    scheduleEntryEffect(entry, 0, () => temporaryLightEffect([bedroom2Ip], RED_SCENE, FLICKER_MS, entry));
  } else if (entry === 4) {
    scheduleEntryEffect(entry, FLERT1_DELAY_MS, () => playSoundWithLight(FLERT1_SOUND, bedroomIps));
  } else if (entry === 8) {
    scheduleEntryEffect(entry, FLERT2_DELAY_MS, () => playSoundWithLight(FLERT2_SOUND, bedroomIps));
    if (livingRoomIp) scheduleEntryEffect(entry, 150_000, () => playSoundWithLight(ENTRY8_VOICE_SOUND, [livingRoomIp], RED_SCENE, 0));
  } else if (entry === 9 && livingRoomIp) {
    scheduleEntryEffect(entry, 120_000, () => playSoundWithLight(ENTRY9_VOICE_SOUND, [livingRoomIp], RED_SCENE, 0));
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
    return { event: type, results: [] };
  }
  if (type === "final_complete") {
    const results = await applyScene(scenes.final, TAPO_BULB_IPS);
    maybePlayAllBulbsFailedSound(results);
    return { event: type, results };
  }
  if (type === "idle") {
    const results = await applyScene(scenes.idle, TAPO_BULB_IPS);
    maybePlayAllBulbsFailedSound(results);
    return { event: type, results };
  }
  if (type === "off") {
    const results = await turnOffBulbs(TAPO_BULB_IPS);
    maybePlayAllBulbsFailedSound(results);
    return { event: type, results };
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
  if (BT_SPEAKER_MAC) {
    void keepBluetoothSpeakerConnected();
    setInterval(() => {
      void keepBluetoothSpeakerConnected();
    }, BT_RECONNECT_INTERVAL_MS).unref();
  }
});
