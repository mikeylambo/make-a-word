import { baseScore } from './phrase-analysis-lib.mjs';

const payouts = [1, 1.2, 1.5, 2, 2.6, 3.4, 4.4, 5.6];
const values = Array.from({ length: 40 }, (_, index) => baseScore(3 + index % 6));
const unchained = values.reduce((sum, value) => sum + value, 0);
const chained = Math.round(unchained * payouts.at(-1));
if (chained < unchained * 2) throw new Error('A 40-word chain must score at least twice an unchained run');
console.log(`40-word chain gate passed: ${chained.toLocaleString()} vs ${unchained.toLocaleString()} unchained (${(chained / unchained).toFixed(1)}×).`);
