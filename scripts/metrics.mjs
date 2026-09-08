import { Redis } from '@upstash/redis';

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) throw new Error('Set the Upstash Redis REST URL and token');
const values = await new Redis({ url, token }).hgetall(`make-a-word:metrics:${date}`) ?? {};
const n = (key) => Number(values[key] ?? 0);
const ratio = (top, bottom) => bottom ? `${(top / bottom * 100).toFixed(1)}%` : '—';
console.table({
  date,
  sessions: n('sessions'),
  activation: ratio(n('activation'), n('sessions')),
  replay: ratio(n('replay'), n('round_completed')),
  inviteConversion: ratio(n('invite_accepted'), n('invite_opened')),
  wordsPerRound: n('round_completed') ? (n('words_submitted') / n('round_completed')).toFixed(1) : '—',
  rejectionRate: ratio(n('reject_too_short') + n('reject_not_in_dictionary') + n('reject_not_in_phrase') + n('reject_duplicate') + n('reject_phrase_word'), n('words_submitted'))
});
