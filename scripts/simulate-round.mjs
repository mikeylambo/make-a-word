import { readFile, writeFile } from 'node:fs/promises';
import { baseScore, canSpell, countsForText, loadDictionary, root } from './phrase-analysis-lib.mjs';

const phrasesUrl = new URL('content/phrases.json', root);
const phrases = JSON.parse(await readFile(phrasesUrl, 'utf8'));
const dictionary = await loadDictionary();
const WORDS_PER_MINUTE = 15;
const ROUND_SECONDS = 120;
const scriptedWords = Math.floor(WORDS_PER_MINUTE * ROUND_SECONDS / 60);
const percentileCounts = [0.35, 0.65, 0.9].map((percentile) => Math.max(1, Math.round(scriptedWords * percentile)));

function scoreWithCombo(length, combo) {
  return Math.round(baseScore(length) * (1 + Math.min(combo, 8) * 0.1));
}

function simulate(phrase) {
  const available = countsForText(phrase.text);
  const words = dictionary
    .filter((word) => canSpell(word, available))
    .sort((a, b) => baseScore(b.length) - baseScore(a.length) || a.localeCompare(b))
    .slice(0, scriptedWords);
  const running = [];
  let total = 0;
  words.forEach((word, index) => {
    total += scoreWithCombo(word.length, index);
    running.push(total);
  });
  return percentileCounts.map((count) => running[Math.min(count, running.length) - 1] ?? total);
}

const table = [];
const updated = phrases.map((phrase, index) => {
  if (index >= 24) {
    const { journeyOrder: _order, medals: _medals, ...rest } = phrase;
    return rest;
  }
  const medals = simulate(phrase);
  table.push({ trial: index + 1, phrase: phrase.text, '35%': medals[0], '65%': medals[1], '90%': medals[2] });
  return { ...phrase, journeyOrder: index + 1, medals };
});

await writeFile(phrasesUrl, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`Scripted Trials: ${WORDS_PER_MINUTE} WPM for ${ROUND_SECONDS}s (${scriptedWords} words).`);
console.table(table);
