import { writeFile } from 'node:fs/promises';
import { analyzePhrases, loadDictionary, loadPhraseBank, root, summarizeAnalysis } from './phrase-analysis-lib.mjs';

const phrases = await loadPhraseBank();
const dictionary = await loadDictionary();
const analyses = analyzePhrases(phrases, dictionary);
const summary = summarizeAnalysis(analyses);

await writeFile(new URL('content/phrase-analysis.json', root), `${JSON.stringify(analyses, null, 2)}\n`);

console.log(`Analyzed ${summary.phrases} phrases against ${dictionary.length.toLocaleString()} shipped words.`);
console.table([
  {
    bank: 'All phrases',
    phrases: summary.phrases,
    'median letters': summary.medianLetters,
    'median words': summary.medianFindable,
    'minimum words': summary.minimumFindable,
    'maximum words': summary.maximumFindable,
    'solution failures': summary.solutionBandFailures,
    'length failures': summary.lengthBandFailures
  }
]);

const extremes = analyses
  .slice()
  .sort((a, b) => a.findableWordCount - b.findableWordCount)
  .filter((analysis, index, ordered) => index < 5 || index >= ordered.length - 5)
  .map((analysis) => ({
    id: analysis.id,
    letters: analysis.letterCount,
    words: analysis.findableWordCount,
    longest: analysis.longestFindableWord.toUpperCase()
  }));

console.log('Tightest and broadest boards:');
console.table(extremes);
