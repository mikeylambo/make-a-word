import { readFile } from 'node:fs/promises';

export const root = new URL('../', import.meta.url);

export async function loadPhraseBank() {
  return JSON.parse(await readFile(new URL('content/phrases.json', root), 'utf8'));
}

export async function loadDictionary() {
  return JSON.parse(await readFile(new URL('content/server-dictionary.json', root), 'utf8'));
}

export function countsForText(text) {
  const counts = new Map();
  for (const letter of text.toLowerCase()) {
    if (!/[a-z]/.test(letter)) continue;
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return counts;
}

export function canSpell(word, available) {
  const used = new Map();
  for (const letter of word) {
    const next = (used.get(letter) ?? 0) + 1;
    if (next > (available.get(letter) ?? 0)) return false;
    used.set(letter, next);
  }
  return true;
}

export function letterSignature(text) {
  return [...text.toLowerCase()].filter((letter) => /[a-z]/.test(letter)).sort().join('');
}

export function baseScore(length) {
  if (length === 3) return 100;
  if (length === 4) return 180;
  if (length === 5) return 300;
  if (length === 6) return 480;
  if (length === 7) return 720;
  return 900 + (length - 8) * 180;
}

function lengthBucket(length) {
  return length >= 8 ? '8+' : String(length);
}

export function analyzePhrase(phrase, dictionary) {
  const available = countsForText(phrase.text);
  const letterCount = [...available.values()].reduce((total, count) => total + count, 0);
  const findable = dictionary.filter((word) => word.length <= letterCount && canSpell(word, available));
  const byLength = { '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8+': 0 };
  for (const word of findable) byLength[lengthBucket(word.length)] += 1;
  const scored = findable
    .map((word) => ({ word, length: word.length, score: baseScore(word.length) }))
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));

  return {
    id: phrase.id,
    text: phrase.text,
    label: phrase.label,
    legacy: phrase.legacy === true,
    canonical: phrase.canonical === true,
    difficulty: phrase.difficulty,
    letterCount,
    findableWordCount: findable.length,
    byLength,
    longestFindableWord: scored[0]?.word ?? '',
    topScoringWords: scored.slice(0, 20)
  };
}

export function analyzePhrases(phrases, dictionary) {
  return phrases.map((phrase) => analyzePhrase(phrase, dictionary));
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function measuredDifficultyById(analyses) {
  const ordered = analyses.slice().sort((a, b) => a.findableWordCount - b.findableWordCount || a.id.localeCompare(b.id));
  return new Map(ordered.map((analysis, index) => [analysis.id, Math.min(5, Math.floor(index * 5 / ordered.length) + 1)]));
}

export function summarizeAnalysis(analyses) {
  const findable = analyses.map((analysis) => analysis.findableWordCount);
  const letters = analyses.map((analysis) => analysis.letterCount);
  return {
    phrases: analyses.length,
    medianLetters: median(letters),
    medianFindable: median(findable),
    minimumFindable: Math.min(...findable),
    maximumFindable: Math.max(...findable),
    solutionBandFailures: analyses.filter((analysis) => analysis.findableWordCount < (analysis.canonical ? 150 : 250) || analysis.findableWordCount > 900).length,
    lengthBandFailures: analyses.filter((analysis) => analysis.letterCount < (analysis.canonical ? 12 : 15) || analysis.letterCount > 22).length
  };
}

export const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'do', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'i', 'in', 'is', 'it', 'its', 'me',
  'my', 'of', 'on', 'or', 'our', 'ours', 'she', 'that', 'the', 'their', 'theirs', 'them', 'they',
  'this', 'to', 'us', 'was', 'we', 'were', 'with', 'you', 'your', 'yours'
]);

export function wordsIn(text) {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

export function phraseVariety(phrases) {
  const wordUse = new Map();
  const bigramUse = new Map();
  for (const phrase of phrases) {
    const words = wordsIn(phrase.text);
    for (const word of new Set(words.filter((entry) => !STOP_WORDS.has(entry)))) {
      const ids = wordUse.get(word) ?? [];
      ids.push(phrase.id);
      wordUse.set(word, ids);
    }
    for (const bigram of new Set(words.slice(1).map((word, index) => `${words[index]} ${word}`))) {
      const ids = bigramUse.get(bigram) ?? [];
      ids.push(phrase.id);
      bigramUse.set(bigram, ids);
    }
  }
  return { wordUse, bigramUse };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

export function seededPhraseOrder(phrases, seed = 0x4D415731) {
  const random = seededRandom(seed);
  const pool = phrases.slice();
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }

  const ordered = [];
  while (pool.length) {
    const previousLabel = ordered.at(-1)?.label;
    let nextIndex = pool.findIndex((phrase) => phrase.label !== previousLabel);
    if (nextIndex < 0) nextIndex = 0;
    ordered.push(pool.splice(nextIndex, 1)[0]);
  }

  if (ordered.length > 2 && ordered[0].label === ordered.at(-1).label) {
    const last = ordered.at(-1);
    const swap = ordered.findIndex((phrase, index) => index > 0 && index < ordered.length - 2
      && ordered[index - 1].label !== last.label
      && ordered[index + 1].label !== last.label
      && ordered[index].label !== ordered.at(-2).label
      && ordered[index].label !== ordered[0].label);
    if (swap > 0) [ordered[swap], ordered[ordered.length - 1]] = [ordered[ordered.length - 1], ordered[swap]];
  }
  return ordered;
}

export function assertDailyLabelRotation(phrases, days = 365) {
  const order = seededPhraseOrder(phrases);
  for (let day = 1; day < days; day += 1) {
    const previous = order[(day - 1) % order.length];
    const current = order[day % order.length];
    if (previous.label === current.label) throw new Error(`Daily label repeats on day ${day}: ${current.label}`);
  }
  return order;
}
