import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const phrases = JSON.parse(await readFile(new URL('content/phrases.json', root), 'utf8'));
const expandedPhrases = JSON.parse(await readFile(new URL('content/expanded-phrases.json', root), 'utf8'));
phrases.push(...expandedPhrases);
const blocklist = new Set(JSON.parse(await readFile(new URL('content/dictionary-blocklist.json', root), 'utf8')));
const additions = JSON.parse(await readFile(new URL('content/dictionary-additions.json', root), 'utf8'));
const dictionary = new Set(
  `${await readFile(new URL('src/common-words.txt', root), 'utf8')}\n${await readFile(new URL('src/inflected-words.txt', root), 'utf8')}`
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 3 && !blocklist.has(word))
);
additions.forEach((word) => dictionary.add(word));

function counts(text) {
  const result = new Map();
  for (const letter of text.toLowerCase()) {
    if (!/[a-z]/.test(letter)) continue;
    result.set(letter, (result.get(letter) ?? 0) + 1);
  }
  return result;
}

function canSpell(word, available) {
  const used = new Map();
  for (const letter of word) {
    const next = (used.get(letter) ?? 0) + 1;
    if (next > (available.get(letter) ?? 0)) return false;
    used.set(letter, next);
  }
  return true;
}

function signature(text) {
  return [...text.toLowerCase()].filter((letter) => /[a-z]/.test(letter)).sort().join('');
}

const errors = [];
const seenIds = new Set();
const seenText = new Set();
const journey = [];
const analyses = [];

for (const phrase of phrases) {
  if (!phrase.id || seenIds.has(phrase.id)) errors.push('Duplicate or missing id: ' + (phrase.id ?? '(missing)'));
  if (!phrase.text || seenText.has(phrase.text)) errors.push('Duplicate or missing phrase: ' + (phrase.text ?? '(missing)'));
  seenIds.add(phrase.id);
  seenText.add(phrase.text);
  if (!Number.isInteger(phrase.difficulty) || phrase.difficulty < 1 || phrase.difficulty > 5) {
    errors.push(phrase.id + ': difficulty must be 1–5');
  }

  const available = counts(phrase.text);
  const phraseLength = signature(phrase.text).length;
  const playable = [...dictionary].filter((word) => word.length <= phraseLength && canSpell(word, available));
  analyses.push({
    id: phrase.id,
    playable: playable.length,
    longest: playable.reduce((best, word) => word.length > best.length ? word : best, '')
  });

  if (phrase.burnSolution) {
    const normalized = phrase.burnSolution.map((word) => word.toLowerCase());
    if (new Set(normalized).size !== normalized.length) errors.push(phrase.id + ': Burn solution repeats a word');
    for (const word of normalized) {
      if (word.length < 3) errors.push(phrase.id + ': Burn solution contains a word shorter than 3 letters (' + word + ')');
      if (!dictionary.has(word)) errors.push(phrase.id + ': Burn solution word is outside the curated dictionary (' + word + ')');
    }
    if (signature(normalized.join('')) !== signature(phrase.text)) {
      errors.push(phrase.id + ': Burn solution does not spend every letter');
    }
  }

  if (phrase.journeyOrder !== undefined) {
    journey.push(phrase);
    if (!Array.isArray(phrase.medals) || phrase.medals.length !== 3 || !(phrase.medals[0] < phrase.medals[1] && phrase.medals[1] < phrase.medals[2])) {
      errors.push(phrase.id + ': Trial medals must contain three ascending scores');
    }
  }
}

journey.sort((a, b) => a.journeyOrder - b.journeyOrder);
journey.forEach((phrase, index) => {
  if (phrase.journeyOrder !== index + 1) errors.push(phrase.id + ': Trial order must be contiguous (expected ' + (index + 1) + ')');
});

const burnCount = phrases.filter((phrase) => phrase.burnSolution?.length).length;
if (burnCount < 300) errors.push('Burn needs at least 300 verified phrases; found ' + burnCount);
if (journey.length < 20) errors.push('Trials needs at least 20 stages; found ' + journey.length);
if (!dictionary.has('heats')) errors.push('Validated inflection HEATS is missing from the dictionary');

if (errors.length) {
  console.error('Phrase Doctor found ' + errors.length + ' problem' + (errors.length === 1 ? '' : 's') + ':');
  errors.forEach((error) => console.error('  • ' + error));
  process.exitCode = 1;
} else {
  const average = Math.round(analyses.reduce((sum, item) => sum + item.playable, 0) / analyses.length);
  const smallest = analyses.reduce((best, item) => item.playable < best.playable ? item : best);
  console.log('Phrase Doctor passed: ' + phrases.length + ' phrases · ' + burnCount + ' verified Burn boards · ' + journey.length + ' Trials');
  console.log('Curated dictionary: ' + dictionary.size.toLocaleString() + ' words · average ' + average + ' playable words per phrase');
  console.log('Tightest phrase: ' + smallest.id + ' (' + smallest.playable + ' words) · longest ' + smallest.longest.toUpperCase());
}
