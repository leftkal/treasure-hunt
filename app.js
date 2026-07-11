const STORAGE_KEY = "treasure-hunt-progress-v1";

const clues = [
  {
    title: "Clue 1: The Cold Open",
    image: "images/step-1.svg",
    text: "A placeholder riddle starts the hunt. Replace this with your first clue before game day.",
    hint: "Placeholder hint: make this gentle enough for the first stop.",
    code: "MOON-01",
  },
  {
    title: "Clue 2: The Locked Smile",
    image: "images/step-2.svg",
    text: "Another editable clue goes here. Keep locations and real codes out until you are ready.",
    hint: "Placeholder hint: point players toward a visible object.",
    code: "KEY-02",
  },
  {
    title: "Clue 3: The Red Thread",
    image: "images/step-3.svg",
    text: "Use this card for the next puzzle beat, photo, or prop instruction.",
    hint: "Placeholder hint: mention the pattern, color, or number to notice.",
    code: "LANTERN-03",
  },
  {
    title: "Clue 4: The Last Door",
    image: "images/step-4.svg",
    text: "Final placeholder clue. Enter its code to finish the hunt.",
    hint: "Placeholder hint: save the biggest nudge for last.",
    code: "FINALE-04",
  },
];

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

function setState(next) { state = { ...state, ...next }; saveState(); }

function renderStart(feedback = "") {
  app.innerHTML = `
    <section class="screen stack">
      <img class="hero-img" src="images/start-doll.svg" alt="An original creepy puppet face for the treasure hunt" />
      <h1>WANNA PLAY A GAME?</h1>
      <button class="btn" id="continueBtn" type="button">Start!</button>
      <div class="divider">or</div>
      <form id="jumpForm" class="stack" novalidate>
        <label class="field"><span>Enter Code</span><input id="startCode" autocomplete="off" inputmode="text" placeholder="Enter Code" aria-describedby="startFeedback" /></label>
        <p class="feedback ${feedback ? "bad" : ""}" id="startFeedback">${feedback}</p>
        <div class="divider">or</div>
        <button class="btn" type="submit">Start!</button>
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
        <h2>${clue.title}</h2>
        <p class="clue">${clue.text}</p>
        <button class="btn secondary" id="hintBtn" type="button" aria-expanded="${hintOpen}">${hintOpen ? "Hide hint" : "Reveal hint"}</button>
        ${hintOpen ? `<p class="hint">${clue.hint}</p>` : ""}
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
  app.innerHTML = `<section class="screen stack"><h1>Complete</h1><p class="clue">You finished the treasure hunt. Replace this message with your finale instructions.</p><button class="btn" id="againBtn" type="button">Play again</button><button class="btn danger" id="resetBtn" type="button">Reset hunt</button></section>`;
  document.querySelector("#againBtn").addEventListener("click", () => { setState({ current: 0, complete: false }); renderCurrent(); });
  document.querySelector("#resetBtn").addEventListener("click", resetHunt);
}

renderStart();
