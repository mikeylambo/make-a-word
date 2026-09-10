import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const data = new Map();
globalThis.localStorage = {
  getItem(key) { return data.has(key) ? data.get(key) : null; },
  setItem(key, value) { data.set(key, String(value)); },
  removeItem(key) { data.delete(key); },
  clear() { data.clear(); },
  key(index) { return [...data.keys()][index] ?? null; },
  get length() { return data.size; }
};

// Node's built-in TypeScript stripping intentionally does not transform
// parameter properties. Compile the production module with the same TypeScript
// dependency used by the app, then exercise the emitted JavaScript directly.
const shellSource = fs.readFileSync(new URL('../src/shell.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(shellSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022
  }
}).outputText;
const shellUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { SaveStore } = await import(shellUrl);

// Two stale copies can both add legitimate progress. Their deltas must add;
// taking only the larger absolute counter silently loses one completed run.
const a = new SaveStore('test.concurrent');
const b = new SaveStore('test.concurrent');
const aSave = a.load();
const bSave = b.load();
aSave.totalWords += 7;
aSave.totalScore += 4200;
aSave.roundsPlayed += 1;
a.save(aSave);

bSave.totalWords += 5;
bSave.totalScore += 1800;
bSave.roundsPlayed += 1;
b.save(bSave);
assert.equal(bSave.totalWords, 12, 'stale word-count increments must add');
assert.equal(bSave.totalScore, 6000, 'stale score increments must add');
assert.equal(bSave.roundsPlayed, 2, 'stale round increments must add');

const reloaded = new SaveStore('test.concurrent').load();
assert.equal(reloaded.totalWords, 12);
assert.equal(reloaded.totalScore, 6000);
assert.equal(reloaded.roundsPlayed, 2);

// Completion IDs are the idempotency authority for online/challenge counts.
// Two stale writers reporting the same match must not double count it, while a
// genuinely different match must still advance the total.
const onlineA = new SaveStore('test.online');
const onlineB = new SaveStore('test.online');
const onlineASave = onlineA.load();
const onlineBSave = onlineB.load();
onlineASave.onlineMatches += 1;
onlineASave.completedOnlineMatchIds.push('match-a');
onlineA.save(onlineASave);
onlineBSave.onlineMatches += 1;
onlineBSave.completedOnlineMatchIds.push('match-a');
onlineB.save(onlineBSave);
assert.equal(onlineBSave.onlineMatches, 1, 'the same completed online match must be idempotent');
assert.deepEqual(onlineBSave.completedOnlineMatchIds, ['match-a']);
const onlineC = new SaveStore('test.online');
const onlineCSave = onlineC.load();
onlineCSave.onlineMatches += 1;
onlineCSave.completedOnlineMatchIds.push('match-b');
onlineC.save(onlineCSave);
assert.equal(onlineCSave.onlineMatches, 2, 'a distinct completed online match must count');
assert.deepEqual(new Set(onlineCSave.completedOnlineMatchIds), new Set(['match-a', 'match-b']));

// A stale progress writer must not roll a newer setting back simply because its
// old snapshot still contains the previous preference value.
const settingsA = new SaveStore('test.settings');
const settingsB = new SaveStore('test.settings');
const settingsASave = settingsA.load();
const settingsBSave = settingsB.load();
settingsASave.settings.sound = false;
settingsA.save(settingsASave);
settingsBSave.totalWords += 1;
settingsB.save(settingsBSave);
assert.equal(settingsBSave.settings.sound, false, 'stale progress writes must preserve newer settings');
assert.equal(settingsBSave.totalWords, 1);

data.set('test.corrupt', JSON.stringify({
  totalWords: -99,
  totalScore: Number.NaN,
  journeyMedals: { trial: 99 },
  settings: { volume: 5, classicDuration: 999, theme: 'broken', sound: 'yes' }
}));
const recovered = new SaveStore('test.corrupt').load();
assert.equal(recovered.totalWords, 0, 'negative counters must recover to zero');
assert.equal(recovered.totalScore, 0, 'invalid counters must recover to zero');
assert.equal(recovered.journeyMedals.trial, 3, 'medals must clamp to three');
assert.equal(recovered.settings.volume, 1, 'volume must clamp to one');
assert.equal(recovered.settings.classicDuration, 120, 'invalid duration must recover to default');
assert.equal(recovered.settings.theme, 'studio', 'invalid theme must recover to default');
assert.equal(recovered.settings.sound, true, 'invalid booleans must recover to default');

const workingStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem() { throw new Error('storage blocked'); },
  setItem() { throw new Error('storage blocked'); },
  removeItem() { throw new Error('storage blocked'); },
  clear() { throw new Error('storage blocked'); },
  key() { return null; },
  get length() { return 0; }
};
const privateStore = new SaveStore('test.private');
const privateSave = privateStore.load();
privateSave.totalWords = 3;
assert.doesNotThrow(() => privateStore.save(privateSave), 'blocked storage must not terminate gameplay');
assert.equal(new SaveStore('test.private').load().totalWords, 3, 'memory fallback must preserve the active session');
globalThis.localStorage = workingStorage;

console.log('Save runtime passed: stale increments add without duplication, settings survive stale writers, malformed data is sanitized, and blocked storage keeps the session alive.');
