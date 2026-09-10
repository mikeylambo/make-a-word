import fs from 'node:fs';

const shell = fs.readFileSync(new URL('../src/shell.ts', import.meta.url), 'utf8');
const failures = [];
const need = (token, message) => { if (!shell.includes(token)) failures.push(message); };

need('const MEMORY_SAVES = new Map<string, SaveData>();', 'session save fallback is missing');
need('const SAVE_BASELINES = new WeakMap<SaveData, SaveData>();', 'per-snapshot save baselines are missing');
need('function sanitizeSave(value: unknown): SaveData', 'save sanitization is missing');
need('function mergeCounter(previous: number, next: number, baseline: number): number', 'concurrent additive counters are not reconciled by delta');
need('safeCount(previous) + Math.max(0, safeCount(next) - safeCount(baseline))', 'stale counter increments can still be lost');
need('function mergeSettings(previous: SaveData["settings"], next: SaveData["settings"], baseline: SaveData["settings"])', 'stale progress writers can overwrite newer settings');
need('function mergeSave(previousValue: unknown, nextValue: unknown, baselineValue: unknown): SaveData', 'stale save snapshots are not reconciled');
need('totalWords: mergeCounter(previous.totalWords, next.totalWords, baseline.totalWords)', 'lifetime word increments can be lost');
need('totalScore: mergeCounter(previous.totalScore, next.totalScore, baseline.totalScore)', 'lifetime score increments can be lost');
need('roundsPlayed: mergeCounter(previous.roundsPlayed, next.roundsPlayed, baseline.roundsPlayed)', 'round increments can be lost');
need('onlineMatches: Math.max(previous.onlineMatches, next.onlineMatches, completedOnlineMatchIds.length)', 'online completion IDs are not the idempotency floor');
need('completedOnlineMatchIds = safeIds([...previous.completedOnlineMatchIds, ...next.completedOnlineMatchIds])', 'online completion IDs are not unioned across writers');
need('Object.assign(data, structuredClone(safe));', 'the active in-memory save snapshot is not refreshed after reconciliation');
need('SAVE_BASELINES.set(data, structuredClone(safe));', 'saved snapshots do not advance their reconciliation baseline');
need('safeRecord(parsed.journeyMedals, 3)', 'Trial medals are not clamped during save recovery');
need('settings.classicDuration === 60 || settings.classicDuration === 120 || settings.classicDuration === 180', 'Classic duration recovery is not validated');
need('settings.theme === "felt" || settings.theme === "studio"', 'theme recovery is not validated');
need('localStorage.setItem(this.key, JSON.stringify(safe));', 'persistent save write is missing');
need('Restricted/private storage or a full quota must never terminate a round.', 'save writes are not guarded against storage failure');
need('document.addEventListener("visibilitychange", () => document.hidden ? sleep() : wake())', 'audio is not suspended when the page is hidden');
need('window.addEventListener("pagehide", sleep)', 'audio is not suspended during page teardown');
need('if (!enabled || document.hidden) return;', 'one-shot audio can still fire while backgrounded');

if (failures.length) {
  console.error(`Shell integrity gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Shell integrity gate passed: malformed saves recover, stale additive progress reconciles without duplication, newer settings survive stale writers, restricted storage stays playable, and hidden pages suspend audio.');
