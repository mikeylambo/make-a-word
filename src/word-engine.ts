import commonWords from "./common-words.txt?raw";
import inflectedWords from "./inflected-words.txt?raw";
import blockedWords from "../content/dictionary-blocklist.json";
import dictionaryAdditions from "../content/dictionary-additions.json";
import {
  burnLetters,
  canSpell,
  countsForText,
  normalizeWord,
  remainingCounts,
  scoreWord
} from "./word-rules";

export { burnLetters, countsForText, remainingCounts, scoreWord } from "./word-rules";

const BLOCKED_WORDS = new Set(blockedWords);
const WORDS = new Set(
  `${commonWords}\n${inflectedWords}`
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 3 && !BLOCKED_WORDS.has(word))
);
dictionaryAdditions.forEach((word) => WORDS.add(word));

export const dictionarySize = WORDS.size;

export type ValidationResult =
  | { ok: true; word: string }
  | { ok: false; reason: "too-short" | "not-word" | "letters" | "duplicate" };

export function validateWord(
  input: string,
  available: Map<string, number>,
  submitted: Set<string>
): ValidationResult {
  const word = normalizeWord(input);
  if (word.length < 3) return { ok: false, reason: "too-short" };
  if (submitted.has(word)) return { ok: false, reason: "duplicate" };
  if (!canSpell(word, available)) return { ok: false, reason: "letters" };
  if (!WORDS.has(word)) return { ok: false, reason: "not-word" };
  return { ok: true, word };
}

export function hasPlayableWord(counts: Map<string, number>, submitted: Set<string>): boolean {
  const availableLetters = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (availableLetters < 3) return false;
  for (const word of WORDS) {
    if (word.length < 3 || word.length > availableLetters || submitted.has(word)) continue;
    if (canSpell(word, counts)) return true;
  }
  return false;
}

export function humanReason(reason: Exclude<ValidationResult, { ok: true }>["reason"]): string {
  if (reason === "too-short") return "Words need at least 3 letters";
  if (reason === "duplicate") return "Already found";
  if (reason === "letters") return "Those letters aren't available";
  return "Not in the word list";
}
