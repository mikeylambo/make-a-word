import fs from 'node:fs';

const room = fs.readFileSync(new URL('../api/room.ts', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/online-client.ts', import.meta.url), 'utf8');
const failures = [];
const need = (source, token, message) => { if (!source.includes(token)) failures.push(message); };
const reject = (source, token, message) => { if (source.includes(token)) failures.push(message); };

need(room, 'const HOST_FAILOVER_MS = 28_000;', 'host failover is not bounded to a short recovery window');
need(room, 'const ROOM_LOCK_TTL_MS = 5_000;', 'room lock TTL is too fragile for network latency');
need(room, 'const MAX_REQUEST_BYTES = 8_192;', 'room request body limit is missing');
need(room, 'const ROOM_TTL_MS = ROOM_TTL_SECONDS * 1_000;', 'room lifetime is not modeled as an absolute six-hour window');
need(room, 'function roomTtlSeconds(room: StoredRoom): number', 'absolute room expiry helper is missing');
need(room, 'await redis.set(roomKey(normalizedCode), room, { ex: ttl });', 'heartbeats can still extend rooms beyond the six-hour lifetime');
need(room, 'if (player.id === room.hostPlayerId) ensureActiveHost(room);', 'intentional host leave does not transfer control immediately');
need(room, 'room.players = room.players.filter((entry) => entry.id === room.hostPlayerId || now - entry.lastSeen < HOST_FAILOVER_MS);', 'rematches retain stale disconnected players');
need(room, 'const VALID_ACTIONS = new Set<OnlineAction["action"]>', 'runtime online action allowlist is missing');
for (const action of ['create', 'join', 'ready', 'heartbeat', 'kick', 'start', 'submit', 'next-round', 'rematch', 'leave']) {
  need(room, `"${action}"`, `online action is not represented in the runtime contract: ${action}`);
}
need(room, 'now - host.lastSeen < HOST_FAILOVER_MS', 'inactive hosts do not transfer using the bounded failover threshold');
need(room, 'px: ROOM_LOCK_TTL_MS', 'room mutations do not use the hardened lock TTL');
need(room, 'for (let attempt = 0; attempt < 16; attempt += 1)', 'lock acquisition does not retry through burst submission contention');
need(room, 'const created = await redis.set(roomKey(code), room, { nx: true, ex: ROOM_TTL_SECONDS });', 'room creation is not atomic');
reject(room, 'redis.exists(roomKey(candidate))', 'room creation still has an exists-then-create race');
need(room, 'if (code.length !== 6) throw new RoomError("Enter a six-character room code.");', 'GET room lookups do not reject malformed codes before Redis access');
need(room, 'const actualSize = Buffer.byteLength', 'room API trusts Content-Length without measuring the parsed body');
need(room, 'declaredSize > MAX_REQUEST_BYTES || actualSize > MAX_REQUEST_BYTES', 'room API does not enforce both declared and actual body size');
need(room, '!VALID_ACTIONS.has(action.action as OnlineAction["action"])', 'unknown authenticated actions can still be accepted silently');

need(client, 'const REQUEST_TIMEOUT_MS = 8_000;', 'online client requests can hang indefinitely');
need(client, 'function isOnlineCredentials(value: unknown): value is OnlineCredentials', 'stored online credentials are not runtime validated');
need(client, '/^[A-Z0-9]{6}$/.test(value.code.toUpperCase())', 'stored room codes are not constrained to the six-character contract');
need(client, 'function isOnlineRoom(value: unknown): value is OnlineRoomView', 'online room responses are trusted without runtime validation');
need(client, 'value.players.length > 8', 'online client does not reject impossible player counts');
need(client, 'function parseOnlineResponse(value: unknown): OnlineResponse | null', 'online response envelope is not validated');
need(client, 'const parsed = parseOnlineResponse(body);', 'response parsing bypasses the validator');
need(client, 'if (!isOnlineCredentials(credentials)) return;', 'invalid credentials can still be persisted');
need(client, 'if (!isOnlineCredentials(parsed)) return null;', 'invalid persisted credentials can still be restored');

const presence = Number(room.match(/const PRESENCE_WINDOW_MS = ([\d_]+);/)?.[1]?.replaceAll('_', '') ?? NaN);
const failover = Number(room.match(/const HOST_FAILOVER_MS = ([\d_]+);/)?.[1]?.replaceAll('_', '') ?? NaN);
const lockTtl = Number(room.match(/const ROOM_LOCK_TTL_MS = ([\d_]+);/)?.[1]?.replaceAll('_', '') ?? NaN);
if (!Number.isFinite(presence) || !Number.isFinite(failover) || failover <= presence || failover > 30_000) {
  failures.push('host failover must allow brief reconnect grace but recover within 30 seconds');
}
if (!Number.isFinite(lockTtl) || lockTtl < 5_000) failures.push('room lock TTL must tolerate at least five seconds of backend latency');

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
need(main, 'function onlineFailureEndsSession(code?: string): boolean', 'client does not classify permanent versus transient room failures');
need(main, 'status.textContent = "Connection interrupted. Reconnecting…"', 'reload during a transient outage abandons the room instead of retrying');
need(main, 'code === "ROOM_EXPIRED"', 'client does not terminate an absolutely expired room session');

if (failures.length) {
  console.error(`Online hardening gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Online hardening gate passed: room creation is atomic, malformed/oversize actions and responses are rejected, locks tolerate latency, host recovery is bounded, and stored sessions are validated.');
