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

export function scoreWord(length: number, combo: number, burnMode: boolean): number {
  const base = length === 3 ? 100 : length === 4 ? 180 : length === 5 ? 300 : length === 6 ? 480 : length === 7 ? 720 : 900 + (length - 8) * 180;
  const comboMultiplier = 1 + Math.min(combo, 8) * 0.1;
  const modeMultiplier = burnMode ? 1.25 : 1;
  return Math.round(base * comboMultiplier * modeMultiplier);
}

export const CHAIN_PAYOUTS = [1, 1.2, 1.5, 2, 2.6, 3.4, 4.4, 5.6] as const;

export function rarityMultiplier(rank: number | undefined): 1 | 1.3 | 1.6 {
  if (rank === undefined || rank < 3_000) return 1;
  if (rank < 10_000) return 1.3;
  return 1.6;
}

export function chainPayout(bank: number, chainLength: number): number {
  const multiplier = CHAIN_PAYOUTS[Math.min(Math.max(1, chainLength), CHAIN_PAYOUTS.length) - 1] ?? 1;
  return Math.round(bank * multiplier);
}

export function burnLetters(phrase: string, word: string, burned: Set<number>): Set<number> {
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
