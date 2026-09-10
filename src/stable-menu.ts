import { JOURNEY_PHRASES } from "./phrases";
import { SaveStore, type SaveData } from "./shell";
import { THEMES, type ThemeId } from "./themes";

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) throw new Error("Missing #app root");
const root: HTMLElement = appRoot;

const store = new SaveStore();

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailyStreak(save: SaveData): number {
  const played = new Set(Object.keys(save.daily).filter((key) => (save.daily[key] ?? 0) > 0));
  let streak = 0;
  const cursor = new Date();
  if (!played.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (played.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function playerLevel(save: SaveData): number {
  return Math.max(1, Math.floor(Math.sqrt(save.totalScore / 5000)) + 1);
}

function shell(title: string, content: string, options: { back?: string } = {}): string {
  return `
    <main class="shell">
      <header class="topbar">
        ${options.back ? `<button class="icon-button" data-nav data-action="${options.back}" aria-label="Back">←</button>` : `<span class="brand-mark">MW</span>`}
        <div class="topbar__title">${title}</div>
        <button class="icon-button" data-nav data-action="settings" aria-label="Settings">⚙</button>
      </header>
      ${content}
    </main>`;
}

function stableMenuMarkup(save: SaveData): string {
  const dailyDone = save.daily[todayKey()] ?? 0;
  const streak = dailyStreak(save);
  const journeyMedals = Object.values(save.journeyMedals).reduce((sum, count) => sum + count, 0);
  const best = Math.max(0, ...Object.values(save.bestScores));

  return shell("MAKE A WORD", `
    <section class="hero-panel hero-panel--menu">
      <div>
        <div class="eyebrow">THE PHRASE WORD GAME</div>
        <h1>MAKE <em>A</em> WORD</h1>
        <h2>Words are hiding inside every phrase.</h2>
        <p>Use only the letters you can see. Longer words score more. Quick answers build your combo.</p>
      </div>
      <div class="hero-score">
        <span>LEVEL ${playerLevel(save)} · BEST SCORE</span>
        <strong>${best.toLocaleString()}</strong>
      </div>
    </section>

    <section class="menu-grid">
      <button class="menu-card menu-card--feature" data-nav data-mode="classic">
        <span class="menu-card__tag">START HERE</span>
        <strong>Classic</strong>
        <small>${formatTime(save.settings.classicDuration)} · Find as many words as you can</small>
        <span class="arrow">→</span>
      </button>
      <button class="menu-card menu-card--daily" data-nav data-mode="daily">
        <span class="menu-card__tag">TODAY</span>
        <strong>Daily Phrase</strong>
        <small>${dailyDone ? `Best today: ${dailyDone.toLocaleString()}` : "Unplayed"} · ${streak} day${streak === 1 ? "" : "s"} streak</small>
        <span class="arrow">→</span>
      </button>
      <button class="menu-card menu-card--burn" data-nav data-mode="burn">
        <span class="menu-card__tag">EVERY LETTER COUNTS</span>
        <strong>Burn</strong>
        <small>Clear each board before time runs out</small>
        <span class="arrow">→</span>
      </button>
      <button class="menu-card menu-card--journey" data-nav data-action="journey">
        <span class="menu-card__tag">CHALLENGES</span>
        <strong>Trials</strong>
        <small>${journeyMedals} / ${JOURNEY_PHRASES.length * 3} medals</small>
        <span class="arrow">→</span>
      </button>
      <button class="menu-card menu-card--together" data-nav data-action="multiplayer">
        <span class="menu-card__tag">LOCAL + ONLINE</span>
        <strong>Play Together</strong>
        <small>Room Codes • Word Relay • Last Word</small>
        <span class="arrow">→</span>
      </button>
      <button class="menu-card menu-card--secondary" data-nav data-action="modes">
        <span class="menu-card__tag">MORE</span>
        <strong>Round Options</strong>
        <small>Choose a timer and mode</small>
      </button>
      <button class="menu-card menu-card--secondary" data-nav data-action="stats">
        <span class="menu-card__tag">PROFILE</span>
        <strong>Statistics</strong>
        <small>${save.totalWords.toLocaleString()} words found</small>
      </button>
      <button class="menu-card menu-card--secondary" data-nav data-action="help">
        <span class="menu-card__tag">RULES</span>
        <strong>How to Play</strong>
        <small>Learn the phrase</small>
      </button>
    </section>
  `);
}

function stableSettingsMarkup(save: SaveData): string {
  const themeButtons = (Object.keys(THEMES) as ThemeId[])
    .map((id) => `<button data-nav data-theme="${id}" class="${save.settings.theme === id ? "selected" : ""}">${THEMES[id].name}</button>`)
    .join("");

  return shell("SETTINGS", `
    <section class="settings-list">
      <button class="setting-row" data-nav data-action="toggle-sound"><span><strong>Sound</strong><small>Game tones and feedback</small></span><b>${save.settings.sound ? "ON" : "OFF"}</b></button>
      <button class="setting-row" data-nav data-action="toggle-music"><span><strong>Music</strong><small>Theme ambience</small></span><b>${save.settings.music ? "ON" : "OFF"}</b></button>
      <label class="setting-row setting-row--slider"><span><strong>Volume</strong><small>All game audio</small></span><input id="volume-setting" type="range" min="0" max="1" step="0.05" value="${save.settings.volume}" aria-label="Volume" /></label>
      <div class="theme-setting"><span><strong>Table Theme</strong><small>Choose the room your words live in</small></span><div>${themeButtons}</div></div>
      <button class="setting-row" data-nav data-action="toggle-motion"><span><strong>Reduced Motion</strong><small>Minimize movement and impact animation</small></span><b>${save.settings.reducedMotion ? "ON" : "OFF"}</b></button>
      <button class="setting-row" data-nav data-action="toggle-analytics"><span><strong>Anonymous Analytics</strong><small>Share aggregate play counts; never words or names</small></span><b>${save.settings.analytics ? "ON" : "OFF"}</b></button>
    </section>
    <p class="settings-note">Progress is saved on this device.</p>
  `, { back: "settings-back" });
}

let rendering = false;

function focusFirst(): void {
  requestAnimationFrame(() => {
    const first = [...root.querySelectorAll<HTMLElement>("[data-nav]:not([disabled])")]
      .find((item) => item.getClientRects().length > 0);
    first?.focus({ preventScroll: true });
  });
}

function restoreStablePresentation(): void {
  if (rendering) return;

  if (root.dataset.screen === "menu" && root.querySelector(".studio-menu")) {
    rendering = true;
    root.innerHTML = stableMenuMarkup(store.load());
    root.dataset.menuPresentation = "stable";
    rendering = false;
    focusFirst();
    return;
  }

  if (root.dataset.screen === "settings" && root.querySelector(".studio-subscreen")) {
    rendering = true;
    root.innerHTML = stableSettingsMarkup(store.load());
    root.dataset.settingsPresentation = "stable";
    rendering = false;
    focusFirst();
  }
}

const observer = new MutationObserver(restoreStablePresentation);
observer.observe(root, { childList: true, subtree: true });
restoreStablePresentation();
