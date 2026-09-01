import "./styles.css";
import { PHRASES, phraseForDay, randomPhrase, type PhraseEntry } from "./phrases";
import { SaveStore, ScreenManager, MenuNavigator, TinyAudio, type SaveData } from "./shell";
import {
  burnLetters,
  countsForText,
  humanReason,
  remainingCounts,
  scoreWord,
  validateWord
} from "./word-engine";

type ModeId = "classic" | "burn" | "blitz" | "daily";

type FoundWord = {
  word: string;
  points: number;
};

type RoundState = {
  mode: ModeId;
  phrase: PhraseEntry;
  score: number;
  timeLeft: number;
  submitted: Set<string>;
  found: FoundWord[];
  burned: Set<number>;
  combo: number;
  bestCombo: number;
  lastValidAt: number;
  paused: boolean;
  ended: boolean;
};

const MODE_META: Record<ModeId, { name: string; kicker: string; description: string; duration: number }> = {
  classic: {
    name: "Classic",
    kicker: "Mine the phrase",
    description: "Letters return after every word. Find as many words as you can.",
    duration: 120
  },
  burn: {
    name: "Burn",
    kicker: "Spend every letter wisely",
    description: "Submitted letters disappear permanently. Every word changes what remains.",
    duration: 150
  },
  blitz: {
    name: "Blitz",
    kicker: "Speed over perfection",
    description: "Sixty seconds. Reusable letters. Chain fast answers for bigger combos.",
    duration: 60
  },
  daily: {
    name: "Daily Phrase",
    kicker: "One phrase. One score.",
    description: "The same phrase for everyone today. Your best score is saved locally.",
    duration: 120
  }
};

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) throw new Error("Missing #app root");

const store = new SaveStore();
let save: SaveData = store.load();
const screens = new ScreenManager(appRoot);
new MenuNavigator(appRoot);
const audio = new TinyAudio();

let round: RoundState | null = null;
let timerId: number | null = null;
let lastResult: RoundState | null = null;
let lastPhraseText = "";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char] ?? char);
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function shell(title: string, content: string, options: { back?: string; compact?: boolean } = {}): string {
  return `
    <main class="shell ${options.compact ? "shell--compact" : ""}">
      <header class="topbar">
        ${options.back ? `<button class="icon-button" data-nav data-action="${options.back}" aria-label="Back">←</button>` : `<span class="brand-mark">MW</span>`}
        <div class="topbar__title">${title}</div>
        <button class="icon-button" data-nav data-action="settings" aria-label="Settings">⚙</button>
      </header>
      ${content}
    </main>`;
}

function showTitle(): void {
  stopTimer();
  screens.show("title", `
    <main class="title-screen">
      <div class="title-orbit" aria-hidden="true"><span>A</span><span>R</span><span>T</span><span>E</span></div>
      <section class="title-lockup">
        <div class="eyebrow">SLU WORD GAME</div>
        <h1>MAKE<br><em>A</em> WORD</h1>
        <p>Mine a phrase. Build everything hiding inside it.</p>
        <button class="primary-button primary-button--wide" data-nav data-action="enter-menu">START</button>
      </section>
      <div class="title-footer">v0.1 • WORDS ARE HIDING EVERYWHERE</div>
    </main>
  `);
}

function showMenu(): void {
  stopTimer();
  const dailyDone = save.daily[todayKey()] ?? 0;
  screens.show("menu", shell("MAKE A WORD", `
    <section class="hero-panel">
      <div>
        <div class="eyebrow">PHRASE MINING</div>
        <h2>Every sentence is<br>a field of possibilities.</h2>
        <p>Use only the letters you can see. Longer words score more. Fast answers build combo.</p>
      </div>
      <div class="hero-score">
        <span>BEST SCORE</span>
        <strong>${Math.max(0, ...Object.values(save.bestScores)).toLocaleString()}</strong>
      </div>
    </section>

    <section class="menu-grid">
      <button class="menu-card menu-card--feature" data-nav data-action="modes">
        <span class="menu-card__tag">PLAY</span>
        <strong>Choose a Mode</strong>
        <small>Classic • Burn • Blitz</small>
        <span class="arrow">→</span>
      </button>
      <button class="menu-card menu-card--daily" data-nav data-mode="daily">
        <span class="menu-card__tag">TODAY</span>
        <strong>Daily Phrase</strong>
        <small>${dailyDone ? `Best today: ${dailyDone.toLocaleString()}` : "Unplayed"}</small>
        <span class="arrow">→</span>
      </button>
      <button class="menu-card" data-nav data-action="stats">
        <span class="menu-card__tag">PROFILE</span>
        <strong>Statistics</strong>
        <small>${save.totalWords.toLocaleString()} words found</small>
      </button>
      <button class="menu-card" data-nav data-action="help">
        <span class="menu-card__tag">RULES</span>
        <strong>How to Play</strong>
        <small>Learn the phrase</small>
      </button>
    </section>
  `));
}

function showModes(): void {
  const cards = (["classic", "burn", "blitz"] as ModeId[]).map((id) => {
    const meta = MODE_META[id];
    const best = save.bestScores[id] ?? 0;
    return `
      <button class="mode-card mode-card--${id}" data-nav data-mode="${id}">
        <div class="mode-card__number">${id === "classic" ? "01" : id === "burn" ? "02" : "03"}</div>
        <div class="mode-card__body">
          <span>${meta.kicker}</span>
          <strong>${meta.name}</strong>
          <p>${meta.description}</p>
          <small>${formatTime(meta.duration)} • BEST ${best.toLocaleString()}</small>
        </div>
        <div class="mode-card__arrow">→</div>
      </button>`;
  }).join("");

  screens.show("modes", shell("CHOOSE A MODE", `<section class="mode-list">${cards}</section>`, { back: "menu" }));
}

function choosePhrase(mode: ModeId): PhraseEntry {
  if (mode === "daily") return phraseForDay();
  const phrase = randomPhrase(lastPhraseText);
  lastPhraseText = phrase.text;
  return phrase;
}

function startRound(mode: ModeId): void {
  stopTimer();
  const phrase = choosePhrase(mode);
  round = {
    mode,
    phrase,
    score: 0,
    timeLeft: MODE_META[mode].duration,
    submitted: new Set(),
    found: [],
    burned: new Set(),
    combo: 0,
    bestCombo: 0,
    lastValidAt: 0,
    paused: false,
    ended: false
  };
  audio.play("start", save.settings.sound);
  renderGame();
  timerId = window.setInterval(tick, 1000);
}

function renderPhrase(state: RoundState): string {
  let wordIndex = 0;
  const words = state.phrase.text.split(" ");
  return words.map((word) => {
    const letters = [...word].map((char) => {
      while (state.phrase.text[wordIndex] === " ") wordIndex += 1;
      const index = wordIndex;
      wordIndex += 1;
      const burned = state.burned.has(index);
      return `<span class="phrase-letter ${burned ? "phrase-letter--burned" : ""}" data-letter-index="${index}">${escapeHtml(char)}</span>`;
    }).join("");
    wordIndex += 1;
    return `<span class="phrase-word">${letters}</span>`;
  }).join(" ");
}

function renderFound(state: RoundState): string {
  if (!state.found.length) return `<div class="empty-found">Your words will collect here.</div>`;
  return state.found.slice().reverse().map((item, index) => `
    <div class="found-word ${index === 0 ? "found-word--new" : ""}">
      <span>${item.word.toUpperCase()}</span><strong>+${item.points}</strong>
    </div>`).join("");
}

function renderGame(): void {
  if (!round) return;
  const state = round;
  const meta = MODE_META[state.mode];
  screens.show("game", `
    <main class="game-screen">
      <header class="game-hud">
        <button class="icon-button" data-nav data-action="pause" aria-label="Pause">Ⅱ</button>
        <div class="hud-stat"><span>MODE</span><strong>${meta.name.toUpperCase()}</strong></div>
        <div class="hud-stat hud-stat--score"><span>SCORE</span><strong id="score-value">${state.score.toLocaleString()}</strong></div>
        <div class="hud-stat hud-stat--combo"><span>COMBO</span><strong id="combo-value">×${Math.max(1, state.combo + 1)}</strong></div>
        <div class="hud-stat hud-stat--time"><span>TIME</span><strong id="time-value">${formatTime(state.timeLeft)}</strong></div>
      </header>

      <section class="playfield">
        <div class="phrase-header">
          <span>${state.mode === "burn" ? "SPEND THESE LETTERS" : "MINE THIS PHRASE"}</span>
          <small>${state.phrase.label} • DIFFICULTY ${"◆".repeat(state.phrase.difficulty)}${"◇".repeat(5 - state.phrase.difficulty)}</small>
        </div>
        <div class="phrase-display" id="phrase-display">${renderPhrase(state)}</div>

        <form class="word-entry" id="word-form" autocomplete="off">
          <input id="word-input" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="24" aria-label="Enter a word" placeholder="TYPE A WORD" />
          <button class="submit-word" type="submit">ENTER</button>
        </form>
        <div class="feedback" id="feedback">3+ letters • ENTER to submit</div>

        <div class="round-lower">
          <div class="found-panel">
            <div class="found-panel__header"><span>FOUND</span><strong id="word-count">${state.found.length}</strong></div>
            <div class="found-list" id="found-list">${renderFound(state)}</div>
          </div>
          <aside class="round-tip">
            <span>${state.mode === "burn" ? "BURN RULE" : "SCORING"}</span>
            <p>${state.mode === "burn" ? "Once a letter is used, it is gone. Save scarce letters for the words that deserve them." : "Length beats volume. Keep answers flowing to increase your combo multiplier."}</p>
          </aside>
        </div>
      </section>

      <div id="pause-layer"></div>
    </main>
  `);

  bindWordForm();
  focusWordInput();
}

function bindWordForm(): void {
  const form = document.querySelector<HTMLFormElement>("#word-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitCurrentWord();
  });
}

function focusWordInput(): void {
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#word-input")?.focus({ preventScroll: true }));
}

function submitCurrentWord(): void {
  if (!round || round.paused || round.ended) return;
  const input = document.querySelector<HTMLInputElement>("#word-input");
  if (!input) return;
  const available = round.mode === "burn" ? remainingCounts(round.phrase.text, round.burned) : countsForText(round.phrase.text);
  const result = validateWord(input.value, available, round.submitted);
  const feedback = document.querySelector<HTMLElement>("#feedback");

  if (!result.ok) {
    audio.play("reject", save.settings.sound);
    feedback?.classList.remove("feedback--good");
    feedback?.classList.add("feedback--bad");
    if (feedback) feedback.textContent = humanReason(result.reason);
    input.classList.remove("shake");
    void input.offsetWidth;
    input.classList.add("shake");
    return;
  }

  const now = performance.now();
  round.combo = round.lastValidAt && now - round.lastValidAt <= 5000 ? round.combo + 1 : 0;
  round.bestCombo = Math.max(round.bestCombo, round.combo);
  round.lastValidAt = now;
  const points = scoreWord(result.word.length, round.combo, round.mode === "burn");
  round.score += points;
  round.submitted.add(result.word);
  round.found.push({ word: result.word, points });
  if (round.mode === "burn") round.burned = burnLetters(round.phrase.text, result.word, round.burned);

  input.value = "";
  audio.play("accept", save.settings.sound);
  if (feedback) {
    feedback.classList.remove("feedback--bad");
    feedback.classList.add("feedback--good");
    feedback.textContent = `${result.word.toUpperCase()}  +${points}${round.combo ? `  •  COMBO ×${round.combo + 1}` : ""}`;
  }
  updateGameHud();
}

function updateGameHud(): void {
  if (!round) return;
  const score = document.querySelector<HTMLElement>("#score-value");
  const combo = document.querySelector<HTMLElement>("#combo-value");
  const count = document.querySelector<HTMLElement>("#word-count");
  const list = document.querySelector<HTMLElement>("#found-list");
  const phrase = document.querySelector<HTMLElement>("#phrase-display");
  if (score) score.textContent = round.score.toLocaleString();
  if (combo) combo.textContent = `×${Math.max(1, round.combo + 1)}`;
  if (count) count.textContent = String(round.found.length);
  if (list) list.innerHTML = renderFound(round);
  if (phrase && round.mode === "burn") phrase.innerHTML = renderPhrase(round);
}

function tick(): void {
  if (!round || round.paused || round.ended) return;
  round.timeLeft -= 1;
  const time = document.querySelector<HTMLElement>("#time-value");
  if (time) {
    time.textContent = formatTime(round.timeLeft);
    time.classList.toggle("danger", round.timeLeft <= 10);
  }
  if (round.timeLeft <= 10 && round.timeLeft > 0) audio.play("tick", save.settings.sound);
  if (round.timeLeft <= 0) endRound();
}

function togglePause(force?: boolean): void {
  if (!round || round.ended) return;
  round.paused = force ?? !round.paused;
  const layer = document.querySelector<HTMLElement>("#pause-layer");
  if (!layer) return;
  if (!round.paused) {
    layer.innerHTML = "";
    focusWordInput();
    return;
  }
  layer.innerHTML = `
    <div class="pause-overlay">
      <div class="pause-card">
        <span class="eyebrow">ROUND PAUSED</span>
        <h2>${MODE_META[round.mode].name}</h2>
        <p>${round.phrase.text}</p>
        <button class="primary-button" data-nav data-action="resume">RESUME</button>
        <button class="secondary-button" data-nav data-action="restart">RESTART</button>
        <button class="text-button" data-nav data-action="quit">QUIT TO MENU</button>
      </div>
    </div>`;
  screens.focusFirst();
}

function stopTimer(): void {
  if (timerId !== null) window.clearInterval(timerId);
  timerId = null;
}

function endRound(): void {
  if (!round || round.ended) return;
  round.ended = true;
  stopTimer();
  audio.play("end", save.settings.sound);
  lastResult = round;

  const modeKey = round.mode;
  save.bestScores[modeKey] = Math.max(save.bestScores[modeKey] ?? 0, round.score);
  if (round.mode === "daily") save.daily[todayKey()] = Math.max(save.daily[todayKey()] ?? 0, round.score);
  save.totalWords += round.found.length;
  save.totalScore += round.score;
  save.roundsPlayed += 1;
  const longest = round.found.reduce((best, entry) => entry.word.length > best.length ? entry.word : best, save.longestWord);
  save.longestWord = longest;
  store.save(save);
  showResults();
}

function showResults(): void {
  const result = lastResult;
  if (!result) return showMenu();
  const sorted = result.found.slice().sort((a, b) => b.word.length - a.word.length || b.points - a.points);
  const longest = sorted[0]?.word ?? "—";
  const best = save.bestScores[result.mode] ?? result.score;
  const newBest = result.score >= best && result.score > 0;

  screens.show("results", shell("ROUND COMPLETE", `
    <section class="results-hero">
      <span class="eyebrow">${MODE_META[result.mode].name.toUpperCase()} • ${result.phrase.label.toUpperCase()}</span>
      <div class="results-score">${result.score.toLocaleString()}</div>
      <div class="results-label">${newBest ? "PERSONAL BEST" : `BEST ${best.toLocaleString()}`}</div>
    </section>
    <section class="result-stats">
      <div><span>WORDS</span><strong>${result.found.length}</strong></div>
      <div><span>LONGEST</span><strong>${longest.toUpperCase()}</strong></div>
      <div><span>BEST COMBO</span><strong>×${result.bestCombo + 1}</strong></div>
      <div><span>MODE</span><strong>${MODE_META[result.mode].name.toUpperCase()}</strong></div>
    </section>
    <section class="result-words">
      <div class="section-heading"><span>YOUR WORDS</span><small>${result.found.length} FOUND</small></div>
      <div class="result-word-grid">
        ${sorted.length ? sorted.map((item) => `<div><span>${item.word.toUpperCase()}</span><strong>${item.points}</strong></div>`).join("") : "<p>No words this round. The phrase gets another shot.</p>"}
      </div>
    </section>
    <section class="result-actions">
      <button class="primary-button" data-nav data-action="again">PLAY AGAIN</button>
      <button class="secondary-button" data-nav data-action="modes">CHANGE MODE</button>
      <button class="text-button" data-nav data-action="menu">MAIN MENU</button>
    </section>
  `));
}

function showStats(): void {
  const avg = save.roundsPlayed ? Math.round(save.totalScore / save.roundsPlayed) : 0;
  screens.show("stats", shell("STATISTICS", `
    <section class="stats-grid">
      <div class="stat-tile stat-tile--wide"><span>TOTAL SCORE</span><strong>${save.totalScore.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>WORDS FOUND</span><strong>${save.totalWords.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>ROUNDS</span><strong>${save.roundsPlayed.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>AVG SCORE</span><strong>${avg.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>LONGEST WORD</span><strong>${save.longestWord ? save.longestWord.toUpperCase() : "—"}</strong></div>
    </section>
    <section class="best-list">
      ${(["classic", "burn", "blitz", "daily"] as ModeId[]).map((id) => `<div><span>${MODE_META[id].name}</span><strong>${(save.bestScores[id] ?? 0).toLocaleString()}</strong></div>`).join("")}
    </section>
  `, { back: "menu" }));
}

function showHelp(): void {
  screens.show("help", shell("HOW TO PLAY", `
    <section class="rule-stack">
      <article><span>01</span><div><h3>Read the phrase</h3><p>Every answer must be made only from letters that appear in the phrase. A letter can only appear as many times as the phrase provides it.</p></div></article>
      <article><span>02</span><div><h3>Make words</h3><p>Words must be at least three letters. Longer answers are worth dramatically more points.</p></div></article>
      <article><span>03</span><div><h3>Keep the chain alive</h3><p>Submit another valid word within five seconds to raise your combo and increase the score.</p></div></article>
      <article><span>04</span><div><h3>Burn changes everything</h3><p>In Burn, letters do not return after a word. A huge answer can be valuable—or destroy several future possibilities.</p></div></article>
    </section>
    <button class="primary-button" data-nav data-action="modes">CHOOSE A MODE</button>
  `, { back: "menu" }));
}

function showSettings(returnTo: string = "menu"): void {
  const previous = screens.getCurrent();
  screens.show("settings", shell("SETTINGS", `
    <section class="settings-list" data-return="${returnTo === "menu" ? previous : returnTo}">
      <button class="setting-row" data-nav data-action="toggle-sound"><span><strong>Sound</strong><small>Game tones and feedback</small></span><b>${save.settings.sound ? "ON" : "OFF"}</b></button>
      <button class="setting-row" data-nav data-action="toggle-motion"><span><strong>Reduced Motion</strong><small>Minimize movement and impact animation</small></span><b>${save.settings.reducedMotion ? "ON" : "OFF"}</b></button>
    </section>
    <p class="settings-note">Progress is stored locally on this device in this prototype.</p>
  `, { back: "settings-back" }));
}

function settingsReturn(): void {
  const returnId = document.querySelector<HTMLElement>(".settings-list")?.dataset.return;
  if (returnId === "game" && round) renderGame();
  else if (returnId === "modes") showModes();
  else if (returnId === "stats") showStats();
  else if (returnId === "help") showHelp();
  else showMenu();
}

appRoot.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action], [data-mode]");
  if (!target) return;
  const mode = target.dataset.mode as ModeId | undefined;
  if (mode) return startRound(mode);
  const action = target.dataset.action;
  if (!action) return;

  if (action === "enter-menu" || action === "menu") showMenu();
  else if (action === "modes") showModes();
  else if (action === "stats") showStats();
  else if (action === "help") showHelp();
  else if (action === "settings") showSettings();
  else if (action === "settings-back") settingsReturn();
  else if (action === "pause") togglePause(true);
  else if (action === "resume") togglePause(false);
  else if (action === "restart" && round) startRound(round.mode);
  else if (action === "quit") { round = null; showMenu(); }
  else if (action === "again" && lastResult) startRound(lastResult.mode);
  else if (action === "toggle-sound") {
    save.settings.sound = !save.settings.sound;
    store.save(save);
    showSettings("settings");
  } else if (action === "toggle-motion") {
    save.settings.reducedMotion = !save.settings.reducedMotion;
    document.documentElement.classList.toggle("reduce-motion", save.settings.reducedMotion);
    store.save(save);
    showSettings("settings");
  }
});

window.addEventListener("keydown", (event) => {
  if (screens.getCurrent() !== "game" || !round) return;
  if (event.key === "Escape") {
    event.preventDefault();
    togglePause();
    return;
  }
  if (round.paused) return;
  const input = document.querySelector<HTMLInputElement>("#word-input");
  if (!input) return;
  if (/^[a-zA-Z]$/.test(event.key) && document.activeElement !== input && !event.metaKey && !event.ctrlKey && !event.altKey) {
    input.focus();
  }
});

window.addEventListener("visibilitychange", () => {
  if (document.hidden && round && !round.ended && !round.paused) togglePause(true);
});

document.documentElement.classList.toggle("reduce-motion", save.settings.reducedMotion);
showTitle();

// Keep content referenced so future phrase-doctor tooling can inspect the bank from this bundle.
void PHRASES;
