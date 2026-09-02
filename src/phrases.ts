import phraseData from "../content/phrases.json";

export type PhraseEntry = {
  id: string;
  text: string;
  label: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  burnSolution?: string[];
  journeyOrder?: number;
  medals?: [number, number, number];
};

export const PHRASES = phraseData as PhraseEntry[];
export const BURN_PHRASES = PHRASES.filter((entry) => entry.burnSolution?.length);
export const JOURNEY_PHRASES = PHRASES
  .filter((entry) => entry.journeyOrder && entry.medals)
  .sort((a, b) => (a.journeyOrder ?? 0) - (b.journeyOrder ?? 0));

export function phraseForDay(date = new Date()): PhraseEntry {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = Math.floor(utc / 86_400_000);
  return PHRASES[Math.abs(day) % PHRASES.length] ?? PHRASES[0];
}

export function randomPhrase(exclude?: string, burnOnly = false): PhraseEntry {
  const source = burnOnly ? BURN_PHRASES : PHRASES;
  const pool = exclude ? source.filter((entry) => entry.text !== exclude) : source;
  return pool[Math.floor(Math.random() * pool.length)] ?? source[0] ?? PHRASES[0];
}
