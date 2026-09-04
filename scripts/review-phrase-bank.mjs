import { readFile } from 'node:fs/promises';
import { analyzePhrases, assertDailyLabelRotation, letterSignature, loadDictionary, measuredDifficultyById, phraseVariety, root, wordsIn } from './phrase-analysis-lib.mjs';

const phrases = JSON.parse(await readFile(new URL('content/phrases.json', root), 'utf8'));
const dictionaryWords = await loadDictionary();
const dictionary = new Set(dictionaryWords);
const analyses = analyzePhrases(phrases, dictionaryWords);
const measuredDifficulty = measuredDifficultyById(analyses);
const errors = [];

if (phrases.length !== 150) errors.push(`Phrase bank must contain 150 phrases; found ${phrases.length}`);

for (const [index, phrase] of phrases.entries()) {
  const analysis = analyses[index];
  const minimumLetters = phrase.canonical ? 12 : 15;
  const minimumWords = phrase.canonical ? 150 : 250;
  if (analysis.letterCount < minimumLetters || analysis.letterCount > 22) errors.push(`${phrase.id}: ${analysis.letterCount} letters`);
  if (analysis.findableWordCount < minimumWords || analysis.findableWordCount > 900) errors.push(`${phrase.id}: ${analysis.findableWordCount} findable words`);
  if (phrase.difficulty !== measuredDifficulty.get(phrase.id)) errors.push(`${phrase.id}: difficulty is not derived from its measured quintile`);
  if (phrase.display && letterSignature(phrase.display) !== letterSignature(phrase.text)) errors.push(`${phrase.id}: display letters differ from board letters`);
  if (phrase.burnSolution) {
    const phraseWords = new Set(wordsIn(phrase.text).filter((word) => word.length >= 3));
    for (const word of phrase.burnSolution) {
      if (!dictionary.has(word)) errors.push(`${phrase.id}: Burn word ${word} is outside the shipped dictionary`);
      if (phraseWords.has(word)) errors.push(`${phrase.id}: Burn word ${word} appears on the board`);
    }
    if (letterSignature(phrase.burnSolution.join('')) !== letterSignature(phrase.text)) errors.push(`${phrase.id}: Burn solution is not an exact partition`);
  }
}

const canonicalCount = phrases.filter((phrase) => phrase.canonical).length;
if (canonicalCount / phrases.length < 0.3) errors.push(`Canonical ratio is ${(canonicalCount / phrases.length * 100).toFixed(1)}%, below 30%`);
const { wordUse, bigramUse } = phraseVariety(phrases);
for (const [word, ids] of wordUse) if (ids.length > 3) errors.push(`${word}: used by ${ids.length} phrases`);
for (const [bigram, ids] of bigramUse) if (ids.length > 2) errors.push(`${bigram}: repeated in ${ids.length} phrases`);

try {
  assertDailyLabelRotation(phrases);
} catch (error) {
  errors.push(error.message);
}

const trials = phrases.filter((phrase) => phrase.journeyOrder !== undefined).sort((a, b) => a.journeyOrder - b.journeyOrder);
if (trials.length !== 24) errors.push(`Phrase bank must define 24 Trials; found ${trials.length}`);
trials.forEach((phrase, index) => {
  if (phrase.journeyOrder !== index + 1) errors.push(`${phrase.id}: Trial order is not contiguous`);
  if (!Array.isArray(phrase.medals) || phrase.medals.length !== 3 || !(phrase.medals[0] < phrase.medals[1] && phrase.medals[1] < phrase.medals[2])) {
    errors.push(`${phrase.id}: Trial medals are not three ascending targets`);
  }
});

if (errors.length) {
  console.error(`Candidate review failed with ${errors.length} problem${errors.length === 1 ? '' : 's'}:`);
  errors.forEach((error) => console.error(`  • ${error}`));
  process.exit(1);
}

console.log(`Bank review passed: ${phrases.length} phrases · ${canonicalCount} canonical · ${phrases.filter((phrase) => phrase.burnSolution).length} Burn boards · ${trials.length} Trials.`);
console.log('All phrases pass the content bands, variety, template, canonical ratio, derived-difficulty, and 365-day Daily rotation gates.');
