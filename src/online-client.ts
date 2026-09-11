import { SaveStore } from "./shell";
import type { OnlineAction, OnlineCredentials, OnlineResponse, OnlineRoomView } from "./online-types";

const API_PATH = "/api/room";
const CREDENTIALS_KEY = "make-a-word.online-room";
const REQUEST_TIMEOUT_MS = 8_000;
const ONLINE_PHASES = new Set(["lobby", "playing", "round-results", "match-results"]);

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOnlineCredentials(value: unknown): value is OnlineCredentials {
  if (!isRecord(value)) return false;
  return typeof value.code === "string" && /^[A-Z0-9]{6}$/.test(value.code.toUpperCase())
    && typeof value.playerId === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(value.playerId)
    && typeof value.token === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(value.token);
}

function isOnlineRoom(value: unknown): value is OnlineRoomView {
  if (!isRecord(value) || typeof value.code !== "string" || !/^[A-Z0-9]{6}$/.test(value.code)) return false;
  if (typeof value.matchId !== "string" || !value.matchId || !Number.isSafeInteger(value.version) || Number(value.version) < 1) return false;
  if (typeof value.phase !== "string" || !ONLINE_PHASES.has(value.phase)) return false;
  if (!isRecord(value.settings)
    || ![1, 3, 5].includes(Number(value.settings.rounds))
    || ![60, 90, 120].includes(Number(value.settings.roundSeconds))
    || !Number.isSafeInteger(value.settings.maxPlayers)
    || Number(value.settings.maxPlayers) < 2
    || Number(value.settings.maxPlayers) > 8) return false;
  if (!Number.isSafeInteger(value.roundNumber) || Number(value.roundNumber) < 0 || !isFiniteCount(value.serverNow)) return false;
  if (!Array.isArray(value.players) || value.players.length > 8 || !Array.isArray(value.words)) return false;
  if (!value.players.every((player) => isRecord(player)
    && typeof player.id === "string" && player.id.length > 0
    && typeof player.name === "string"
    && typeof player.isHost === "boolean"
    && typeof player.ready === "boolean"
    && typeof player.online === "boolean"
    && isFiniteCount(player.score)
    && isFiniteCount(player.roundScore)
    && isFiniteCount(player.foundCount)
    && typeof player.longestWord === "string"
    && isFiniteCount(player.matchFoundCount)
    && typeof player.matchLongestWord === "string"
    && isFiniteCount(player.combo))) return false;
  if (!value.words.every((word) => isRecord(word) && typeof word.word === "string" && isFiniteCount(word.points))) return false;
  if (value.phrase !== undefined && (!isRecord(value.phrase)
    || typeof value.phrase.id !== "string"
    || typeof value.phrase.text !== "string"
    || (value.phrase.display !== undefined && typeof value.phrase.display !== "string")
    || typeof value.phrase.label !== "string"
    || !isFiniteCount(value.phrase.difficulty))) return false;
  if (value.startsAt !== undefined && !isFiniteCount(value.startsAt)) return false;
  if (value.endsAt !== undefined && !isFiniteCount(value.endsAt)) return false;
  return true;
}

function parseOnlineResponse(value: unknown): OnlineResponse | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") return null;
  if (!value.ok) return typeof value.error === "string"
    ? { ok: false, error: value.error, code: typeof value.code === "string" ? value.code : undefined }
    : null;
  if (!isOnlineRoom(value.room)) return null;
  const credentials = value.credentials === undefined ? undefined : isOnlineCredentials(value.credentials) ? value.credentials : null;
  if (credentials === null) return null;
  return { ok: true, room: value.room, credentials };
}

function normalizeFinalLeaderboard(response: OnlineResponse): OnlineResponse {
  if (!response.ok || response.room.phase !== "match-results") return response;
  response.room.players.forEach((player) => {
    player.foundCount = player.matchFoundCount;
    player.longestWord = player.matchLongestWord;
  });
  return response;
}

async function parseResponse(response: Response): Promise<OnlineResponse> {
  const body = await response.json().catch(() => null) as unknown;
  const parsed = parseOnlineResponse(body);
  if (parsed) return normalizeFinalLeaderboard(parsed);
  return { ok: false, error: response.ok ? "The room sent an unreadable response." : "The room service is unavailable." };
}

function reconcileCompletedMatch(response: OnlineResponse, credentials?: OnlineCredentials): void {
  if (!response.ok || response.room.phase !== "match-results") return;
  const identity = response.credentials ?? credentials;
  if (!identity) return;
  const self = response.room.players.find((player) => player.id === identity.playerId);
  if (!self) return;

  const store = new SaveStore();
  const save = store.load();
  if (save.completedOnlineMatchIds.includes(response.room.matchId)) return;
  save.completedOnlineMatchIds.push(response.room.matchId);
  save.onlineMatches += 1;
  save.totalWords += self.matchFoundCount;
  save.totalScore += self.score;
  // Lifetime score stores the whole match, so round count must advance by
  // the actual number of timed rounds to keep average-score semantics coherent.
  save.roundsPlayed += response.room.settings.rounds;
  if (self.matchLongestWord.length > save.longestWord.length) save.longestWord = self.matchLongestWord;
  store.save(save);
}

export async function sendOnlineAction(action: OnlineAction): Promise<OnlineResponse> {
  try {
    const response = await fetchWithTimeout(API_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action)
    });
    const parsed = await parseResponse(response);
    const credentials = "credentials" in action ? action.credentials : parsed.ok ? parsed.credentials : undefined;
    reconcileCompletedMatch(parsed, credentials);
    return parsed;
  } catch {
    return { ok: false, error: "Could not reach the room. Check your connection and try again." };
  }
}

export async function fetchOnlineRoom(credentials: OnlineCredentials): Promise<OnlineResponse> {
  const query = new URLSearchParams({ code: credentials.code });
  try {
    const response = await fetchWithTimeout(`${API_PATH}?${query.toString()}`, {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${credentials.token}`,
        "x-room-player": credentials.playerId
      }
    });
    const parsed = await parseResponse(response);
    reconcileCompletedMatch(parsed, credentials);
    return parsed;
  } catch {
    return { ok: false, error: "Reconnecting…" };
  }
}

export function storeOnlineCredentials(credentials: OnlineCredentials): void {
  if (!isOnlineCredentials(credentials)) return;
  try {
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ ...credentials, code: credentials.code.toUpperCase() }));
  } catch {
    // Storage can be unavailable in private/restricted browser contexts. The
    // live room still works; only automatic reload/reconnect is unavailable.
  }
}

export function loadOnlineCredentials(code?: string): OnlineCredentials | null {
  try {
    const raw = sessionStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isOnlineCredentials(parsed)) return null;
    const normalizedCode = parsed.code.toUpperCase();
    if (code && normalizedCode !== code.toUpperCase()) return null;
    return { code: normalizedCode, playerId: parsed.playerId, token: parsed.token };
  } catch {
    return null;
  }
}

export function clearOnlineCredentials(): void {
  try {
    sessionStorage.removeItem(CREDENTIALS_KEY);
  } catch {
    // Treat unavailable storage as already cleared.
  }
}
