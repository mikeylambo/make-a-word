import { readFile, writeFile } from 'node:fs/promises';
import { root, seededPhraseOrder } from './phrase-analysis-lib.mjs';

const bankUrl = new URL('content/phrases.json', root);
const scheduleUrl = new URL('content/daily-schedule.json', root);
const phrases = JSON.parse(await readFile(bankUrl, 'utf8'));
const phraseIds = seededPhraseOrder(phrases).map((phrase) => phrase.id);
const schedule = {
  versions: [{
    id: 'v1',
    startsOn: '1970-01-01',
    phraseIds
  }]
};

if (process.argv.includes('--write')) {
  await writeFile(scheduleUrl, `${JSON.stringify(schedule, null, 2)}\n`);
  console.log(`Wrote stable Daily schedule with ${phraseIds.length} phrase ids.`);
} else {
  console.log(JSON.stringify(schedule, null, 2));
}
