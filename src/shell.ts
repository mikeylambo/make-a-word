export type ScreenId = "title" | "menu" | "modes" | "game" | "results" | "stats" | "settings" | "help";

export type SaveData = {
  bestScores: Record<string, number>;
  totalWords: number;
  totalScore: number;
  longestWord: string;
  roundsPlayed: number;
  daily: Record<string, number>;
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

  play(kind: "accept" | "reject" | "tick" | "start" | "end", enabled: boolean): void {
    if (!enabled) return;
    this.context ??= new AudioContext();
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const map = {
      accept: [620, 0.06],
      reject: [150, 0.09],
      tick: [380, 0.03],
      start: [520, 0.12],
      end: [220, 0.2]
    } as const;
    const [frequency, duration] = map[kind];
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
}
