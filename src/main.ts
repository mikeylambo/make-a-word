import "./styles.css";
import { PHRASES, phraseForDay, randomPhrase, type PhraseEntry } from "./phrases";
import { SaveStore, ScreenManager, MenuNavigator, TinyAudio, type SaveData, type ScreenId } from "./shell";
import {
  burnLetters,
  countsForText,
  hasPlayableWord,
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
  comboFrozenAt: number;
  boardNumber: number;
  boardsCleared: number;
  boardWords: number;
  starting: boolean;
  dealing: boolean;
  paused: boolean;
  ended: boolean;
  newBest: boolean;
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
    description: "Spend a phrase, clear the board, then keep scoring from the next deal.",
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
let flowToken = 0;
let settingsReturnScreen: ScreenId = "menu";
let comboMeterFrame: number | null = null;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

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
  flowToken += 1;
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
  flowToken += 1;
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
  const token = ++flowToken;
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
    comboFrozenAt: 0,
    boardNumber: 1,
    boardsCleared: 0,
    boardWords: 0,
    starting: true,
    dealing: false,
    paused: false,
    ended: false,
    newBest: false
  };
  renderGame();
  void runRoundCountdown(token);
}

async function runRoundCountdown(token: number): Promise<void> {
  for (const value of ["3", "2", "1"]) {
    if (token !== flowToken || !round || round.ended) return;
    showEvent(value, "GET READY", "event-card--countdown");
    audio.play("start", save.settings.sound);
    await delay(650);
  }
  if (token !== flowToken || !round || round.ended) return;
  showEvent("MAKE WORDS", round.mode === "burn" ? "BOARD 01 · GO" : "GO", "event-card--go");
  audio.play("go", save.settings.sound);
  round.starting = false;
  setGameControlsDisabled(false);
  focusWordInput();
  await delay(650);
  if (token !== flowToken || !round || round.ended) return;
  clearEvent();
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
    <main class="game-screen game-screen--${state.mode} ${state.timeLeft <= 10 ? "game-screen--danger" : ""}">
      <header class="game-hud">
        <button class="icon-button" data-nav data-action="pause" aria-label="Pause" ${state.starting || state.dealing ? "disabled" : ""}>Ⅱ</button>
        <div class="hud-stat"><span>${state.mode === "burn" ? "BOARD" : "MODE"}</span><strong>${state.mode === "burn" ? String(state.boardNumber).padStart(2, "0") : meta.name.toUpperCase()}</strong></div>
        <div class="hud-stat hud-stat--score"><span>SCORE</span><strong id="score-value">${state.score.toLocaleString()}</strong></div>
        <div class="hud-stat hud-stat--combo">
          <span>COMBO</span><strong id="combo-value">×${Math.max(1, state.combo + 1)}</strong>
          <div class="combo-meter" aria-hidden="true"><i id="combo-meter-fill"></i></div>
        </div>
        <div class="hud-stat hud-stat--time"><span>TIME</span><strong id="time-value">${formatTime(state.timeLeft)}</strong></div>
      </header>

      <section class="playfield">
        <div class="phrase-header">
          <span>${state.mode === "burn" ? `BOARD ${String(state.boardNumber).padStart(2, "0")} · SPEND THESE LETTERS` : "MINE THIS PHRASE"}</span>
          <small>${state.phrase.label} • DIFFICULTY ${"◆".repeat(state.phrase.difficulty)}${"◇".repeat(5 - state.phrase.difficulty)}</small>
        </div>
        <div class="phrase-display" id="phrase-display">${renderPhrase(state)}</div>

        <form class="word-entry" id="word-form" autocomplete="off">
          <input id="word-input" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="24" aria-label="Enter a word" placeholder="TYPE A WORD" ${state.starting || state.dealing ? "disabled" : ""} />
          <button class="submit-word" type="submit">ENTER</button>
        </form>
        <div class="feedback" id="feedback">3+ letters • ENTER to submit</div>

        <div class="round-lower">
          <div class="found-panel">
            <div class="found-panel__header"><span>FOUND</span><strong id="word-count">${state.found.length}</strong></div>
            <div class="found-list" id="found-list">${renderFound(state)}</div>
          </div>
          <aside class="round-tip">
            ${state.mode === "burn" ? `
              <span>BURN RUN</span>
              <div class="burn-board-stat"><strong id="boards-cleared">${state.boardsCleared}</strong><small>BOARDS CLEARED</small></div>
              <p>Spend every letter for a +1,000 Board Clear bonus. Deal early for a 5-second penalty.</p>
              <button class="deal-button" data-nav data-action="next-board" ${state.starting || state.dealing ? "disabled" : ""}>DEAL NEXT <small>−5 SEC</small></button>
            ` : `
              <span>SCORING</span>
              <p>Length beats volume. Keep answers flowing to increase your combo multiplier.</p>
            `}
          </aside>
        </div>
      </section>

      <div class="event-stage" id="event-stage" aria-live="assertive"></div>
      <div class="score-fx-stage" id="score-fx-stage" aria-hidden="true"></div>
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
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>("#word-input");
    if (!input?.disabled) input?.focus({ preventScroll: true });
  });
}

function showEvent(title: string, subtitle = "", className = ""): void {
  const stage = document.querySelector<HTMLElement>("#event-stage");
  if (!stage) return;
  stage.innerHTML = `
    <div class="event-card ${className}">
      ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
      <strong>${escapeHtml(title)}</strong>
    </div>`;
}

function clearEvent(): void {
  const stage = document.querySelector<HTMLElement>("#event-stage");
  if (stage) stage.innerHTML = "";
}

function setGameControlsDisabled(disabled: boolean): void {
  const input = document.querySelector<HTMLInputElement>("#word-input");
  const pause = document.querySelector<HTMLButtonElement>("[data-action='pause']");
  const deal = document.querySelector<HTMLButtonElement>("[data-action='next-board']");
  if (input) input.disabled = disabled;
  if (pause) pause.disabled = disabled;
  if (deal) deal.disabled = disabled;
}

function submitCurrentWord(): void {
  if (!round || round.paused || round.ended || round.starting || round.dealing) return;
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
  round.comboFrozenAt = 0;
  const points = scoreWord(result.word.length, round.combo, round.mode === "burn");
  const previousScore = round.score;
  round.score += points;
  round.submitted.add(result.word);
  round.found.push({ word: result.word, points });
  round.boardWords += 1;
  if (round.mode === "burn") round.burned = burnLetters(round.phrase.text, result.word, round.burned);

  input.value = "";
  audio.play("accept", save.settings.sound);
  if (round.combo >= 2) audio.play("combo", save.settings.sound);
  if (feedback) {
    feedback.classList.remove("feedback--bad");
    feedback.classList.add("feedback--good");
    feedback.textContent = `${result.word.toUpperCase()}  +${points}${round.combo ? `  •  COMBO ×${round.combo + 1}` : ""}`;
  }
  updateGameHud(previousScore);
  showScoreImpact(result.word, points, round.combo + 1);
  startComboMeter();

  if (round.mode === "burn") {
    const availableAfterWord = remainingCounts(round.phrase.text, round.burned);
    if (!hasPlayableWord(availableAfterWord, round.submitted)) {
      const token = flowToken;
      round.dealing = true;
      setGameControlsDisabled(true);
      window.setTimeout(() => {
        if (token === flowToken && round?.mode === "burn" && !round.ended) void advanceBurnBoard(true);
      }, 500);
    }
  }
}

function updateGameHud(previousScore?: number): void {
  if (!round) return;
  const score = document.querySelector<HTMLElement>("#score-value");
  const combo = document.querySelector<HTMLElement>("#combo-value");
  const count = document.querySelector<HTMLElement>("#word-count");
  const list = document.querySelector<HTMLElement>("#found-list");
  const phrase = document.querySelector<HTMLElement>("#phrase-display");
  if (score) {
    if (previousScore === undefined) score.textContent = round.score.toLocaleString();
    else animateNumber(score, previousScore, round.score, 360);
    score.classList.remove("hud-hit");
    void score.offsetWidth;
    score.classList.add("hud-hit");
  }
  if (combo) combo.textContent = `×${Math.max(1, round.combo + 1)}`;
  if (count) count.textContent = String(round.found.length);
  if (list) list.innerHTML = renderFound(round);
  if (phrase && round.mode === "burn") phrase.innerHTML = renderPhrase(round);
}

function animateNumber(element: HTMLElement, from: number, to: number, duration: number): void {
  if (save.settings.reducedMotion || from === to) {
    element.textContent = to.toLocaleString();
    return;
  }
  const startedAt = performance.now();
  const frame = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(from + (to - from) * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function freezeComboMeter(): void {
  if (!round?.lastValidAt || round.comboFrozenAt) return;
  round.comboFrozenAt = performance.now();
}

function resumeComboMeter(): void {
  if (!round?.lastValidAt) return;
  if (round.comboFrozenAt) {
    round.lastValidAt += performance.now() - round.comboFrozenAt;
    round.comboFrozenAt = 0;
  }
  startComboMeter();
}

function startComboMeter(): void {
  if (comboMeterFrame !== null) cancelAnimationFrame(comboMeterFrame);
  comboMeterFrame = null;
  if (!round?.lastValidAt || round.ended) return;

  const frame = (now: number) => {
    const state = round;
    const fill = document.querySelector<HTMLElement>("#combo-meter-fill");
    if (!state || state.ended || !fill || !state.lastValidAt) {
      comboMeterFrame = null;
      return;
    }
    if (state.paused || state.dealing || state.starting) {
      comboMeterFrame = requestAnimationFrame(frame);
      return;
    }

    const remaining = Math.max(0, 1 - (now - state.lastValidAt) / 5000);
    fill.style.transform = `scaleX(${remaining})`;
    fill.classList.toggle("combo-meter__fill--low", remaining <= .28);
    if (remaining <= 0) {
      state.combo = 0;
      state.lastValidAt = 0;
      state.comboFrozenAt = 0;
      const combo = document.querySelector<HTMLElement>("#combo-value");
      if (combo) combo.textContent = "×1";
      comboMeterFrame = null;
      return;
    }
    comboMeterFrame = requestAnimationFrame(frame);
  };
  comboMeterFrame = requestAnimationFrame(frame);
}

function clearComboMeter(): void {
  if (comboMeterFrame !== null) cancelAnimationFrame(comboMeterFrame);
  comboMeterFrame = null;
  const fill = document.querySelector<HTMLElement>("#combo-meter-fill");
  if (fill) {
    fill.style.transform = "scaleX(0)";
    fill.classList.remove("combo-meter__fill--low");
  }
}

function showScoreImpact(word: string, points: number, multiplier: number): void {
  const stage = document.querySelector<HTMLElement>("#score-fx-stage");
  if (!stage) return;
  const tier = multiplier >= 5 ? "score-impact--major" : multiplier >= 3 ? "score-impact--combo" : "";
  stage.innerHTML = `
    <div class="score-impact ${tier}">
      <strong>${escapeHtml(word.toUpperCase())}</strong>
      <span>+${points.toLocaleString()}</span>
      ${multiplier > 1 ? `<b>COMBO ×${multiplier}</b>` : ""}
    </div>`;
  window.setTimeout(() => {
    if (stage.querySelector(".score-impact")) stage.innerHTML = "";
  }, multiplier >= 5 ? 1050 : 720);
}

function tick(): void {
  if (!round || round.paused || round.dealing || round.ended) return;
  round.timeLeft -= 1;
  const time = document.querySelector<HTMLElement>("#time-value");
  const game = document.querySelector<HTMLElement>(".game-screen");
  if (time) {
    time.textContent = formatTime(round.timeLeft);
    time.classList.toggle("danger", round.timeLeft <= 10);
  }
  game?.classList.toggle("game-screen--danger", round.timeLeft <= 10);
  if (round.timeLeft === 10) {
    showEvent("10 SECONDS", "FINAL COUNTDOWN", "event-card--warning");
    audio.play("warning", save.settings.sound);
    window.setTimeout(clearEvent, 720);
  } else if (round.timeLeft <= 5 && round.timeLeft > 0) {
    showEvent(String(round.timeLeft), "", "event-card--final");
    audio.play("warning", save.settings.sound);
    window.setTimeout(clearEvent, 620);
  } else if (round.timeLeft < 10 && round.timeLeft > 5) {
    audio.play("tick", save.settings.sound);
  }
  if (round.timeLeft <= 0) endRound();
}

async function advanceBurnBoard(cleared: boolean): Promise<void> {
  const state = round;
  if (!state || state.mode !== "burn" || state.ended || state.starting) return;
  if (state.dealing && !cleared) return;
  state.dealing = true;
  freezeComboMeter();
  setGameControlsDisabled(true);
  document.querySelector<HTMLElement>("#phrase-display")?.classList.add("phrase-display--leaving");

  let bonus = 0;
  if (cleared) {
    const remaining = [...remainingCounts(state.phrase.text, state.burned).values()].reduce((sum, count) => sum + count, 0);
    const total = [...countsForText(state.phrase.text).values()].reduce((sum, count) => sum + count, 0);
    const boardClear = remaining === 0;
    bonus = 250 + (total - remaining) * 35 + state.boardNumber * 50 + (boardClear ? 1000 : 0);
    const previousScore = state.score;
    state.score += bonus;
    state.boardsCleared += 1;
    updateGameHud(previousScore);
    showEvent(
      `+${bonus.toLocaleString()}`,
      boardClear ? `BOARD CLEAR · ALL LETTERS` : `BOARD ${String(state.boardNumber).padStart(2, "0")} EXHAUSTED`,
      boardClear ? "event-card--board event-card--board-clear" : "event-card--board"
    );
    audio.play("board", save.settings.sound);
  } else {
    state.timeLeft = Math.max(0, state.timeLeft - 5);
    state.combo = 0;
    state.lastValidAt = 0;
    state.comboFrozenAt = 0;
    clearComboMeter();
    const time = document.querySelector<HTMLElement>("#time-value");
    if (time) time.textContent = formatTime(state.timeLeft);
    showEvent("NEW DEAL", "−5 SECONDS", "event-card--skip");
    audio.play("start", save.settings.sound);
    if (state.timeLeft <= 0) {
      await delay(450);
      endRound();
      return;
    }
  }

  const token = flowToken;
  await delay(cleared ? 680 : 440);
  if (token !== flowToken || round !== state || state.ended) return;

  state.phrase = choosePhrase("burn");
  state.boardNumber += 1;
  state.burned = new Set();
  state.submitted = new Set();
  state.boardWords = 0;
  updateBurnBoardDisplay(state);
  showEvent(`BOARD ${String(state.boardNumber).padStart(2, "0")}`, "NEW PHRASE", "event-card--deal");
  await delay(430);
  if (token !== flowToken || round !== state || state.ended) return;
  clearEvent();
  state.dealing = false;
  if (cleared) {
    state.lastValidAt = performance.now();
    state.comboFrozenAt = 0;
    startComboMeter();
  }
  setGameControlsDisabled(false);
  focusWordInput();
}

function updateBurnBoardDisplay(state: RoundState): void {
  const boardValue = document.querySelector<HTMLElement>(".game-hud .hud-stat:first-of-type strong");
  const heading = document.querySelector<HTMLElement>(".phrase-header > span");
  const details = document.querySelector<HTMLElement>(".phrase-header > small");
  const phrase = document.querySelector<HTMLElement>("#phrase-display");
  const feedback = document.querySelector<HTMLElement>("#feedback");
  const cleared = document.querySelector<HTMLElement>("#boards-cleared");
  const combo = document.querySelector<HTMLElement>("#combo-value");
  const input = document.querySelector<HTMLInputElement>("#word-input");

  if (boardValue) boardValue.textContent = String(state.boardNumber).padStart(2, "0");
  if (heading) heading.textContent = `BOARD ${String(state.boardNumber).padStart(2, "0")} · SPEND THESE LETTERS`;
  if (details) details.textContent = `${state.phrase.label} · DIFFICULTY ${"◆".repeat(state.phrase.difficulty)}${"◇".repeat(5 - state.phrase.difficulty)}`;
  if (phrase) {
    phrase.innerHTML = renderPhrase(state);
    phrase.classList.remove("phrase-display--leaving");
    phrase.classList.add("phrase-display--entering");
    window.setTimeout(() => phrase.classList.remove("phrase-display--entering"), 520);
  }
  if (feedback) {
    feedback.classList.remove("feedback--good", "feedback--bad");
    feedback.textContent = "NEW BOARD · 3+ letters · ENTER to submit";
  }
  if (cleared) cleared.textContent = String(state.boardsCleared);
  if (combo) combo.textContent = `×${Math.max(1, state.combo + 1)}`;
  if (input) input.value = "";
}

function togglePause(force?: boolean): void {
  if (!round || round.ended || round.starting || round.dealing) return;
  const willPause = force ?? !round.paused;
  if (willPause) freezeComboMeter();
  round.paused = willPause;
  const layer = document.querySelector<HTMLElement>("#pause-layer");
  if (!layer) return;
  if (!round.paused) {
    layer.innerHTML = "";
    resumeComboMeter();
    focusWordInput();
    return;
  }
  layer.innerHTML = `
    <div class="pause-overlay">
      <div class="pause-card">
        <span class="eyebrow">ROUND PAUSED</span>
        <h2>${MODE_META[round.mode].name}</h2>
        <button class="primary-button" data-nav data-action="resume">RESUME</button>
        <button class="secondary-button" data-nav data-action="restart">RESTART</button>
        <button class="secondary-button secondary-button--danger" data-nav data-action="end-run">END RUN</button>
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
  flowToken += 1;
  stopTimer();
  audio.play("end", save.settings.sound);
  lastResult = round;

  const modeKey = round.mode;
  round.newBest = round.score > (save.bestScores[modeKey] ?? 0);
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
  const newBest = result.newBest;

  screens.show("results", shell("ROUND COMPLETE", `
    <section class="results-hero">
      <span class="eyebrow">${MODE_META[result.mode].name.toUpperCase()} • ${result.phrase.label.toUpperCase()}</span>
      <div class="results-score" id="results-score" data-final-score="${result.score}">0</div>
      <div class="results-label">${newBest ? "PERSONAL BEST" : `BEST ${best.toLocaleString()}`}</div>
    </section>
    <section class="result-stats">
      <div><span>WORDS</span><strong>${result.found.length}</strong></div>
      <div><span>LONGEST</span><strong>${longest.toUpperCase()}</strong></div>
      <div><span>BEST COMBO</span><strong>×${result.bestCombo + 1}</strong></div>
      <div><span>${result.mode === "burn" ? "BOARDS" : "MODE"}</span><strong>${result.mode === "burn" ? result.boardsCleared : MODE_META[result.mode].name.toUpperCase()}</strong></div>
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
  requestAnimationFrame(() => {
    const score = document.querySelector<HTMLElement>("#results-score");
    if (score) animateNumber(score, 0, result.score, 900);
  });
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

function showSettings(returnTo?: ScreenId): void {
  const current = screens.getCurrent();
  if (current !== "settings") settingsReturnScreen = returnTo ?? current;
  screens.show("settings", shell("SETTINGS", `
    <section class="settings-list">
      <button class="setting-row" data-nav data-action="toggle-sound"><span><strong>Sound</strong><small>Game tones and feedback</small></span><b>${save.settings.sound ? "ON" : "OFF"}</b></button>
      <button class="setting-row" data-nav data-action="toggle-motion"><span><strong>Reduced Motion</strong><small>Minimize movement and impact animation</small></span><b>${save.settings.reducedMotion ? "ON" : "OFF"}</b></button>
    </section>
    <p class="settings-note">Progress is stored locally on this device in this prototype.</p>
  `, { back: "settings-back" }));
}

function settingsReturn(): void {
  if (settingsReturnScreen === "game" && round) renderGame();
  else if (settingsReturnScreen === "results") showResults();
  else if (settingsReturnScreen === "modes") showModes();
  else if (settingsReturnScreen === "stats") showStats();
  else if (settingsReturnScreen === "help") showHelp();
  else if (settingsReturnScreen === "title") showTitle();
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
  else if (action === "end-run") endRound();
  else if (action === "next-board") void advanceBurnBoard(false);
  else if (action === "quit") { round = null; showMenu(); }
  else if (action === "again" && lastResult) startRound(lastResult.mode);
  else if (action === "toggle-sound") {
    save.settings.sound = !save.settings.sound;
    store.save(save);
    showSettings();
  } else if (action === "toggle-motion") {
    save.settings.reducedMotion = !save.settings.reducedMotion;
    document.documentElement.classList.toggle("reduce-motion", save.settings.reducedMotion);
    store.save(save);
    showSettings();
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
