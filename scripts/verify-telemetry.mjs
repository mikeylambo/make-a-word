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
need(main, 'telemetry.enabled = save.settings.analytics && navigator.doNotTrack !== "1";', 'persisted analytics preference is not applied at startup');
need(main, 'telemetry.enabled = save.settings.analytics && navigator.doNotTrack !== "1";', 'settings toggle is not routed through telemetry consent');
need(eventApi, 'const ALLOWED = new Set([', 'telemetry API allowlist is missing');
need(eventApi, 'Number(value) <= 10_000', 'telemetry API does not bound metric values');
reject(telemetry, 'submittedWords', 'telemetry must not collect submitted words');
reject(telemetry, 'playerName', 'telemetry must not collect player names');

if (failures.length) {
  console.error(`Telemetry gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Telemetry gate passed: analytics starts opted out until saved consent loads, DNT is enforced, and only bounded aggregate metrics are accepted.');
