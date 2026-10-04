/* ==========================================================================
   Keystroke — Typing Speed Test
   Plain JS, no build step. Organized into: data, state, DOM refs, theme,
   sound, keyboard viz, passage handling, timer/test lifecycle, stats,
   results + storage (personal best & history).
   ========================================================================== */

/* ----------------------------- Passage data ----------------------------- */
const PASSAGES = {
  easy: [
    "the cat sat on the mat and looked out at the rain.",
    "she likes to read a book each night before bed.",
    "we walk to the park and feed the small brown ducks.",
    "he made a cup of tea and sat by the window.",
    "the dog ran across the yard to fetch the ball."
  ],
  medium: [
    "the quiet library smelled of old paper and warm dust, and every footstep echoed between the tall wooden shelves.",
    "learning to type quickly takes patience, since your fingers need time to remember where each letter lives.",
    "a soft rain began just as the market stalls were closing, sending vendors scrambling to cover their fruit.",
    "the engineer sketched the bridge on a napkin, certain the idea would look better once it reached the whiteboard.",
    "morning light moved slowly across the kitchen floor while the kettle began its long, low whistle."
  ],
  hard: [
    "the committee's decision, though unanimous, left several department heads privately questioning whether the timeline of eighteen months was remotely realistic.",
    "quantum computers exploit superposition and entanglement, two properties that make classical intuition an unreliable guide to their behavior.",
    "despite three redrafts, the contract's indemnification clause still contradicted section 4.2, a discrepancy nobody caught until the signing meeting.",
    "the archipelago's biodiversity, shaped by isolation and volcanic upheaval, produced species found nowhere else on the planet.",
    "negotiators from both delegations reconvened at dawn, aware that the treaty's final wording would be scrutinized for decades."
  ]
};

/* -------------------------------- State ---------------------------------- */
const state = {
  difficulty: "medium",
  duration: 30,
  passageText: "",
  typedValue: "",
  isRunning: false,
  isFinished: false,
  startTime: null,
  timerHandle: null,
  errorCount: 0,
  paceSamples: [],   // {t: secondsElapsed, wpm}
  lastSampledSecond: -1,
  soundEnabled: false,
  audioCtx: null
};

/* ------------------------------- DOM refs -------------------------------- */
const el = {
  html: document.documentElement,
  
  soundToggle: document.getElementById("soundToggle"),
  difficultySet: document.getElementById("difficultySet"),
  durationSet: document.getElementById("durationSet"),
  statTimer: document.getElementById("statTimer"),
  statWpm: document.getElementById("statWpm"),
  statAccuracy: document.getElementById("statAccuracy"),
  statErrors: document.getElementById("statErrors"),
  statBest: document.getElementById("statBest"),
  setupView: document.getElementById("setupView"),
  testView: document.getElementById("testView"),
  startTestBtn: document.getElementById("startTestBtn"),
  setupBest: document.getElementById("setupBest"),
  changeSettingsBtn: document.getElementById("changeSettingsBtn"),
  typeStage: document.getElementById("typeStage"),
  passageWrap: document.getElementById("passageWrap"),
  passage: document.getElementById("passage"),
  focusVeil: document.getElementById("focusVeil"),
  hiddenInput: document.getElementById("hiddenInput"),
  restartBtn: document.getElementById("restartBtn"),
  tallyCorrect: document.getElementById("tallyCorrect"),
  tallyIncorrect: document.getElementById("tallyIncorrect"),
  results: document.getElementById("results"),
  resultsHeadline: document.getElementById("resultsHeadline"),
  pbBadge: document.getElementById("pbBadge"),
  resWpm: document.getElementById("resWpm"),
  resAccuracy: document.getElementById("resAccuracy"),
  resCorrect: document.getElementById("resCorrect"),
  resIncorrect: document.getElementById("resIncorrect"),
  resErrors: document.getElementById("resErrors"),
  resRawWpm: document.getElementById("resRawWpm"),
  paceChart: document.getElementById("paceChart"),
  tryAgainBtn: document.getElementById("tryAgainBtn"),
  keyboard: document.getElementById("keyboard"),
  keyboardPanel: document.getElementById("keyboardPanel"),
  historyChart: document.getElementById("historyChart"),
  historyEmpty: document.getElementById("historyEmpty"),
  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn")
};

/* ================================ Theme ================================== */


/* ================================ Sound =================================== */
function initSound() {
  state.soundEnabled = localStorage.getItem("keystroke_sound") === "1";
  el.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
}
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  el.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
  localStorage.setItem("keystroke_sound", state.soundEnabled ? "1" : "0");
}
el.soundToggle.addEventListener("click", toggleSound);

function ensureAudioCtx() {
  if (!state.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new Ctx();
  }
  return state.audioCtx;
}
function playTone(freq, dur, type) {
  if (!state.soundEnabled) return;
  const ctx = ensureAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

/* ============================ Keyboard viz ================================ */
const KEY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
  [" "]
];
function buildKeyboard() {
  el.keyboard.innerHTML = "";
  KEY_ROWS.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "key-row";
    row.forEach((k) => {
      const keyEl = document.createElement("span");
      keyEl.className = "key" + (k === " " ? " k-space" : "");
      keyEl.dataset.key = k;
      keyEl.textContent = k === " " ? "space" : k;
      rowEl.appendChild(keyEl);
    });
    el.keyboard.appendChild(rowEl);
  });
}
function flashKey(key, active) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  const target = el.keyboard.querySelector(`[data-key="${k === " " ? " " : k}"]`);
  if (target) target.classList.toggle("is-active", active);
}

/* ============================ Passage handling ============================ */
function randomPassage(difficulty) {
  const pool = PASSAGES[difficulty];
  return pool[Math.floor(Math.random() * pool.length)];
}

function charSpan(ch) {
  const span = document.createElement("span");
  span.className = "char";
  span.textContent = ch;
  return span;
}

function setFreshPassage() {
  state.passageText = randomPassage(state.difficulty);
  el.passage.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const ch of state.passageText) frag.appendChild(charSpan(ch));
  el.passage.appendChild(frag);
  markCurrentIndex(0);
}

// Append more text once the typist is nearing the end of the buffer, so a
// duration-based test never "runs out" of passage mid-flow.
function extendPassageIfNeeded() {
  const remaining = state.passageText.length - state.typedValue.length;
  if (remaining < 40) {
    const addition = " " + randomPassage(state.difficulty);
    state.passageText += addition;
    const frag = document.createDocumentFragment();
    for (const ch of addition) frag.appendChild(charSpan(ch));
    el.passage.appendChild(frag);
  }
}

function markCurrentIndex(index) {
  const prevCurrent = el.passage.querySelector(".char.current");
  if (prevCurrent) prevCurrent.classList.remove("current");
  const spans = el.passage.children;
  if (spans[index]) spans[index].classList.add("current");
}

/* ============================ Test lifecycle =============================== */
function startTest() {
  state.isRunning = true;
  state.isFinished = false;
  state.startTime = Date.now();
  state.errorCount = 0;
  state.paceSamples = [];
  state.lastSampledSecond = -1;
  setControlsDisabled(true);
  state.timerHandle = setInterval(tick, 200);
  tick();
}

function tick() {
  const elapsedMs = Date.now() - state.startTime;
  const elapsedSec = elapsedMs / 1000;
  const remaining = Math.max(0, state.duration - elapsedSec);
  el.statTimer.textContent = Math.ceil(remaining);

  updateLiveStats(elapsedMs);

  const wholeSecond = Math.floor(elapsedSec);
  if (wholeSecond !== state.lastSampledSecond && wholeSecond <= state.duration) {
    state.lastSampledSecond = wholeSecond;
    const wpmNow = Number(el.statWpm.textContent) || 0;
    state.paceSamples.push({ t: wholeSecond, wpm: wpmNow });
  }

  if (remaining <= 0) endTest();
}

function endTest() {
  if (!state.isRunning) return;
  state.isRunning = false;
  state.isFinished = true;
  clearInterval(state.timerHandle);
  el.hiddenInput.blur();
  setControlsDisabled(false);
  renderResults();
}

function setControlsDisabled(disabled) {
  el.difficultySet.querySelectorAll(".pill").forEach((b) => (b.disabled = disabled));
  el.durationSet.querySelectorAll(".pill").forEach((b) => (b.disabled = disabled));
}

/* =============================== Live stats ================================ */
function compareTyped() {
  let correct = 0;
  let incorrect = 0;
  const spans = el.passage.children;
  const typed = state.typedValue;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (i < typed.length) {
      const isCorrect = typed[i] === state.passageText[i];
      span.classList.toggle("correct", isCorrect);
      span.classList.toggle("incorrect", !isCorrect);
      if (isCorrect) correct++; else incorrect++;
    } else {
      span.classList.remove("correct", "incorrect");
    }
  }
  markCurrentIndex(Math.min(typed.length, spans.length - 1));
  return { correct, incorrect };
}

function updateLiveStats(elapsedMs) {
  const { correct, incorrect } = compareTyped();
  el.tallyCorrect.textContent = correct;
  el.tallyIncorrect.textContent = incorrect;
  el.statErrors.textContent = state.errorCount;

  const totalTyped = correct + incorrect;
  const accuracy = totalTyped > 0 ? Math.round((correct / totalTyped) * 100) : 100;
  el.statAccuracy.textContent = accuracy;

  const minutes = Math.max(elapsedMs / 60000, 1 / 600); // guard divide-by-zero
  const wpm = Math.round((correct / 5) / minutes);
  el.statWpm.textContent = elapsedMs > 250 ? wpm : 0;
}

/* ============================== Input handling ============================== */
el.passageWrap.addEventListener("click", () => el.hiddenInput.focus());

el.hiddenInput.addEventListener("focus", () => el.typeStage.classList.add("is-focused"));
el.hiddenInput.addEventListener("blur", () => {
  if (!state.isFinished) el.typeStage.classList.remove("is-focused");
});

el.hiddenInput.addEventListener("input", (e) => {
  if (state.isFinished) { e.target.value = ""; return; }
  if (!state.isRunning) startTest();

  const newValue = e.target.value;
  const grew = newValue.length > state.typedValue.length;

  if (grew) {
    const idx = newValue.length - 1;
    const expected = state.passageText[idx];
    const typedChar = newValue[idx];
    const isMatch = typedChar === expected;
    if (!isMatch) state.errorCount++;
    playTone(isMatch ? 880 : 220, isMatch ? 0.03 : 0.08, isMatch ? "sine" : "square");
  }

  state.typedValue = newValue;
  extendPassageIfNeeded();
  updateLiveStats(Date.now() - state.startTime);
});

el.hiddenInput.addEventListener("keydown", (e) => {
  if (e.key.length === 1 || e.key === " ") flashKey(e.key, true);
});
el.hiddenInput.addEventListener("keyup", (e) => {
  if (e.key.length === 1 || e.key === " ") flashKey(e.key, false);
});

/* =============================== Restart / reset ============================= */
function resetTest() {
  clearInterval(state.timerHandle);
  state.isRunning = false;
  state.isFinished = false;
  state.typedValue = "";
  state.errorCount = 0;
  state.paceSamples = [];
  state.lastSampledSecond = -1;
  el.hiddenInput.value = "";
  el.results.hidden = true;
  el.typeStage.hidden = false;
el.keyboardPanel.hidden = false;
  el.statTimer.textContent = state.duration;
  el.statWpm.textContent = 0;
  el.statAccuracy.textContent = 100;
  el.statErrors.textContent = 0;
  el.tallyCorrect.textContent = 0;
  el.tallyIncorrect.textContent = 0;
  setControlsDisabled(false);
  setFreshPassage();
  refreshBestDisplay();
}
el.restartBtn.addEventListener("click", () => {
  resetTest();
  el.hiddenInput.focus();
});

/* =============================== View switching ============================== */
// Screen 1 (setup) <-> Screen 2 (test). Only these two functions ever toggle
// which screen is visible — everything else just manipulates content.
function goToTest() {
  el.setupView.hidden = true;
  el.testView.hidden = false;
  resetTest();
  el.hiddenInput.focus();
}
function goToSetup() {
  el.testView.hidden = true;
  el.setupView.hidden = false;
  resetTest();
  renderHistory();
}

el.startTestBtn.addEventListener("click", goToTest);
el.changeSettingsBtn.addEventListener("click", goToSetup);
el.tryAgainBtn.addEventListener("click", () => {
  resetTest();
  el.hiddenInput.focus();
});

/* ================================= Results =================================== */
function renderResults() {
  const { correct, incorrect } = compareTyped();
  const totalTyped = correct + incorrect;
  const accuracy = totalTyped > 0 ? Math.round((correct / totalTyped) * 100) : 100;
  const minutes = state.duration / 60;
  const wpm = Math.round((correct / 5) / minutes);
  const rawWpm = Math.round((totalTyped / 5) / minutes);

  el.resWpm.textContent = wpm;
  el.resAccuracy.textContent = accuracy;
  el.resCorrect.textContent = correct;
  el.resIncorrect.textContent = incorrect;
  el.resErrors.textContent = state.errorCount;
  el.resRawWpm.textContent = rawWpm;

  const isNewBest = updatePersonalBest(wpm);
  el.pbBadge.hidden = !isNewBest;
  el.resultsHeadline.textContent = isNewBest ? "New personal best!" : "Test complete";

  drawPaceChart();
  saveHistoryEntry({ wpm, accuracy, errors: state.errorCount, duration: state.duration, difficulty: state.difficulty });
  refreshBestDisplay();
  renderHistory();

  el.results.hidden = false;
  el.typeStage.hidden = true;
el.keyboardPanel.hidden = true;
}

function drawPaceChart() {
  const samples = state.paceSamples.length ? state.paceSamples : [{ t: 0, wpm: 0 }];
  const maxWpm = Math.max(...samples.map((s) => s.wpm), 10);
  const points = samples
    .map((s) => {
      const x = (s.t / state.duration) * 300;
      const y = 76 - (s.wpm / maxWpm) * 66;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  el.paceChart.innerHTML = `
    <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="0" y1="78" x2="300" y2="78" stroke="var(--border)" stroke-width="1"/>
  `;
}

/* ======================== Personal best (localStorage) ======================= */
function pbKey() { return `${state.difficulty}_${state.duration}`; }
function loadAllBests() {
  try { return JSON.parse(localStorage.getItem("keystroke_pb")) || {}; }
  catch (err) { return {}; }
}
function updatePersonalBest(wpm) {
  const all = loadAllBests();
  const key = pbKey();
  const prev = all[key] || 0;
  if (wpm > prev) {
    all[key] = wpm;
    localStorage.setItem("keystroke_pb", JSON.stringify(all));
    return true;
  }
  return false;
}
function refreshBestDisplay() {
  const all = loadAllBests();
  const best = all[pbKey()];
  el.statBest.textContent = best ? best : "—";
  el.setupBest.textContent = best ? best : "—";
}

/* =========================== History (localStorage) =========================== */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem("keystroke_history")) || []; }
  catch (err) { return []; }
}
function saveHistoryEntry(entry) {
  const history = loadHistory();
  history.unshift({ ...entry, ts: Date.now() });
  localStorage.setItem("keystroke_history", JSON.stringify(history.slice(0, 20)));
}
function renderHistory() {
  const history = loadHistory();
  el.historyEmpty.hidden = history.length > 0;

  // Bars: oldest to newest across the last 10 sessions.
  const recent = history.slice(0, 10).reverse();
  const maxWpm = Math.max(...recent.map((h) => h.wpm), 1);
  el.historyChart.querySelectorAll(".history-bar").forEach((b) => b.remove());
  recent.forEach((h) => {
    const bar = document.createElement("div");
    bar.className = "history-bar";
    bar.style.height = `${Math.max((h.wpm / maxWpm) * 100, 4)}%`;
    bar.title = `${h.wpm} wpm`;
    el.historyChart.appendChild(bar);
  });

  el.historyList.innerHTML = "";
  history.slice(0, 8).forEach((h) => {
    const li = document.createElement("li");
    const date = new Date(h.ts);
    const when = date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " · " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    li.innerHTML = `
      <span>${when} — ${h.difficulty}, ${h.duration}s</span>
      <span class="hist-wpm">${h.wpm} wpm</span>
      <span>${h.accuracy}% · ${h.errors} err</span>
    `;
    el.historyList.appendChild(li);
  });
}
function clearHistory() {
  localStorage.removeItem("keystroke_history");
  renderHistory();
}
el.clearHistoryBtn.addEventListener("click", clearHistory);

/* ============================ Difficulty / duration =========================== */
el.difficultySet.addEventListener("click", (e) => {
  const btn = e.target.closest(".pill");
  if (!btn || state.isRunning) return;
  el.difficultySet.querySelectorAll(".pill").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  state.difficulty = btn.dataset.difficulty;
  resetTest();
});

el.durationSet.addEventListener("click", (e) => {
  const btn = e.target.closest(".pill");
  if (!btn || state.isRunning) return;
  el.durationSet.querySelectorAll(".pill").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  state.duration = Number(btn.dataset.duration);
  resetTest();
});

/* =================================== Init ===================================== */
function init() {
  
  initSound();
  buildKeyboard();
  setFreshPassage();
  refreshBestDisplay();
  renderHistory();
  el.statTimer.textContent = state.duration;
}
init();
