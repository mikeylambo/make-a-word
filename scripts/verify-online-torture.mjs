import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canSpell, countsForText } from '../src/word-rules.ts';

const runtimePath = new URL('../api/room.test-runtime.ts', import.meta.url);
const sourcePath = new URL('../api/room.ts', import.meta.url);
const roomSource = fs.readFileSync(sourcePath, 'utf8').replace('../src/word-rules.js', '../src/word-rules.ts');
fs.writeFileSync(runtimePath, roomSource);
const { default: handler, __setRedisClientForTests } = await import(`${runtimePath.href}?run=${Date.now()}`);

const dictionary = JSON.parse(fs.readFileSync(new URL('../content/server-dictionary.json', import.meta.url), 'utf8'));
const originalNow = Date.now;
let now = 1_800_000_000_000;
Date.now = () => now;
const clone = (value) => value === undefined ? undefined : structuredClone(value);

class FakeRedis {
  constructor() { this.data = new Map(); }
  clean(key) { const e = this.data.get(key); if (e?.expiresAt !== undefined && e.expiresAt <= Date.now()) this.data.delete(key); }
  async get(key) { this.clean(key); return clone(this.data.get(key)?.value ?? null); }
  async set(key, value, options = {}) { this.clean(key); if (options.nx && this.data.has(key)) return null; let expiresAt; if (options.ex !== undefined) expiresAt = Date.now() + Number(options.ex) * 1000; if (options.px !== undefined) expiresAt = Date.now() + Number(options.px); this.data.set(key, { value: clone(value), expiresAt }); return 'OK'; }
  async del(key) { return this.data.delete(key) ? 1 : 0; }
  async incr(key) { this.clean(key); const value = Number(this.data.get(key)?.value ?? 0) + 1; const expiresAt = this.data.get(key)?.expiresAt; this.data.set(key, { value, expiresAt }); return value; }
  async expire(key, seconds) { this.clean(key); const e = this.data.get(key); if (!e) return 0; e.expiresAt = Date.now() + Number(seconds) * 1000; return 1; }
  async eval(_script, keys, args) { const key = keys[0]; this.clean(key); const e = this.data.get(key); if (e?.value === args[0]) { this.data.delete(key); return 1; } return 0; }
  peek(key) { this.clean(key); return clone(this.data.get(key)?.value); }
  expiresAt(key) { this.clean(key); return this.data.get(key)?.expiresAt; }
}

const redis = new FakeRedis();
__setRedisClientForTests(redis);
async function call(method, { body, query = {}, headers = {} } = {}) {
  let statusCode = 200; let payload;
  const req = { method, query, body, headers: { 'x-forwarded-for': '203.0.113.9', ...headers } };
  const res = { setHeader() {}, status(code) { statusCode = code; return this; }, json(value) { payload = value; } };
  await handler(req, res);
  return { status: statusCode, body: payload };
}
const post = (body) => call('POST', { body });
const get = (credentials) => call('GET', { query: { code: credentials.code }, headers: { authorization: `Bearer ${credentials.token}`, 'x-room-player': credentials.playerId } });

try {
  const created = await post({ action: 'create', name: 'Host', settings: { rounds: 1, roundSeconds: 60, maxPlayers: 8 } });
  assert.equal(created.body.ok, true);
  const host = created.body.credentials;
  const credentials = [host];
  for (let i = 1; i < 8; i += 1) {
    const joined = await post({ action: 'join', code: host.code, name: `Guest ${i}` });
    assert.equal(joined.body.ok, true);
    credentials.push(joined.body.credentials);
  }
  for (const guest of credentials.slice(1)) assert.equal((await post({ action: 'ready', credentials: guest, ready: true })).body.ok, true);
  const started = await post({ action: 'start', credentials: host });
  assert.equal(started.body.room.phase, 'playing');
  const matchId = started.body.room.matchId;
  now = started.body.room.startsAt + 1000;
  const available = countsForText(started.body.room.phrase.text);
  const playable = dictionary.filter((word) => word.length >= 3 && canSpell(word, available));
  assert.ok(playable.length >= 12);

  const simultaneous = await Promise.all(credentials.map((identity, i) => post({ action: 'submit', credentials: identity, word: playable[i] })));
  assert.equal(simultaneous.filter((r) => r.body.ok).length, 8, 'eight-player burst should serialize');
  const duplicateWord = playable[8];
  const dupe = await Promise.all([post({ action: 'submit', credentials: host, word: duplicateWord }), post({ action: 'submit', credentials: host, word: duplicateWord })]);
  assert.equal(dupe.filter((r) => r.body.ok).length, 1, 'duplicate race must score once');
  assert.equal(dupe.filter((r) => !r.body.ok && r.body.code === 'DUPLICATE').length, 1);

  const hostLeave = await post({ action: 'leave', credentials: host });
  const promoted = hostLeave.body.room.players.find((p) => p.isHost);
  assert.ok(promoted && promoted.id !== host.playerId, 'intentional host leave must transfer immediately');
  const promotedCredentials = credentials.find((c) => c.playerId === promoted.id);
  now = hostLeave.body.room.endsAt - 1000;
  assert.equal((await post({ action: 'heartbeat', credentials: promotedCredentials })).body.ok, true);
  now = hostLeave.body.room.endsAt + 1;
  const resultsReload = await get(promotedCredentials);
  assert.equal(resultsReload.body.room.phase, 'match-results');
  assert.equal(resultsReload.body.room.matchId, matchId);
  const rematch = await post({ action: 'rematch', credentials: promotedCredentials });
  assert.equal(rematch.body.room.phase, 'lobby');
  assert.notEqual(rematch.body.room.matchId, matchId);
  assert.ok(!rematch.body.room.players.some((p) => p.id === host.playerId), 'departed host must not ghost the rematch lobby');

  const key = `make-a-word:room:${host.code}`;
  const stored = redis.peek(key);
  now = stored.createdAt + 5 * 60 * 60 * 1000;
  assert.equal((await post({ action: 'heartbeat', credentials: promotedCredentials })).body.ok, true);
  assert.equal(redis.expiresAt(key), stored.createdAt + 6 * 60 * 60 * 1000, 'heartbeat must not extend six-hour absolute expiry');
  now = stored.createdAt + 6 * 60 * 60 * 1000 + 1;
  assert.equal((await get(promotedCredentials)).body.ok, false, 'expired room must not reconnect');

  now = 1_900_000_000_000;
  const created2 = await post({ action: 'create', name: 'Host 2', settings: { rounds: 1, roundSeconds: 60, maxPlayers: 4 } });
  const host2 = created2.body.credentials;
  const joined2 = await post({ action: 'join', code: host2.code, name: 'Guest 2' });
  const guest2 = joined2.body.credentials;
  await post({ action: 'ready', credentials: guest2, ready: true });
  const started2 = await post({ action: 'start', credentials: host2 });
  const baseline = started2.body.room.serverNow;
  now = baseline + 15_000;
  await post({ action: 'heartbeat', credentials: guest2 });
  now = baseline + 29_000;
  const migrated = await post({ action: 'heartbeat', credentials: guest2 });
  assert.equal(migrated.body.room.players.find((p) => p.id === guest2.playerId)?.isHost, true, 'stale host should migrate within bounded grace');
  assert.equal((await get(guest2)).body.ok, true, 'promoted host should reload successfully');

  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('Connection interrupted. Reconnecting…'));
  assert.ok(main.includes('ROOM_EXPIRED'));
  console.log('Online torture passed: burst submits, duplicate races, host failover, reload/results/rematch, ghost pruning, and absolute expiry are stable.');
} finally {
  Date.now = originalNow;
  __setRedisClientForTests(null);
  fs.rmSync(runtimePath, { force: true });
}
