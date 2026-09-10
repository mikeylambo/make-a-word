import { JOURNEY_PHRASES } from "./phrases";
import { SaveStore, type SaveData } from "./shell";

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

function shell(title: string, content: string): string {
  return `
    <main class="shell">
      <header class="topbar">
        <span class="brand-mark">MW</span>
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

let rendering = false;

function restoreStableMenu(): void {
  if (rendering || root.dataset.screen !== "menu") return;
  if (!root.querySelector(".studio-menu")) return;

  rendering = true;
  root.innerHTML = stableMenuMarkup(store.load());
  root.dataset.menuPresentation = "stable";
  rendering = false;

  requestAnimationFrame(() => {
    const first = [...root.querySelectorAll<HTMLElement>("[data-nav]:not([disabled])")]
      .find((item) => item.getClientRects().length > 0);
    first?.focus({ preventScroll: true });
  });
}

const observer = new MutationObserver(restoreStableMenu);
observer.observe(root, { childList: true, subtree: true });
restoreStableMenu();
