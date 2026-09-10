import fs from 'node:fs';

const stable = fs.readFileSync(new URL('../src/stable-menu.ts', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../src/shell.ts', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const failures = [];
const required = [
  'data-mode="classic"',
  'data-mode="daily"',
  'data-mode="burn"',
  'data-action="journey"',
  'data-action="multiplayer"',
  'data-action="modes"',
  'data-action="stats"',
  'data-action="help"',
  'data-action="settings"'
];

if (!stable.includes('hero-panel hero-panel--menu') || !stable.includes('class="menu-grid"')) failures.push('stable pre-studio menu structure is missing');
for (const token of required) if (!stable.includes(token)) failures.push(`stable menu routing is missing ${token}`);
if (!stable.includes('new SaveStore()') || !stable.includes('classicDuration') || !stable.includes('dailyStreak')) failures.push('stable menu is not reading current save state');
if (!stable.includes('stableSettingsMarkup') || !stable.includes('class="settings-list"') || !stable.includes('data-action="settings-back"')) failures.push('stable pre-studio settings presentation is missing');
if (!stable.includes('data-action="toggle-sound"') || !stable.includes('data-action="toggle-music"') || !stable.includes('data-action="toggle-motion"') || !stable.includes('data-action="toggle-analytics"')) failures.push('settings controls are not preserved');
if (!stable.includes('MutationObserver') || !stable.includes('root.dataset.screen === "menu"') || !stable.includes('root.dataset.screen === "settings"')) failures.push('stable presentation replacement is not scoped to menu/settings screens');
if (!css.includes('.menu-grid') || !css.includes('.menu-card--feature') || !css.includes('.hero-panel--menu')) failures.push('pre-studio menu styling is missing');
if (!css.includes('.settings-list') || !css.includes('.setting-row')) failures.push('pre-studio settings styling is missing');
if (!index.includes('/src/stable-menu.ts')) failures.push('stable presentation is not loaded by the app');
if (index.includes('three.min.js') || index.includes('/src/studio3d.ts') || index.includes('studio-reference-lock.css')) failures.push('experimental studio renderer is still on the live boot path');
if (!shell.includes('id !== "game" && id !== "multiplayer-game" && id !== "online-room"')) failures.push('gameplay must own text-input focus without menu autofocus racing it');
if (!main.includes('eventTarget.closest("input, textarea, select, option")')) failures.push('delegated actions must ignore form-control taps');
if (!main.includes('event.stopImmediatePropagation();\n    submitCurrentWord();')) failures.push('gameplay Enter must be captured before stale focused controls can activate');

if (failures.length) {
  console.error(`Stable presentation gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Stable presentation gate passed: pre-studio menu/settings restored, all routes wired, save data live, experimental WebGL boot disabled, gameplay input guards retained.');
