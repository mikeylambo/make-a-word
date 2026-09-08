import { readFile, writeFile } from 'node:fs/promises';
import { baseScore, canSpell, countsForText, loadDictionary, root } from './phrase-analysis-lib.mjs';

const phrasesUrl = new URL('content/phrases.json', root);
const phrases = JSON.parse(await readFile(phrasesUrl, 'utf8'));
const dictionary = await loadDictionary();
const ranks = JSON.parse(await readFile(new URL('content/word-rank.json', root), 'utf8'));
const WORDS_PER_MINUTE = 15;
const ROUND_SECONDS = 120;
const scriptedWords = Math.floor(WORDS_PER_MINUTE * ROUND_SECONDS / 60);
const percentileCounts = [0.35, 0.65, 0.9].map((percentile) => Math.max(1, Math.round(scriptedWords * percentile)));

const payouts = [1, 1.2, 1.5, 2, 2.6, 3.4, 4.4, 5.6];
function wordValue(word) {
  const rank = ranks[word];
  const rarity = rank < 3000 ? 1 : rank < 10000 ? 1.3 : 1.6;
  return Math.round(baseScore(word.length) * rarity);
}

function simulate(phrase) {
  const available = countsForText(phrase.text);
  const words = dictionary
    .filter((word) => canSpell(word, available))
    .sort((a, b) => wordValue(b) - wordValue(a) || a.localeCompare(b))
    .slice(0, scriptedWords);
  const running = [];
  let bank = 0;
  words.forEach((word, index) => {
    bank += wordValue(word);
    running.push(Math.round(bank * payouts[Math.min(index, payouts.length - 1)]));
  });
  return percentileCounts.map((count) => running[Math.min(count, running.length) - 1] ?? bank);
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
