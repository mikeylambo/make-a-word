import { SaveStore } from "./shell";
import type { OnlineAction, OnlineCredentials, OnlineResponse } from "./online-types";

const API_PATH = "/api/room";
const CREDENTIALS_KEY = "make-a-word.online-room";
const REQUEST_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function parseResponse(response: Response): Promise<OnlineResponse> {
  const body = await response.json().catch(() => null) as OnlineResponse | null;
  if (body && typeof body === "object" && "ok" in body) return body;
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
  save.roundsPlayed += 1;
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
  try {
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  } catch {
    // Storage can be unavailable in private/restricted browser contexts. The
    // live room still works; only automatic reload/reconnect is unavailable.
  }
}

export function loadOnlineCredentials(code?: string): OnlineCredentials | null {
  try {
    const raw = sessionStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnlineCredentials>;
    if (typeof parsed.code !== "string" || typeof parsed.playerId !== "string" || typeof parsed.token !== "string") return null;
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
