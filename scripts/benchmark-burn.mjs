import { canSpell, countsForText, loadDictionary, loadPhraseBank, wordsIn } from './phrase-analysis-lib.mjs';

const dictionary = await loadDictionary();
const phrases = (await loadPhraseBank()).filter((phrase) => phrase.burnSolution?.length);
let cachedChecks = 0;
for (const phrase of phrases) {
  const available = countsForText(phrase.text);
  const prohibited = new Set(wordsIn(phrase.text).filter((word) => word.length >= 3));
  cachedChecks += dictionary.filter((word) => !prohibited.has(word) && canSpell(word, available)).length;
}
const legacyPerSubmit = dictionary.length;
const cachedPerSubmit = Math.round(cachedChecks / phrases.length);
if (cachedPerSubmit >= legacyPerSubmit) throw new Error('Burn candidate caching did not reduce submit-time checks');
console.log(`Burn submit search: ${legacyPerSubmit.toLocaleString()} dictionary checks before → ${cachedPerSubmit.toLocaleString()} cached candidates after (${(legacyPerSubmit / cachedPerSubmit).toFixed(1)}× smaller).`);
