import { analyzePhrases, letterSignature, loadDictionary, loadPhraseBank, measuredDifficultyById, phraseVariety, wordsIn } from './phrase-analysis-lib.mjs';

const phrases = await loadPhraseBank();
const dictionaryWords = await loadDictionary();
const dictionary = new Set(dictionaryWords);
const measured = analyzePhrases(phrases, dictionaryWords);
const analysisById = new Map(measured.map((analysis) => [analysis.id, analysis]));
const currentAnalyses = measured.filter((analysis) => !analysis.legacy);
const measuredDifficulty = measuredDifficultyById(currentAnalyses);

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
  if (phrase.legacy) errors.push(`${phrase.id}: legacy content is not allowed after Phase B`);
  if (phrase.canonical !== undefined && typeof phrase.canonical !== 'boolean') errors.push(`${phrase.id}: canonical must be a boolean`);
  if (phrase.display && letterSignature(phrase.display) !== letterSignature(phrase.text)) {
    errors.push(`${phrase.id}: display text must contain exactly the same letters as text`);
  }

  const analysis = analysisById.get(phrase.id);
  const phraseLength = analysis?.letterCount ?? 0;
  const playableCount = analysis?.findableWordCount ?? 0;
  analyses.push({
    id: phrase.id,
    playable: playableCount,
    longest: analysis?.longestFindableWord ?? ''
  });

  if (!phrase.legacy) {
    const minimumWords = phrase.canonical ? 150 : 250;
    const minimumLetters = phrase.canonical ? 12 : 15;
    if (playableCount < minimumWords || playableCount > 900) {
      errors.push(`${phrase.id}: SOLUTION_BAND requires ${minimumWords}–900 findable words; found ${playableCount}`);
    }
    if (phraseLength < minimumLetters || phraseLength > 22) {
      errors.push(`${phrase.id}: LENGTH_BAND requires ${minimumLetters}–22 letters; found ${phraseLength}`);
    }
    const expectedDifficulty = measuredDifficulty.get(phrase.id);
    if (expectedDifficulty && Math.abs(phrase.difficulty - expectedDifficulty) > 1) {
      errors.push(`${phrase.id}: DIFFICULTY_TRUTH expected difficulty ${expectedDifficulty} ±1; found ${phrase.difficulty}`);
    }
  }

  if (phrase.burnSolution) {
    const normalized = phrase.burnSolution.map((word) => word.toLowerCase());
    const phraseWords = new Set(wordsIn(phrase.text).filter((word) => word.length >= 3));
    if (new Set(normalized).size !== normalized.length) errors.push(phrase.id + ': Burn solution repeats a word');
    for (const word of normalized) {
      if (word.length < 3) errors.push(phrase.id + ': Burn solution contains a word shorter than 3 letters (' + word + ')');
      if (!dictionary.has(word)) errors.push(phrase.id + ': Burn solution word is outside the curated dictionary (' + word + ')');
      if (phraseWords.has(word)) errors.push(phrase.id + ': Burn solution repeats a visible phrase word (' + word + ')');
    }
    if (letterSignature(normalized.join('')) !== letterSignature(phrase.text)) {
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

if (phrases.length !== 150) errors.push(`PHRASE_COUNT requires 150 phrases; found ${phrases.length}`);
const canonicalCount = phrases.filter((phrase) => phrase.canonical).length;
if (canonicalCount / phrases.length < 0.3) errors.push(`CANON_RATIO requires at least 30% canonical phrases; found ${(canonicalCount / phrases.length * 100).toFixed(1)}%`);
const { wordUse, bigramUse } = phraseVariety(phrases);
for (const [word, ids] of wordUse) {
  if (ids.length > 3) errors.push(`VARIETY allows ${word.toUpperCase()} in at most 3 phrases; found ${ids.length} (${ids.join(', ')})`);
}
for (const [bigram, ids] of bigramUse) {
  if (ids.length > 2) errors.push(`TEMPLATE allows "${bigram.toUpperCase()}" in at most 2 phrases; found ${ids.length} (${ids.join(', ')})`);
}

journey.sort((a, b) => a.journeyOrder - b.journeyOrder);
journey.forEach((phrase, index) => {
  if (phrase.journeyOrder !== index + 1) errors.push(phrase.id + ': Trial order must be contiguous (expected ' + (index + 1) + ')');
});

const burnCount = phrases.filter((phrase) => phrase.burnSolution?.length).length;
if (journey.length < 20) errors.push('Trials needs at least 20 stages; found ' + journey.length);
if (!dictionary.has('heats')) errors.push('Validated inflection HEATS is missing from the dictionary');

if (errors.length) {
  console.error('Phrase Doctor found ' + errors.length + ' problem' + (errors.length === 1 ? '' : 's') + ':');
  errors.forEach((error) => console.error('  • ' + error));
  process.exitCode = 1;
} else {
  const average = Math.round(analyses.reduce((sum, item) => sum + item.playable, 0) / analyses.length);
  const smallest = analyses.reduce((best, item) => item.playable < best.playable ? item : best);
  console.log('Phrase Doctor passed: ' + phrases.length + ' phrases · ' + canonicalCount + ' canonical · ' + burnCount + ' verified Burn boards · ' + journey.length + ' Trials');
  console.log('Curated dictionary: ' + dictionary.size.toLocaleString() + ' words · average ' + average + ' playable words per phrase');
  console.log('Tightest phrase: ' + smallest.id + ' (' + smallest.playable + ' words) · longest ' + smallest.longest.toUpperCase());
}
