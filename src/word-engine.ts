import shippedWords from "../content/server-dictionary.json";
import shippedRanks from "../content/word-ranks.json";
import {
  burnBoardSettlement,
  burnLetters,
  canSpell,
  countsForText,
  normalizeWord,
  remainingCounts,
  rarityMultiplier,
  chainPayout,
  scoreWord
} from "./word-rules";

export { burnBoardSettlement, burnLetters, chainPayout, countsForText, rarityMultiplier, remainingCounts, scoreWord } from "./word-rules";

const WORDS = new Set(shippedWords);
const WORD_RANKS = new Map(shippedWords.map((word, index) => [word, shippedRanks[index]]));

export const dictionarySize = WORDS.size;
export function wordRank(word: string): number | undefined { return WORD_RANKS.get(word); }

export type ValidationResult =
  | { ok: true; word: string }
  | { ok: false; reason: "too-short" | "not-word" | "letters" | "duplicate" | "phrase-word" };

export function validateWord(
  input: string,
  available: Map<string, number>,
  submitted: Set<string>,
  prohibited = new Set<string>()
): ValidationResult {
  const word = normalizeWord(input);
  if (word.length < 3) return { ok: false, reason: "too-short" };
  if (submitted.has(word)) return { ok: false, reason: "duplicate" };
  if (!canSpell(word, available)) return { ok: false, reason: "letters" };
  if (prohibited.has(word)) return { ok: false, reason: "phrase-word" };
  if (!WORDS.has(word)) return { ok: false, reason: "not-word" };
  return { ok: true, word };
}

export function playableWords(counts: Map<string, number>, prohibited = new Set<string>()): string[] {
  const availableLetters = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (availableLetters < 3) return [];
  const found: string[] = [];
  for (const word of WORDS) {
    if (word.length < 3 || word.length > availableLetters || prohibited.has(word)) continue;
    if (canSpell(word, counts)) found.push(word);
  }
  return found;
}

export function hasPlayableWord(candidates: string[], counts: Map<string, number>, submitted: Set<string>): boolean {
  return candidates.some((word) => !submitted.has(word) && canSpell(word, counts));
}

export function humanReason(reason: Exclude<ValidationResult, { ok: true }>["reason"]): string {
  if (reason === "too-short") return "Words need at least 3 letters";
  if (reason === "duplicate") return "Already found";
  if (reason === "letters") return "Those letters aren't available";
  if (reason === "phrase-word") return "That one's already on the board";
  return "Not in the word list";
}
