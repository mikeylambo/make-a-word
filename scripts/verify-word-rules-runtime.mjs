import assert from 'node:assert/strict';

const {
  burnBoardSettlement,
  burnLetters,
  canSpell,
  chainPayout,
  countsForText,
  normalizeWord,
  rarityMultiplier,
  remainingCounts,
  scoreWord
} = await import('../src/word-rules.ts');

assert.equal(normalizeWord(" Heat's! "), 'heats');
const counts = countsForText('MAKE A WORD');
assert.equal(canSpell('maker', counts), true);
assert.equal(canSpell('drawer', counts), false);

assert.equal(scoreWord(3, 0, false), 100);
assert.equal(scoreWord(3, 8, false), 180);
assert.equal(scoreWord(3, 0, true), 125);
assert.equal(rarityMultiplier(undefined), 1);
assert.equal(rarityMultiplier(2999), 1);
assert.equal(rarityMultiplier(3000), 1.3);
assert.equal(rarityMultiplier(10000), 1.6);
assert.equal(chainPayout(1000, 1), 1000);
assert.equal(chainPayout(1000, 4), 2000);
assert.equal(chainPayout(1000, 99), 5600);

assert.deepEqual(burnBoardSettlement(20, 20), { boardClear: false, scoreDelta: -950 }, 'an untouched 20-letter Burn board must pay its full leftover cost');
assert.deepEqual(burnBoardSettlement(20, 10), { boardClear: false, scoreDelta: 0 }, 'partial Burn settlement must reward spent letters and charge leftovers symmetrically');
assert.deepEqual(burnBoardSettlement(20, 0), { boardClear: true, scoreDelta: 1950 }, 'a full 20-letter Burn clear must include the +1000 Board Clear bonus');
assert.deepEqual(burnBoardSettlement(20, 25), { boardClear: false, scoreDelta: -950 }, 'remaining-letter input must clamp to the board size');

const burned = burnLetters('LETTER', 'tee', new Set());
assert.equal(burned.size, 3);
const remaining = remainingCounts('LETTER', burned);
assert.equal([...remaining.values()].reduce((sum, count) => sum + count, 0), 3);
assert.equal(canSpell('let', remaining), false, 'spent letters must not be reusable in Burn');

console.log('Word-rule runtime passed: normalization, letter limits, scoring, rarity, chain payout, Burn consumption, and Burn board settlement are stable.');
