export type ScreenId = "title" | "menu" | "modes" | "journey" | "game" | "results" | "stats" | "settings" | "help";

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
  settings: {
    sound: boolean;
    reducedMotion: boolean;
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
  settings: { sound: true, reducedMotion: false }
};

export class SaveStore {
  constructor(private readonly key = "slu.make-a-word.save.v1") {}

  load(): SaveData {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        ...structuredClone(DEFAULT_SAVE),
        ...parsed,
        bestScores: { ...DEFAULT_SAVE.bestScores, ...(parsed.bestScores ?? {}) },
        daily: { ...DEFAULT_SAVE.daily, ...(parsed.daily ?? {}) },
        journeyScores: { ...DEFAULT_SAVE.journeyScores, ...(parsed.journeyScores ?? {}) },
        journeyMedals: { ...DEFAULT_SAVE.journeyMedals, ...(parsed.journeyMedals ?? {}) },
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
    this.focusFirst();
    return this.root;
  }

  getCurrent(): ScreenId {
    return this.current;
  }

  focusFirst(): void {
    requestAnimationFrame(() => {
      const first = this.root.querySelector<HTMLElement>("[data-nav]:not([disabled])");
      first?.focus({ preventScroll: true });
    });
  }
}

export class MenuNavigator {
  constructor(private readonly root: HTMLElement) {
    window.addEventListener("keydown", (event) => this.onKey(event));
  }

  private onKey(event: KeyboardEvent): void {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches("input, textarea")) return;
    const items = [...this.root.querySelectorAll<HTMLElement>("[data-nav]:not([disabled])")];
    if (!items.length) return;
    event.preventDefault();
    const index = Math.max(0, items.indexOf(active ?? items[0]));
    const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
    items[(index + direction + items.length) % items.length]?.focus();
  }
}

export class TinyAudio {
  private context?: AudioContext;

  play(
    kind: "accept" | "reject" | "tick" | "start" | "go" | "end" | "combo" | "board" | "warning",
    enabled: boolean
  ): void {
    if (!enabled) return;
    this.context ??= new AudioContext();
    const ctx = this.context;
    const soundMap = {
      accept: { notes: [620, 930], duration: .09, gain: .055, type: "sine" as OscillatorType },
      reject: { notes: [155, 120], duration: .12, gain: .045, type: "sawtooth" as OscillatorType },
      tick: { notes: [420], duration: .045, gain: .038, type: "square" as OscillatorType },
      warning: { notes: [520], duration: .065, gain: .05, type: "square" as OscillatorType },
      start: { notes: [392], duration: .11, gain: .05, type: "sine" as OscillatorType },
      go: { notes: [523, 659, 784], duration: .24, gain: .045, type: "triangle" as OscillatorType },
      combo: { notes: [784, 988], duration: .16, gain: .04, type: "triangle" as OscillatorType },
      board: { notes: [392, 523, 659, 784], duration: .34, gain: .043, type: "triangle" as OscillatorType },
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
      gain.gain.exponentialRampToValueAtTime(sound.gain, startAt + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, startAt + sound.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + sound.duration + .02);
    });
  }
}
