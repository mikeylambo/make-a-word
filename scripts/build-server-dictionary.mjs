import { readFileSync, writeFileSync } from "node:fs";

const blocked = new Set(JSON.parse(readFileSync(new URL("../content/dictionary-blocklist.json", import.meta.url), "utf8")));
const additions = JSON.parse(readFileSync(new URL("../content/dictionary-additions.json", import.meta.url), "utf8"));
const source = [
  readFileSync(new URL("../src/common-words.txt", import.meta.url), "utf8"),
  readFileSync(new URL("../src/inflected-words.txt", import.meta.url), "utf8")
].join("\n");

const words = new Set(
  source
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 3 && !blocked.has(word))
);
for (const word of additions) words.add(word.toLowerCase());

const destination = new URL("../content/server-dictionary.json", import.meta.url);
const rendered = `${JSON.stringify([...words].sort())}\n`;
if (process.argv.includes("--check")) {
  const current = readFileSync(destination, "utf8");
  if (current !== rendered) {
    console.error("Server dictionary is stale. Run npm run dictionary:server.");
    process.exit(1);
  }
  console.log(`Server dictionary verified: ${words.size.toLocaleString()} words`);
} else {
  writeFileSync(destination, rendered);
  console.log(`Server dictionary: ${words.size.toLocaleString()} words`);
}
