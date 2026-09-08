import shippedWords from "../content/server-dictionary.json";
import {
  burnLetters,
  canSpell,
  countsForText,
  normalizeWord,
  remainingCounts,
  scoreWord
} from "./word-rules";

export { burnLetters, countsForText, remainingCounts, scoreWord } from "./word-rules";

const WORDS = new Set(shippedWords);

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
