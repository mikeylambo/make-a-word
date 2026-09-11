import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mobile = fs.readFileSync(new URL('../src/mobile.ts', import.meta.url), 'utf8');
const mobileCss = fs.readFileSync(new URL('../src/mobile.css', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../src/runtime-guard.ts', import.meta.url), 'utf8');

assert.ok(index.includes('viewport-fit=cover'), 'safe-area viewport coverage is required');
assert.ok(!index.includes('maximum-scale=1'), 'viewport zoom must remain available for accessibility');

assert.ok(mobile.includes('window.visualViewport?.addEventListener(\'resize\''), 'visual viewport resize tracking is missing');
assert.ok(mobile.includes('window.addEventListener(\'orientationchange\', settleViewport)'), 'orientation recovery is missing');
assert.ok(mobile.includes('window.addEventListener(\'pageshow\', settleViewport)'), 'BFCache/app-switch viewport recovery is missing');
assert.ok(mobile.includes("document.addEventListener('visibilitychange'"), 'foreground viewport recovery is missing');
assert.ok(mobile.includes("coarsePointer.addEventListener?.('change', schedule)"), 'pointer-mode changes must refresh touch layout');
assert.ok(mobile.includes("input.setAttribute('enterkeyhint', 'send')"), 'mobile submit keyboard hint is missing');
assert.ok(mobile.includes("input.setAttribute('autocorrect', 'off')"), 'autocorrect must stay disabled for word entry');
assert.ok(mobile.includes("input.setAttribute('autocapitalize', 'characters')"), 'word entry should request character capitalization');
assert.ok(mobile.includes('window.setTimeout(schedule, 150)'), 'viewport settling pass is missing');
assert.ok(mobile.includes('window.setTimeout(schedule, 500)'), 'late viewport settling pass is missing');

assert.ok(mobileCss.includes('env(safe-area-inset-top)'), 'top safe-area handling is missing');
assert.ok(mobileCss.includes('env(safe-area-inset-bottom)'), 'bottom safe-area handling is missing');
assert.ok(mobileCss.includes('.keyboard-open'), 'software-keyboard layout is missing');
assert.ok(mobileCss.includes('touch-action: manipulation'), 'tap delay suppression is missing');
assert.ok(mobileCss.includes('font-size:16px'), 'mobile form controls need a 16px floor to avoid iOS focus zoom');

assert.ok(guard.includes('window.addEventListener("pagehide", () => armBackgroundPause(true))'), 'pagehide must force a local pause attempt');
assert.ok(guard.includes('document.addEventListener("visibilitychange", () => armBackgroundPause(false))'), 'visibility changes must pause local play');
assert.ok(guard.includes('screen !== "game" && screen !== "multiplayer-game"'), 'background guard must stay scoped to local play');
assert.ok(!guard.includes('online-room'), 'server-authoritative online play must not be locally paused');

console.log('Device acceptance gate passed: safe areas, zoom accessibility, keyboard behavior, orientation/BFCache recovery, touch-mode changes, and local background pausing are protected.');
