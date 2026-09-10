import fs from 'node:fs';

const room = fs.readFileSync(new URL('../api/room.ts', import.meta.url), 'utf8');
const failures = [];
const need = (token, message) => { if (!room.includes(token)) failures.push(message); };
const reject = (token, message) => { if (room.includes(token)) failures.push(message); };

need('const HOST_FAILOVER_MS = 28_000;', 'host failover is not bounded to a short recovery window');
need('const ROOM_LOCK_TTL_MS = 5_000;', 'room lock TTL is too fragile for network latency');
need('const MAX_REQUEST_BYTES = 8_192;', 'room request body limit is missing');
need('const VALID_ACTIONS = new Set<OnlineAction["action"]>', 'runtime online action allowlist is missing');
for (const action of ['create', 'join', 'ready', 'heartbeat', 'kick', 'start', 'submit', 'next-round', 'rematch', 'leave']) {
  need(`"${action}"`, `online action is not represented in the runtime contract: ${action}`);
}
need('now - host.lastSeen < HOST_FAILOVER_MS', 'inactive hosts do not transfer using the bounded failover threshold');
need('px: ROOM_LOCK_TTL_MS', 'room mutations do not use the hardened lock TTL');
need('for (let attempt = 0; attempt < 10; attempt += 1)', 'lock acquisition does not retry through short contention');
need('const created = await redis.set(roomKey(code), room, { nx: true, ex: ROOM_TTL_SECONDS });', 'room creation is not atomic');
reject('redis.exists(roomKey(candidate))', 'room creation still has an exists-then-create race');
need('if (code.length !== 6) throw new RoomError("Enter a six-character room code.");', 'GET room lookups do not reject malformed codes before Redis access');
need('const actualSize = Buffer.byteLength', 'room API trusts Content-Length without measuring the parsed body');
need('declaredSize > MAX_REQUEST_BYTES || actualSize > MAX_REQUEST_BYTES', 'room API does not enforce both declared and actual body size');
need('!VALID_ACTIONS.has(action.action as OnlineAction["action"])', 'unknown authenticated actions can still be accepted silently');

const presence = Number(room.match(/const PRESENCE_WINDOW_MS = ([\d_]+);/)?.[1]?.replaceAll('_', '') ?? NaN);
const failover = Number(room.match(/const HOST_FAILOVER_MS = ([\d_]+);/)?.[1]?.replaceAll('_', '') ?? NaN);
const lockTtl = Number(room.match(/const ROOM_LOCK_TTL_MS = ([\d_]+);/)?.[1]?.replaceAll('_', '') ?? NaN);
if (!Number.isFinite(presence) || !Number.isFinite(failover) || failover <= presence || failover > 30_000) {
  failures.push('host failover must allow brief reconnect grace but recover within 30 seconds');
}
if (!Number.isFinite(lockTtl) || lockTtl < 5_000) failures.push('room lock TTL must tolerate at least five seconds of backend latency');

if (failures.length) {
  console.error(`Online hardening gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Online hardening gate passed: room creation is atomic, malformed/oversize actions are rejected, locks tolerate latency, and host recovery is bounded.');
