type MetricName =
  | "sessions" | "activation" | "round_started" | "round_completed" | "replay"
  | "words_submitted" | "reject_too_short" | "reject_not_in_dictionary" | "reject_not_in_phrase"
  | "reject_duplicate" | "reject_phrase_word" | "invite_created" | "invite_opened"
  | "invite_accepted" | "daily_played" | "multiplayer_started";

const ALLOWED = new Set<MetricName>([
  "sessions", "activation", "round_started", "round_completed", "replay", "words_submitted",
  "reject_too_short", "reject_not_in_dictionary", "reject_not_in_phrase", "reject_duplicate",
  "reject_phrase_word", "invite_created", "invite_opened", "invite_accepted", "daily_played",
  "multiplayer_started"
]);

class AggregateTelemetry {
  private counts = new Map<MetricName, number>();
  private requests = 0;
  private day = new Date().toISOString().slice(0, 10);

  enabled = true;

  constructor() {
    if (navigator.doNotTrack === "1") this.enabled = false;
    this.increment("sessions");
    window.addEventListener("pagehide", () => this.flush(true));
  }

  increment(name: MetricName, amount = 1): void {
    if (!this.enabled || !ALLOWED.has(name)) return;
    this.counts.set(name, Math.min(10_000, (this.counts.get(name) ?? 0) + Math.max(0, Math.round(amount))));
  }

  flush(beacon = false): void {
    if (!this.enabled || !this.counts.size || this.requests >= 2) return;
    const metrics = Object.fromEntries(this.counts);
    this.counts.clear();
    this.requests += 1;
    const body = JSON.stringify({ date: this.day, metrics });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/event", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  }
}

export const telemetry = new AggregateTelemetry();
