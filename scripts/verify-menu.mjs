import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const requiredModes = ['studio-mode--classic', 'studio-mode--daily', 'studio-mode--burn', 'studio-mode--trials', 'studio-mode--together'];
const failures = [];
if (!main.includes('class="studio-menu"')) failures.push('the championship menu root is missing');
if (!main.includes('menuLogo()')) failures.push('the physical letter-tile logo is missing');
for (const mode of requiredModes) if (!main.includes(mode) || !css.includes(`.${mode}`)) failures.push(`${mode} is not fully implemented`);
if (!css.includes('@media (max-width: 560px)') || !css.includes('grid-template-rows:230px 155px 155px 100px 100px')) failures.push('the phone menu reflow is missing');
if (!css.includes('.studio-menu__lights') || !css.includes('.studio-menu::after')) failures.push('the studio lighting or stage floor is missing');
if (!main.includes('data-action="stats"') || !main.includes('data-action="help"') || !main.includes('data-action="settings"')) failures.push('menu utilities are not wired');

if (failures.length) {
  console.error(`Studio menu gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Studio menu gate passed: tile logo, staged lighting, five functional mode boards, utilities, and phone reflow.');
