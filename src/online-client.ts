import type { OnlineAction, OnlineCredentials, OnlineResponse } from "./online-types";

const API_PATH = "/api/room";
const CREDENTIALS_KEY = "make-a-word.online-room";

async function parseResponse(response: Response): Promise<OnlineResponse> {
  const body = await response.json().catch(() => null) as OnlineResponse | null;
  if (body && typeof body === "object" && "ok" in body) return body;
  return { ok: false, error: response.ok ? "The room sent an unreadable response." : "The room service is unavailable." };
}

export async function sendOnlineAction(action: OnlineAction): Promise<OnlineResponse> {
  try {
    const response = await fetch(API_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action)
    });
    return parseResponse(response);
  } catch {
    return { ok: false, error: "Could not reach the room. Check your connection and try again." };
  }
}

export async function fetchOnlineRoom(credentials: OnlineCredentials): Promise<OnlineResponse> {
  const query = new URLSearchParams({ code: credentials.code });
  try {
    const response = await fetch(`${API_PATH}?${query.toString()}`, {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${credentials.token}`,
        "x-room-player": credentials.playerId
      }
    });
    return parseResponse(response);
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
