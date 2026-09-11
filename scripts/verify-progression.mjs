import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const phrasesSource = fs.readFileSync(new URL('../src/phrases.ts', import.meta.url), 'utf8');
const phrases = JSON.parse(fs.readFileSync(new URL('../content/phrases.json', import.meta.url), 'utf8'));
const archive = JSON.parse(fs.readFileSync(new URL('../content/daily-archive.json', import.meta.url), 'utf8'));
const schedule = JSON.parse(fs.readFileSync(new URL('../content/daily-schedule.json', import.meta.url), 'utf8'));
const failures = [];
const need = (source, token, message) => { if (!source.includes(token)) failures.push(message); };

const allPhraseIds = new Set([...archive, ...phrases].map((phrase) => phrase.id));
const versions = Array.isArray(schedule?.versions) ? schedule.versions : [];
if (!versions.length) failures.push('Daily schedule has no versions');
const seenVersionIds = new Set();
const seenStarts = new Set();
let previousStart = '';
for (const version of versions) {
  if (!version || typeof version.id !== 'string' || !version.id) failures.push('Daily schedule contains a version without an id');
  if (seenVersionIds.has(version.id)) failures.push(`Daily schedule repeats version id ${version.id}`);
  seenVersionIds.add(version.id);
  if (typeof version.startsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(version.startsOn) || Number.isNaN(Date.parse(`${version.startsOn}T00:00:00Z`))) {
    failures.push(`Daily schedule has an invalid start date: ${version?.startsOn}`);
  }
  if (seenStarts.has(version.startsOn)) failures.push(`Daily schedule repeats start date ${version.startsOn}`);
  seenStarts.add(version.startsOn);
  if (previousStart && version.startsOn <= previousStart) failures.push('Daily schedule versions must remain append-ordered by startsOn');
  previousStart = version.startsOn;
  if (!Array.isArray(version.phraseIds) || !version.phraseIds.length) failures.push(`Daily schedule version ${version.id} has no phrase ids`);
  for (const id of version.phraseIds ?? []) if (!allPhraseIds.has(id)) failures.push(`Daily schedule references missing phrase ${id}`);
}

need(phrasesSource, 'if (!Number.isFinite(date.getTime())) return Number.NaN;', 'Daily selector does not survive an invalid Date');
need(phrasesSource, '.filter((version) => Number.isFinite(version.startDay) && version.phraseIds.length > 0)', 'Daily selector does not reject malformed/empty schedule versions');
need(phrasesSource, 'if (!versions.length) return fallback;', 'Daily selector has no safe fallback for an empty schedule');
need(phrasesSource, 'PHRASES_BY_ID.get(version.phraseIds[index] ?? "") ?? fallback', 'Daily selector has no safe fallback for a missing scheduled phrase');

const trials = phrases.filter((phrase) => phrase.journeyOrder !== undefined || phrase.medals !== undefined);
const orders = trials.map((phrase) => phrase.journeyOrder).filter(Number.isInteger).sort((a, b) => a - b);
if (orders.length !== trials.length) failures.push('Every Trial must have a journeyOrder');
for (let index = 0; index < orders.length; index += 1) {
  if (orders[index] !== index + 1) failures.push(`Trial order is not contiguous at position ${index + 1}`);
}
for (const phrase of trials) {
  if (!Array.isArray(phrase.medals) || phrase.medals.length !== 3) {
    failures.push(`Trial ${phrase.id} must define exactly three medal thresholds`);
    continue;
  }
  const [bronze, silver, gold] = phrase.medals;
  if (![bronze, silver, gold].every((value) => Number.isInteger(value) && value > 0) || !(bronze < silver && silver < gold)) {
    failures.push(`Trial ${phrase.id} medal thresholds must be positive and strictly increasing`);
  }
}
need(main, 'if (earned >= 1) save.journeyUnlocked = Math.min(JOURNEY_PHRASES.length, Math.max(save.journeyUnlocked, round.journeyStage + 2));', 'Trials no longer unlock exactly one next stage after earning a medal');
need(main, 'save.journeyMedals[round.phrase.id] = Math.max', 'Trial replay can regress earned medals');
need(main, 'if (phrase && stage < save.journeyUnlocked) startRound("journey", phrase, stage);', 'locked Trial stages can bypass the progression gate');

need(main, 'const played = new Set(Object.keys(save.daily));', 'zero-score Daily completions do not count toward streaks');
need(main, 'const dailyPlayed = Object.prototype.hasOwnProperty.call(save.daily, dailyKey);', 'Daily menu cannot distinguish an unplayed day from a completed zero-score day');
need(main, 'function todayKey(date = new Date()): string', 'Daily keys cannot be derived from the exact round-start instant');
need(main, 'const dailyDate = mode === "daily" ? new Date() : undefined;', 'Daily round start does not capture a stable calendar instant');
need(main, 'const phrase = phraseOverride ?? (dailyDate ? phraseForDay(dailyDate) : choosePhrase(mode));', 'Daily phrase selection is not pinned to the captured round-start instant');
need(main, 'dailyKey: dailyDate ? todayKey(dailyDate) : undefined,', 'Daily round state does not retain its start-day key');
need(main, 'const key = round.dailyKey ?? todayKey();', 'Daily completion does not use the round-start day after a midnight rollover');
need(main, 'save.daily[key] = Math.max(save.daily[key] ?? 0, round.score);', 'Daily best score persistence is missing or can regress');

need(main, 'if (round.mode === "burn") round.burned = burnLetters', 'Burn no longer consumes submitted letters');
need(main, 'if (!hasPlayableWord(round.boardCandidates, availableAfterWord, round.submitted))', 'Burn exhausted-board detection is missing');
need(main, 'void advanceBurnBoard(false)', 'Burn exhausted boards no longer advance automatically');
need(main, 'data-action="next-board"', 'Burn manual board advance control is missing');
const burnAdvanceStart = main.indexOf('async function advanceBurnBoard(manual: boolean): Promise<void>');
const burnAdvanceEnd = main.indexOf('function updateBurnBoardDisplay', burnAdvanceStart);
const burnAdvance = burnAdvanceStart >= 0 && burnAdvanceEnd > burnAdvanceStart ? main.slice(burnAdvanceStart, burnAdvanceEnd) : '';
need(burnAdvance, 'burnBoardSettlement(total, remaining)', 'Burn board transitions do not use the canonical settlement rule');
need(burnAdvance, 'state.score = Math.max(0, state.score + bonus);', 'Burn board transitions no longer apply settlement to score');
need(burnAdvance, 'if (boardClear) state.boardsCleared += 1;', 'Burn board transitions no longer count Board Clears');

const endRoundStart = main.indexOf('function endRound(): void');
const endRoundEnd = main.indexOf('function showResults(): void', endRoundStart);
const endRound = endRoundStart >= 0 && endRoundEnd > endRoundStart ? main.slice(endRoundStart, endRoundEnd) : '';
need(endRound, 'if (round.mode === "burn") {', 'Burn runs do not settle the active board when the run ends');
need(endRound, 'burnBoardSettlement(total, remaining)', 'final Burn boards do not use the same settlement rule as board transitions');
need(endRound, 'round.score = Math.max(0, round.score + scoreDelta);', 'final Burn board settlement is not applied to the run score');
need(endRound, 'if (boardClear) round.boardsCleared += 1;', 'a final Burn Board Clear is not counted');

need(main, 'if (!together || together.ended) return;', 'local match completion is not idempotent');
need(main, 'player.lives = Math.max(0, player.lives - 1)', 'Last Word strikes can underflow or disappeared');
need(main, 'if (active.length <= 1)', 'Last Word no longer resolves when one player remains');
need(main, 'player.roundFound = []', 'local multiplayer does not reset round word state');
need(main, 'player.lives = 2', 'Last Word lives do not reset between rounds');
need(main, 'finalRound ? "finish-together" : "next-together-round"', 'final local multiplayer round cannot reach match results');
need(main, 'else if (action === "finish-together") endTogetherMatch();', 'final local multiplayer action does not finalize the match');

if (failures.length) {
  console.error(`Progression gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Progression gate passed: ${versions.length} Daily schedule version(s), ${trials.length} ordered Trials, Daily midnight rollover, Burn final-board settlement, Burn board transitions, and local multiplayer completion invariants are intact.`);
