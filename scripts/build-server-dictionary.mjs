import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const authority = new Set(require("an-array-of-english-words").map((word) => word.toLowerCase()));
const policyFiles = ["dictionary-blocklist.json", "dictionary-interjections.json", "dictionary-profanity.json", "dictionary-non-us.json"];
const blocked = new Set(policyFiles.flatMap((file) => JSON.parse(readFileSync(new URL(`../content/${file}`, import.meta.url), "utf8"))));
const additions = JSON.parse(readFileSync(new URL("../content/dictionary-additions.json", import.meta.url), "utf8"));
const sourceWords = [
  ...readFileSync(new URL("../src/common-words.txt", import.meta.url), "utf8").split(/\s+/),
  ...readFileSync(new URL("../src/inflected-words.txt", import.meta.url), "utf8").split(/\s+/)
].map((word) => word.toLowerCase()).filter(Boolean);

const words = new Set(
  sourceWords.filter((word) => word.length >= 3 && authority.has(word) && !blocked.has(word))
);
for (const value of additions) {
  const word = value.toLowerCase();
  if (authority.has(word) && !blocked.has(word)) words.add(word);
}

const sourceRanks = new Map();
sourceWords.forEach((word, index) => { if (!sourceRanks.has(word)) sourceRanks.set(word, index); });
const ranks = Object.fromEntries([...words].map((word) => [word, sourceRanks.get(word) ?? sourceWords.length]));

const destination = new URL("../content/server-dictionary.json", import.meta.url);
const rendered = `${JSON.stringify([...words].sort())}\n`;
const rankDestination = new URL("../content/word-rank.json", import.meta.url);
const rankRendered = `${JSON.stringify(ranks)}\n`;
if (process.argv.includes("--check")) {
  const current = readFileSync(destination, "utf8");
  const currentRanks = readFileSync(rankDestination, "utf8");
  if (current !== rendered || currentRanks !== rankRendered) {
    console.error("Server dictionary is stale. Run npm run dictionary:server.");
    process.exit(1);
  }
  console.log(`Server dictionary verified: ${words.size.toLocaleString()} words`);
} else {
  writeFileSync(destination, rendered);
  writeFileSync(rankDestination, rankRendered);
  console.log(`Server dictionary: ${words.size.toLocaleString()} words`);
}
