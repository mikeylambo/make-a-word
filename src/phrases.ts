import phraseData from "../content/phrases.json";
import dailyScheduleData from "../content/daily-schedule.json";
import dailyArchiveData from "../content/daily-archive.json";

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

type DailySchedule = { versions: Array<{ id: string; startsOn: string; phraseIds: string[] }> };
const DAILY_SCHEDULE = dailyScheduleData as DailySchedule;
const PHRASES_BY_ID = new Map([...(dailyArchiveData as PhraseEntry[]), ...PHRASES].map((phrase) => [phrase.id, phrase]));

function utcDay(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

export function phraseForDay(date = new Date()): PhraseEntry {
  const day = utcDay(date);
  const versions = DAILY_SCHEDULE.versions
    .map((version) => ({ ...version, startDay: utcDay(new Date(`${version.startsOn}T00:00:00Z`)) }))
    .sort((a, b) => a.startDay - b.startDay);
  const version = versions.filter((entry) => entry.startDay <= day).at(-1) ?? versions[0];
  const ids = version?.phraseIds ?? [];
  const index = ((day - (version?.startDay ?? 0)) % ids.length + ids.length) % ids.length;
  return PHRASES_BY_ID.get(ids[index] ?? "") ?? PHRASES[0];
}

export function randomPhrase(exclude?: string, burnOnly = false): PhraseEntry {
  const source = burnOnly ? BURN_PHRASES : PHRASES;
  const pool = exclude ? source.filter((entry) => entry.text !== exclude) : source;
  return pool[Math.floor(Math.random() * pool.length)] ?? source[0] ?? PHRASES[0];
}
