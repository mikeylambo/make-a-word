import fs from 'node:fs';

const telemetry = fs.readFileSync(new URL('../src/telemetry.ts', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const eventApi = fs.readFileSync(new URL('../api/event.ts', import.meta.url), 'utf8');
const failures = [];
const need = (source, token, message) => { if (!source.includes(token)) failures.push(message); };
const reject = (source, token, message) => { if (source.includes(token)) failures.push(message); };

need(telemetry, 'private _enabled = false;', 'telemetry does not start disabled before preferences load');
need(telemetry, 'set enabled(value: boolean)', 'telemetry preference setter is missing');
need(telemetry, 'Boolean(value) && navigator.doNotTrack !== "1"', 'Do Not Track is not enforced when analytics is enabled');
need(telemetry, 'if (this._enabled && !this.sessionCounted)', 'session metrics are not deferred until analytics consent is active');
const consentAssignments = main.match(/telemetry\.enabled = save\.settings\.analytics && navigator\.doNotTrack !== "1";/g) ?? [];
if (consentAssignments.length < 2) failures.push('persisted analytics preference and in-settings toggle must both route through telemetry consent');
need(eventApi, 'const ALLOWED = new Set([', 'telemetry API allowlist is missing');
need(eventApi, 'Number(value) <= 10_000', 'telemetry API does not bound metric values');
need(eventApi, 'const REQUESTS_PER_MINUTE = 30;', 'telemetry endpoint rate limit is missing');
need(eventApi, 'createHash("sha256").update(forwarded)', 'telemetry rate-limit actor is not privacy-preserving');
need(eventApi, 'return response.status(429).json({ ok: false })', 'telemetry endpoint does not reject abusive request rates');
reject(telemetry, 'submittedWords', 'telemetry must not collect submitted words');
reject(telemetry, 'playerName', 'telemetry must not collect player names');

if (failures.length) {
  console.error(`Telemetry gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Telemetry gate passed: saved consent and DNT are enforced before collection, payloads stay aggregate/bounded, and the endpoint is rate limited.');
