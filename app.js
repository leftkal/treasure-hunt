const STORAGE_KEY = "treasure-hunt-progress-v1";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const MARKDOWN_SOURCE = "The_Rooms_That_Remember_Treasure_Hunt.md";

// Replace these placeholder unlock codes before game day.
// The app expects one code per markdown entry, in the same order.
const clueCodes = [
  "ENTRY-01",
  "ENTRY-02",
  "ENTRY-03",
  "ENTRY-04",
  "ENTRY-05",
  "ENTRY-06",
  "ENTRY-07",
  "ENTRY-08",
  "ENTRY-09",
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

const app = document.querySelector("#app");
let state = loadState();

function loadState() {
  const savedState = readSavedState();
  if (savedState) return savedState;
  return { current: 0, complete: false, started: false };
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
      text: body,
      hint,
      code: clueCodes[index] || `ENTRY-${String(index + 1).padStart(2, "0")}`,
    };
  });
}

async function loadClues() {
  renderLoading();
  try {
    const sourceUrl = new URL(MARKDOWN_SOURCE, window.location.href);
    sourceUrl.searchParams.set("v", String(Date.now()));
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    clues = parseDiary(await response.text());
    if (!clues.length) throw new Error("No diary entries found");
    state = { ...state, current: clampIndex(state.current) };
    renderSavedScreen();
  } catch (error) {
    renderError(error);
  }
}

function setState(next) { state = { ...state, ...next }; saveState(); }

function renderSavedScreen() {
  if (state.complete) {
    setState({ current: clues.length - 1, complete: false, started: true });
    return renderCurrent();
  }
  if (state.started || state.current > 0) return renderCurrent();
  renderStart();
}

function renderLoading() {
  app.innerHTML = `<section class="screen stack"><h1>Loading</h1><p class="clue">Opening the diary pages...</p></section>`;
}

function renderError(error) {
  app.innerHTML = `<section class="screen stack"><h1>Diary unavailable</h1><p class="clue">The clue diary could not be loaded. Serve this folder with a local web server and make sure ${escapeHtml(MARKDOWN_SOURCE)} is beside index.html.</p><p class="feedback bad">${escapeHtml(error.message)}</p><button class="btn" id="retryBtn" type="button">Try again</button></section>`;
  document.querySelector("#retryBtn").addEventListener("click", loadClues);
}

function renderStart(feedback = "") {
  app.innerHTML = `
    <section class="screen cover stack">
      <div class="hero-frame"><img class="hero-img" src="images/optimized/saw_doll.webp" alt="A creepy Saw-style doll inviting players to start the treasure hunt" decoding="async" /></div>
      <h1>WANNA PLAY A GAME?</h1>
      <button class="btn" id="continueBtn" type="button">Start!</button>
      <div class="divider">or</div>
      <form id="jumpForm" class="stack" novalidate>
        <label class="field"><span>Enter Code</span><input id="startCode" autocomplete="off" inputmode="text" enterkeyhint="go" placeholder="Enter Code" aria-describedby="startFeedback" /></label>
        <p class="feedback ${feedback ? "bad" : ""}" id="startFeedback">${feedback}</p>
      </form>
      <p class="small">Progress is saved on this device.</p>
    </section>`;
  document.querySelector("#continueBtn").addEventListener("click", () => { setState({ started: true }); renderCurrent(); });
  document.querySelector("#jumpForm").addEventListener("submit", (event) => {
    event.preventDefault();
    handleCode(document.querySelector("#startCode").value, true);
  });
}

function renderCurrent(feedback = "", isOk = false, hintOpen = false) {
  if (state.complete) {
    setState({ current: clues.length - 1, complete: false, started: true });
  }
  const clue = clues[state.current];
  const isFinalClue = state.current === clues.length - 1;
  app.innerHTML = `
    <article class="card">
      ${renderClueMedia(clue, state.current + 1)}
      <div class="card-body">
        <div class="meta"><span>Step ${state.current + 1} / ${clues.length}</span><button class="btn secondary" id="homeBtn" type="button" aria-label="Return to start screen">Home</button></div>
        <h2>${escapeHtml(clue.title)}</h2>
        <div class="clue diary-text">${renderMarkdownText(clue.text, state.current + 1)}</div>
        <button class="btn secondary" id="hintBtn" type="button" aria-expanded="${hintOpen}">${hintOpen ? "Hide hint" : "Reveal hint"}</button>
        ${hintOpen ? `<div class="hint diary-text">${renderMarkdownText(clue.hint || "No hint is written for this entry yet.", state.current + 1)}</div>` : ""}
        ${isFinalClue ? `<p class="final-note">The diary is complete. No more codes are needed.</p>` : `<form id="codeForm" class="stack" novalidate>
          <label class="field"><span>Enter Code</span><input id="codeInput" autocomplete="off" inputmode="text" placeholder="Enter Code" aria-describedby="feedback" /></label>
          <button class="btn" type="submit">Unlock next clue</button>
          <p class="feedback ${isOk ? "ok" : feedback ? "bad" : ""}" id="feedback">${feedback}</p>
        </form>`}
        <div class="actions"><button class="btn danger" id="resetBtn" type="button">Reset hunt</button></div>
      </div>
    </article>`;
  document.querySelector("#homeBtn").addEventListener("click", () => renderStart());
  document.querySelector("#hintBtn").addEventListener("click", () => renderCurrent(feedback, isOk, !hintOpen));
  document.querySelector("#codeForm")?.addEventListener("submit", (event) => { event.preventDefault(); handleCode(document.querySelector("#codeInput").value); });
  document.querySelector("#resetBtn").addEventListener("click", resetHunt);
  wireMediaControls();
}

function wireMediaControls() {
  document.querySelectorAll(".media-frame video, .diary-media-note video").forEach((video) => {
    video.muted = true;
    video.play().catch(() => {});
  });
  document.querySelectorAll(".mute-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const video = button.parentElement.querySelector("video");
      if (!video) return;
      video.muted = !video.muted;
      button.dataset.muted = String(video.muted);
      button.setAttribute("aria-pressed", String(!video.muted));
      button.setAttribute("aria-label", video.muted ? "Unmute video" : "Mute video");
      video.play().catch(() => {});
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
  if (nextIndex >= clues.length) { setState({ current: clues.length - 1, complete: false, started: true }); renderCurrent(); return scrollToTop(); }
  setState({ current: nextIndex, complete: false, started: true });
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
  state = { current: 0, complete: false, started: false };
  renderStart();
}

function renderComplete() {
  app.innerHTML = `<section class="screen stack"><h1>Complete</h1><p class="clue">The diary is complete. The final letter waits where it was left.</p><button class="btn" id="againBtn" type="button">Play again</button><button class="btn danger" id="resetBtn" type="button">Reset hunt</button></section>`;
  document.querySelector("#againBtn").addEventListener("click", () => { setState({ current: 0, complete: false, started: true }); renderCurrent(); });
  document.querySelector("#resetBtn").addEventListener("click", resetHunt);
}

loadClues();
