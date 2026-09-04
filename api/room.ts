import { createHash, randomBytes, randomInt } from "node:crypto";
import { Redis } from "@upstash/redis";
import dictionary from "../content/server-dictionary.json" with { type: "json" };
import blockedWords from "../content/dictionary-blocklist.json" with { type: "json" };
import phraseData from "../content/phrases.json" with { type: "json" };
import type {
  OnlineAction,
  OnlineCredentials,
  OnlineFoundWord,
  OnlinePlayerView,
  OnlineResponse,
  OnlineRoomView,
  OnlineSettings
} from "../src/online-types.js";

type PhraseEntry = {
  id: string;
  text: string;
  display?: string;
  label: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  burnSolution?: string[];
  journeyOrder?: number;
  medals?: [number, number, number];
};

const PHRASES = phraseData as PhraseEntry[];

function normalizeWord(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z]/g, "");
}

function countsForText(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const char of text.toLowerCase()) {
    if (!/[a-z]/.test(char)) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return counts;
}

function canSpell(word: string, counts: Map<string, number>): boolean {
  const used = new Map<string, number>();
  for (const char of word) {
    const next = (used.get(char) ?? 0) + 1;
    if (next > (counts.get(char) ?? 0)) return false;
    used.set(char, next);
  }
  return true;
}

function scoreWord(length: number, combo: number): number {
  const base = length === 3 ? 100 : length === 4 ? 180 : length === 5 ? 300 : length === 6 ? 480 : length === 7 ? 720 : 900 + (length - 8) * 180;
  return Math.round(base * (1 + Math.min(combo, 8) * 0.1));
}

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(value: OnlineResponse): void;
};

type RoomPlayer = {
  id: string;
  tokenHash: string;
  name: string;
  ready: boolean;
  joinedAt: number;
  lastSeen: number;
  score: number;
  roundScore: number;
  roundWords: OnlineFoundWord[];
  submitted: string[];
  longestWord: string;
  combo: number;
  lastValidAt: number;
};

type StoredRoom = {
  code: string;
  matchId: string;
  version: number;
  createdAt: number;
  hostPlayerId: string;
  phase: OnlineRoomView["phase"];
  settings: OnlineSettings;
  roundNumber: number;
  phraseId?: string;
  usedPhraseIds: string[];
  startsAt?: number;
  endsAt?: number;
  players: RoomPlayer[];
};

const WORDS = new Set<string>(dictionary);
const BLOCKED_CODE_PARTS = blockedWords.filter((word) => word.length >= 3);
const ROOM_TTL_SECONDS = 6 * 60 * 60;
const PRESENCE_WINDOW_MS = 20_000;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
let redisClient: Redis | null = null;

class RoomError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
  }
}

function getRedis(): Redis {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new RoomError("Online rooms are not configured yet.", 503, "ROOMS_NOT_CONFIGURED");
  redisClient = new Redis({ url, token });
  return redisClient;
}

function roomKey(code: string): string {
  return `make-a-word:room:${code}`;
}

function cleanCode(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function cleanName(value: unknown): string {
  return String(value ?? "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().replace(/\s+/g, " ").slice(0, 16);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function makeId(bytes = 12): string {
  return randomBytes(bytes).toString("base64url");
}

function makeCode(): string {
  for (;;) {
    let code = "";
    for (let index = 0; index < 6; index += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    const lowercase = code.toLowerCase();
    if (!BLOCKED_CODE_PARTS.some((word) => lowercase.includes(word))) return code;
  }
}

function normalizeSettings(input: OnlineSettings): OnlineSettings {
  const rounds = input?.rounds === 1 || input?.rounds === 5 ? input.rounds : 3;
  const roundSeconds = input?.roundSeconds === 60 || input?.roundSeconds === 90 ? input.roundSeconds : 120;
  const maxPlayers = Math.min(8, Math.max(2, Math.round(Number(input?.maxPlayers) || 4)));
  return { rounds, roundSeconds, maxPlayers };
}

function newPlayer(name: string, ready: boolean): { player: RoomPlayer; credentials: Omit<OnlineCredentials, "code"> } {
  const token = makeId(24);
  const id = makeId(9);
  const now = Date.now();
  return {
    player: {
      id,
      tokenHash: hashToken(token),
      name,
      ready,
      joinedAt: now,
      lastSeen: now,
      score: 0,
      roundScore: 0,
      roundWords: [],
      submitted: [],
      longestWord: "",
      combo: 0,
      lastValidAt: 0
    },
    credentials: { playerId: id, token }
  };
}

function getPhrase(room: StoredRoom): PhraseEntry | undefined {
  return room.phraseId ? PHRASES.find((phrase) => phrase.id === room.phraseId) : undefined;
}

function choosePhrase(room: StoredRoom): PhraseEntry {
  const unused = PHRASES.filter((phrase) => !room.usedPhraseIds.includes(phrase.id));
  const pool = unused.length ? unused : PHRASES;
  return pool[randomInt(pool.length)] ?? PHRASES[0];
}

function resetRoundPlayer(player: RoomPlayer): void {
  player.roundScore = 0;
  player.roundWords = [];
  player.submitted = [];
  player.longestWord = "";
  player.combo = 0;
  player.lastValidAt = 0;
}

function beginRound(room: StoredRoom, roundNumber: number): void {
  const phrase = choosePhrase(room);
  const startsAt = Date.now() + 4_000;
  room.roundNumber = roundNumber;
  room.phraseId = phrase.id;
  room.usedPhraseIds.push(phrase.id);
  room.startsAt = startsAt;
  room.endsAt = startsAt + room.settings.roundSeconds * 1_000;
  room.phase = "playing";
  room.players.forEach(resetRoundPlayer);
}

function advanceExpiredRound(room: StoredRoom): boolean {
  if (room.phase !== "playing" || !room.endsAt || Date.now() < room.endsAt) return false;
  room.phase = room.roundNumber >= room.settings.rounds ? "match-results" : "round-results";
  room.startsAt = undefined;
  room.endsAt = undefined;
  room.players.forEach((player) => {
    player.combo = 0;
    player.lastValidAt = 0;
  });
  return true;
}

function ensureActiveHost(room: StoredRoom): void {
  const now = Date.now();
  const host = room.players.find((player) => player.id === room.hostPlayerId);
  if (host && now - host.lastSeen < 60_000) return;
  const replacement = room.players.find((player) => now - player.lastSeen < PRESENCE_WINDOW_MS);
  if (replacement) {
    room.hostPlayerId = replacement.id;
    replacement.ready = true;
  }
}

function requirePlayer(room: StoredRoom, credentials: OnlineCredentials): RoomPlayer {
  if (cleanCode(credentials?.code) !== room.code) throw new RoomError("That room code does not match.", 403);
  const player = room.players.find((entry) => entry.id === credentials?.playerId);
  if (!player || player.tokenHash !== hashToken(String(credentials?.token ?? ""))) {
    throw new RoomError("Your room session has expired. Join the room again.", 403, "SESSION_EXPIRED");
  }
  return player;
}

function requireHost(room: StoredRoom, credentials: OnlineCredentials): RoomPlayer {
  const player = requirePlayer(room, credentials);
  if (player.id !== room.hostPlayerId) throw new RoomError("Only the host can do that.", 403);
  return player;
}

function roomView(room: StoredRoom, viewerId: string): OnlineRoomView {
  const now = Date.now();
  const phrase = getPhrase(room);
  const viewer = room.players.find((player) => player.id === viewerId);
  const players: OnlinePlayerView[] = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    isHost: player.id === room.hostPlayerId,
    ready: player.ready,
    online: now - player.lastSeen < PRESENCE_WINDOW_MS,
    score: player.score,
    roundScore: player.roundScore,
    foundCount: player.roundWords.length,
    longestWord: player.longestWord,
    combo: player.lastValidAt && now - player.lastValidAt <= 5_000 ? player.combo : 0
  }));
  return {
    code: room.code,
    matchId: room.matchId,
    version: room.version,
    phase: room.phase,
    settings: room.settings,
    roundNumber: room.roundNumber,
    players,
    phrase: phrase && room.phase !== "lobby" ? {
      id: phrase.id,
      text: phrase.text,
      display: phrase.display,
      label: phrase.label,
      difficulty: phrase.difficulty
    } : undefined,
    startsAt: room.startsAt,
    endsAt: room.endsAt,
    words: viewer?.roundWords ?? [],
    serverNow: now
  };
}

async function acquireLock(code: string): Promise<string> {
  const redis = getRedis();
  const key = `${roomKey(code)}:lock`;
  const token = makeId(12);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const acquired = await redis.set(key, token, { nx: true, px: 2_000 });
    if (acquired) return token;
    await new Promise((resolve) => setTimeout(resolve, 35 + attempt * 20));
  }
  throw new RoomError("The room is busy. Try that again.", 409, "ROOM_BUSY");
}

async function releaseLock(code: string, token: string): Promise<void> {
  const redis = getRedis();
  const key = `${roomKey(code)}:lock`;
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    [key],
    [token]
  );
}

async function mutateRoom<T>(code: string, mutation: (room: StoredRoom) => Promise<T> | T): Promise<{ room: StoredRoom; value: T }> {
  const redis = getRedis();
  const normalizedCode = cleanCode(code);
  if (normalizedCode.length !== 6) throw new RoomError("Enter a six-character room code.");
  const lock = await acquireLock(normalizedCode);
  try {
    const room = await redis.get<StoredRoom>(roomKey(normalizedCode));
    if (!room) throw new RoomError("That room could not be found. Check the code and try again.", 404, "ROOM_NOT_FOUND");
    advanceExpiredRound(room);
    ensureActiveHost(room);
    const value = await mutation(room);
    room.version += 1;
    await redis.set(roomKey(normalizedCode), room, { ex: ROOM_TTL_SECONDS });
    return { room, value };
  } finally {
    await releaseLock(normalizedCode, lock).catch(() => undefined);
  }
}

async function rateLimit(req: ApiRequest, limit: number, discriminator = "public"): Promise<void> {
  const redis = getRedis();
  const forwarded = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0]?.trim() || "unknown";
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `make-a-word:rate:${createHash("sha256").update(`${forwarded}:${discriminator}`).digest("hex").slice(0, 16)}:${bucket}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 90);
  if (count > limit) throw new RoomError("Too many requests. Wait a moment and try again.", 429);
}

async function createRoom(action: Extract<OnlineAction, { action: "create" }>): Promise<{ room: StoredRoom; credentials: OnlineCredentials }> {
  const redis = getRedis();
  const name = cleanName(action.name);
  if (name.length < 1) throw new RoomError("Enter a player name.");
  let code = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = makeCode();
    if (!(await redis.exists(roomKey(candidate)))) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new RoomError("Could not create a room. Try again.", 503);
  const { player, credentials } = newPlayer(name, true);
  const room: StoredRoom = {
    code,
    matchId: makeId(8),
    version: 1,
    createdAt: Date.now(),
    hostPlayerId: player.id,
    phase: "lobby",
    settings: normalizeSettings(action.settings),
    roundNumber: 0,
    usedPhraseIds: [],
    players: [player]
  };
  const created = await redis.set(roomKey(code), room, { nx: true, ex: ROOM_TTL_SECONDS });
  if (!created) throw new RoomError("Could not create a room. Try again.", 503);
  return { room, credentials: { code, ...credentials } };
}

async function handleAction(action: OnlineAction, req: ApiRequest): Promise<{ room: StoredRoom; viewerId: string; credentials?: OnlineCredentials }> {
  if (action.action === "create") {
    await rateLimit(req, 30);
    const created = await createRoom(action);
    return { room: created.room, viewerId: created.credentials.playerId, credentials: created.credentials };
  }

  if (action.action === "join") {
    await rateLimit(req, 180);
    const name = cleanName(action.name);
    if (!name) throw new RoomError("Enter a player name.");
    const result = await mutateRoom(action.code, (room) => {
      if (room.phase !== "lobby") throw new RoomError("That match has already started.", 409);
      if (room.players.length >= room.settings.maxPlayers) throw new RoomError("That room is full.", 409);
      if (room.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) throw new RoomError("That name is already in the room.", 409);
      const joined = newPlayer(name, false);
      if (room.players.length === 0) {
        room.hostPlayerId = joined.player.id;
        joined.player.ready = true;
      }
      room.players.push(joined.player);
      return joined.credentials;
    });
    const credentials = { code: result.room.code, ...result.value };
    return { room: result.room, viewerId: credentials.playerId, credentials };
  }

  if (!("credentials" in action) || !action.credentials) throw new RoomError("Invalid room request.");
  const credentials = action.credentials;
  await rateLimit(req, 240, credentials?.playerId ?? "unknown");
  const result = await mutateRoom(credentials.code, (room) => {
    const player = requirePlayer(room, credentials);
    player.lastSeen = Date.now();

    if (action.action === "heartbeat") return;
    if (action.action === "ready") {
      if (room.phase !== "lobby") throw new RoomError("The match has already started.", 409);
      if (player.id !== room.hostPlayerId) player.ready = Boolean(action.ready);
      return;
    }
    if (action.action === "kick") {
      requireHost(room, credentials);
      if (room.phase !== "lobby") throw new RoomError("Players can only be removed before the match.", 409);
      if (action.playerId === room.hostPlayerId) throw new RoomError("The host cannot remove themselves.", 409);
      room.players = room.players.filter((entry) => entry.id !== action.playerId);
      return;
    }
    if (action.action === "start") {
      requireHost(room, credentials);
      if (room.phase !== "lobby") throw new RoomError("The match has already started.", 409);
      if (room.players.length < 2) throw new RoomError("At least two players are needed.", 409);
      if (room.players.some((entry) => entry.id !== room.hostPlayerId && !entry.ready)) throw new RoomError("Every player must be ready.", 409);
      beginRound(room, 1);
      return;
    }
    if (action.action === "submit") {
      if (room.phase !== "playing" || !room.startsAt || !room.endsAt) throw new RoomError("The round is not active.", 409);
      const now = Date.now();
      if (now < room.startsAt) throw new RoomError("Wait for the countdown.", 409);
      if (now >= room.endsAt) throw new RoomError("Time is up.", 409);
      const phrase = getPhrase(room);
      if (!phrase) throw new RoomError("This round has no phrase.", 500);
      const word = normalizeWord(action.word);
      if (word.length < 3) throw new RoomError("Words need at least three letters.", 422, "TOO_SHORT");
      if (player.submitted.includes(word)) throw new RoomError("You already found that word.", 422, "DUPLICATE");
      if (!canSpell(word, countsForText(phrase.text))) throw new RoomError("Those letters are not available.", 422, "LETTERS");
      if (!WORDS.has(word)) throw new RoomError("That word is not in the word list.", 422, "NOT_WORD");
      player.combo = player.lastValidAt && now - player.lastValidAt <= 5_000 ? Math.min(9, player.combo + 1) : 0;
      player.lastValidAt = now;
      const points = scoreWord(word.length, player.combo);
      player.score += points;
      player.roundScore += points;
      player.submitted.push(word);
      player.roundWords.push({ word, points });
      if (word.length > player.longestWord.length) player.longestWord = word;
      return;
    }
    if (action.action === "next-round") {
      requireHost(room, credentials);
      if (room.phase !== "round-results") throw new RoomError("The next round is not ready yet.", 409);
      beginRound(room, room.roundNumber + 1);
      return;
    }
    if (action.action === "rematch") {
      requireHost(room, credentials);
      if (room.phase !== "match-results") throw new RoomError("The rematch is not ready yet.", 409);
      room.phase = "lobby";
      room.matchId = makeId(8);
      room.roundNumber = 0;
      room.phraseId = undefined;
      room.usedPhraseIds = [];
      room.startsAt = undefined;
      room.endsAt = undefined;
      room.players.forEach((entry) => {
        entry.score = 0;
        resetRoundPlayer(entry);
        entry.ready = entry.id === room.hostPlayerId;
      });
      return;
    }
    if (action.action === "leave") {
      if (room.phase === "lobby") {
        room.players = room.players.filter((entry) => entry.id !== player.id);
        if (room.hostPlayerId === player.id && room.players[0]) {
          room.hostPlayerId = room.players[0].id;
          room.players[0].ready = true;
        }
      } else {
        player.lastSeen = 0;
      }
    }
  });
  return { room: result.room, viewerId: credentials.playerId };
}

function send(res: ApiResponse, status: number, body: OnlineResponse): void {
  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(status).json(body);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    if (req.method === "GET") {
      const credentials: OnlineCredentials = {
        code: cleanCode(req.query.code),
        playerId: String(req.headers["x-room-player"] ?? ""),
        token: String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "")
      };
      const redis = getRedis();
      let room = await redis.get<StoredRoom>(roomKey(credentials.code));
      if (!room) throw new RoomError("That room could not be found. Check the code and try again.", 404, "ROOM_NOT_FOUND");
      requirePlayer(room, credentials);
      if (room.phase === "playing" && room.endsAt && Date.now() >= room.endsAt) {
        room = (await mutateRoom(credentials.code, (current) => requirePlayer(current, credentials))).room;
      }
      send(res, 200, { ok: true, room: roomView(room, credentials.playerId) });
      return;
    }

    if (req.method === "POST") {
      const size = Number(req.headers["content-length"] ?? 0);
      if (size > 8_192) throw new RoomError("That request is too large.", 413);
      const action = req.body as OnlineAction;
      if (!action || typeof action !== "object" || typeof action.action !== "string") throw new RoomError("Invalid room request.");
      const result = await handleAction(action, req);
      send(res, 200, {
        ok: true,
        room: roomView(result.room, result.viewerId),
        credentials: result.credentials
      });
      return;
    }

    res.setHeader("allow", "GET, POST");
    send(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    if (error instanceof RoomError) {
      send(res, error.status, { ok: false, error: error.message, code: error.code });
      return;
    }
    console.error("Online room error", error);
    send(res, 500, { ok: false, error: "The room hit an unexpected problem. Try again." });
  }
}
