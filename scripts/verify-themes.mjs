import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/themes.ts', import.meta.url), 'utf8');
for (const id of ['studio', 'felt']) {
  const block = source.match(new RegExp(`${id}: \\{([\\s\\S]*?)audio: "${id}"`))?.[1] ?? '';
  const roles = [...block.matchAll(/(field|panel|letters|hero|alarm): "#[0-9A-F]{6}"/g)].map((match) => match[1]);
  if (roles.length !== 5 || new Set(roles).size !== 5) throw new Error(`${id} must define exactly five color roles`);
}
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
for (const legacy of ['--lime', '--violet', '--orange', '--cyan', '--danger', '--bg', '--text']) {
  if (css.includes(`var(${legacy})`) || new RegExp(`(^|\\s)${legacy}:`, 'm').test(css)) throw new Error(`Legacy color token remains: ${legacy}`);
}
console.log('Theme gate passed: Studio and Felt each define exactly five semantic colors; no legacy accent tokens remain.');
