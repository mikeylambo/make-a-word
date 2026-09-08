import { Redis } from "@upstash/redis";

type RequestLike = { method?: string; body?: unknown };
type ResponseLike = { status(code: number): ResponseLike; json(body: unknown): void };

const ALLOWED = new Set([
  "sessions", "activation", "round_started", "round_completed", "replay", "words_submitted",
  "reject_too_short", "reject_not_in_dictionary", "reject_not_in_phrase", "reject_duplicate",
  "reject_phrase_word", "invite_created", "invite_opened", "invite_accepted", "daily_played",
  "multiplayer_started", "first_word_10s", "first_word_30s", "first_word_later"
]);

function redis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Telemetry storage is not configured");
  return new Redis({ url, token });
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.method !== "POST") return response.status(405).json({ ok: false });
  let body: unknown;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body) as unknown : request.body;
  } catch {
    return response.status(400).json({ ok: false });
  }
  if (!body || typeof body !== "object") return response.status(400).json({ ok: false });
  const { date, metrics } = body as { date?: unknown; metrics?: unknown };
  const today = new Date().toISOString().slice(0, 10);
  if (date !== today || !metrics || typeof metrics !== "object" || Array.isArray(metrics)) return response.status(400).json({ ok: false });

  const entries = Object.entries(metrics).filter(([name, value]) => ALLOWED.has(name)
    && Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 10_000);
  if (!entries.length || entries.length > ALLOWED.size) return response.status(400).json({ ok: false });

  const args = entries.flatMap(([name, value]) => [name, String(value)]);
  await redis().eval(
    "for i=1,#ARGV,2 do redis.call('HINCRBY',KEYS[1],ARGV[i],ARGV[i+1]) end return #ARGV/2",
    [`make-a-word:metrics:${today}`],
    args
  );
  response.status(202).json({ ok: true });
}
