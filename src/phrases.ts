import phraseData from "../content/phrases.json";

export type PhraseEntry = {
  id: string;
  text: string;
  display?: string;
  label: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  canonical?: boolean;
  burnSolution?: string[];
  journeyOrder?: number;
  medals?: [number, number, number];
  legacy?: boolean;
};

export const PHRASES = phraseData as PhraseEntry[];
export const BURN_PHRASES = PHRASES.filter((entry) => entry.burnSolution?.length);
export const JOURNEY_PHRASES = PHRASES
  .filter((entry) => entry.journeyOrder && entry.medals)
  .sort((a, b) => (a.journeyOrder ?? 0) - (b.journeyOrder ?? 0));

export function phraseDisplayText(phrase: Pick<PhraseEntry, "text" | "display">): string {
  return phrase.display ?? phrase.text;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function seededPhraseOrder(phrases: PhraseEntry[], seed = 0x4D415731): PhraseEntry[] {
  const random = seededRandom(seed);
  const pool = phrases.slice();
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  const ordered: PhraseEntry[] = [];
  while (pool.length) {
    const previousLabel = ordered.at(-1)?.label;
    let nextIndex = pool.findIndex((phrase) => phrase.label !== previousLabel);
    if (nextIndex < 0) nextIndex = 0;
    ordered.push(pool.splice(nextIndex, 1)[0]);
  }
  if (ordered.length > 2 && ordered[0].label === ordered.at(-1)?.label) {
    const last = ordered.at(-1) as PhraseEntry;
    const swap = ordered.findIndex((phrase, index) => index > 0 && index < ordered.length - 2
      && ordered[index - 1].label !== last.label
      && ordered[index + 1].label !== last.label
      && phrase.label !== ordered.at(-2)?.label
      && phrase.label !== ordered[0].label);
    if (swap > 0) [ordered[swap], ordered[ordered.length - 1]] = [ordered[ordered.length - 1], ordered[swap]];
  }
  return ordered;
}

const DAILY_PHRASES = seededPhraseOrder(PHRASES);

export function phraseForDay(date = new Date()): PhraseEntry {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = Math.floor(utc / 86_400_000);
  return DAILY_PHRASES[Math.abs(day) % DAILY_PHRASES.length] ?? PHRASES[0];
}

export function randomPhrase(exclude?: string, burnOnly = false): PhraseEntry {
  const source = burnOnly ? BURN_PHRASES : PHRASES;
  const pool = exclude ? source.filter((entry) => entry.text !== exclude) : source;
  return pool[Math.floor(Math.random() * pool.length)] ?? source[0] ?? PHRASES[0];
}
