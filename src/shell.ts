export type ScreenId = "title" | "menu" | "modes" | "journey" | "multiplayer" | "multiplayer-game" | "multiplayer-round" | "multiplayer-results" | "online" | "online-room" | "challenge" | "game" | "results" | "stats" | "settings" | "help";

export type SaveData = {
  bestScores: Record<string, number>;
  totalWords: number;
  totalScore: number;
  longestWord: string;
  roundsPlayed: number;
  daily: Record<string, number>;
  journeyScores: Record<string, number>;
  journeyMedals: Record<string, number>;
  journeyUnlocked: number;
  partyMatches: number;
  onlineMatches: number;
  completedOnlineMatchIds: string[];
  challengesCompleted: number;
  completedChallengeIds: string[];
  settings: {
    sound: boolean;
    music: boolean;
    volume: number;
    reducedMotion: boolean;
    analytics: boolean;
    classicDuration: 60 | 120 | 180;
    theme: "studio" | "felt";
  };
};

const DEFAULT_SAVE: SaveData = {
  bestScores: {},
  totalWords: 0,
  totalScore: 0,
  longestWord: "",
  roundsPlayed: 0,
  daily: {},
  journeyScores: {},
  journeyMedals: {},
  journeyUnlocked: 1,
  partyMatches: 0,
  onlineMatches: 0,
  completedOnlineMatchIds: [],
  challengesCompleted: 0,
  completedChallengeIds: [],
  settings: { sound: true, music: true, volume: 0.72, reducedMotion: false, analytics: true, classicDuration: 120, theme: "studio" }
};

export class SaveStore {
  constructor(private readonly key = "slu.make-a-word.save.v1") {}

  load(): SaveData {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const bestScores = { ...DEFAULT_SAVE.bestScores, ...(parsed.bestScores ?? {}) };
      if (bestScores.blitz) bestScores["classic:60"] = Math.max(bestScores["classic:60"] ?? 0, bestScores.blitz);
      return {
        ...structuredClone(DEFAULT_SAVE),
        ...parsed,
        bestScores,
        daily: { ...DEFAULT_SAVE.daily, ...(parsed.daily ?? {}) },
        journeyScores: { ...DEFAULT_SAVE.journeyScores, ...(parsed.journeyScores ?? {}) },
        journeyMedals: { ...DEFAULT_SAVE.journeyMedals, ...(parsed.journeyMedals ?? {}) },
        completedOnlineMatchIds: Array.isArray(parsed.completedOnlineMatchIds) ? parsed.completedOnlineMatchIds : [],
        completedChallengeIds: Array.isArray(parsed.completedChallengeIds) ? parsed.completedChallengeIds : [],
        settings: { ...DEFAULT_SAVE.settings, ...(parsed.settings ?? {}) }
      };
    } catch {
      return structuredClone(DEFAULT_SAVE);
    }
  }

  save(data: SaveData): void {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
}

export class ScreenManager {
  private current: ScreenId = "title";

  constructor(private readonly root: HTMLElement) {}

  show(id: ScreenId, html: string): HTMLElement {
    this.current = id;
    this.root.dataset.screen = id;
    this.root.innerHTML = html;
    this.root.classList.remove("screen-transition");
    void this.root.offsetWidth;
    this.root.classList.add("screen-transition");
    // Gameplay owns its text focus. Letting the generic menu autofocus race the
    // word input can leave a previously selected utility button as Enter's
    // implicit click target, especially after a touch-driven transition.
    if (id !== "game" && id !== "multiplayer-game" && id !== "online-room") this.focusFirst();
    return this.root;
  }

  getCurrent(): ScreenId {
    return this.current;
  }

  focusFirst(): void {
    const screen = this.current;
    requestAnimationFrame(() => {
      if (screen !== this.current) return;
      const scope = this.root.querySelector('.pause-card') ?? this.root;
      const first = [...scope.querySelectorAll<HTMLElement>("[data-nav]:not([disabled])")].find(item => item.getClientRects().length > 0);
      first?.focus({ preventScroll: true });
    });
  }
}

export class MenuNavigator {
  constructor(private readonly root: HTMLElement) {
    window.addEventListener("keydown", (event) => this.onKey(event));
  }

  private onKey(event: KeyboardEvent): void {
    const modal = this.root.querySelector<HTMLElement>('.pause-card');
    if (modal && event.key === 'Tab') {
      const controls = [...modal.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(item => item.getClientRects().length > 0);
      if (controls.length) {
        event.preventDefault();
        const index = controls.indexOf(document.activeElement as HTMLElement);
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches("input, textarea, select")) return;
    const items = [...(modal ?? this.root).querySelectorAll<HTMLElement>("[data-nav]:not([disabled])")].filter(item => item.getClientRects().length > 0);
    if (!items.length) return;
    event.preventDefault();
    const index = Math.max(0, items.indexOf(active ?? items[0]));
    const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
    items[(index + direction + items.length) % items.length]?.focus();
  }
}

export class TinyAudio {
  private context?: AudioContext;
  private volume = .72;
  private theme: "studio" | "felt" = "studio";
  private musicNodes: OscillatorNode[] = [];

  constructor() {
    const wake = () => { if (this.context?.state === "suspended") void this.context.resume(); };
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
  }

  configure(volume: number, theme: "studio" | "felt" = this.theme): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.theme = theme;
  }

  async resume(): Promise<void> {
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }

  play(
    kind: "accept" | "reject" | "rule" | "soft-reject" | "tick" | "start" | "go" | "end" | "combo" | "board" | "bank" | "navigate" | "warning",
    enabled: boolean
  ): void {
    if (!enabled) return;
    this.context ??= new AudioContext();
    const ctx = this.context;
    const soundMap = {
      accept: { notes: [620, 930], duration: .09, gain: .055, type: "sine" as OscillatorType },
      reject: { notes: [155, 120], duration: .12, gain: .045, type: "sawtooth" as OscillatorType },
      rule: { notes: [180, 135], duration: .13, gain: .05, type: "square" as OscillatorType },
      "soft-reject": { notes: [294, 262], duration: .1, gain: .025, type: "sine" as OscillatorType },
      tick: { notes: [420], duration: .045, gain: .038, type: "square" as OscillatorType },
      warning: { notes: [520], duration: .065, gain: .05, type: "square" as OscillatorType },
      start: { notes: [392], duration: .11, gain: .05, type: "sine" as OscillatorType },
      go: { notes: [523, 659, 784], duration: .24, gain: .045, type: "triangle" as OscillatorType },
      combo: { notes: [784, 988], duration: .16, gain: .04, type: "triangle" as OscillatorType },
      board: { notes: [392, 523, 659, 784], duration: .34, gain: .043, type: "triangle" as OscillatorType },
      bank: { notes: [330, 440, 554, 659, 880], duration: .42, gain: .06, type: "triangle" as OscillatorType },
      navigate: { notes: [this.theme === "studio" ? 440 : 392], duration: .045, gain: .018, type: "sine" as OscillatorType },
      end: { notes: [440, 349, 262], duration: .36, gain: .045, type: "triangle" as OscillatorType }
    } as const;
    const sound = soundMap[kind];
    sound.notes.forEach((frequency, index) => {
      const startAt = ctx.currentTime + index * (kind === "accept" ? .025 : .07);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = sound.type;
      osc.frequency.setValueAtTime(frequency, startAt);
      if (kind === "accept") osc.frequency.exponentialRampToValueAtTime(frequency * 1.035, startAt + sound.duration);
      gain.gain.setValueAtTime(.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(sound.gain * this.volume, startAt + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, startAt + sound.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + sound.duration + .02);
    });
  }

  playAccept(length: number, rarity: number, chain: number, enabled: boolean): void {
    if (!enabled) return;
    this.context ??= new AudioContext();
    const scale = this.theme === "studio" ? [262, 294, 330, 392, 440] : [220, 262, 294, 330, 392];
    const rung = Math.min(scale.length - 1, Math.max(0, length - 3 + Math.floor(chain / 2)));
    const notes = [scale[rung], scale[Math.min(scale.length - 1, rung + 1)]];
    if (rarity > 1) notes.push(Math.round(scale[rung] * (rarity >= 1.6 ? 2 : 1.5)));
    notes.forEach((frequency, index) => this.tone(frequency, index * .035, .12, .045, "triangle"));
  }

  playReject(reason: string, enabled: boolean): void {
    this.play(reason === "not-word" ? "soft-reject" : "rule", enabled);
  }

  private tone(frequency: number, delay: number, duration: number, level: number, type: OscillatorType): void {
    if (!this.context) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(level * this.volume, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  setMusic(enabled: boolean): void {
    if (!enabled || !this.context || this.volume === 0) {
      this.musicNodes.forEach((node) => node.stop());
      this.musicNodes = [];
      return;
    }
    if (this.musicNodes.length) return;
    const root = this.theme === "studio" ? 65.41 : 73.42;
    [root, root * 1.5].forEach((frequency) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = .006 * this.volume;
      oscillator.connect(gain).connect(this.context!.destination);
      oscillator.start();
      this.musicNodes.push(oscillator);
    });
  }
}
