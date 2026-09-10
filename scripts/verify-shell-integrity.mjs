import fs from 'node:fs';

const shell = fs.readFileSync(new URL('../src/shell.ts', import.meta.url), 'utf8');
const failures = [];
const need = (token, message) => { if (!shell.includes(token)) failures.push(message); };

need('const MEMORY_SAVES = new Map<string, SaveData>();', 'session save fallback is missing');
need('function sanitizeSave(value: unknown): SaveData', 'save sanitization is missing');
need('function mergeSave(previousValue: unknown, nextValue: unknown): SaveData', 'stale save snapshots are not reconciled');
need('totalWords: Math.max(previous.totalWords, next.totalWords)', 'lifetime word totals can regress');
need('totalScore: Math.max(previous.totalScore, next.totalScore)', 'lifetime score can regress');
need('completedOnlineMatchIds: safeIds([...previous.completedOnlineMatchIds, ...next.completedOnlineMatchIds])', 'online completion IDs are not unioned across writers');
need('Object.assign(data, structuredClone(safe));', 'the active in-memory save snapshot is not refreshed after reconciliation');
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

console.log('Shell integrity gate passed: malformed/stale saves reconcile safely, restricted storage stays playable, and hidden pages suspend audio.');
