import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const telemetry = fs.readFileSync(new URL('../src/telemetry.ts', import.meta.url), 'utf8');

const assertions = [
  [main.includes('function showTitle(): void {\n  showMenu();'), 'the title must open directly into the menu'],
  [main.includes('data-mode="classic"') && main.includes('data-mode="daily"') && main.includes('data-mode="burn"'), 'Classic, Daily, and Burn must be one-tap menu choices'],
  [main.includes('data-action="toggle-found"'), 'the mobile found panel must be collapsible'],
  [css.includes('.board-stage { position:sticky;'), 'the phrase board must remain pinned on mobile'],
  [css.includes('.found-panel--collapsible:not(.found-panel--expanded)'), 'the collapsed found-panel rule is missing'],
  [css.includes('grid-template-columns:36px minmax(74px,.8fr) minmax(108px,1.2fr) minmax(54px,.65fr)'), 'the compact 390px HUD constraint is missing'],
  [telemetry.includes('first_word_10s') && telemetry.includes('first_word_30s'), 'time-to-first-word telemetry buckets are missing']
];

const failures = assertions.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(`Mobile journey gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Mobile journey gate passed: direct menu, one-tap hero modes, pinned board, collapsible words, compact HUD, and first-word timing.');
