import { readFile, writeFile } from 'node:fs/promises';
import { canSpell, countsForText, letterSignature, loadDictionary, root } from './phrase-analysis-lib.mjs';

const shippedUrl = new URL('content/phrases.json', root);
const phrases = JSON.parse(await readFile(shippedUrl, 'utf8'));

const dictionary = await loadDictionary();
const frequency = `${await readFile(new URL('src/common-words.txt', root), 'utf8')}`.split(/\s+/).filter(Boolean);
const rank = new Map(frequency.map((word, index) => [word.toLowerCase(), index]));
const lexicalWords = new Set(JSON.parse(await readFile(new URL('node_modules/an-array-of-english-words/index.json', root), 'utf8')));
const MAX_SOLUTION_RANK = 3_000;

function wordCounts(word) {
  const counts = new Uint8Array(26);
  for (const letter of word) counts[letter.charCodeAt(0) - 97] += 1;
  return counts;
}

function remainingKey(remaining) {
  return Array.from(remaining).join('.');
}

function fits(candidate, remaining) {
  for (let index = 0; index < 26; index += 1) if (candidate.counts[index] > remaining[index]) return false;
  return true;
}

function subtract(candidate, remaining) {
  const next = remaining.slice();
  for (let index = 0; index < 26; index += 1) next[index] -= candidate.counts[index];
  return next;
}

function remainingTotal(remaining) {
  return remaining.reduce((total, count) => total + count, 0);
}

function solvePhrase(phrase) {
  const available = countsForText(phrase.text);
  const phraseWords = new Set(phrase.text.toLowerCase().match(/[a-z]+/g)?.filter((word) => word.length >= 3) ?? []);
  const candidates = dictionary
    .filter((word) => word.length >= 3 && word.length <= 12 && !phraseWords.has(word) && lexicalWords.has(word) && (rank.get(word) ?? Number.MAX_SAFE_INTEGER) < MAX_SOLUTION_RANK && canSpell(word, available))
    .map((word) => ({ word, counts: wordCounts(word), rank: rank.get(word) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => b.word.length - a.word.length || a.rank - b.rank || a.word.localeCompare(b.word));
  const byLetter = Array.from({ length: 26 }, () => []);
  candidates.forEach((candidate) => {
    for (let index = 0; index < 26; index += 1) if (candidate.counts[index]) byLetter[index].push(candidate);
  });

  const remaining = new Uint8Array(26);
  for (const [letter, count] of available) remaining[letter.charCodeAt(0) - 97] = count;
  const failed = new Set();
  let visited = 0;

  function search(state, chosen, used) {
    visited += 1;
    if (visited > 250_000) return null;
    const total = remainingTotal(state);
    if (total === 0) return chosen;
    if (total < 3 || chosen.length >= 7) return null;
    const key = remainingKey(state);
    if (failed.has(key)) return null;

    let pivot = -1;
    let options = null;
    for (let index = 0; index < 26; index += 1) {
      if (!state[index]) continue;
      const fitting = byLetter[index].filter((candidate) => !used.has(candidate.word) && fits(candidate, state));
      if (!fitting.length) {
        failed.add(key);
        return null;
      }
      if (!options || fitting.length < options.length) {
        pivot = index;
        options = fitting;
      }
    }

    for (const candidate of options ?? []) {
      const nextTotal = total - candidate.word.length;
      if (nextTotal === 1 || nextTotal === 2) continue;
      used.add(candidate.word);
      const result = search(subtract(candidate, state), [...chosen, candidate.word], used);
      used.delete(candidate.word);
      if (result) return result;
    }
    if (pivot >= 0) failed.add(key);
    return null;
  }

  return { solution: search(remaining, [], new Set()), visited };
}

let solved = 0;
let totalVisited = 0;
const updated = phrases.map((phrase) => {
  const { solution, visited } = solvePhrase(phrase);
  totalVisited += visited;
  if (!solution) {
    const { burnSolution: _discarded, ...withoutSolution } = phrase;
    return withoutSolution;
  }
  if (solution.some((word) => phrase.text.toLowerCase().match(/[a-z]+/g)?.includes(word))) {
    throw new Error(`${phrase.id}: solver used a phrase word`);
  }
  if (letterSignature(solution.join('')) !== letterSignature(phrase.text)) {
    throw new Error(`${phrase.id}: solver returned an incomplete partition`);
  }
  solved += 1;
  return { ...phrase, burnSolution: solution };
});

await writeFile(shippedUrl, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`Derived ${solved} non-trivial Burn partitions for ${phrases.length} phrases.`);
console.log(`Solver visited ${totalVisited.toLocaleString()} states (${Math.round(totalVisited / phrases.length).toLocaleString()} average per phrase).`);
