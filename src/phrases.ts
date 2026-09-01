export type PhraseEntry = {
  text: string;
  label: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
};

export const PHRASES: PhraseEntry[] = [
  { text: "THE STARS ARE CALLING", label: "Open Sky", difficulty: 2 },
  { text: "A JOURNEY OF A THOUSAND MILES", label: "Long Road", difficulty: 4 },
  { text: "FORTUNE FAVORS THE BOLD", label: "Fortune", difficulty: 3 },
  { text: "MAKE EVERY SECOND COUNT", label: "Second Count", difficulty: 3 },
  { text: "THERE IS MAGIC IN THE MAKING", label: "Making", difficulty: 4 },
  { text: "CHASE THE LIGHT", label: "Light", difficulty: 1 },
  { text: "THE QUICK BROWN FOX", label: "Quick Fox", difficulty: 2 },
  { text: "NOTHING VENTURED NOTHING GAINED", label: "Venture", difficulty: 5 },
  { text: "LEAVE YOUR MARK", label: "Mark", difficulty: 1 },
  { text: "BUILD SOMETHING WONDERFUL", label: "Wonderful", difficulty: 4 },
  { text: "DREAM BIGGER THAN YESTERDAY", label: "Bigger", difficulty: 4 },
  { text: "THE WORLD IS FULL OF WORDS", label: "World of Words", difficulty: 3 },
  { text: "KEEP MOVING FORWARD", label: "Forward", difficulty: 2 },
  { text: "EVERY LETTER MATTERS", label: "Letters", difficulty: 2 },
  { text: "CREATE WITHOUT FEAR", label: "Create", difficulty: 2 },
  { text: "TIME WAITS FOR NO ONE", label: "No One", difficulty: 2 },
  { text: "FIND THE HIDDEN PATH", label: "Hidden Path", difficulty: 2 },
  { text: "SMALL WORDS BIG SCORE", label: "Big Score", difficulty: 2 },
  { text: "MOMENTUM CHANGES EVERYTHING", label: "Momentum", difficulty: 5 },
  { text: "WRITE YOUR OWN STORY", label: "Story", difficulty: 2 },
  { text: "THE BEST IDEAS START SMALL", label: "Start Small", difficulty: 3 },
  { text: "PLAY LEARN REFINE REPEAT", label: "Refine", difficulty: 3 },
  { text: "WORDS ARE EVERYWHERE", label: "Everywhere", difficulty: 3 },
  { text: "A LITTLE PROGRESS EACH DAY", label: "Progress", difficulty: 3 }
];

export function phraseForDay(date = new Date()): PhraseEntry {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = Math.floor(utc / 86_400_000);
  return PHRASES[Math.abs(day) % PHRASES.length];
}

export function randomPhrase(exclude?: string): PhraseEntry {
  const pool = exclude ? PHRASES.filter((entry) => entry.text !== exclude) : PHRASES;
  return pool[Math.floor(Math.random() * pool.length)] ?? PHRASES[0];
}
