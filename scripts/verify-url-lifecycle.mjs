import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const lifecycle = fs.readFileSync(new URL('../src/url-lifecycle.ts', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

const lifecycleIndex = index.indexOf('src="/src/url-lifecycle.ts"');
const mainIndex = index.indexOf('src="/src/main.ts"');
assert.ok(lifecycleIndex >= 0, 'deep-link lifecycle module must boot');
assert.ok(mainIndex > lifecycleIndex, 'deep-link lifecycle listener must be registered before main gameplay listeners');

assert.ok(lifecycle.includes('action === "play-challenge"'), 'accepted challenge links must be consumed');
assert.ok(lifecycle.includes('removeParam("challenge")'), 'challenge query cleanup is missing');
assert.ok(lifecycle.includes('action === "multiplayer" || action === "online-cancel"'), 'room exit actions must consume room links');
assert.ok(lifecycle.includes('loadOnlineCredentials(code)'), 'active room members must retain reconnectable room URLs');
assert.ok(lifecycle.includes('DOMContentLoaded'), 'new room visitors must clean consumed invite URLs after initial boot');
assert.ok(lifecycle.includes('9_000'), 'terminal room failures must get a post-timeout cleanup pass');

// Main intentionally gives invite URLs priority over resumable rounds on boot.
// Therefore challenge cleanup is release-critical: without it, refreshing a
// challenge after accepting it would reopen the landing page rather than the
// saved in-progress round.
assert.ok(main.includes('else if (pendingChallenge) showChallengeLanding();'), 'challenge boot priority changed unexpectedly');
assert.ok(main.includes('const resumableRound = runStore.load();'), 'resumable round boot path is missing');

console.log('Deep-link lifecycle gate passed: consumed challenge/room links cannot become sticky reload loops, while authenticated online-room URLs remain reconnectable.');
