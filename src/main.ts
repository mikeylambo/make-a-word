import "./styles.css";
import { JOURNEY_PHRASES, PHRASES, phraseForDay, randomPhrase, type PhraseEntry } from "./phrases";
import { SaveStore, ScreenManager, MenuNavigator, TinyAudio, type SaveData, type ScreenId } from "./shell";
import {
  clearOnlineCredentials,
  fetchOnlineRoom,
  loadOnlineCredentials,
  sendOnlineAction,
  storeOnlineCredentials
} from "./online-client";
import type { OnlineCredentials, OnlinePlayerView, OnlineRoomView, OnlineSettings } from "./online-types";
import {
  burnLetters,
  countsForText,
  hasPlayableWord,
  humanReason,
  remainingCounts,
  scoreWord,
  validateWord
} from "./word-engine";

type ModeId = "classic" | "burn" | "blitz" | "daily" | "journey";

type FoundWord = {
  word: string;
  points: number;
};

type TogetherMode = "relay" | "pass-play" | "last-word";

type TogetherPlayer = {
  name: string;
  score: number;
  found: FoundWord[];
  roundFound: FoundWord[];
  submitted: Set<string>;
  roundScore: number;
  lives: number;
  eliminated: boolean;
};

type TogetherState = {
  mode: TogetherMode;
  phrase: PhraseEntry;
  players: TogetherPlayer[];
  currentPlayer: number;
  sharedSubmitted: Set<string>;
  timeLeft: number;
  roundNumber: number;
  totalRounds: number;
  usedPhrases: Set<string>;
  paused: boolean;
  ended: boolean;
};

type ChallengePayload = {
  version: 1;
  phraseId: string;
  target: number;
  mode: "classic" | "blitz";
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
  journeyStage?: number;
  challengeTarget?: number;
  starting: boolean;
  dealing: boolean;
  paused: boolean;
  ended: boolean;
  newBest: boolean;
};

const MODE_META: Record<ModeId, { name: string; kicker: string; description: string; duration: number }> = {
  classic: {
    name: "Classic",
    kicker: "Make as many words as you can",
    description: "Letters return after every word. Find as many words as you can.",
    duration: 120
  },
  burn: {
    name: "Burn",
    kicker: "Every letter counts",
    description: "Used letters disappear. Clear the board, then keep scoring with a new phrase.",
    duration: 150
  },
  blitz: {
    name: "Blitz",
    kicker: "Make words quickly",
    description: "You have 60 seconds. Make words quickly to build bigger combos.",
    duration: 60
  },
  daily: {
    name: "Daily Phrase",
    kicker: "One phrase. One score.",
    description: "A new phrase every day. Everyone gets the same challenge.",
    duration: 120
  },
  journey: {
    name: "Trials",
    kicker: "Take on each challenge",
    description: "Play a series of phrases and earn up to three medals on each one.",
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
let together: TogetherState | null = null;
let togetherPlayerCount = 2;
let togetherTimerId: number | null = null;
let togetherRoundCount = 3;
let togetherPlayerNames = ["Player 1", "Player 2", "Player 3", "Player 4"];
let pendingChallenge: ChallengePayload | null = null;
let onlineRoom: OnlineRoomView | null = null;
let onlineCredentials: OnlineCredentials | null = null;
let onlinePollId: number | null = null;
let onlineClockId: number | null = null;
let onlineClockOffset = 0;
let onlineBusy = false;
let onlineError = "";
let onlineLastCountdown = -1;
let onlineNextHeartbeatAt = 0;

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

function dailyStreak(): number {
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

function playerLevel(): number {
  return Math.max(1, Math.floor(Math.sqrt(save.totalScore / 5000)) + 1);
}

function togetherTurnDuration(mode: TogetherMode): number {
  if (mode === "relay") return 60;
  if (mode === "pass-play") return 30;
  return 12;
}

function encodeChallenge(payload: ChallengePayload): string {
  return btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeChallenge(value: string | null): ChallengePayload | null {
  if (!value) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as Partial<ChallengePayload>;
    if (parsed.version !== 1 || typeof parsed.phraseId !== "string" || typeof parsed.target !== "number") return null;
    if (!Number.isSafeInteger(parsed.target) || parsed.target < 0 || parsed.target > 10_000_000) return null;
    if (parsed.mode !== "classic" && parsed.mode !== "blitz") return null;
    if (!PHRASES.some((phrase) => phrase.id === parsed.phraseId)) return null;
    return parsed as ChallengePayload;
  } catch {
    return null;
  }
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
  stopTogetherTimer();
  stopOnlineSync();
  flowToken += 1;
  screens.show("title", `
    <main class="title-screen">
      <div class="title-orbit" aria-hidden="true"><span>A</span><span>R</span><span>T</span><span>E</span></div>
      <section class="title-lockup">
        <div class="eyebrow">THE PHRASE WORD GAME</div>
        <h1>MAKE<br><em>A</em> WORD</h1>
        <p>Use the letters in the phrase. Make as many words as you can.</p>
        <button class="primary-button primary-button--wide" data-nav data-action="enter-menu">START</button>
      </section>
      <div class="title-footer">WORDS ARE HIDING EVERYWHERE</div>
    </main>
  `);
}

function showMenu(): void {
  stopTimer();
  stopTogetherTimer();
  stopOnlineSync();
  flowToken += 1;
  const dailyDone = save.daily[todayKey()] ?? 0;
  const streak = dailyStreak();
  const journeyMedals = Object.values(save.journeyMedals).reduce((sum, count) => sum + count, 0);
  screens.show("menu", shell("MAKE A WORD", `
    <section class="hero-panel">
      <div>
        <div class="eyebrow">HOW MANY CAN YOU FIND?</div>
        <h2>Words are hiding<br>inside every phrase.</h2>
        <p>Use only the letters you can see. Longer words score more. Quick answers build your combo.</p>
      </div>
      <div class="hero-score">
        <span>LEVEL ${playerLevel()} · BEST SCORE</span>
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
        <small>${dailyDone ? `Best today: ${dailyDone.toLocaleString()}` : "Unplayed"} · ${streak} day${streak === 1 ? "" : "s"} streak</small>
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

function medalCount(score: number, medals: [number, number, number] | undefined): number {
  if (!medals) return 0;
  if (score >= medals[2]) return 3;
  if (score >= medals[1]) return 2;
  if (score >= medals[0]) return 1;
  return 0;
}

function showJourney(): void {
  const totalMedals = Object.values(save.journeyMedals).reduce((sum, count) => sum + count, 0);
  const stages = JOURNEY_PHRASES.map((phrase, index) => {
    const stage = index + 1;
    const locked = stage > save.journeyUnlocked;
    const score = save.journeyScores[phrase.id] ?? 0;
    const earned = save.journeyMedals[phrase.id] ?? 0;
    return `
      <button class="journey-stage ${locked ? "journey-stage--locked" : ""}" data-nav data-journey-stage="${index}" ${locked ? "disabled" : ""}>
        <span class="journey-stage__number">${String(stage).padStart(2, "0")}</span>
        <span class="journey-stage__body">
          <small>${locked ? "LOCKED" : phrase.label.toUpperCase()}</small>
          <strong>${locked ? "Complete the previous stage" : phrase.text}</strong>
          <i aria-label="${earned} of 3 medals">${[0, 1, 2].map((medal) => `<b class="${medal < earned ? "earned" : ""}">◆</b>`).join("")}</i>
        </span>
        <span class="journey-stage__score">${locked ? "—" : score.toLocaleString()}</span>
      </button>`;
  }).join("");

  screens.show("journey", shell("TRIALS", `
    <section class="journey-header">
      <div><span class="eyebrow">${JOURNEY_PHRASES.length} WORD TRIALS</span><h2>Put your word skills to the test.</h2><p>Earn one medal to unlock the next trial. Replay any trial to earn all three.</p></div>
      <div><strong>${totalMedals}</strong><span>OF ${JOURNEY_PHRASES.length * 3} MEDALS</span></div>
    </section>
    <section class="journey-list">${stages}</section>
  `, { back: "menu" }));
}

function showMultiplayer(): void {
  stopTogetherTimer();
  stopOnlineSync();
  screens.show("multiplayer", shell("PLAY TOGETHER", `
    <section class="multiplayer-header">
      <div><span class="eyebrow">LOCAL OR ONLINE</span><h2>Bring the classroom game back.</h2><p>Gather around one screen or give everyone a room code and let them play from their own device.</p></div>
    </section>
    <button class="online-callout" data-nav data-action="online">
      <span><b>PLAY ONLINE</b><strong>Word Race</strong><small>2–8 players · private room codes · everyone plays at once</small></span>
      <i>CREATE OR JOIN →</i>
    </button>
    <div class="local-divider"><span>LOCAL MATCH</span></div>
    <div class="match-options match-options--local">
      <div class="player-count" role="group" aria-label="Number of players">
        <span>PLAYERS</span>
        <div>${[2, 3, 4].map((count) => `<button class="${count === togetherPlayerCount ? "selected" : ""}" data-nav data-player-count="${count}">${count}</button>`).join("")}</div>
      </div>
      <div class="player-count" role="group" aria-label="Number of rounds">
        <span>ROUNDS</span>
        <div>${[1, 3, 5].map((count) => `<button class="${count === togetherRoundCount ? "selected" : ""}" data-nav data-round-count="${count}">${count}</button>`).join("")}</div>
      </div>
    </div>
    <section class="player-names" aria-label="Player names">
      ${togetherPlayerNames.slice(0, togetherPlayerCount).map((name, index) => `<label><span>PLAYER ${index + 1}</span><input maxlength="16" data-player-name="${index}" value="${escapeHtml(name)}" aria-label="Player ${index + 1} name" /></label>`).join("")}
    </section>
    <section class="multiplayer-modes">
      <button class="multiplayer-mode multiplayer-mode--relay" data-nav data-together-mode="relay">
        <span>QUICK TURNS</span><strong>Word Relay</strong>
        <p>Everyone shares one phrase. Find a word, then the turn moves immediately to the next player.</p>
        <small>60 SECONDS PER ROUND · SHARED WORDS</small><b>→</b>
      </button>
      <button class="multiplayer-mode multiplayer-mode--pass" data-nav data-together-mode="pass-play">
        <span>HEAD TO HEAD</span><strong>Pass &amp; Play</strong>
        <p>Each player gets 30 seconds with the same phrase. Word lists stay private until everyone has played.</p>
        <small>30 SECONDS EACH · PRIVATE WORDS</small><b>→</b>
      </button>
      <button class="multiplayer-mode multiplayer-mode--last" data-nav data-together-mode="last-word">
        <span>TAKE TURNS</span><strong>Last Word</strong>
        <p>Find a new word before time runs out. Two strikes eliminate a player; the last player standing wins the round.</p>
        <small>12-SECOND TURNS · TWO STRIKES</small><b>→</b>
      </button>
    </section>
    <p class="multiplayer-note">Made for family game nights, classrooms, and friendly competition.</p>
  `, { back: "menu" }));
}

function rememberedOnlineName(): string {
  try {
    return localStorage.getItem("make-a-word.online-name") ?? "";
  } catch {
    return "";
  }
}

function rememberOnlineName(name: string): void {
  try {
    localStorage.setItem("make-a-word.online-name", name);
  } catch {
    // A private browser can decline local persistence without blocking online play.
  }
}

function stopOnlineSync(): void {
  if (onlinePollId !== null) window.clearInterval(onlinePollId);
  if (onlineClockId !== null) window.clearInterval(onlineClockId);
  onlinePollId = null;
  onlineClockId = null;
  onlineLastCountdown = -1;
}

function onlineSelf(room = onlineRoom): OnlinePlayerView | undefined {
  return room?.players.find((player) => player.id === onlineCredentials?.playerId);
}

function cleanRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function updateRoomUrl(code?: string): void {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  if (code) url.searchParams.set("room", code);
  history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function showOnlineHome(prefillCode = ""): void {
  stopOnlineSync();
  onlineError = "";
  const name = rememberedOnlineName();
  const code = cleanRoomCode(prefillCode);
  screens.show("online", shell("PLAY ONLINE", `
    <section class="online-intro">
      <span class="eyebrow">WORD RACE · 2–8 PLAYERS</span>
      <h2>Same phrase.<br>Everyone at once.</h2>
      <p>Create a private room for friends, family, or a classroom. Every player competes on their own device while scores update live.</p>
    </section>
    <section class="online-entry-grid">
      <article class="online-entry online-entry--host">
        <span>HOST A MATCH</span><h3>Create a room</h3>
        <label><b>YOUR NAME</b><input id="online-host-name" maxlength="16" value="${escapeHtml(name)}" placeholder="Player name" autocomplete="nickname" /></label>
        <div class="online-options">
          <label><b>ROUNDS</b><select id="online-rounds" aria-label="Online rounds"><option value="1">1 round</option><option value="3" selected>3 rounds</option><option value="5">5 rounds</option></select></label>
          <label><b>ROUND TIME</b><select id="online-duration" aria-label="Online round time"><option value="60">60 seconds</option><option value="90" selected>90 seconds</option><option value="120">2 minutes</option></select></label>
          <label><b>ROOM SIZE</b><select id="online-capacity" aria-label="Online room size"><option value="4">4 players</option><option value="6">6 players</option><option value="8" selected>8 players</option></select></label>
        </div>
        <button class="primary-button" type="button" data-nav data-action="online-create">CREATE ROOM</button>
      </article>
      <article class="online-entry online-entry--join">
        <span>JOIN A MATCH</span><h3>Enter a room code</h3>
        <label><b>YOUR NAME</b><input id="online-join-name" maxlength="16" value="${escapeHtml(name)}" placeholder="Player name" autocomplete="nickname" /></label>
        <label><b>ROOM CODE</b><input id="online-code" class="room-code-input" maxlength="6" value="${escapeHtml(code)}" placeholder="ABC123" autocomplete="off" autocapitalize="characters" /></label>
        <button class="secondary-button" type="button" data-nav data-action="online-join">JOIN ROOM</button>
      </article>
    </section>
    <div class="online-message" id="online-message" role="status"></div>
    <p class="online-fineprint">Private rooms expire automatically after six hours. No account is required.</p>
  `, { back: "multiplayer" }));
  requestAnimationFrame(() => (code ? document.querySelector<HTMLInputElement>("#online-join-name") : document.querySelector<HTMLInputElement>("#online-host-name"))?.focus());
}

function showOnlineConnecting(code: string): void {
  screens.show("online", shell("JOINING ROOM", `
    <section class="online-connecting"><span class="connection-spinner" aria-hidden="true"></span><h2>${escapeHtml(code)}</h2><p>Reconnecting to your match…</p></section>
  `, { back: "online-cancel" }));
}

function setOnlineMessage(message: string, bad = true): void {
  onlineError = message;
  const element = document.querySelector<HTMLElement>("#online-message, #online-feedback");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("online-message--bad", bad);
  element.classList.toggle("feedback--bad", bad);
}

async function createOnlineRoom(): Promise<void> {
  if (onlineBusy) return;
  const name = document.querySelector<HTMLInputElement>("#online-host-name")?.value.trim() ?? "";
  const settings: OnlineSettings = {
    rounds: Number(document.querySelector<HTMLSelectElement>("#online-rounds")?.value ?? 3) as OnlineSettings["rounds"],
    roundSeconds: Number(document.querySelector<HTMLSelectElement>("#online-duration")?.value ?? 90) as OnlineSettings["roundSeconds"],
    maxPlayers: Number(document.querySelector<HTMLSelectElement>("#online-capacity")?.value ?? 8)
  };
  if (!name) return setOnlineMessage("Enter your name first.");
  onlineBusy = true;
  setOnlineMessage("Creating your room…", false);
  const response = await sendOnlineAction({ action: "create", name, settings });
  onlineBusy = false;
  if (!response.ok || !response.credentials) return setOnlineMessage(response.ok ? "The room did not return a session." : response.error);
  rememberOnlineName(name);
  enterOnlineRoom(response.room, response.credentials);
}

async function joinOnlineRoom(): Promise<void> {
  if (onlineBusy) return;
  const name = document.querySelector<HTMLInputElement>("#online-join-name")?.value.trim() ?? "";
  const code = cleanRoomCode(document.querySelector<HTMLInputElement>("#online-code")?.value ?? "");
  if (!name) return setOnlineMessage("Enter your name first.");
  if (code.length !== 6) return setOnlineMessage("Enter the six-character room code.");
  onlineBusy = true;
  setOnlineMessage("Joining the room…", false);
  const response = await sendOnlineAction({ action: "join", code, name });
  onlineBusy = false;
  if (!response.ok || !response.credentials) return setOnlineMessage(response.ok ? "The room did not return a session." : response.error);
  rememberOnlineName(name);
  enterOnlineRoom(response.room, response.credentials);
}

function enterOnlineRoom(room: OnlineRoomView, credentials: OnlineCredentials): void {
  onlineRoom = room;
  onlineCredentials = credentials;
  onlineClockOffset = room.serverNow - Date.now();
  onlineNextHeartbeatAt = Date.now() + 8_000;
  onlineError = "";
  storeOnlineCredentials(credentials);
  updateRoomUrl(room.code);
  renderOnlineRoom();
  startOnlineSync();
}

async function resumeOnlineRoom(code: string): Promise<void> {
  const credentials = loadOnlineCredentials(code);
  if (!credentials) {
    showOnlineHome(code);
    return;
  }
  onlineCredentials = credentials;
  showOnlineConnecting(code);
  const response = await fetchOnlineRoom(credentials);
  if (!response.ok) {
    clearOnlineCredentials();
    onlineCredentials = null;
    showOnlineHome(code);
    setOnlineMessage(response.error);
    return;
  }
  enterOnlineRoom(response.room, credentials);
}

function startOnlineSync(): void {
  stopOnlineSync();
  onlinePollId = window.setInterval(() => void syncOnlineRoom(), 1_200);
  onlineClockId = window.setInterval(updateOnlineClock, 100);
  updateOnlineClock();
}

async function syncOnlineRoom(): Promise<void> {
  if (!onlineCredentials || onlineBusy || document.hidden) return;
  onlineBusy = true;
  const heartbeat = Date.now() >= onlineNextHeartbeatAt;
  const response = heartbeat
    ? await sendOnlineAction({ action: "heartbeat", credentials: onlineCredentials })
    : await fetchOnlineRoom(onlineCredentials);
  if (heartbeat) onlineNextHeartbeatAt = Date.now() + 8_000;
  onlineBusy = false;
  if (!response.ok) {
    const signal = document.querySelector<HTMLElement>("#online-signal");
    if (signal) {
      signal.textContent = "RECONNECTING";
      signal.classList.add("offline");
    }
    if (response.code === "SESSION_EXPIRED" || response.code === "ROOM_NOT_FOUND") setOnlineMessage(response.error);
    return;
  }
  applyOnlineRoom(response.room);
}

function applyOnlineRoom(next: OnlineRoomView): void {
  const previousPhase = onlineRoom?.phase;
  const previousPhrase = onlineRoom?.phrase?.id;
  if (previousPhase && previousPhase !== next.phase) onlineError = "";
  onlineRoom = next;
  onlineClockOffset = next.serverNow - Date.now();
  if (screens.getCurrent() === "settings") return;
  const signal = document.querySelector<HTMLElement>("#online-signal");
  if (signal) {
    signal.textContent = "SYNCED";
    signal.classList.remove("offline");
  }
  if (screens.getCurrent() !== "online-room" || previousPhase !== next.phase || previousPhrase !== next.phrase?.id) {
    renderOnlineRoom();
    return;
  }
  updateOnlineRoomDom();
}

function onlinePlayerCards(room: OnlineRoomView): string {
  const viewerIsHost = onlineSelf(room)?.isHost;
  return room.players.map((player) => `
    <article class="online-player ${player.id === onlineCredentials?.playerId ? "you" : ""} ${player.ready ? "ready" : ""}">
      <i class="presence-dot ${player.online ? "online" : ""}" aria-label="${player.online ? "Online" : "Reconnecting"}"></i>
      <span>${escapeHtml(player.name)}${player.id === onlineCredentials?.playerId ? " · YOU" : ""}</span>
      <strong>${player.isHost ? "HOST" : player.ready ? "READY" : "NOT READY"}</strong>
      ${viewerIsHost && !player.isHost ? `<button data-nav data-action="online-kick" data-player-id="${player.id}" aria-label="Remove ${escapeHtml(player.name)}">×</button>` : ""}
    </article>`).join("");
}

function onlineLeaderboard(room: OnlineRoomView, final = false): string {
  const ranked = room.players.slice().sort((a, b) => (final ? b.score - a.score : b.roundScore - a.roundScore) || b.foundCount - a.foundCount);
  return ranked.map((player, index) => `
    <div class="online-rank ${player.id === onlineCredentials?.playerId ? "you" : ""} ${index === 0 ? "leader" : ""}">
      <b>${index + 1}</b><span>${escapeHtml(player.name)}${player.id === onlineCredentials?.playerId ? " · YOU" : ""}</span>
      <small>${player.foundCount} ${player.foundCount === 1 ? "WORD" : "WORDS"}</small>
      <strong>${(final ? player.score : player.roundScore).toLocaleString()}</strong>
    </div>`).join("");
}

function renderOnlineRoom(): void {
  const room = onlineRoom;
  if (!room || !onlineCredentials) return showOnlineHome();
  if (room.phase === "lobby") renderOnlineLobby(room);
  else if (room.phase === "playing") renderOnlineGame(room);
  else renderOnlineResults(room);
}

function renderOnlineLobby(room: OnlineRoomView): void {
  const self = onlineSelf(room);
  if (!self) return showOnlineHome(room.code);
  const guestsReady = room.players.filter((player) => !player.isHost).every((player) => player.ready);
  const canStart = self.isHost && room.players.length >= 2 && guestsReady;
  screens.show("online-room", shell(`ROOM ${room.code}`, `
    <section class="online-lobby-hero">
      <span class="eyebrow">PRIVATE WORD RACE</span><h2>${room.code}</h2><p>Share this code. Everyone joins at <strong>make-a-word.vercel.app</strong>.</p>
      <button class="secondary-button" data-nav data-action="online-share">SHARE ROOM</button>
    </section>
    <section class="online-lobby-meta">
      <div><span>PLAYERS</span><strong id="online-lobby-count">${room.players.length} / ${room.settings.maxPlayers}</strong></div>
      <div><span>ROUNDS</span><strong>${room.settings.rounds}</strong></div>
      <div><span>TIME</span><strong>${room.settings.roundSeconds}s</strong></div>
      <div><span>CONNECTION</span><strong id="online-signal">SYNCED</strong></div>
    </section>
    <section class="online-player-list" id="online-player-list">${onlinePlayerCards(room)}</section>
    <div class="online-message" id="online-message" role="status">${escapeHtml(onlineError)}</div>
    <section class="online-lobby-actions">
      ${self.isHost
        ? `<button class="primary-button primary-button--wide" data-nav data-action="online-start" ${canStart ? "" : "disabled"}>${room.players.length < 2 ? "WAITING FOR PLAYERS" : guestsReady ? "START MATCH" : "WAITING FOR READY"}</button><p>You control when each round begins.</p>`
        : `<button class="primary-button primary-button--wide" data-nav data-action="online-ready">${self.ready ? "I'M READY ✓" : "READY UP"}</button><p>${self.ready ? "Waiting for the host to begin." : "Let the host know you are ready."}</p>`}
      <button class="text-button" data-nav data-action="online-leave">LEAVE ROOM</button>
    </section>
  `, { back: "online-leave" }));
}

function renderOnlineGame(room: OnlineRoomView): void {
  const self = onlineSelf(room);
  if (!self || !room.phrase) return;
  screens.show("online-room", `
    <main class="game-screen online-game-screen">
      <header class="online-hud">
        <button class="icon-button" data-nav data-action="online-leave" aria-label="Leave room">←</button>
        <div class="online-room-badge"><span>ROOM</span><strong>${room.code}</strong></div>
        <div class="hud-stat hud-stat--score"><span>YOUR SCORE</span><strong id="online-score">${self.roundScore.toLocaleString()}</strong></div>
        <div class="hud-stat hud-stat--combo"><span>COMBO</span><strong id="online-combo">×${Math.max(1, self.combo + 1)}</strong></div>
        <div class="hud-stat hud-stat--time"><span>TIME</span><strong id="online-time">${formatTime(room.settings.roundSeconds)}</strong></div>
        <div class="online-signal" id="online-signal">SYNCED</div>
      </header>
      <section class="playfield online-playfield">
        <div class="phrase-header"><span>WORD RACE · ROUND ${room.roundNumber}/${room.settings.rounds}</span><small>${escapeHtml(room.phrase.label)} · EVERYONE HAS THE SAME PHRASE</small></div>
        <div class="phrase-display">${renderPhraseText(room.phrase.text)}</div>
        <div class="online-countdown" id="online-countdown" aria-live="assertive"></div>
        <form class="word-entry" id="online-word-form" autocomplete="off">
          <input id="online-word-input" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="24" aria-label="Enter an online word" placeholder="TYPE A WORD" />
          <button class="submit-word" type="submit">ENTER</button>
        </form>
        <div class="feedback" id="online-feedback">Your words stay private until the round ends</div>
        <div class="online-race-grid">
          <section class="online-live-board"><div class="found-panel__header"><span>LIVE STANDINGS</span><strong>${room.players.length} PLAYERS</strong></div><div class="online-ranking" id="online-ranking">${onlineLeaderboard(room)}</div></section>
          <section class="found-panel"><div class="found-panel__header"><span>YOUR WORDS</span><strong id="online-word-count">${room.words.length}</strong></div><div class="found-list" id="online-word-list">${onlineWordList(room)}</div></section>
        </div>
      </section>
      <div class="score-fx-stage" id="score-fx-stage" aria-hidden="true"></div>
    </main>`);
  document.querySelector<HTMLFormElement>("#online-word-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitOnlineWord();
  });
  updateOnlineClock();
}

function onlineWordList(room: OnlineRoomView): string {
  if (!room.words.length) return `<div class="empty-found">Your words will appear here.</div>`;
  return room.words.slice().reverse().map((item, index) => `<div class="found-word ${index === 0 ? "found-word--new" : ""}"><span>${escapeHtml(item.word.toUpperCase())}</span><strong>+${item.points}</strong></div>`).join("");
}

function renderOnlineResults(room: OnlineRoomView): void {
  const self = onlineSelf(room);
  if (!self) return;
  onlineError = "";
  const final = room.phase === "match-results";
  if (final && !save.completedOnlineMatchIds.includes(room.matchId)) {
    save.completedOnlineMatchIds.push(room.matchId);
    save.onlineMatches += 1;
    store.save(save);
  }
  const ranked = room.players.slice().sort((a, b) => (final ? b.score - a.score : b.roundScore - a.roundScore) || b.foundCount - a.foundCount);
  const leader = ranked[0];
  screens.show("online-room", shell(final ? "MATCH COMPLETE" : `ROUND ${room.roundNumber} COMPLETE`, `
    <section class="online-results-hero">
      <span class="eyebrow">${final ? "WORD RACE WINNER" : "ROUND LEADER"}</span>
      <h2>${escapeHtml(leader?.name ?? "Great match")}</h2>
      <p>${(final ? leader?.score : leader?.roundScore)?.toLocaleString() ?? 0} points</p>
    </section>
    <section class="online-ranking online-ranking--results" id="online-ranking">${onlineLeaderboard(room, final)}</section>
    <div class="online-message" id="online-message" role="status">${escapeHtml(onlineError)}</div>
    <section class="online-lobby-actions">
      ${final
        ? self.isHost ? `<button class="primary-button primary-button--wide" data-nav data-action="online-rematch">PLAY A REMATCH</button>` : `<p>Waiting to see if the host starts a rematch.</p>`
        : self.isHost ? `<button class="primary-button primary-button--wide" data-nav data-action="online-next">START NEXT ROUND</button>` : `<p>Waiting for the host to start round ${room.roundNumber + 1}.</p>`}
      <button class="secondary-button" data-nav data-action="online-share">SHARE ROOM</button>
      <button class="text-button" data-nav data-action="online-leave">LEAVE ROOM</button>
    </section>
  `, { back: "online-leave" }));
}

function updateOnlineRoomDom(): void {
  const room = onlineRoom;
  if (!room) return;
  if (room.phase === "lobby") {
    const self = onlineSelf(room);
    const list = document.querySelector<HTMLElement>("#online-player-list");
    const count = document.querySelector<HTMLElement>("#online-lobby-count");
    if (list) list.innerHTML = onlinePlayerCards(room);
    if (count) count.textContent = `${room.players.length} / ${room.settings.maxPlayers}`;
    const start = document.querySelector<HTMLButtonElement>('[data-action="online-start"]');
    if (start && self?.isHost) {
      const guestsReady = room.players.filter((player) => !player.isHost).every((player) => player.ready);
      start.disabled = room.players.length < 2 || !guestsReady;
      start.textContent = room.players.length < 2 ? "WAITING FOR PLAYERS" : guestsReady ? "START MATCH" : "WAITING FOR READY";
    }
    return;
  }
  if (room.phase === "playing") {
    const self = onlineSelf(room);
    const score = document.querySelector<HTMLElement>("#online-score");
    const combo = document.querySelector<HTMLElement>("#online-combo");
    const ranking = document.querySelector<HTMLElement>("#online-ranking");
    const words = document.querySelector<HTMLElement>("#online-word-list");
    const wordCount = document.querySelector<HTMLElement>("#online-word-count");
    if (score && self) score.textContent = self.roundScore.toLocaleString();
    if (combo && self) combo.textContent = `×${Math.max(1, self.combo + 1)}`;
    if (ranking) ranking.innerHTML = onlineLeaderboard(room);
    if (words) words.innerHTML = onlineWordList(room);
    if (wordCount) wordCount.textContent = String(room.words.length);
  }
}

function updateOnlineClock(): void {
  const room = onlineRoom;
  if (!room || room.phase !== "playing" || !room.startsAt || !room.endsAt) return;
  const now = Date.now() + onlineClockOffset;
  const beforeStart = room.startsAt - now;
  const countdown = document.querySelector<HTMLElement>("#online-countdown");
  const input = document.querySelector<HTMLInputElement>("#online-word-input");
  const submit = document.querySelector<HTMLButtonElement>("#online-word-form button");
  if (beforeStart > 0) {
    const value = Math.max(1, Math.ceil(beforeStart / 1_000));
    if (countdown) {
      countdown.textContent = value > 3 ? "GET READY" : String(value);
      countdown.classList.add("visible");
    }
    if (input) input.disabled = true;
    if (submit) submit.disabled = true;
    if (value !== onlineLastCountdown && value <= 3) audio.play("start", save.settings.sound);
    onlineLastCountdown = value;
  } else {
    if (countdown?.classList.contains("visible") && onlineLastCountdown !== 0) {
      countdown.textContent = "MAKE WORDS";
      audio.play("go", save.settings.sound);
      onlineLastCountdown = 0;
      window.setTimeout(() => countdown.classList.remove("visible"), 650);
      input?.focus({ preventScroll: true });
    }
    if (input) input.disabled = false;
    if (submit) submit.disabled = false;
  }
  const remaining = Math.max(0, Math.ceil((room.endsAt - now) / 1_000));
  const timer = document.querySelector<HTMLElement>("#online-time");
  if (timer) {
    timer.textContent = formatTime(remaining);
    timer.classList.toggle("danger", remaining <= 10);
  }
}

async function submitOnlineWord(): Promise<void> {
  if (!onlineCredentials || !onlineRoom || onlineBusy) return;
  const input = document.querySelector<HTMLInputElement>("#online-word-input");
  const word = input?.value ?? "";
  if (!word.trim()) return;
  const priorWords = onlineRoom.words.length;
  onlineBusy = true;
  const response = await sendOnlineAction({ action: "submit", credentials: onlineCredentials, word });
  onlineBusy = false;
  if (!response.ok) {
    audio.play("reject", save.settings.sound);
    setOnlineMessage(response.error);
    input?.classList.remove("shake");
    if (input) void input.offsetWidth;
    input?.classList.add("shake");
    return;
  }
  if (input) input.value = "";
  const newest = response.room.words.at(-1);
  applyOnlineRoom(response.room);
  audio.play("accept", save.settings.sound);
  const feedback = document.querySelector<HTMLElement>("#online-feedback");
  if (feedback && newest && response.room.words.length > priorWords) {
    feedback.textContent = `${newest.word.toUpperCase()} · +${newest.points.toLocaleString()}`;
    feedback.classList.remove("feedback--bad");
    feedback.classList.add("feedback--good");
    showScoreImpact(newest.word, newest.points, Math.max(1, (onlineSelf(response.room)?.combo ?? 0) + 1));
  }
  input?.focus({ preventScroll: true });
}

async function performOnlineAction(action: "ready" | "start" | "next-round" | "rematch"): Promise<void> {
  if (!onlineCredentials || !onlineRoom || onlineBusy) return;
  onlineBusy = true;
  const self = onlineSelf();
  const payload = action === "ready"
    ? { action, credentials: onlineCredentials, ready: !self?.ready } as const
    : { action, credentials: onlineCredentials } as const;
  const response = await sendOnlineAction(payload);
  onlineBusy = false;
  if (!response.ok) return setOnlineMessage(response.error);
  applyOnlineRoom(response.room);
}

async function kickOnlinePlayer(playerId: string): Promise<void> {
  if (!onlineCredentials || !playerId || onlineBusy) return;
  onlineBusy = true;
  const response = await sendOnlineAction({ action: "kick", credentials: onlineCredentials, playerId });
  onlineBusy = false;
  if (!response.ok) return setOnlineMessage(response.error);
  applyOnlineRoom(response.room);
}

async function shareOnlineRoom(button: HTMLElement): Promise<void> {
  if (!onlineRoom) return;
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("room", onlineRoom.code);
  const text = `Join my Make a Word room: ${onlineRoom.code}`;
  try {
    if (typeof navigator.share === "function") await navigator.share({ title: "Make a Word Room", text, url: url.toString() });
    else await navigator.clipboard.writeText(url.toString());
    button.textContent = typeof navigator.share === "function" ? "ROOM SHARED" : "LINK COPIED";
  } catch (error) {
    if ((error as DOMException).name === "AbortError") return;
    await navigator.clipboard.writeText(url.toString()).catch(() => undefined);
    button.textContent = "LINK COPIED";
  }
}

async function leaveOnlineRoom(): Promise<void> {
  const credentials = onlineCredentials;
  stopOnlineSync();
  onlineRoom = null;
  onlineCredentials = null;
  clearOnlineCredentials();
  updateRoomUrl();
  if (credentials) void sendOnlineAction({ action: "leave", credentials });
  showMultiplayer();
}

function captureTogetherNames(): void {
  document.querySelectorAll<HTMLInputElement>("[data-player-name]").forEach((input) => {
    const index = Number(input.dataset.playerName);
    togetherPlayerNames[index] = input.value.trim() || `Player ${index + 1}`;
  });
}

function startMultiplayer(mode: TogetherMode): void {
  stopTimer();
  stopTogetherTimer();
  flowToken += 1;
  together = {
    mode,
    phrase: randomPhrase(lastPhraseText),
    players: Array.from({ length: togetherPlayerCount }, (_, index) => ({
      name: togetherPlayerNames[index] || `Player ${index + 1}`,
      score: 0,
      found: [],
      roundFound: [],
      submitted: new Set<string>(),
      roundScore: 0,
      lives: 2,
      eliminated: false
    })),
    currentPlayer: 0,
    sharedSubmitted: new Set<string>(),
    timeLeft: togetherTurnDuration(mode),
    roundNumber: 1,
    totalRounds: togetherRoundCount,
    usedPhrases: new Set<string>(),
    paused: true,
    ended: false
  };
  together.usedPhrases.add(together.phrase.id);
  lastPhraseText = together.phrase.text;
  showTogetherHandoff(true);
}

function showTogetherHandoff(firstTurn = false): void {
  if (!together) return;
  stopTogetherTimer();
  const player = together.players[together.currentPlayer];
  screens.show("multiplayer-game", `
    <main class="handoff-screen">
      <section class="handoff-card">
        <span class="eyebrow">${together.mode === "relay" ? "WORD RELAY" : together.mode === "last-word" ? "LAST WORD" : firstTurn ? "PASS & PLAY" : "PASS THE DEVICE"} · ROUND ${together.roundNumber} OF ${together.totalRounds}</span>
        <div class="handoff-player">${together.currentPlayer + 1}</div>
        <h2>${escapeHtml(player?.name ?? "Next player")}</h2>
        <p>${together.mode === "relay" ? "Find a word, then hand the turn to the next player." : together.mode === "last-word" ? "You have 12 seconds and two strikes. Keep the word chain alive." : "Your word list stays private until the round results."}</p>
        <button class="primary-button primary-button--wide" data-nav data-action="begin-together">${firstTurn ? together.roundNumber === 1 ? "START MATCH" : "START ROUND" : "START TURN"}</button>
        <button class="text-button" data-nav data-action="quit-together">QUIT TO MENU</button>
      </section>
    </main>
  `);
}

function beginTogetherTurn(): void {
  if (!together || together.ended) return;
  together.paused = false;
  renderTogetherGame();
  stopTogetherTimer();
  togetherTimerId = window.setInterval(togetherTick, 1000);
}

function togetherScoreboard(state: TogetherState): string {
  return state.players.map((player, index) => `
    <div class="together-player ${index === state.currentPlayer ? "active" : ""} ${player.eliminated ? "eliminated" : ""}">
      <span>${escapeHtml(player.name)}</span><strong>${player.score.toLocaleString()}</strong>
      ${state.mode === "last-word" ? `<small>${player.eliminated ? "OUT" : `${"●".repeat(player.lives)}${"○".repeat(2 - player.lives)}`}</small>` : `<small>+${player.roundScore.toLocaleString()} THIS ROUND</small>`}
    </div>`).join("");
}

function togetherFound(state: TogetherState): string {
  const player = state.players[state.currentPlayer];
  const list = state.mode === "relay" || state.mode === "last-word"
    ? state.players.flatMap((entry) => entry.roundFound)
    : player?.roundFound ?? [];
  if (!list.length) return `<div class="empty-found">Words will appear here.</div>`;
  return list.slice().reverse().map((item, index) => `
    <div class="found-word ${index === 0 ? "found-word--new" : ""}"><span>${item.word.toUpperCase()}</span><strong>+${item.points}</strong></div>
  `).join("");
}

function renderTogetherGame(): void {
  if (!together) return;
  const state = together;
  const player = state.players[state.currentPlayer];
  screens.show("multiplayer-game", `
    <main class="game-screen game-screen--together">
      <header class="together-hud">
        <button class="icon-button" data-nav data-action="pause-together" aria-label="Pause">Ⅱ</button>
        <div><span>${state.mode === "relay" ? "WORD RELAY" : state.mode === "last-word" ? "LAST WORD" : "PASS & PLAY"} · ROUND ${state.roundNumber}/${state.totalRounds}</span><strong id="together-turn">${escapeHtml((player?.name ?? "Player").toUpperCase())}'S TURN</strong></div>
        <div class="hud-stat hud-stat--time"><span>TIME</span><strong id="together-time">${formatTime(state.timeLeft)}</strong></div>
      </header>
      <section class="playfield together-playfield">
        <div class="together-scoreboard" id="together-scoreboard">${togetherScoreboard(state)}</div>
        <div class="phrase-header"><span>MAKE WORDS FROM THIS PHRASE</span><small>${state.phrase.label}</small></div>
        <div class="phrase-display">${renderPhraseText(state.phrase.text)}</div>
        <form class="word-entry" id="together-form" autocomplete="off">
          <input id="together-input" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="24" aria-label="Enter a word" placeholder="TYPE A WORD" />
          <button class="submit-word" type="submit">ENTER</button>
        </form>
        <div class="feedback" id="together-feedback">${state.mode === "relay" ? "Find one word to pass the turn" : state.mode === "last-word" ? "Find a new word before time runs out" : "3+ letters · ENTER to submit"}</div>
        ${state.mode === "relay" || state.mode === "last-word" ? `<button class="pass-turn" data-nav data-action="pass-turn">${state.mode === "last-word" ? "TAKE A STRIKE" : "PASS TURN"}</button>` : ""}
        <div class="found-panel together-found">
          <div class="found-panel__header"><span>${state.mode === "relay" || state.mode === "last-word" ? "ROUND WORDS" : `${escapeHtml(player?.name ?? "Player").toUpperCase()}'S WORDS`}</span><strong id="together-word-count">${state.mode === "relay" || state.mode === "last-word" ? state.sharedSubmitted.size : player?.submitted.size ?? 0}</strong></div>
          <div class="found-list" id="together-found-list">${togetherFound(state)}</div>
        </div>
      </section>
      <div id="pause-layer"></div>
    </main>
  `);
  const form = document.querySelector<HTMLFormElement>("#together-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitTogetherWord();
  });
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#together-input")?.focus({ preventScroll: true }));
}

function submitTogetherWord(): void {
  if (!together || together.paused || together.ended) return;
  const state = together;
  const player = state.players[state.currentPlayer];
  const input = document.querySelector<HTMLInputElement>("#together-input");
  const feedback = document.querySelector<HTMLElement>("#together-feedback");
  if (!player || !input) return;
  const submitted = state.mode === "relay" || state.mode === "last-word" ? state.sharedSubmitted : player.submitted;
  const result = validateWord(input.value, countsForText(state.phrase.text), submitted);
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

  const points = scoreWord(result.word.length, 0, false);
  player.score += points;
  player.roundScore += points;
  player.found.push({ word: result.word, points });
  player.roundFound.push({ word: result.word, points });
  player.submitted.add(result.word);
  state.sharedSubmitted.add(result.word);
  input.value = "";
  audio.play("accept", save.settings.sound);
  if (state.mode === "relay" || state.mode === "last-word") {
    state.currentPlayer = nextActiveTogetherPlayer(state, state.currentPlayer);
    if (state.mode === "last-word") state.timeLeft = togetherTurnDuration("last-word");
  }
  renderTogetherGame();
}

function passTogetherTurn(): void {
  if (!together || together.mode === "pass-play" || together.paused) return;
  if (together.mode === "last-word") return applyTogetherStrike();
  together.currentPlayer = nextActiveTogetherPlayer(together, together.currentPlayer);
  renderTogetherGame();
}

function nextActiveTogetherPlayer(state: TogetherState, current: number): number {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = (current + offset) % state.players.length;
    if (!state.players[candidate]?.eliminated) return candidate;
  }
  return current;
}

function applyTogetherStrike(): void {
  const state = together;
  if (!state || state.mode !== "last-word") return;
  const player = state.players[state.currentPlayer];
  if (!player) return;
  player.lives = Math.max(0, player.lives - 1);
  player.eliminated = player.lives === 0;
  audio.play("reject", save.settings.sound);
  const active = state.players.filter((entry) => !entry.eliminated);
  if (active.length <= 1) {
    const survivor = active[0];
    if (survivor) {
      survivor.score += 1000;
      survivor.roundScore += 1000;
    }
    completeTogetherRound();
    return;
  }
  state.currentPlayer = nextActiveTogetherPlayer(state, state.currentPlayer);
  state.timeLeft = togetherTurnDuration("last-word");
  renderTogetherGame();
}

function togetherTick(): void {
  if (!together || together.paused || together.ended) return;
  together.timeLeft -= 1;
  const time = document.querySelector<HTMLElement>("#together-time");
  if (time) {
    time.textContent = formatTime(together.timeLeft);
    time.classList.toggle("danger", together.timeLeft <= 10);
  }
  if (together.timeLeft > 0) return;

  if (together.mode === "last-word") {
    applyTogetherStrike();
  } else if (together.mode === "pass-play" && together.currentPlayer + 1 < together.players.length) {
    together.currentPlayer += 1;
    together.timeLeft = togetherTurnDuration("pass-play");
    together.paused = true;
    showTogetherHandoff();
  } else {
    completeTogetherRound();
  }
}

function completeTogetherRound(): void {
  if (!together || together.ended) return;
  together.paused = true;
  stopTogetherTimer();
  audio.play("board", save.settings.sound);
  showTogetherRoundResults();
}

function showTogetherRoundResults(): void {
  if (!together || together.ended) return;
  const ranked = together.players.slice().sort((a, b) => b.roundScore - a.roundScore || b.score - a.score);
  const roundWinner = ranked[0];
  const finalRound = together.roundNumber >= together.totalRounds;
  screens.show("multiplayer-round", shell(finalRound ? "FINAL ROUND COMPLETE" : `ROUND ${together.roundNumber} COMPLETE`, `
    <section class="round-winner"><span class="eyebrow">${finalRound ? "FINAL ROUND WINNER" : "ROUND WINNER"}</span><h2>${escapeHtml(roundWinner?.name ?? "Great round")}</h2><p>+${roundWinner?.roundScore.toLocaleString() ?? 0} points this round</p></section>
    <section class="together-ranking">
      ${ranked.map((player, index) => `<div class="${index === 0 ? "winner" : ""}"><b>${index + 1}</b><span>${escapeHtml(player.name)}</span><small>+${player.roundScore.toLocaleString()} ROUND</small><strong>${player.score.toLocaleString()}</strong></div>`).join("")}
    </section>
    <section class="result-actions"><button class="primary-button" data-nav data-action="${finalRound ? "finish-together" : "next-together-round"}">${finalRound ? "FINAL RESULTS" : "NEXT ROUND"}</button><button class="text-button" data-nav data-action="quit-together">QUIT TO MENU</button></section>
  `));
}

function nextTogetherRound(): void {
  if (!together || together.ended) return;
  together.roundNumber += 1;
  let nextPhrase = randomPhrase(together.phrase.text);
  for (let attempt = 0; attempt < 8 && together.usedPhrases.has(nextPhrase.id); attempt += 1) nextPhrase = randomPhrase(nextPhrase.text);
  together.phrase = nextPhrase;
  together.usedPhrases.add(nextPhrase.id);
  together.sharedSubmitted = new Set<string>();
  together.currentPlayer = 0;
  together.timeLeft = togetherTurnDuration(together.mode);
  together.players.forEach((player) => {
    player.submitted = new Set<string>();
    player.roundFound = [];
    player.roundScore = 0;
    player.lives = 2;
    player.eliminated = false;
  });
  showTogetherHandoff(true);
}

function toggleTogetherPause(paused: boolean): void {
  if (!together || together.ended) return;
  together.paused = paused;
  const layer = document.querySelector<HTMLElement>("#pause-layer");
  if (!layer) return;
  if (!paused) {
    layer.innerHTML = "";
    document.querySelector<HTMLInputElement>("#together-input")?.focus({ preventScroll: true });
    return;
  }
  layer.innerHTML = `<div class="pause-overlay"><div class="pause-card"><span class="eyebrow">MATCH PAUSED</span><h2>Play Together</h2><button class="primary-button" data-nav data-action="resume-together">RESUME</button><button class="secondary-button secondary-button--danger" data-nav data-action="end-together">END MATCH</button><button class="text-button" data-nav data-action="quit-together">QUIT TO MENU</button></div></div>`;
  screens.focusFirst();
}

function stopTogetherTimer(): void {
  if (togetherTimerId !== null) window.clearInterval(togetherTimerId);
  togetherTimerId = null;
}

function endTogetherMatch(): void {
  if (!together || together.ended) return;
  together.ended = true;
  stopTogetherTimer();
  audio.play("end", save.settings.sound);
  const words = together.players.reduce((sum, player) => sum + player.found.length, 0);
  const score = together.players.reduce((sum, player) => sum + player.score, 0);
  save.totalWords += words;
  save.totalScore += score;
  save.roundsPlayed += 1;
  save.partyMatches += 1;
  store.save(save);
  showTogetherResults();
}

function showTogetherResults(): void {
  if (!together) return showMenu();
  const ranked = together.players
    .map((player, index) => ({ ...player, originalIndex: index }))
    .sort((a, b) => b.score - a.score || b.found.length - a.found.length);
  const winner = ranked[0];
  screens.show("multiplayer-results", shell("MATCH COMPLETE", `
    <section class="results-hero together-results-hero">
      <span class="eyebrow">${together.mode === "relay" ? "WORD RELAY" : together.mode === "last-word" ? "LAST WORD" : "PASS & PLAY"} · ${together.totalRounds} ${together.totalRounds === 1 ? "ROUND" : "ROUNDS"}</span>
      <div class="winner-number">${winner?.originalIndex === undefined ? "★" : winner.originalIndex + 1}</div>
      <h2>${escapeHtml(winner?.name ?? "Great game")} wins!</h2>
      <p>${winner?.score.toLocaleString() ?? 0} points · ${winner?.found.length ?? 0} ${(winner?.found.length ?? 0) === 1 ? "word" : "words"}</p>
    </section>
    <section class="together-ranking">
      ${ranked.map((player, index) => `<div class="${index === 0 ? "winner" : ""}"><b>${index + 1}</b><span>${escapeHtml(player.name)}</span><small>${player.found.length} ${player.found.length === 1 ? "WORD" : "WORDS"}</small><strong>${player.score.toLocaleString()}</strong></div>`).join("")}
    </section>
    <section class="result-actions">
      <button class="primary-button" data-nav data-action="again-together">PLAY AGAIN</button>
      <button class="secondary-button" data-nav data-action="multiplayer">CHANGE MATCH</button>
      <button class="text-button" data-nav data-action="menu">MAIN MENU</button>
    </section>
  `, { back: "multiplayer" }));
}

function showChallengeLanding(): void {
  const challenge = pendingChallenge;
  const phrase = challenge ? PHRASES.find((entry) => entry.id === challenge.phraseId) : undefined;
  if (!challenge || !phrase) {
    pendingChallenge = null;
    showTitle();
    return;
  }
  screens.show("challenge", shell("SCORE CHALLENGE", `
    <section class="challenge-hero">
      <span class="eyebrow">A PLAYER CHALLENGED YOU</span>
      <h2>Can you beat<br>${challenge.target.toLocaleString()}?</h2>
      <p>You will get the exact same phrase and ${challenge.mode === "blitz" ? "60-second Blitz" : "two-minute Classic"} rules.</p>
      <div class="challenge-preview"><span>THE PHRASE</span><strong>${escapeHtml(phrase.text)}</strong><small>${escapeHtml(phrase.label)}</small></div>
      <div class="challenge-actions"><button class="primary-button primary-button--wide" data-nav data-action="play-challenge">PLAY CHALLENGE</button><button class="text-button" data-nav data-action="dismiss-challenge">NOT NOW</button></div>
    </section>
  `));
}

function startPendingChallenge(): void {
  const challenge = pendingChallenge;
  const phrase = challenge ? PHRASES.find((entry) => entry.id === challenge.phraseId) : undefined;
  if (!challenge || !phrase) return showMenu();
  startRound(challenge.mode, phrase, undefined, challenge.target);
}

function dismissChallenge(): void {
  pendingChallenge = null;
  history.replaceState({}, "", location.pathname);
  showMenu();
}

function challengeUrlFor(result: RoundState): string {
  const payload: ChallengePayload = {
    version: 1,
    phraseId: result.phrase.id,
    target: result.score,
    mode: result.mode === "blitz" ? "blitz" : "classic"
  };
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("challenge", encodeChallenge(payload));
  return url.toString();
}

async function shareLastResult(button: HTMLElement): Promise<void> {
  const result = lastResult;
  if (!result || result.mode === "burn") return;
  const url = challengeUrlFor(result);
  const text = `I scored ${result.score.toLocaleString()} in Make a Word. Can you beat me?`;
  const canShare = typeof navigator.share === "function";
  try {
    if (canShare) await navigator.share({ title: "Make a Word Challenge", text, url });
    else await navigator.clipboard.writeText(url);
    button.textContent = canShare ? "CHALLENGE SHARED" : "LINK COPIED";
  } catch (error) {
    if ((error as DOMException).name === "AbortError") return;
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = "LINK COPIED";
    } catch {
      button.textContent = "COPY FAILED";
    }
  }
}

function choosePhrase(mode: ModeId): PhraseEntry {
  if (mode === "daily") return phraseForDay();
  const phrase = randomPhrase(lastPhraseText, mode === "burn");
  lastPhraseText = phrase.text;
  return phrase;
}

function startRound(mode: ModeId, phraseOverride?: PhraseEntry, journeyStage?: number, challengeTarget?: number): void {
  stopTimer();
  stopTogetherTimer();
  const token = ++flowToken;
  const phrase = phraseOverride ?? choosePhrase(mode);
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
    journeyStage,
    challengeTarget,
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

function renderPhraseText(text: string, burned = new Set<number>()): string {
  let wordIndex = 0;
  const words = text.split(" ");
  return words.map((word) => {
    const letters = [...word].map((char) => {
      while (text[wordIndex] === " ") wordIndex += 1;
      const index = wordIndex;
      wordIndex += 1;
      const isBurned = burned.has(index);
      return `<span class="phrase-letter ${isBurned ? "phrase-letter--burned" : ""}" data-letter-index="${index}">${escapeHtml(char)}</span>`;
    }).join("");
    wordIndex += 1;
    return `<span class="phrase-word">${letters}</span>`;
  }).join(" ");
}

function renderPhrase(state: RoundState): string {
  return renderPhraseText(state.phrase.text, state.burned);
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
  const totalLetters = [...countsForText(state.phrase.text).values()].reduce((sum, count) => sum + count, 0);
  const spentLetters = state.burned.size;
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
          <span>${state.mode === "burn" ? `BOARD ${String(state.boardNumber).padStart(2, "0")} · USE EVERY LETTER` : state.mode === "journey" ? `TRIAL ${String((state.journeyStage ?? 0) + 1).padStart(2, "0")}` : "MAKE WORDS FROM THIS PHRASE"}</span>
          <small>${state.phrase.label} • DIFFICULTY ${"◆".repeat(state.phrase.difficulty)}${"◇".repeat(5 - state.phrase.difficulty)}${state.challengeTarget !== undefined ? ` • BEAT ${state.challengeTarget.toLocaleString()}` : ""}</small>
        </div>
        ${state.mode === "burn" ? `
          <div class="burn-progress" aria-label="${spentLetters} of ${totalLetters} letters spent">
            <div><span>LETTERS SPENT</span><strong id="burn-progress-count">${spentLetters} / ${totalLetters}</strong></div>
            <div class="burn-progress__track"><i id="burn-progress-fill" style="transform:scaleX(${totalLetters ? spentLetters / totalLetters : 0})"></i></div>
            <b>BOARD CLEAR <small>+1,000</small></b>
          </div>` : ""}
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
            ` : state.mode === "journey" ? `
              <span>TRIAL MEDALS</span>
              <div class="journey-targets">
                ${(state.phrase.medals ?? []).map((target, index) => `<div><b>${"◆".repeat(index + 1)}</b><strong>${target.toLocaleString()}</strong></div>`).join("")}
              </div>
              <p>Earn one medal to unlock the next trial. Replay it later to reach all three targets.</p>
            ` : `
              <span>SCORING</span>
              <p>Longer words score more. Watch the combo bar and answer before it runs out.</p>
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
  if (phrase && round.mode === "burn") {
    phrase.innerHTML = renderPhrase(round);
    updateBurnProgress(round);
  }
}

function updateBurnProgress(state: RoundState): void {
  const total = [...countsForText(state.phrase.text).values()].reduce((sum, count) => sum + count, 0);
  const spent = state.burned.size;
  const count = document.querySelector<HTMLElement>("#burn-progress-count");
  const fill = document.querySelector<HTMLElement>("#burn-progress-fill");
  if (count) count.textContent = `${spent} / ${total}`;
  if (fill) {
    fill.style.transform = `scaleX(${total ? spent / total : 0})`;
    fill.classList.toggle("burn-progress__fill--complete", spent === total);
  }
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
    if (boardClear) state.boardsCleared += 1;
    updateGameHud(previousScore);
    showEvent(
      boardClear ? "BOARD CLEAR" : `+${bonus.toLocaleString()}`,
      boardClear ? `+${bonus.toLocaleString()} · ALL LETTERS` : `BOARD ${String(state.boardNumber).padStart(2, "0")} EXHAUSTED`,
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
  updateBurnProgress(state);
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
  const previousBest = round.mode === "journey"
    ? save.journeyScores[round.phrase.id] ?? 0
    : save.bestScores[modeKey] ?? 0;
  round.newBest = round.score > previousBest;
  save.bestScores[modeKey] = Math.max(save.bestScores[modeKey] ?? 0, round.score);
  if (round.mode === "daily") save.daily[todayKey()] = Math.max(save.daily[todayKey()] ?? 0, round.score);
  if (round.mode === "journey" && round.journeyStage !== undefined) {
    const earned = medalCount(round.score, round.phrase.medals);
    save.journeyScores[round.phrase.id] = Math.max(previousBest, round.score);
    save.journeyMedals[round.phrase.id] = Math.max(save.journeyMedals[round.phrase.id] ?? 0, earned);
    if (earned >= 1) save.journeyUnlocked = Math.min(JOURNEY_PHRASES.length, Math.max(save.journeyUnlocked, round.journeyStage + 2));
  }
  if (round.challengeTarget !== undefined && round.score > round.challengeTarget) {
    const challengeId = `${round.phrase.id}:${round.challengeTarget}:${round.mode}`;
    if (!save.completedChallengeIds.includes(challengeId)) {
      save.completedChallengeIds.push(challengeId);
      save.challengesCompleted += 1;
    }
  }
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
  const best = result.mode === "journey" ? save.journeyScores[result.phrase.id] ?? result.score : save.bestScores[result.mode] ?? result.score;
  const newBest = result.newBest;
  const journeyMedals = result.mode === "journey" ? medalCount(result.score, result.phrase.medals) : 0;
  const hasNextJourneyStage = result.mode === "journey" && result.journeyStage !== undefined && result.journeyStage + 1 < JOURNEY_PHRASES.length;
  const challengeWon = result.challengeTarget !== undefined && result.score > result.challengeTarget;
  const resultLabel = result.challengeTarget !== undefined
    ? challengeWon ? `CHALLENGE BEATEN · +${(result.score - result.challengeTarget).toLocaleString()}` : `${(result.challengeTarget - result.score + 1).toLocaleString()} MORE TO WIN`
    : result.mode === "journey" ? `${journeyMedals} / 3 MEDALS${journeyMedals ? " · TRIAL COMPLETE" : ""}` : newBest ? "PERSONAL BEST" : `BEST ${best.toLocaleString()}`;

  screens.show("results", shell("ROUND COMPLETE", `
    <section class="results-hero">
      <span class="eyebrow">${result.challengeTarget !== undefined ? "SCORE CHALLENGE" : MODE_META[result.mode].name.toUpperCase()} • ${result.phrase.label.toUpperCase()}</span>
      <div class="results-score" id="results-score" data-final-score="${result.score}">0</div>
      <div class="results-label ${result.challengeTarget !== undefined ? challengeWon ? "results-label--won" : "results-label--close" : ""}">${resultLabel}</div>
    </section>
    <section class="result-stats">
      <div><span>WORDS</span><strong>${result.found.length}</strong></div>
      <div><span>LONGEST</span><strong>${longest.toUpperCase()}</strong></div>
      <div><span>BEST COMBO</span><strong>×${result.bestCombo + 1}</strong></div>
      <div><span>${result.mode === "burn" ? "BOARD CLEARS" : result.mode === "journey" ? "MEDALS" : "MODE"}</span><strong>${result.mode === "burn" ? result.boardsCleared : result.mode === "journey" ? `${journeyMedals} / 3` : MODE_META[result.mode].name.toUpperCase()}</strong></div>
    </section>
    <section class="result-words">
      <div class="section-heading"><span>YOUR WORDS</span><small>${result.found.length} FOUND</small></div>
      <div class="result-word-grid">
        ${sorted.length ? sorted.map((item) => `<div><span>${item.word.toUpperCase()}</span><strong>${item.points}</strong></div>`).join("") : "<p>No words this round. The phrase gets another shot.</p>"}
      </div>
    </section>
    <section class="result-actions">
      ${result.mode === "journey" ? `
        ${hasNextJourneyStage && journeyMedals ? `<button class="primary-button" data-nav data-action="journey-next">NEXT TRIAL</button>` : `<button class="primary-button" data-nav data-action="again">REPLAY TRIAL</button>`}
        ${hasNextJourneyStage && journeyMedals ? `<button class="secondary-button" data-nav data-action="again">REPLAY TRIAL</button>` : ""}
        <button class="secondary-button" data-nav data-action="share-result">CHALLENGE A FRIEND</button>
        <button class="text-button" data-nav data-action="journey">BACK TO TRIALS</button>
      ` : `
        <button class="primary-button" data-nav data-action="again">PLAY AGAIN</button>
        <button class="secondary-button" data-nav data-action="modes">CHANGE MODE</button>
        ${result.mode !== "burn" ? `<button class="secondary-button" data-nav data-action="share-result">CHALLENGE A FRIEND</button>` : ""}
        <button class="text-button" data-nav data-action="menu">MAIN MENU</button>
      `}
    </section>
  `));
  requestAnimationFrame(() => {
    const score = document.querySelector<HTMLElement>("#results-score");
    if (score) animateNumber(score, 0, result.score, 900);
  });
}

function showStats(): void {
  const avg = save.roundsPlayed ? Math.round(save.totalScore / save.roundsPlayed) : 0;
  const medals = Object.values(save.journeyMedals).reduce((sum, count) => sum + count, 0);
  const availableMedals = JOURNEY_PHRASES.length * 3;
  const bestScore = Math.max(0, ...Object.values(save.bestScores));
  const achievements = [
    { name: "First Find", detail: "Find your first word", unlocked: save.totalWords >= 1 },
    { name: "Word Collector", detail: "Find 100 words", unlocked: save.totalWords >= 100 },
    { name: "Five Figures", detail: "Score 10,000 in one round", unlocked: bestScore >= 10_000 },
    { name: "Daily Habit", detail: "Reach a 3-day streak", unlocked: dailyStreak() >= 3 },
    { name: "Party Starter", detail: "Finish a Play Together match", unlocked: save.partyMatches + save.onlineMatches >= 1 },
    { name: "Challenge Won", detail: "Beat a shared score", unlocked: save.challengesCompleted >= 1 },
    { name: "Trial Runner", detail: "Earn 12 Trial medals", unlocked: medals >= 12 },
    { name: "Trial Master", detail: `Earn all ${availableMedals} Trial medals`, unlocked: medals >= availableMedals }
  ];
  screens.show("stats", shell("STATISTICS", `
    <section class="stats-grid">
      <div class="stat-tile stat-tile--wide"><span>PLAYER LEVEL</span><strong>${playerLevel()}</strong><small>${save.totalScore.toLocaleString()} lifetime points</small></div>
      <div class="stat-tile"><span>WORDS FOUND</span><strong>${save.totalWords.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>ROUNDS</span><strong>${save.roundsPlayed.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>AVG SCORE</span><strong>${avg.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>LONGEST WORD</span><strong>${save.longestWord ? save.longestWord.toUpperCase() : "—"}</strong></div>
      <div class="stat-tile"><span>DAILY STREAK</span><strong>${dailyStreak()}</strong></div>
      <div class="stat-tile"><span>PARTY MATCHES</span><strong>${save.partyMatches.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>ONLINE MATCHES</span><strong>${save.onlineMatches.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>CHALLENGES WON</span><strong>${save.challengesCompleted.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>TRIAL MEDALS</span><strong>${medals} / ${availableMedals}</strong></div>
    </section>
    <section class="best-list">
      ${(["classic", "burn", "blitz", "daily", "journey"] as ModeId[]).map((id) => `<div><span>${MODE_META[id].name}</span><strong>${(save.bestScores[id] ?? 0).toLocaleString()}</strong></div>`).join("")}
    </section>
    <section class="achievement-section">
      <div class="section-heading"><span>ACHIEVEMENTS</span><small>${achievements.filter((item) => item.unlocked).length} / ${achievements.length}</small></div>
      <div class="achievement-grid">${achievements.map((item) => `<article class="${item.unlocked ? "unlocked" : ""}"><b>${item.unlocked ? "◆" : "◇"}</b><div><strong>${item.name}</strong><small>${item.detail}</small></div></article>`).join("")}</div>
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
      <article><span>05</span><div><h3>Take on Trials</h3><p>Each Trial has three score medals. Earn one to unlock the next challenge, then replay to collect all three.</p></div></article>
      <article><span>06</span><div><h3>Play together</h3><p>Add two to four names, choose a one-, three-, or five-round match, then share one device for Word Relay, Pass &amp; Play, or Last Word.</p></div></article>
      <article><span>07</span><div><h3>Challenge a friend</h3><p>After a Classic or Blitz run, share your exact phrase and score. Your friend plays by the same rules and tries to beat it.</p></div></article>
      <article><span>08</span><div><h3>Race online</h3><p>Create a private room for up to eight players. Everyone receives the same phrase and timer, while scores update live across every device.</p></div></article>
    </section>
    <button class="primary-button" data-nav data-action="modes">CHOOSE A MODE</button>
  `, { back: "menu" }));
}

function showSettings(returnTo?: ScreenId): void {
  const current = screens.getCurrent();
  if (current === "online-room") stopOnlineSync();
  if (current !== "settings") settingsReturnScreen = returnTo ?? current;
  screens.show("settings", shell("SETTINGS", `
    <section class="settings-list">
      <button class="setting-row" data-nav data-action="toggle-sound"><span><strong>Sound</strong><small>Game tones and feedback</small></span><b>${save.settings.sound ? "ON" : "OFF"}</b></button>
      <button class="setting-row" data-nav data-action="toggle-motion"><span><strong>Reduced Motion</strong><small>Minimize movement and impact animation</small></span><b>${save.settings.reducedMotion ? "ON" : "OFF"}</b></button>
    </section>
    <p class="settings-note">Progress is saved on this device.</p>
  `, { back: "settings-back" }));
}

function settingsReturn(): void {
  if (settingsReturnScreen === "game" && round) renderGame();
  else if (settingsReturnScreen === "results") showResults();
  else if (settingsReturnScreen === "modes") showModes();
  else if (settingsReturnScreen === "journey") showJourney();
  else if (settingsReturnScreen === "multiplayer") showMultiplayer();
  else if (settingsReturnScreen === "multiplayer-round") showTogetherRoundResults();
  else if (settingsReturnScreen === "multiplayer-results") showTogetherResults();
  else if (settingsReturnScreen === "online") showOnlineHome(cleanRoomCode(new URLSearchParams(location.search).get("room") ?? ""));
  else if (settingsReturnScreen === "online-room" && onlineRoom) { renderOnlineRoom(); startOnlineSync(); }
  else if (settingsReturnScreen === "challenge") showChallengeLanding();
  else if (settingsReturnScreen === "stats") showStats();
  else if (settingsReturnScreen === "help") showHelp();
  else if (settingsReturnScreen === "title") showTitle();
  else showMenu();
}

appRoot.addEventListener("input", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-player-name]");
  if (!input) return;
  const index = Number(input.dataset.playerName);
  togetherPlayerNames[index] = input.value;
});

appRoot.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action], [data-mode], [data-journey-stage], [data-player-count], [data-round-count], [data-together-mode]");
  if (!target) return;
  const playerCount = target.dataset.playerCount;
  if (playerCount !== undefined) {
    captureTogetherNames();
    togetherPlayerCount = Number(playerCount);
    showMultiplayer();
    return;
  }
  const roundCount = target.dataset.roundCount;
  if (roundCount !== undefined) {
    captureTogetherNames();
    togetherRoundCount = Number(roundCount);
    showMultiplayer();
    return;
  }
  const togetherMode = target.dataset.togetherMode as TogetherMode | undefined;
  if (togetherMode) {
    captureTogetherNames();
    return startMultiplayer(togetherMode);
  }
  const journeyStage = target.dataset.journeyStage;
  if (journeyStage !== undefined) {
    const stage = Number(journeyStage);
    const phrase = JOURNEY_PHRASES[stage];
    if (phrase && stage < save.journeyUnlocked) startRound("journey", phrase, stage);
    return;
  }
  const mode = target.dataset.mode as ModeId | undefined;
  if (mode) return startRound(mode);
  const action = target.dataset.action;
  if (!action) return;

  if (action === "enter-menu" || action === "menu") showMenu();
  else if (action === "modes") showModes();
  else if (action === "journey") showJourney();
  else if (action === "multiplayer") showMultiplayer();
  else if (action === "online") { updateRoomUrl(); showOnlineHome(); }
  else if (action === "online-cancel") { onlineCredentials = null; showOnlineHome(cleanRoomCode(new URLSearchParams(location.search).get("room") ?? "")); }
  else if (action === "online-create") void createOnlineRoom();
  else if (action === "online-join") void joinOnlineRoom();
  else if (action === "online-ready") void performOnlineAction("ready");
  else if (action === "online-start") void performOnlineAction("start");
  else if (action === "online-kick") void kickOnlinePlayer(target.dataset.playerId ?? "");
  else if (action === "online-next") void performOnlineAction("next-round");
  else if (action === "online-rematch") void performOnlineAction("rematch");
  else if (action === "online-share") void shareOnlineRoom(target);
  else if (action === "online-leave") void leaveOnlineRoom();
  else if (action === "play-challenge") startPendingChallenge();
  else if (action === "dismiss-challenge") dismissChallenge();
  else if (action === "stats") showStats();
  else if (action === "help") showHelp();
  else if (action === "settings") showSettings();
  else if (action === "settings-back") settingsReturn();
  else if (action === "pause") togglePause(true);
  else if (action === "resume") togglePause(false);
  else if (action === "restart" && round) startRound(round.mode, round.mode === "journey" || round.challengeTarget !== undefined ? round.phrase : undefined, round.journeyStage, round.challengeTarget);
  else if (action === "end-run") endRound();
  else if (action === "next-board") void advanceBurnBoard(false);
  else if (action === "begin-together") beginTogetherTurn();
  else if (action === "pass-turn") passTogetherTurn();
  else if (action === "pause-together") toggleTogetherPause(true);
  else if (action === "resume-together") toggleTogetherPause(false);
  else if (action === "end-together") endTogetherMatch();
  else if (action === "next-together-round") nextTogetherRound();
  else if (action === "finish-together") endTogetherMatch();
  else if (action === "quit-together") { together = null; showMenu(); }
  else if (action === "again-together" && together) startMultiplayer(together.mode);
  else if (action === "quit") { round = null; showMenu(); }
  else if (action === "again" && lastResult) startRound(lastResult.mode, lastResult.mode === "journey" || lastResult.challengeTarget !== undefined ? lastResult.phrase : undefined, lastResult.journeyStage, lastResult.challengeTarget);
  else if (action === "share-result") void shareLastResult(target);
  else if (action === "journey-next" && lastResult?.journeyStage !== undefined) {
    const nextStage = lastResult.journeyStage + 1;
    const phrase = JOURNEY_PHRASES[nextStage];
    if (phrase && nextStage < save.journeyUnlocked) startRound("journey", phrase, nextStage);
    else showJourney();
  }
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
  if (screens.getCurrent() === "online") {
    if (event.key === "Enter" && (event.target as HTMLElement).closest("#online-host-name, #online-rounds, #online-duration, #online-capacity")) {
      event.preventDefault();
      void createOnlineRoom();
    } else if (event.key === "Enter" && (event.target as HTMLElement).closest("#online-join-name, #online-code")) {
      event.preventDefault();
      void joinOnlineRoom();
    }
    return;
  }
  if (screens.getCurrent() === "online-room" && onlineRoom?.phase === "playing") {
    const onlineInput = document.querySelector<HTMLInputElement>("#online-word-input");
    if (/^[a-zA-Z]$/.test(event.key) && onlineInput && document.activeElement !== onlineInput && !event.metaKey && !event.ctrlKey && !event.altKey) onlineInput.focus();
    return;
  }
  if (screens.getCurrent() === "multiplayer-game" && together) {
    if (event.key === "Escape" && document.querySelector("#pause-layer")) {
      event.preventDefault();
      toggleTogetherPause(!together.paused);
      return;
    }
    const togetherInput = document.querySelector<HTMLInputElement>("#together-input");
    if (/^[a-zA-Z]$/.test(event.key) && togetherInput && document.activeElement !== togetherInput && !event.metaKey && !event.ctrlKey && !event.altKey) togetherInput.focus();
    return;
  }
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
  if (document.hidden && together && !together.ended && !together.paused) toggleTogetherPause(true);
});

document.documentElement.classList.toggle("reduce-motion", save.settings.reducedMotion);
const initialQuery = new URLSearchParams(location.search);
const initialRoomCode = cleanRoomCode(initialQuery.get("room") ?? "");
pendingChallenge = decodeChallenge(initialQuery.get("challenge"));
if (initialRoomCode.length === 6) void resumeOnlineRoom(initialRoomCode);
else if (pendingChallenge) showChallengeLanding();
else showTitle();

// Keep content referenced so future phrase-doctor tooling can inspect the bank from this bundle.
void PHRASES;
