import words from "an-array-of-english-words";

const WORDS = new Set(words.map((word) => word.toLowerCase()));

export type ValidationResult =
  | { ok: true; word: string }
  | { ok: false; reason: "too-short" | "not-word" | "letters" | "duplicate" };

export function normalizeWord(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z]/g, "");
}

export function countsForText(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const char of text.toLowerCase()) {
    if (!/[a-z]/.test(char)) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return counts;
}

export function canSpell(word: string, counts: Map<string, number>): boolean {
  const used = new Map<string, number>();
  for (const char of word) {
    const next = (used.get(char) ?? 0) + 1;
    if (next > (counts.get(char) ?? 0)) return false;
    used.set(char, next);
  }
  return true;
}

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

export function scoreWord(length: number, combo: number, burnMode: boolean): number {
  const base = length === 3 ? 100 : length === 4 ? 180 : length === 5 ? 300 : length === 6 ? 480 : length === 7 ? 720 : 900 + (length - 8) * 180;
  const comboMultiplier = 1 + Math.min(combo, 8) * 0.1;
  const modeMultiplier = burnMode ? 1.25 : 1;
  return Math.round(base * comboMultiplier * modeMultiplier);
}

export function burnLetters(
  phrase: string,
  word: string,
  burned: Set<number>
): Set<number> {
  const next = new Set(burned);
  for (const letter of word) {
    for (let i = 0; i < phrase.length; i += 1) {
      if (next.has(i)) continue;
      if (phrase[i]?.toLowerCase() === letter) {
        next.add(i);
        break;
      }
    }
  }
  return next;
}

export function remainingCounts(phrase: string, burned: Set<number>): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < phrase.length; i += 1) {
    if (burned.has(i)) continue;
    const char = phrase[i]?.toLowerCase() ?? "";
    if (!/[a-z]/.test(char)) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return counts;
}

export function humanReason(reason: Exclude<ValidationResult, { ok: true }>["reason"]): string {
  if (reason === "too-short") return "Words need at least 3 letters";
  if (reason === "duplicate") return "Already found";
  if (reason === "letters") return "Those letters aren't available";
  return "Not in the word list";
}
