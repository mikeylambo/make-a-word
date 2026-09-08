import { readFile } from 'node:fs/promises';
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
if (!css.includes('animation-delay:calc(var(--deal-index) * 40ms)')) throw new Error('Board deal must stagger letters by 40ms');
if (!css.includes('.phrase-letter--used')) throw new Error('Classic board history state is missing');
if (!css.includes('.phrase-letter--missing')) throw new Error('Missing-letter teaching state is missing');
const mobile = css.match(/@media \(max-width: 460px\)([\s\S]*)/)?.[1] ?? '';
const width = Number(mobile.match(/\.phrase-letter\s*\{[^}]*width:(\d+)px/)?.[1] ?? 0);
if (width && width < 32) throw new Error(`Mobile letter tiles regressed below 32px (${width}px)`);
console.log(`Board gate passed: staggered deal, persistent use state, missing-letter feedback, mobile tile floor ${width || 'fluid'}px.`);
