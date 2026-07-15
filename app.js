const STORAGE_KEY = "treasure-hunt-progress-v1";
const MUSIC_STORAGE_KEY = "treasure-hunt-music-v3";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const MARKDOWN_SOURCE = "The_Rooms_That_Remember_Treasure_Hunt.md";
const COVER_MUSIC_SRC = "music/cover_music.mp3";
const ENTRY_MUSIC_SRCS = [
  "music/entry_music_a.mp3",
  "music/entry_music_b.mp3",
  "music/entry_music_c.mp3",
  "music/entry_music_d.mp3",
  "music/entry_music_e.mp3",
  "music/entry_music_f.mp3",
];
const MUSIC_VOLUME = 0.5;
const MUSIC_DUCK_VOLUME = 0.1;
const MUSIC_FADE_MS = 420;
const MUSIC_POSITION_SAVE_THROTTLE_MS = 1000;

// Replace these placeholder unlock codes before game day.
// The app expects one code per markdown entry, in the same order.
const clueCodes = [
  "FLUTE",
  "BALMY",
  "LUNAR",
  "CHARM",
  "VERDE",
  "SOUPS",
  "PROJE",
  "ATLAS",
  "PILLS",
];

const clueMedia = [
  { type: "video", src: "images/optimized/entry1.mp4" },
  { type: "image", src: "images/optimized/entry2.webp" },
  { type: "image", src: "images/optimized/entry3.webp" },
  { type: "image", src: "images/optimized/entry4.webp" },
  { type: "image", src: "images/optimized/entry5.webp" },
  { type: "image", src: "images/optimized/entry6.webp" },
  { type: "video", src: "images/optimized/entry7.mp4" },
  { type: "image", src: "images/optimized/entry8.webp" },
  { type: "image", src: "images/optimized/entry9.webp" },
];

const clueVoiceovers = [
  { src: "voiceovers/entry1-p254.mp3" },
  { src: "voiceovers/entry2-p254.mp3" },
  { src: "voiceovers/entry3-p254.mp3" },
  { src: "voiceovers/entry4-p254.mp3" },
  { src: "voiceovers/entry5-p254.mp3" },
  { src: "voiceovers/entry6-p254.mp3" },
  { src: "voiceovers/entry7-p254.mp3" },
  { src: "voiceovers/entry8-p254.mp3" },
  { src: "voiceovers/entry9-p254.mp3" },
];

const entryMediaExtensions = {
  "1_1": "webp", "1_2": "webp", "1_3": "webp", "1_4": "mp4",
  "2_1": "mp4", "2_2": "webp",
  "3_1": "webp", "3_2": "webp",
  "4_1": "webp", "4_2": "mp4", "4_3": "webp",
  "5_1": "webp", "5_2": "webp", "5_3": "webp", "5_4": "webp",
  "6_1": "webp", "6_2": "mp4", "6_3": "webp", "6_4": "mp4",
  "7_1": "webp", "7_2": "mp4", "7_3": "mp4",
  "8_1": "webp",
  "9_1": "mp4", "9_2": "webp",
};
let clues = [];
let creatorNote = null;
let activeScreen = "loading";
let videoPauseCount = 0;
let musicReady = false;
let musicUnlocked = false;
let musicMode = "cover";
let mutedVideoResumeDelay = null;
let musicSaveTimer = null;
let musicCurrentTrackIndex = 0;
let musicDesiredTrackIndex = 0;
let musicCurrentTime = 0;
let musicPausedByVoiceover = false;
let musicPausedByVideo = false;
let musicPausedByVisibility = false;
let musicAudioContext = null;
let musicAudioGraphReady = false;
let musicMasterGain = null;
let coverMusic = null;
let entryMusic = [];
const musicFadeFrames = new WeakMap();
const musicSourceNodes = new WeakMap();
const musicGainNodes = new WeakMap();
let musicObserver = null;
const watchedVideos = new Set();
const audibleVideos = new Set();
const activeVoiceoverPlayers = new Set();

const app = document.querySelector("#app");
let state = loadState();

function createAudio(src, loop = false) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.loop = loop;
  audio.volume = 0;
  audio.playsInline = true;
  return audio;
}

function loadMusicState() {
  try {
    const raw = localStorage.getItem(MUSIC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      mode: parsed.mode === "entry" ? "entry" : "cover",
      trackIndex: Math.max(0, Math.min(ENTRY_MUSIC_SRCS.length - 1, Number(parsed.trackIndex ?? 0) || 0)),
      currentTime: Math.max(0, Number(parsed.currentTime ?? 0) || 0),
      trackTimes: Array.isArray(parsed.trackTimes) ? parsed.trackTimes.map((value) => Math.max(0, Number(value) || 0)) : [],
      mutedVideo: Boolean(parsed.mutedVideo),
    };
  } catch {
    return null;
  }
}

function writeMusicState() {
  if (!musicReady) return;
  try {
    const trackTimes = entryMusic.map((audio) => Math.max(0, audio.currentTime || 0));
    localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify({
      mode: musicMode,
      trackIndex: musicCurrentTrackIndex,
      currentTime: musicMode === "entry" ? (entryMusic[musicCurrentTrackIndex]?.currentTime || musicCurrentTime || 0) : 0,
      trackTimes,
      mutedVideo: videoPauseCount > 0,
    }));
  } catch {
    // Ignore persistence failures.
  }
}

function saveMusicState(force = false) {
  if (!musicReady) return;
  if (force) {
    if (musicSaveTimer) window.clearTimeout(musicSaveTimer);
    musicSaveTimer = null;
    writeMusicState();
    return;
  }
  if (musicSaveTimer) return;
  musicSaveTimer = window.setTimeout(() => {
    musicSaveTimer = null;
    writeMusicState();
  }, MUSIC_POSITION_SAVE_THROTTLE_MS);
}

function applyVolume(audio, target, duration = MUSIC_FADE_MS) {
  if (!audio) return;
  const gainNode = musicGainNodes.get(audio);
  if (gainNode && musicAudioContext) {
    const existingFrame = musicFadeFrames.get(audio);
    if (existingFrame) cancelAnimationFrame(existingFrame);
    musicFadeFrames.delete(audio);
    setMusicAudioLevel(audio, target, duration);
    return;
  }
  const start = Number(audio.volume || 0);
  const delta = target - start;
  const existingFrame = musicFadeFrames.get(audio);
  if (existingFrame) cancelAnimationFrame(existingFrame);
  const startedAt = performance.now();
  const step = (now) => {
    const progress = duration <= 0 ? 1 : Math.min(1, (now - startedAt) / duration);
    audio.volume = start + (delta * progress);
    if (progress < 1) {
      musicFadeFrames.set(audio, requestAnimationFrame(step));
    } else {
      musicFadeFrames.delete(audio);
    }
  };
  musicFadeFrames.set(audio, requestAnimationFrame(step));
}

function pauseAudio(audio) {
  if (!audio) return;
  try { audio.pause(); } catch {}
}

function getMusicAudioLevel(audio) {
  const gainNode = musicGainNodes.get(audio);
  return gainNode ? Number(gainNode.gain.value || 0) : Number(audio.volume || 0);
}

function setMusicAudioLevel(audio, target, duration = 0) {
  if (!audio) return;
  const gainNode = musicGainNodes.get(audio);
  if (gainNode && musicAudioContext) {
    const now = musicAudioContext.currentTime;
    const gain = gainNode.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0, Math.min(1, gain.value)), now);
    if (duration <= 0) {
      gain.setValueAtTime(target, now);
    } else {
      gain.linearRampToValueAtTime(target, now + Math.max(0.01, duration / 1000));
    }
    audio.volume = 1;
    return;
  }
  audio.volume = target;
}

function silenceAndPauseAudio(audio) {
  if (!audio) return;
  const existingFrame = musicFadeFrames.get(audio);
  if (existingFrame) cancelAnimationFrame(existingFrame);
  musicFadeFrames.delete(audio);
  try {
    setMusicAudioLevel(audio, 0, 0);
    audio.pause();
  } catch {}
}

function getMusicAudios() {
  return [coverMusic, ...entryMusic].filter(Boolean);
}

function isMusicDucked() {
  return musicPausedByVoiceover || musicPausedByVideo || videoPauseCount > 0;
}

function getMusicTargetVolume() {
  return isMusicDucked() ? MUSIC_DUCK_VOLUME : MUSIC_VOLUME;
}

function isMusicPlaybackBlocked() {
  return musicPausedByVisibility;
}

function isExpectedMusicAudio(audio) {
  if (!audio) return false;
  if (audio === coverMusic) return musicMode === "cover";
  const entryIndex = entryMusic.indexOf(audio);
  return musicMode === "entry" && entryIndex === musicCurrentTrackIndex;
}

function updateMusicDucking(duration = 180) {
  const target = getMusicTargetVolume();
  getMusicAudios().forEach((audio) => {
    if (!audio || audio.paused || audio.ended) return;
    applyVolume(audio, target, duration);
  });
}

function createMusicAudioGraph() {
  if (musicAudioGraphReady || !coverMusic || !entryMusic.length) return;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;
  try {
    musicAudioContext = musicAudioContext || new AudioContextCtor();
    if (!musicMasterGain) {
      musicMasterGain = musicAudioContext.createGain();
      musicMasterGain.gain.value = 1;
      musicMasterGain.connect(musicAudioContext.destination);
    }
    getMusicAudios().forEach((audio) => {
      if (!audio || musicGainNodes.has(audio)) return;
      const source = musicAudioContext.createMediaElementSource(audio);
      const gain = musicAudioContext.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(musicMasterGain);
      musicSourceNodes.set(audio, source);
      musicGainNodes.set(audio, gain);
      audio.volume = 1;
    });
    musicAudioGraphReady = true;
  } catch {
    musicAudioContext = null;
    musicMasterGain = null;
    musicAudioGraphReady = false;
  }
}

function fadeOutAndPause(audio, duration = MUSIC_FADE_MS) {
  if (!audio) return;
  applyVolume(audio, 0, duration);
  window.setTimeout(() => {
    if (getMusicAudioLevel(audio) <= 0.03) pauseAudio(audio);
  }, duration + 30);
}

async function playAudio(audio) {
  if (!audio || isMusicPlaybackBlocked() || !isExpectedMusicAudio(audio)) return false;
  try {
    if (musicAudioContext && musicAudioContext.state === "suspended") {
      await musicAudioContext.resume().catch(() => {});
    }
    await audio.play();
    if (isMusicPlaybackBlocked() || !isExpectedMusicAudio(audio)) {
      silenceAndPauseAudio(audio);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function initializeMusic() {
  if (musicReady) return;
  coverMusic = createAudio(COVER_MUSIC_SRC, true);
  entryMusic = ENTRY_MUSIC_SRCS.map((src) => createAudio(src, false));
  const saved = loadMusicState();
  if (saved) {
    musicMode = saved.mode;
    musicCurrentTrackIndex = saved.trackIndex;
    musicDesiredTrackIndex = saved.trackIndex;
    musicCurrentTime = saved.currentTime;
    if (saved.trackTimes.length) {
      saved.trackTimes.forEach((time, index) => {
        if (entryMusic[index]) entryMusic[index].currentTime = time;
      });
    }
    if (saved.currentTime && entryMusic[musicCurrentTrackIndex]) entryMusic[musicCurrentTrackIndex].currentTime = saved.currentTime;
  }
  coverMusic.addEventListener("timeupdate", saveMusicState);
  coverMusic.addEventListener("pause", saveMusicState);
  coverMusic.addEventListener("play", saveMusicState);
  coverMusic.addEventListener("ended", () => {
    if (!coverMusic.loop) setMusicMode("cover");
  });
  entryMusic.forEach((audio, index) => {
    audio.addEventListener("timeupdate", () => {
      if (index === musicCurrentTrackIndex) {
        musicCurrentTime = audio.currentTime || 0;
        saveMusicState();
      }
    });
    audio.addEventListener("ended", () => advanceEntryTrack(index));
    audio.addEventListener("pause", saveMusicState);
    audio.addEventListener("play", saveMusicState);
  });
  createMusicAudioGraph();
  musicReady = true;
  syncMusicToScreen(true);
}

function primeMusicAutoplay() {
  if (!musicReady) initializeMusic();
  musicUnlocked = true;
  syncMusicToScreen(true);
}

function setMusicUnlocked() {
  musicUnlocked = true;
  syncMusicToScreen(true);
}

function setMusicMode(mode, { trackIndex = musicCurrentTrackIndex, immediate = false, preservePosition = true } = {}) {
  if (!musicReady) return;
  musicMode = mode === "entry" ? "entry" : "cover";
  if (musicMode === "cover") {
    musicDesiredTrackIndex = 0;
    if (!coverMusic.loop) coverMusic.loop = true;
    if (coverMusic.currentTime == null) coverMusic.currentTime = 0;
    if (coverMusic.paused || coverMusic.ended) playAudio(coverMusic);
    applyVolume(coverMusic, getMusicTargetVolume());
    entryMusic.forEach((audio) => {
      if (!audio) return;
      fadeOutAndPause(audio);
      if (!preservePosition) audio.currentTime = 0;
    });
  } else {
    const nextIndex = Math.max(0, Math.min(entryMusic.length - 1, trackIndex));
    musicDesiredTrackIndex = nextIndex;
    musicCurrentTrackIndex = nextIndex;
    const audio = entryMusic[nextIndex];
    if (!audio) return;
    if (coverMusic && !coverMusic.paused) {
      fadeOutAndPause(coverMusic);
    } else {
      pauseAudio(coverMusic);
    }
    entryMusic.forEach((candidate, index) => {
      if (!candidate) return;
      if (index === nextIndex) return;
      fadeOutAndPause(candidate);
    });
    if (preservePosition && audio.currentTime > 0) musicCurrentTime = audio.currentTime;
    audio.loop = false;
    if (audio.paused || audio.ended) playAudio(audio);
    applyVolume(audio, getMusicTargetVolume());
  }
  saveMusicState();
}

function advanceEntryTrack(fromIndex = musicCurrentTrackIndex) {
  if (!musicReady || musicMode !== "entry") return;
  const nextIndex = (fromIndex + 1) % entryMusic.length;
  const current = entryMusic[fromIndex];
  const next = entryMusic[nextIndex];
  if (!next) return;
  pauseAudio(current);
  if (current) current.volume = 0;
  next.currentTime = 0;
  musicCurrentTrackIndex = nextIndex;
  musicCurrentTime = 0;
  playAudio(next);
  applyVolume(next, getMusicTargetVolume());
  saveMusicState();
}

function pauseMusicForOverlay(reason = "generic") {
  if (!musicReady) return;
  if (reason === "voiceover") musicPausedByVoiceover = true;
  if (reason === "video") musicPausedByVideo = true;
  updateMusicDucking();
  saveMusicState(true);
}

function resumeMusicFromOverlay(reason = "generic") {
  if (!musicReady) return;
  if (reason === "voiceover") musicPausedByVoiceover = false;
  if (reason === "video") musicPausedByVideo = false;
  updateMusicDucking();
  if (musicPausedByVisibility) return;
  syncMusicToScreen(true);
}

function syncMusicToScreen(force = false) {
  if (!musicReady || !musicUnlocked) return;
  if (musicPausedByVisibility) return;
  const targetMode = activeScreen === "cover" ? "cover" : "entry";
  if (!force && targetMode === musicMode) return;
  if (targetMode === "cover") {
    setMusicMode("cover", { immediate: true, preservePosition: true });
  } else {
    const index = musicCurrentTrackIndex;
    const audio = entryMusic[index] || entryMusic[0];
    if (!audio) return;
    musicCurrentTrackIndex = index;
    setMusicMode("entry", { trackIndex: index, immediate: true, preservePosition: true });
  }
}

function onUserMusicGesture() {
  if (!musicReady) initializeMusic();
  if (musicAudioContext && musicAudioContext.state === "suspended") {
    musicAudioContext.resume().catch(() => {});
  }
  setMusicUnlocked();
  if (activeScreen === "cover" && !musicPausedByVisibility) {
    setMusicMode("cover", { immediate: true, preservePosition: true });
  } else if (activeScreen !== "cover" && !musicPausedByVisibility) {
    setMusicMode("entry", { trackIndex: musicCurrentTrackIndex, immediate: true, preservePosition: true });
  }
}

function queueMusicResumeAfterMute() {
  if (mutedVideoResumeDelay) window.clearTimeout(mutedVideoResumeDelay);
  mutedVideoResumeDelay = window.setTimeout(() => {
    mutedVideoResumeDelay = null;
    if (videoPauseCount === 0) resumeMusicFromOverlay("video");
  }, 120);
}

function updateVideoAudibility(video, isAudible) {
  if (!video) return;
  if (isAudible) {
    audibleVideos.add(video);
  } else {
    audibleVideos.delete(video);
  }
  videoPauseCount = audibleVideos.size;
  if (videoPauseCount > 0) {
    pauseMusicForOverlay("video");
  } else {
    queueMusicResumeAfterMute();
  }
}

function clearRenderedVideoAudio() {
  document.querySelectorAll("video").forEach((video) => {
    try {
      video.muted = true;
      video.pause();
    } catch {}
  });
  audibleVideos.clear();
  watchedVideos.clear();
  videoPauseCount = 0;
  musicPausedByVideo = false;
  if (musicObserver) musicObserver.disconnect();
}

function clearRenderedVoiceovers() {
  document.querySelectorAll(".voiceover-player").forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
    activeVoiceoverPlayers.delete(audio);
  });
  if (!activeVoiceoverPlayers.size) resumeMusicFromOverlay("voiceover");
}

function clearRenderedAudio() {
  clearRenderedVoiceovers();
  clearRenderedVideoAudio();
}

function registerVideo(video) {
  if (!video || watchedVideos.has(video)) return;
  watchedVideos.add(video);
  video.addEventListener("play", () => { updateVideoAudibility(video, !video.muted && video.volume > 0); });
  video.addEventListener("pause", () => { updateVideoAudibility(video, false); });
  video.addEventListener("volumechange", () => {
    if (video.dataset.syncingMute === "1") return;
    const isMuted = video.muted || video.volume === 0;
    const button = video.parentElement?.querySelector(".mute-btn");
    if (button) {
      button.dataset.muted = String(isMuted);
      button.setAttribute("aria-pressed", String(!isMuted));
      button.setAttribute("aria-label", isMuted ? "Unmute video" : "Mute video");
    }
    updateVideoAudibility(video, !isMuted && !video.paused);
  });
  if (!musicObserver && "IntersectionObserver" in window) {
    musicObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const target = entry.target;
        if (!(target instanceof HTMLVideoElement)) return;
        if (!entry.isIntersecting || entry.intersectionRatio < 0.35) {
          target.muted = true;
          target.pause();
          updateVideoAudibility(target, false);
          const button = target.parentElement?.querySelector(".mute-btn");
          if (button) {
            button.dataset.muted = "true";
            button.setAttribute("aria-pressed", "false");
            button.setAttribute("aria-label", "Unmute video");
          }
        } else if (activeScreen !== "loading") {
          target.play().catch(() => {});
        }
      });
    }, { threshold: [0, 0.35, 0.6, 1] });
  }
  if (musicObserver) musicObserver.observe(video);
}

function setVideoMuted(video, muted) {
  if (!video) return;
  video.dataset.syncingMute = "1";
  video.muted = muted;
  video.dataset.syncingMute = "0";
}

function loadState() {
  const savedState = readSavedState();
  if (savedState) return savedState;
  return { current: 0, maxUnlocked: 0, complete: false, started: false };
}

function readSavedState() {
  // Prefer localStorage, but fall back to the cookie for refresh/device storage quirks.
  const localState = parseStateValue(readLocalStorage());
  if (localState) return localState;
  return parseStateValue(readCookie(STORAGE_KEY));
}

function parseStateValue(value) {
  if (!value) return null;
  try {
    const saved = JSON.parse(value);
    if (!saved || typeof saved !== "object") return null;
    return {
      current: clampIndex(saved.current ?? 0),
      maxUnlocked: Math.max(0, Number(saved.maxUnlocked ?? saved.current ?? 0) || 0),
      complete: Boolean(saved.complete),
      // Older saved progress did not include `started`, so treat any existing
      // saved state as started to avoid refreshes falling back to the cover.
      started: "started" in saved ? Boolean(saved.started) : true,
    };
  } catch {
    return null;
  }
}

function readLocalStorage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}

function writeCookie(name, value) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`;
}

function saveState() {
  const serialized = JSON.stringify(state);
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Cookie persistence still keeps the hunt recoverable if localStorage is unavailable.
  }
  writeCookie(STORAGE_KEY, serialized);
}
function clampIndex(value) {
  const index = Math.max(0, Number(value) || 0);
  if (!clues.length) return index;
  return Math.min(clues.length - 1, index);
}
function normalize(value) { return value.trim().toUpperCase().replace(/\s+/g, "-"); }
function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function renderInlineText(value) {
  return escapeHtml(value).replace(
    /([\u0370-\u03FF\u1F00-\u1FFF]+(?:[\u0370-\u03FF\u1F00-\u1FFF\s.,;·!?«»"'’()…-]*[\u0370-\u03FF\u1F00-\u1FFF]+)?)/g,
    '<span class="greek-text" lang="el">$1</span>'
  );
}

function renderMarkdownText(value, entryNumber) {
  const placeholderPattern = /\*\*\s*picture\s+(\d+)\s*\*\*/gi;
  const parts = [];
  let lastIndex = 0;
  value.replace(placeholderPattern, (match, mediaNumber, offset) => {
    parts.push({ type: "text", value: value.slice(lastIndex, offset) });
    parts.push({ type: "media", mediaNumber: Number(mediaNumber) });
    lastIndex = offset + match.length;
    return match;
  });
  parts.push({ type: "text", value: value.slice(lastIndex) });

  return parts
    .map((part) => part.type === "media" ? renderDiaryMedia(entryNumber, part.mediaNumber) : renderTextParagraphs(part.value))
    .join("");
}

function renderTextParagraphs(value) {
  return value
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${renderInlineText(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function getEntryMedia(entryNumber, mediaNumber) {
  const extension = entryMediaExtensions[`${entryNumber}_${mediaNumber}`];
  if (!extension) return null;
  return {
    type: ["mov", "mp4", "webm"].includes(extension.toLowerCase()) ? "video" : "image",
    src: `images/optimized/entry${entryNumber}_${mediaNumber}.${extension}`,
  };
}

function getMediaHaunt(entryNumber, mediaNumber = 0) {
  if (entryNumber === 9 && mediaNumber === 2) return 0;
  return Math.max(0.15, 1 - ((entryNumber - 1) / 8));
}

function renderClueMedia(clue, entryNumber) {
  const src = escapeHtml(clue.media?.src || "");
  const alt = escapeHtml(`Illustration for ${clue.title}`);
  const haunt = getMediaHaunt(entryNumber).toFixed(2);
  const content = clue.media?.type === "video"
    ? `<video class="step-img" src="${src}" aria-label="${alt}" autoplay muted loop playsinline preload="metadata"></video><span class="media-noise" aria-hidden="true"></span><button class="mute-btn" type="button" aria-label="Unmute video" aria-pressed="false" data-muted="true"></button>`
    : `<img class="step-img" src="${src}" alt="${alt}" decoding="async" /><span class="media-noise" aria-hidden="true"></span>`;
  return `<div class="media-frame step-media" style="--haunt: ${haunt}">${content}</div>`;
}

function renderDiaryMedia(entryNumber, mediaNumber) {
  const media = getEntryMedia(entryNumber, mediaNumber);
  if (!media) return `<p>${renderInlineText(`Picture ${mediaNumber}`)}</p>`;
  const src = escapeHtml(media.src);
  const alt = escapeHtml(`Picture ${mediaNumber} for entry ${entryNumber}`);
  const haunt = getMediaHaunt(entryNumber, mediaNumber).toFixed(2);
  const cleanClass = haunt === "0.00" ? " clean" : "";
  const content = media.type === "video"
    ? `<video class="diary-media-item" src="${src}" aria-label="${alt}" autoplay muted loop playsinline preload="metadata"></video><span class="media-noise" aria-hidden="true"></span><button class="mute-btn" type="button" aria-label="Unmute video" aria-pressed="false" data-muted="true"></button>`
    : `<img class="diary-media-item" src="${src}" alt="${alt}" loading="lazy" decoding="async" /><span class="media-noise" aria-hidden="true"></span>`;
  return `<figure class="diary-media-note${cleanClass}" style="--haunt: ${haunt}">${content}</figure>`;
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function parseDiary(markdown) {
  const entries = markdown
    .split(/^##\s+/m)
    .map((section) => section.trim())
    .filter((section) => section.startsWith("Entry"));
  return entries.map((entry, index) => {
    const [title, ...bodyLines] = entry.split("\n");
    let body = bodyLines.join("\n").trim();
    let hint = "";
    body = body.replace(/^\*\*For you:\s*([\s\S]*?)\*\*\s*$/im, (_, foundHint) => {
      hint = foundHint.trim();
      return "";
    }).replace(/^\s*---\s*$/gm, "").trim();
    return {
      title: title.trim(),
      media: clueMedia[index] || clueMedia[clueMedia.length - 1],
      voiceover: clueVoiceovers[index] || null,
      text: body,
      hint,
      code: clueCodes[index] || `ENTRY-${String(index + 1).padStart(2, "0")}`,
    };
  });
}

function parseCreatorNote(markdown) {
  const match = markdown.match(/^##\s+(.*Note from the creator.*)\s*\n+([\s\S]*)$/im);
  if (!match) return null;
  return { title: match[1].trim(), body: match[2].trim() };
}

async function loadClues() {
  renderLoading();
  try {
    const sourceUrl = new URL(MARKDOWN_SOURCE, window.location.href);
    sourceUrl.searchParams.set("v", String(Date.now()));
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    clues = parseDiary(markdown);
    creatorNote = parseCreatorNote(markdown);
    if (!clues.length) throw new Error("No diary entries found");
    state = {
      ...state,
      current: clampIndex(state.current),
      maxUnlocked: clampIndex(state.maxUnlocked ?? state.current ?? 0),
    };
    if (state.current > state.maxUnlocked) state.current = state.maxUnlocked;
    saveState();
    renderSavedScreen();
  } catch (error) {
    renderError(error);
  }
}

function setState(next) { state = { ...state, ...next }; saveState(); }

function renderSavedScreen() {
  if (state.complete) {
    setState({ current: clues.length - 1, maxUnlocked: clues.length - 1, complete: false, started: true });
    return renderCurrent();
  }
  if (state.started || state.current > 0) return renderCurrent();
  renderStart();
}

function renderLoading() {
  clearRenderedAudio();
  activeScreen = "loading";
  app.innerHTML = `<section class="screen stack"><h1>Loading</h1><p class="clue">Opening the diary pages...</p></section>`;
}

function renderError(error) {
  clearRenderedAudio();
  activeScreen = "error";
  app.innerHTML = `<section class="screen stack"><h1>Diary unavailable</h1><p class="clue">The clue diary could not be loaded. Serve this folder with a local web server and make sure ${escapeHtml(MARKDOWN_SOURCE)} is beside index.html.</p><p class="feedback bad">${escapeHtml(error.message)}</p><button class="btn" id="retryBtn" type="button">Try again</button></section>`;
  document.querySelector("#retryBtn").addEventListener("click", loadClues);
}

function renderStart(feedback = "") {
  clearRenderedAudio();
  activeScreen = "cover";
  app.innerHTML = `
    <section class="screen cover stack">
      <div class="hero-frame"><img class="hero-img" src="images/optimized/saw_doll.webp" alt="A creepy Saw-style doll inviting players to start the treasure hunt" decoding="async" /></div>
      <h1>I've been waiting for you... Alex.</h1>
      <button class="btn" id="continueBtn" type="button">Start!</button>
      <div class="divider">or</div>
      <form id="jumpForm" class="stack" novalidate>
        <label class="field"><span>Enter Code</span><input id="startCode" autocomplete="off" inputmode="text" enterkeyhint="go" placeholder="Enter Code" aria-describedby="startFeedback" /></label>
        <p class="feedback ${feedback ? "bad" : ""}" id="startFeedback">${feedback}</p>
      </form>
    </section>`;
  document.querySelector("#continueBtn").addEventListener("click", () => { setState({ started: true }); renderCurrent(); });
  document.querySelector("#continueBtn").addEventListener("click", onUserMusicGesture);
  document.querySelector("#jumpForm").addEventListener("submit", (event) => {
    event.preventDefault();
    onUserMusicGesture();
    handleCode(document.querySelector("#startCode").value, true);
  });
  primeMusicAutoplay();
  syncMusicToScreen(true);
}

function renderCurrent(feedback = "", isOk = false, hintOpen = false, creatorNoteOpen = false) {
  clearRenderedAudio();
  activeScreen = "entry";
  if (state.complete) {
    setState({ current: clues.length - 1, maxUnlocked: clues.length - 1, complete: false, started: true });
  }
  const clue = clues[state.current];
  const isFinalClue = state.current === clues.length - 1;
  const isUnlockedPastEntry = state.current < (state.maxUnlocked ?? state.current);
  const prevLabel = state.current === 0 ? "Back to Start" : "Previous Entry";
  app.innerHTML = `
    <article class="card">
      ${renderClueMedia(clue, state.current + 1)}
      <div class="card-body">
        <div class="meta"><span>Step ${state.current + 1} / ${clues.length}</span><button class="btn secondary" id="prevBtn" type="button" aria-label="Go to previous entry">${prevLabel}</button></div>
        <h2>${escapeHtml(clue.title)}</h2>
        ${renderVoiceover(clue)}
        <div class="clue diary-text">${renderMarkdownText(clue.text, state.current + 1)}</div>
        <button class="btn secondary" id="hintBtn" type="button" aria-expanded="${hintOpen}">${hintOpen ? "Hide hint" : "Reveal hint"}</button>
        ${hintOpen ? `<div class="hint diary-text">${renderMarkdownText(clue.hint || "No hint is written for this entry yet.", state.current + 1)}</div>` : ""}
        ${isFinalClue ? `
          ${creatorNote ? `<button class="btn secondary" id="creatorNoteBtn" type="button" aria-expanded="${creatorNoteOpen}">${creatorNoteOpen ? "Hide creator note" : "Open creator note"}</button>` : ""}
          ${creatorNoteOpen && creatorNote ? `<div class="creator-note diary-text"><p class="divider">${escapeHtml(creatorNote.title)}</p>${renderMarkdownText(creatorNote.body, state.current + 1)}</div>` : ""}
        ` : isUnlockedPastEntry ? `<button class="btn" id="nextBtn" type="button">Next Entry</button>` : `<form id="codeForm" class="stack" novalidate>
          <label class="field"><span>Enter Code</span><input id="codeInput" autocomplete="off" inputmode="text" placeholder="Enter Code" aria-describedby="feedback" /></label>
          <button class="btn" type="submit">Unlock next clue</button>
          <p class="feedback ${isOk ? "ok" : feedback ? "bad" : ""}" id="feedback">${feedback}</p>
        </form>`}
        <div class="actions"><button class="btn danger" id="resetBtn" type="button">Reset hunt</button></div>
      </div>
    </article>`;
  document.querySelector("#prevBtn").addEventListener("click", () => {
    if (state.current === 0) {
      state = { ...state, current: 0, started: false };
      saveState();
      return renderStart();
    }
    state = { ...state, current: state.current - 1 };
    saveState();
    renderCurrent();
  });
  document.querySelector("#hintBtn").addEventListener("click", () => renderCurrent(feedback, isOk, !hintOpen));
  document.querySelector("#codeForm")?.addEventListener("submit", (event) => { event.preventDefault(); handleCode(document.querySelector("#codeInput").value); });
  document.querySelector("#nextBtn")?.addEventListener("click", () => {
    const nextCurrent = Math.min(state.current + 1, state.maxUnlocked ?? state.current);
    state = { ...state, current: nextCurrent };
    saveState();
    renderCurrent();
    window.requestAnimationFrame(scrollToTop);
  });
  document.querySelector("#creatorNoteBtn")?.addEventListener("click", () => renderCurrent(feedback, isOk, hintOpen, !creatorNoteOpen));
  document.querySelector("#resetBtn").addEventListener("click", resetHunt);
  wireMediaControls();
  wireVoiceoverControls();
  primeMusicAutoplay();
  syncMusicToScreen(true);
}

function renderVoiceover(clue) {
  if (!clue.voiceover?.src) return "";
  const src = escapeHtml(clue.voiceover.src);
  const label = escapeHtml(`Voiceover for ${clue.title}`);
  return `<div class="voiceover-stick"><div class="voiceover-panel"><span>Voiceover</span><audio class="voiceover-player" controls preload="metadata" aria-label="${label}"><source src="${src}" type="audio/mpeg" /></audio></div></div>`;
}

function wireVoiceoverControls() {
  document.querySelectorAll(".voiceover-player").forEach((audio) => {
    audio.addEventListener("play", () => {
      document.querySelectorAll(".voiceover-player").forEach((other) => {
        if (other !== audio) other.pause();
      });
      activeVoiceoverPlayers.add(audio);
      pauseMusicForOverlay("voiceover");
    });
    const releaseVoiceover = () => {
      activeVoiceoverPlayers.delete(audio);
      if (!activeVoiceoverPlayers.size) resumeMusicFromOverlay("voiceover");
    };
    audio.addEventListener("pause", releaseVoiceover);
    audio.addEventListener("ended", releaseVoiceover);
  });
}

function wireMediaControls() {
  document.querySelectorAll(".media-frame video, .diary-media-note video").forEach((video) => {
    video.muted = true;
    registerVideo(video);
    video.play().catch(() => {});
  });
  document.querySelectorAll(".mute-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const video = button.parentElement.querySelector("video");
      if (!video) return;
      setVideoMuted(video, !video.muted);
      button.dataset.muted = String(video.muted);
      button.setAttribute("aria-pressed", String(!video.muted));
      button.setAttribute("aria-label", video.muted ? "Unmute video" : "Mute video");
      video.play().catch(() => {});
      updateVideoAudibility(video, !video.muted && video.volume > 0);
    });
  });
}

function handleCode(rawCode, fromStart = false) {
  const entered = normalize(rawCode);
  if (!entered) return fromStart ? renderStart("Enter a code to begin from it.") : renderCurrent("Enter a code first.");
  const matchedIndex = clues.findIndex((clue) => normalize(clue.code) === entered);
  if (matchedIndex === -1) return fromStart ? renderStart("That code is not in this hunt. Check the letters and try again.") : renderCurrent("Wrong code. Check the clue and try again.");
  // On clue pages, only accept the current clue's code to prevent skip-ahead.
  // On start page, allow jumping to any valid code found in the wild.
  if (!fromStart && matchedIndex !== state.current) {
    if (matchedIndex < state.current) {
      return renderCurrent("You already unlocked this clue. Keep going!");
    }
    return renderCurrent("That code is for a later clue. Solve the current clue first.");
  }
  const nextIndex = matchedIndex + 1;
  if (nextIndex >= clues.length) { setState({ current: clues.length - 1, maxUnlocked: clues.length - 1, complete: false, started: true }); renderCurrent(); return scrollToTop(); }
  setState({ current: nextIndex, maxUnlocked: Math.max(state.maxUnlocked ?? 0, nextIndex), complete: false, started: true });
  renderCurrent();
  scrollToTop();
}

function resetHunt() {
  if (!confirm("Reset all saved progress on this device?")) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors; the in-memory state and cookie are still cleared.
  }
  clearCookie(STORAGE_KEY);
  state = { current: 0, maxUnlocked: 0, complete: false, started: false };
  activeScreen = "cover";
  renderStart();
}

function renderComplete() {
  clearRenderedAudio();
  activeScreen = "entry";
  app.innerHTML = `<section class="screen stack"><h1>Complete</h1><p class="clue">The diary is complete. The final letter waits where it was left.</p><button class="btn" id="againBtn" type="button">Play again</button><button class="btn danger" id="resetBtn" type="button">Reset hunt</button></section>`;
  document.querySelector("#againBtn").addEventListener("click", () => { setState({ current: 0, maxUnlocked: 0, complete: false, started: true }); renderCurrent(); });
  document.querySelector("#resetBtn").addEventListener("click", resetHunt);
}

window.TreasureHuntAudio = {
  pauseForVoiceover() {
    pauseMusicForOverlay("voiceover");
    return { resume() { window.TreasureHuntAudio.resumeAfterVoiceover(); } };
  },
  resumeAfterVoiceover() {
    resumeMusicFromOverlay("voiceover");
  },
  pauseMusic() {
    pauseMusicForOverlay("voiceover");
  },
  resumeMusic() {
    resumeMusicFromOverlay("voiceover");
  },
  getState() {
    return { mode: musicMode, trackIndex: musicCurrentTrackIndex, currentTime: musicMode === "entry" ? (entryMusic[musicCurrentTrackIndex]?.currentTime || 0) : 0 };
  },
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    musicPausedByVisibility = true;
    saveMusicState(true);
    const currentAudio = musicMode === "cover" ? coverMusic : entryMusic[musicCurrentTrackIndex];
    if (currentAudio) {
      applyVolume(currentAudio, 0, 120);
      window.setTimeout(() => pauseAudio(currentAudio), 120);
    }
  } else {
    musicPausedByVisibility = false;
    syncMusicToScreen(true);
  }
});

document.addEventListener("pointerdown", onUserMusicGesture, { once: true, passive: true });
document.addEventListener("keydown", onUserMusicGesture, { once: true });

loadClues();
