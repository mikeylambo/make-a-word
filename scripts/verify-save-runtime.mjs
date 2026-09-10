import assert from 'node:assert/strict';

const data = new Map();
globalThis.localStorage = {
  getItem(key) { return data.has(key) ? data.get(key) : null; },
  setItem(key, value) { data.set(key, String(value)); },
  removeItem(key) { data.delete(key); },
  clear() { data.clear(); },
  key(index) { return [...data.keys()][index] ?? null; },
  get length() { return data.size; }
};

const { SaveStore } = await import('../src/shell.ts');

const a = new SaveStore('test.concurrent');
const b = new SaveStore('test.concurrent');
const aSave = a.load();
const bSave = b.load();
aSave.totalWords = 7;
aSave.totalScore = 4200;
aSave.completedOnlineMatchIds.push('match-a');
a.save(aSave);

bSave.onlineMatches = 1;
bSave.completedOnlineMatchIds.push('match-b');
b.save(bSave);
assert.equal(bSave.totalWords, 7, 'stale writer must not erase totalWords');
assert.equal(bSave.totalScore, 4200, 'stale writer must not erase totalScore');
assert.deepEqual(new Set(bSave.completedOnlineMatchIds), new Set(['match-a', 'match-b']), 'completion IDs must union');

const reloaded = new SaveStore('test.concurrent').load();
assert.equal(reloaded.totalWords, 7);
assert.equal(reloaded.totalScore, 4200);
assert.deepEqual(new Set(reloaded.completedOnlineMatchIds), new Set(['match-a', 'match-b']));

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

console.log('Save runtime passed: stale writers reconcile, malformed data is sanitized, and blocked storage keeps the session alive.');
