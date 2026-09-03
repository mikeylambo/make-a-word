import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const broadWords = require("an-array-of-english-words");

const root = new URL("../", import.meta.url);
const baseWords = (await readFile(new URL("src/common-words.txt", root), "utf8"))
  .split(/\s+/)
  .map((word) => word.toLowerCase())
  .filter(Boolean);
const broad = new Set(broadWords.map((word) => word.toLowerCase()));
const base = new Set(baseWords);
const derived = new Set();

function candidates(word) {
  const forms = new Set([
    `${word}s`,
    `${word}ed`,
    `${word}ing`
  ]);

  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
  }
  if (/(s|x|z|ch|sh)$/.test(word)) forms.add(`${word}es`);
  if (word.endsWith("e")) {
    forms.add(`${word}d`);
    forms.add(`${word.slice(0, -1)}ing`);
  }

  return forms;
}

// The base list is frequency ordered. Derive from its common half so everyday
// forms are filled in without reopening the door to obscure dictionary noise.
for (const word of baseWords.slice(0, 7500)) {
  if (word.length < 3) continue;
  for (const candidate of candidates(word)) {
    if (broad.has(candidate) && !base.has(candidate)) derived.add(candidate);
  }
}

const output = `${[...derived].sort().join("\n")}\n`;
if (process.argv.includes("--write")) {
  await writeFile(new URL("src/inflected-words.txt", root), output);
  console.log(`Wrote ${derived.size.toLocaleString()} verified inflections.`);
} else {
  process.stdout.write(output);
}
