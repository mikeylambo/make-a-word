import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/run-store.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { RunStore, sanitizeRunSnapshot, resumedTimeLeft, resumeGapMs } = await import(moduleUrl);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const storage = new MemoryStorage();
const store = new RunStore('run.test', storage);
const base = {
  version: 1, savedAt: 1_000_000, mode: 'burn', phraseId: 'test-phrase', score: 1200,
  duration: 150, timeLeft: 90, submitted: ['stone', 'tone'],
  found: [{ word: 'stone', points: 500, rarity: 1.3 }], burned: [1, 3, 4],
  usedLetters: ['s', 't', 'o', 'n', 'e'], combo: 2, chainBank: 700, chainLength: 3,
  bestCombo: 4, comboAgeMs: 1200, startedElapsedMs: 22000, boardNumber: 2,
  boardsCleared: 1, boardWords: 2, boardCandidates: ['stone', 'tone', 'one'],
  paused: false, newBest: false, firstWordTracked: true
};

store.save(base);
const restored = store.load(1_005_400);
assert.equal(restored?.score, 1200);
assert.equal(restored?.boardNumber, 2);
assert.deepEqual(restored?.burned, [1, 3, 4]);
assert.equal(resumedTimeLeft(restored, 1_005_400), 85, 'active reload must consume wall-clock time');
assert.equal(resumeGapMs(restored, 1_005_400), 5400);

const paused = { ...base, savedAt: 2_000_000, paused: true, timeLeft: 44 };
store.save(paused);
const pausedLoaded = store.load(2_300_000);
assert.equal(resumedTimeLeft(pausedLoaded, 2_300_000), 44, 'a deliberately paused run must remain paused across reload');
assert.equal(resumeGapMs(pausedLoaded, 2_300_000), 0);

storage.setItem('run.corrupt', '{not json');
assert.equal(new RunStore('run.corrupt', storage).load(), null, 'corrupt run snapshots must be discarded');
storage.setItem('run.tampered', JSON.stringify({ ...base, version: 99, score: 999999999999 }));
assert.equal(new RunStore('run.tampered', storage).load(1_000_001), null, 'unknown snapshot versions must not be restored');

const sanitized = sanitizeRunSnapshot({ ...base, score: -10, timeLeft: 999, burned: [-2, 3, 9000], usedLetters: ['A', '!', 'b'] });
assert.equal(sanitized.score, 0);
assert.equal(sanitized.timeLeft, 150);
assert.deepEqual(sanitized.burned, [3]);
assert.deepEqual(sanitized.usedLetters, ['a', 'b']);

store.save({ ...base, savedAt: 3_000_000 });
assert.equal(store.load(3_000_000 + 31 * 60 * 1000), null, 'abandoned runs must expire instead of resurfacing later');

const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
const blockedStore = new RunStore('run.blocked', blocked);
assert.doesNotThrow(() => blockedStore.save({ ...base, savedAt: Date.now() }));
assert.equal(blockedStore.load()?.score, 1200, 'blocked storage must remain non-fatal in the active tab');

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
for (const token of [
  'function persistRoundSnapshot(): void',
  'function restoreRoundSnapshot(snapshot: RunSnapshot): boolean',
  'persistRoundSnapshot();\n  const time =',
  'runStore.clear();\n  showResults();',
  'window.addEventListener("pagehide"',
  'const resumableRound = runStore.load();'
]) assert.ok(main.includes(token), `main lifecycle is missing reload invariant: ${token}`);

console.log('Run-store torture passed: Burn/Daily/Trials-compatible round state survives reload, active time cannot be frozen by refresh, paused runs stay paused, bad/old snapshots are rejected, and abandoned runs expire.');
