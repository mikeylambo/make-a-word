export type RunMode = "classic" | "burn" | "blitz" | "daily" | "journey";

export type RunSnapshot = {
  version: 1;
  savedAt: number;
  mode: RunMode;
  phraseId: string;
  score: number;
  duration: number;
  timeLeft: number;
  submitted: string[];
  found: Array<{ word: string; points: number; rarity?: 1 | 1.3 | 1.6 }>;
  burned: number[];
  usedLetters: string[];
  combo: number;
  chainBank: number;
  chainLength: number;
  bestCombo: number;
  comboAgeMs: number;
  startedElapsedMs: number;
  boardNumber: number;
  boardsCleared: number;
  boardWords: number;
  boardCandidates: string[];
  journeyStage?: number;
  challengeTarget?: number;
  dailyKey?: string;
  paused: boolean;
  newBest: boolean;
  firstWordTracked: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const MEMORY_RUNS = new Map<string, RunSnapshot>();
const MAX_AGE_MS = 30 * 60 * 1000;
const VALID_DURATIONS = new Set([60, 120, 150, 180]);
const VALID_MODES = new Set<RunMode>(["classic", "burn", "blitz", "daily", "journey"]);

function safeInt(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function safeWord(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const word = value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 24);
  return word.length >= 3 ? word : null;
}

function safeWords(value: unknown, limit = 1200): string[] {
  if (!Array.isArray(value)) return [];
  const words = value.map(safeWord).filter((word): word is string => Boolean(word));
  return [...new Set(words)].slice(0, limit);
}

function optionalInt(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : undefined;
}

export function sanitizeRunSnapshot(value: unknown): RunSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Partial<RunSnapshot>;
  if (input.version !== 1 || !VALID_MODES.has(input.mode as RunMode)) return null;
  if (typeof input.phraseId !== "string" || !/^[a-z0-9._:-]{1,80}$/i.test(input.phraseId)) return null;
  if (typeof input.savedAt !== "number" || !Number.isFinite(input.savedAt)) return null;
  const duration = VALID_DURATIONS.has(Number(input.duration)) ? Number(input.duration) : 120;
  const found = Array.isArray(input.found)
    ? input.found.slice(0, 500).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as { word?: unknown; points?: unknown; rarity?: unknown };
        const word = safeWord(item.word);
        if (!word) return [];
        const rarity: 1 | 1.3 | 1.6 = item.rarity === 1.3 || item.rarity === 1.6 ? item.rarity : 1;
        return [{ word, points: safeInt(item.points, 0, 10_000_000), rarity }];
      })
    : [];
  const burned = Array.isArray(input.burned)
    ? [...new Set(input.burned.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 512))].slice(0, 512)
    : [];
  const usedLetters = Array.isArray(input.usedLetters)
    ? [...new Set(input.usedLetters.filter((entry): entry is string => typeof entry === "string" && /^[a-z]$/i.test(entry)).map((entry) => entry.toLowerCase()))].slice(0, 26)
    : [];
  const dailyKey = typeof input.dailyKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.dailyKey) ? input.dailyKey : undefined;
  return {
    version: 1,
    savedAt: Math.floor(input.savedAt),
    mode: input.mode as RunMode,
    phraseId: input.phraseId,
    score: safeInt(input.score, 0, 100_000_000),
    duration,
    timeLeft: safeInt(input.timeLeft, 0, duration, duration),
    submitted: safeWords(input.submitted, 500),
    found,
    burned,
    usedLetters,
    combo: safeInt(input.combo, 0, 999),
    chainBank: safeInt(input.chainBank, 0, 100_000_000),
    chainLength: safeInt(input.chainLength, 0, 999),
    bestCombo: safeInt(input.bestCombo, 0, 999),
    comboAgeMs: safeInt(input.comboAgeMs, 0, 300_000),
    startedElapsedMs: safeInt(input.startedElapsedMs, 0, 3_600_000),
    boardNumber: safeInt(input.boardNumber, 1, 10_000, 1),
    boardsCleared: safeInt(input.boardsCleared, 0, 10_000),
    boardWords: safeInt(input.boardWords, 0, 10_000),
    boardCandidates: safeWords(input.boardCandidates),
    journeyStage: optionalInt(input.journeyStage, 0, 10_000),
    challengeTarget: optionalInt(input.challengeTarget, 0, 10_000_000),
    dailyKey,
    paused: input.paused === true,
    newBest: input.newBest === true,
    firstWordTracked: input.firstWordTracked === true
  };
}

export function resumedTimeLeft(snapshot: RunSnapshot, now = Date.now()): number {
  if (snapshot.paused) return snapshot.timeLeft;
  const elapsed = Math.max(0, Math.floor((now - snapshot.savedAt) / 1000));
  return Math.max(0, snapshot.timeLeft - elapsed);
}

export function resumeGapMs(snapshot: RunSnapshot, now = Date.now()): number {
  return snapshot.paused ? 0 : Math.max(0, now - snapshot.savedAt);
}

export class RunStore {
  constructor(private readonly key = "slu.make-a-word.run.v1", private readonly storage?: StorageLike) {}

  private getStorage(): StorageLike {
    if (this.storage) return this.storage;
    return localStorage;
  }

  load(now = Date.now()): RunSnapshot | null {
    let candidate = MEMORY_RUNS.get(this.key) ?? null;
    try {
      const raw = this.getStorage().getItem(this.key);
      if (raw) candidate = sanitizeRunSnapshot(JSON.parse(raw));
    } catch {
      // Memory fallback below keeps restricted storage non-fatal.
    }
    const safe = sanitizeRunSnapshot(candidate);
    if (!safe || safe.savedAt > now + 5 * 60 * 1000 || now - safe.savedAt > MAX_AGE_MS) {
      this.clear();
      return null;
    }
    MEMORY_RUNS.set(this.key, safe);
    return structuredClone(safe);
  }

  save(snapshot: RunSnapshot): void {
    const safe = sanitizeRunSnapshot(snapshot);
    if (!safe) return;
    MEMORY_RUNS.set(this.key, safe);
    try {
      this.getStorage().setItem(this.key, JSON.stringify(safe));
    } catch {
      // Reload recovery cannot be guaranteed when storage is blocked,
      // but the active tab remains safe and playable.
    }
  }

  clear(): void {
    MEMORY_RUNS.delete(this.key);
    try {
      this.getStorage().removeItem(this.key);
    } catch {
      // Restricted storage is already equivalent to no persisted run.
    }
  }
}
