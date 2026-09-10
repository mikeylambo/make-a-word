import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const room = fs.readFileSync(new URL('../api/room.ts', import.meta.url), 'utf8');
const online = fs.readFileSync(new URL('../src/online-client.ts', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../src/runtime-guard.ts', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const failures = [];
const need = (source, token, message) => { if (!source.includes(token)) failures.push(message); };

// Solo round lifecycle.
need(main, 'function submitCurrentWord(): void', 'solo submit path is missing');
need(main, 'validateWord(input.value, available, round.submitted, phraseWords)', 'solo validation is not wired through the shared word engine');
need(main, 'round.chainBank += points', 'bank-or-risk chain accumulation is missing');
need(main, 'function cashChain(announce = true): number', 'chain banking is missing');
need(main, 'if (round.timeLeft <= 0) endRound()', 'solo timer no longer resolves the round');
need(main, 'save.totalWords += round.found.length', 'solo completion no longer records found words');
need(main, 'save.roundsPlayed += 1', 'solo completion no longer records rounds');

// Burn must support both explicit and automatic board progression.
need(main, 'data-action="next-board"', 'Burn DEAL NEXT control is missing');
need(main, 'void advanceBurnBoard(true)', 'manual Burn board advance is not routed');
need(main, 'void advanceBurnBoard(false)', 'automatic exhausted-board advance is missing');
need(main, 'boardClear ? 1000 : 0', 'Burn Board Clear bonus is missing');

// Local multiplayer lifecycle and all three rulesets.
need(main, 'type TogetherMode = "relay" | "pass-play" | "last-word"', 'local multiplayer mode contract changed');
need(main, 'function startMultiplayer(mode: TogetherMode): void', 'local match start path is missing');
need(main, 'function showTogetherHandoff(firstTurn = false): void', 'local handoff privacy screen is missing');
need(main, 'function completeTogetherRound(): void', 'local round completion is missing');
need(main, 'function nextTogetherRound(): void', 'local next-round lifecycle is missing');
need(main, 'function endTogetherMatch(): void', 'local final-match persistence is missing');
need(main, 'data-action="again-together"', 'local rematch route is missing');
need(main, 'state.sharedSubmitted.add(result.word)', 'shared-word duplicate protection is missing');
need(main, 'player.lives = Math.max(0, player.lives - 1)', 'Last Word strike/elimination logic is missing');

// Online room lifecycle must remain server-authoritative and reconnectable.
for (const action of ['create', 'join', 'ready', 'heartbeat', 'kick', 'start', 'submit', 'next-round', 'rematch', 'leave']) {
  need(room, `action.action === "${action}"`, `server online action is missing: ${action}`);
}
need(room, 'requirePlayer(room, credentials)', 'online mutations are not authenticated');
need(room, 'requireHost(room, credentials)', 'host-only online controls are not enforced');
need(room, 'acquireLock(normalizedCode)', 'online room mutations are not serialized');
need(room, 'ROOM_TTL_SECONDS = 6 * 60 * 60', 'online room expiry contract changed');
need(room, 'player.submitted.includes(word)', 'online duplicate rejection is missing');
need(room, '!canSpell(word, countsForText(phrase.text))', 'online phrase-letter validation is missing');
need(room, '!WORDS.has(word)', 'online dictionary validation is missing');
need(main, 'void resumeOnlineRoom(initialRoomCode)', 'room-link reconnect path is missing');
need(online, 'CREDENTIALS_KEY', 'online reconnect persistence key is missing');
need(online, 'try {\n    sessionStorage.setItem', 'online persistence is not safe in restricted storage contexts');

// Challenge links must preserve a deterministic phrase/rules target.
need(main, 'phraseId: result.phrase.id', 'challenge links no longer preserve the phrase');
need(main, 'target: result.score', 'challenge links no longer preserve the target score');
need(main, 'duration: result.duration === 60 || result.duration === 180 ? result.duration : 120', 'challenge links no longer preserve supported Classic durations');

// Leaving the tab during local/solo play must not burn live timers in the background.
need(index, '/src/runtime-guard.ts', 'runtime safety guard is not loaded');
need(guard, 'document.addEventListener("visibilitychange", armBackgroundPause)', 'background pause is not listening on Document visibility');
need(guard, '[data-action="pause-together"]', 'background pause does not cover local multiplayer');

// Returning from Settings during a solo round must restore the paused round, not silently resume it.
need(main, 'settingsReturnScreen === "game" && round) { renderGame(); togglePause(true); }', 'settings return no longer restores a paused solo round');

if (failures.length) {
  console.error(`Game-flow gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Game-flow gate passed: solo, Burn, local multiplayer, online room lifecycle, challenges, reconnect storage, and background-pause invariants are intact.');
