const STORAGE_KEY = "treasure-hunt-progress-v1";
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

const stepImages = ["images/step-1.svg", "images/step-2.svg", "images/step-3.svg", "images/step-4.svg"];
let clues = [];

const app = document.querySelector("#app");
let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { current: clampIndex(saved?.current ?? 0), complete: Boolean(saved?.complete) };
  } catch {
    return { current: 0, complete: false };
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function clampIndex(value) { return Math.max(0, Math.min(clues.length - 1, Number(value) || 0)); }
function normalize(value) { return value.trim().toUpperCase().replace(/\s+/g, "-"); }
function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
function renderMarkdownText(value) {
  return value
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
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
      image: stepImages[index % stepImages.length],
      text: body,
      hint,
      code: clueCodes[index] || `ENTRY-${String(index + 1).padStart(2, "0")}`,
    };
  });
}

async function loadClues() {
  renderLoading();
  try {
    const response = await fetch(MARKDOWN_SOURCE, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    clues = parseDiary(await response.text());
    if (!clues.length) throw new Error("No diary entries found");
    state = { ...state, current: clampIndex(state.current) };
    saveState();
    renderStart();
  } catch (error) {
    renderError(error);
  }
}

function setState(next) { state = { ...state, ...next }; saveState(); }

function renderLoading() {
  app.innerHTML = `<section class="screen stack"><h1>Loading</h1><p class="clue">Opening the diary pages...</p></section>`;
}

function renderError(error) {
  app.innerHTML = `<section class="screen stack"><h1>Diary unavailable</h1><p class="clue">The clue diary could not be loaded. Serve this folder with a local web server and make sure ${escapeHtml(MARKDOWN_SOURCE)} is beside index.html.</p><p class="feedback bad">${escapeHtml(error.message)}</p><button class="btn" id="retryBtn" type="button">Try again</button></section>`;
  document.querySelector("#retryBtn").addEventListener("click", loadClues);
}

function renderStart(feedback = "") {
  app.innerHTML = `
    <section class="screen stack">
      <img class="hero-img" src="images/saw_doll.jpeg" alt="A creepy Saw-style doll inviting players to start the treasure hunt" />
      <h1>WANNA PLAY A GAME?</h1>
      <button class="btn" id="continueBtn" type="button">Start!</button>
      <div class="divider">or</div>
      <form id="jumpForm" class="stack" novalidate>
        <label class="field"><span>Enter Code</span><input id="startCode" autocomplete="off" inputmode="text" enterkeyhint="go" placeholder="Enter Code" aria-describedby="startFeedback" /></label>
        <p class="feedback ${feedback ? "bad" : ""}" id="startFeedback">${feedback}</p>
      </form>
      <p class="small">Progress is saved on this device.</p>
    </section>`;
  document.querySelector("#continueBtn").addEventListener("click", () => renderCurrent());
  document.querySelector("#jumpForm").addEventListener("submit", (event) => {
    event.preventDefault();
    handleCode(document.querySelector("#startCode").value, true);
  });
}

function renderCurrent(feedback = "", isOk = false, hintOpen = false) {
  if (state.complete) return renderComplete();
  const clue = clues[state.current];
  app.innerHTML = `
    <article class="card">
      <img class="step-img" src="${clue.image}" alt="Placeholder illustration for ${clue.title}" />
      <div class="card-body">
        <div class="meta"><span>Step ${state.current + 1} / ${clues.length}</span><button class="btn secondary" id="homeBtn" type="button" aria-label="Return to start screen">Home</button></div>
        <h2>${escapeHtml(clue.title)}</h2>
        <div class="clue diary-text">${renderMarkdownText(clue.text)}</div>
        <button class="btn secondary" id="hintBtn" type="button" aria-expanded="${hintOpen}">${hintOpen ? "Hide hint" : "Reveal hint"}</button>
        ${hintOpen ? `<div class="hint diary-text">${renderMarkdownText(clue.hint || "No hint is written for this entry yet.")}</div>` : ""}
        <form id="codeForm" class="stack" novalidate>
          <label class="field"><span>Enter Code</span><input id="codeInput" autocomplete="off" inputmode="text" placeholder="Enter Code" aria-describedby="feedback" /></label>
          <button class="btn" type="submit">Unlock next clue</button>
          <p class="feedback ${isOk ? "ok" : feedback ? "bad" : ""}" id="feedback">${feedback}</p>
        </form>
        <div class="actions"><button class="btn secondary" id="restartBtn" type="button">Restart clue</button><button class="btn danger" id="resetBtn" type="button">Reset hunt</button></div>
      </div>
    </article>`;
  document.querySelector("#homeBtn").addEventListener("click", () => renderStart());
  document.querySelector("#hintBtn").addEventListener("click", () => renderCurrent(feedback, isOk, !hintOpen));
  document.querySelector("#codeForm").addEventListener("submit", (event) => { event.preventDefault(); handleCode(document.querySelector("#codeInput").value); });
  document.querySelector("#restartBtn").addEventListener("click", () => renderCurrent("Clue restarted. Try the code when you find it.", false, false));
  document.querySelector("#resetBtn").addEventListener("click", resetHunt);
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
  if (nextIndex >= clues.length) { setState({ current: clues.length - 1, complete: true }); return renderComplete(); }
  setState({ current: nextIndex, complete: false });
  renderCurrent("Unlocked! Here is your next clue.", true);
}

function resetHunt() {
  if (!confirm("Reset all saved progress on this device?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = { current: 0, complete: false };
  renderStart();
}

function renderComplete() {
  app.innerHTML = `<section class="screen stack"><h1>Complete</h1><p class="clue">The diary is complete. The final letter waits where it was left.</p><button class="btn" id="againBtn" type="button">Play again</button><button class="btn danger" id="resetBtn" type="button">Reset hunt</button></section>`;
  document.querySelector("#againBtn").addEventListener("click", () => { setState({ current: 0, complete: false }); renderCurrent(); });
  document.querySelector("#resetBtn").addEventListener("click", resetHunt);
}

loadClues();
