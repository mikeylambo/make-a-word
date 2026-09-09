import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../src/shell.ts', import.meta.url), 'utf8');

const requiredModes = ['studio-mode--classic', 'studio-mode--daily', 'studio-mode--burn', 'studio-mode--trials', 'studio-mode--together'];
const failures = [];
if (!main.includes('class="studio-menu ')) failures.push('the championship menu root is missing');
if (!main.includes('/assets/menu/studio-championship.webp')) failures.push('the approved desktop master plate is missing');
if (!main.includes('studio-hotspot--classic') || !main.includes('studio-hotspot--together')) failures.push('desktop master-plate hit regions are missing');
if (!main.includes('preserveAspectRatio="none"><polygon') || !css.includes('.studio-hotspot svg polygon')) failures.push('panel-shaped SVG focus frames are missing');
if (!main.includes('menuLogo()')) failures.push('the physical letter-tile logo is missing');
for (const mode of requiredModes) if (!main.includes(mode) || !css.includes(`.${mode}`)) failures.push(`${mode} is not fully implemented`);
if (!css.includes('@media (max-width: 560px)') || !css.includes('grid-template-rows:230px 155px 155px 100px 100px')) failures.push('the phone menu reflow is missing');
if (!css.includes('.studio-menu__lights') || !css.includes('.studio-menu::after')) failures.push('the studio lighting or stage floor is missing');
if (!css.includes('aspect-ratio:1672/941') || !css.includes('.studio-hotspot--classic { left:7.6%; top:22.1%')) failures.push('the desktop plate is not locked to the approved coordinate system');
if (!main.includes('data-action="stats"') || !main.includes('data-action="help"') || !main.includes('data-action="settings"')) failures.push('menu utilities are not wired');
if (!main.includes('class="studio-subscreen"') || !css.includes('.studio-console__header')) failures.push('settings is not integrated into the studio set');
if (!shell.includes('id !== "game" && id !== "multiplayer-game" && id !== "online-room"')) failures.push('gameplay must own text-input focus without menu autofocus racing it');
if (!main.includes('eventTarget.closest("input, textarea, select, option")')) failures.push('delegated menu actions must ignore form-control taps');
if (!main.includes('event.stopImmediatePropagation();\n    submitCurrentWord();')) failures.push('gameplay Enter must be captured before stale focused controls can activate');
if (!css.includes('display:none!important') || !css.includes('.studio-menu::after { display:none!important; }')) failures.push('the desktop master plate is not isolated from the mobile fallback');

if (failures.length) {
  console.error(`Studio menu gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Studio menu gate passed: tile logo, staged lighting, five functional mode boards, utilities, and phone reflow.');
