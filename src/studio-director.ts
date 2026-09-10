import "./studio-director.css";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  spin: number;
  angle: number;
  kind: "spark" | "confetti";
};

const MODE_COLORS: Record<string, string> = {
  classic: "#ffd34f",
  daily: "#4fdcff",
  burn: "#ff5c45",
  trials: "#be6cff",
  together: "#54f39a"
};

function modeForElement(element: Element | null): string {
  if (!(element instanceof HTMLElement)) return "classic";
  if (element.classList.contains("studio-mode--daily")) return "daily";
  if (element.classList.contains("studio-mode--burn")) return "burn";
  if (element.classList.contains("studio-mode--trials")) return "trials";
  if (element.classList.contains("studio-mode--together")) return "together";
  return "classic";
}

class StudioDirector {
  private readonly app: HTMLElement;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly flash: HTMLElement;
  private particles: Particle[] = [];
  private frame = 0;
  private width = 1;
  private height = 1;
  private lastTime = performance.now();
  private menu: HTMLElement | null = null;
  private menuCleanup: (() => void) | null = null;
  private syncQueued = false;
  private attractTimer = 0;
  private lastCombo = "";
  private lastScore = "";
  private visible = !document.hidden;

  constructor(app: HTMLElement) {
    this.app = app;
    const overlay = document.createElement("div");
    overlay.className = "studio-director-overlay";
    overlay.setAttribute("aria-hidden", "true");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "studio-director-canvas";
    this.flash = document.createElement("div");
    this.flash.className = "studio-director-flash";
    overlay.append(this.canvas, this.flash);
    document.body.append(overlay);
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("StudioDirector requires canvas 2D support");
    this.ctx = context;
    this.resize();

    new ResizeObserver(() => this.resize()).observe(document.documentElement);
    new MutationObserver((records) => this.onMutations(records)).observe(this.app, {
      subtree: true,
      childList: true,
      characterData: true
    });
    document.addEventListener("visibilitychange", () => {
      this.visible = !document.hidden;
      if (this.visible && !this.frame) this.frame = requestAnimationFrame((time) => this.tick(time));
    });
    this.reducedMotion.addEventListener?.("change", () => this.sync());
    this.sync();
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  private resize(): void {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(this.width * ratio));
    this.canvas.height = Math.max(1, Math.round(this.height * ratio));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private onMutations(records: MutationRecord[]): void {
    let needsSync = false;
    for (const record of records) {
      if (record.type === "characterData") {
        const parent = record.target.parentElement;
        if (parent?.id === "combo-value") this.comboChanged(parent.textContent ?? "");
        if (parent?.id === "score-value") this.scoreChanged(parent.textContent ?? "");
        continue;
      }
      needsSync = true;
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const scoreImpact = node.matches(".score-impact") ? node : node.querySelector<HTMLElement>(".score-impact");
        if (scoreImpact) this.wordAccepted(scoreImpact);
        const boardClear = node.matches(".event-card--board-clear") ? node : node.querySelector<HTMLElement>(".event-card--board-clear");
        if (boardClear) this.boardCleared(boardClear);
        const entering = node.matches(".phrase-display--entering") ? node : node.querySelector<HTMLElement>(".phrase-display--entering");
        if (entering) this.newBoard(entering);
      }
      const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      if (target?.id === "combo-value") this.comboChanged(target.textContent ?? "");
      if (target?.id === "score-value") this.scoreChanged(target.textContent ?? "");
    }
    if (needsSync) this.queueSync();
  }

  private queueSync(): void {
    if (this.syncQueued) return;
    this.syncQueued = true;
    requestAnimationFrame(() => {
      this.syncQueued = false;
      this.sync();
    });
  }

  private sync(): void {
    const nextMenu = this.app.querySelector<HTMLElement>(".studio-menu--layered");
    if (nextMenu !== this.menu) {
      this.menuCleanup?.();
      this.menuCleanup = null;
      this.menu = nextMenu;
      if (nextMenu) this.menuCleanup = this.bindMenu(nextMenu);
    }
    document.body.classList.toggle("studio-director-menu-active", Boolean(nextMenu));
    const combo = this.app.querySelector<HTMLElement>("#combo-value");
    const score = this.app.querySelector<HTMLElement>("#score-value");
    if (combo && !this.lastCombo) this.lastCombo = combo.textContent ?? "";
    if (score && !this.lastScore) this.lastScore = score.textContent ?? "";
  }

  private bindMenu(menu: HTMLElement): () => void {
    menu.classList.add("studio-directed", "studio-entering");
    const stage = document.createElement("div");
    stage.className = "studio-stage-live";
    stage.setAttribute("aria-hidden", "true");
    stage.innerHTML = `
      <div class="studio-stage-beams"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="studio-stage-glow"></div>
      <div class="studio-stage-floor"></div>
    `;
    menu.prepend(stage);
    requestAnimationFrame(() => menu.classList.add("studio-entered"));
    window.setTimeout(() => menu.classList.remove("studio-entering"), 1200);

    const controller = new AbortController();
    const signal = controller.signal;
    let focusedMode: HTMLElement | null = null;

    const focusMode = (mode: HTMLElement | null) => {
      if (focusedMode === mode) return;
      focusedMode?.classList.remove("studio-mode--directed-focus");
      focusedMode = mode;
      if (!mode) {
        menu.removeAttribute("data-studio-focus");
        return;
      }
      const id = modeForElement(mode);
      menu.dataset.studioFocus = id;
      mode.classList.add("studio-mode--directed-focus");
      this.sparkElement(mode, MODE_COLORS[id], this.reducedMotion.matches ? 2 : 8);
    };

    menu.addEventListener("pointerover", (event) => {
      const mode = (event.target as Element | null)?.closest<HTMLElement>(".studio-mode");
      if (mode && mode.contains(event.relatedTarget as Node | null)) return;
      if (mode) focusMode(mode);
    }, { signal });
    menu.addEventListener("pointerout", (event) => {
      const mode = (event.target as Element | null)?.closest<HTMLElement>(".studio-mode");
      if (!mode || mode.contains(event.relatedTarget as Node | null)) return;
      const next = (event.relatedTarget as Element | null)?.closest<HTMLElement>(".studio-mode") ?? null;
      focusMode(next);
    }, { signal });
    menu.addEventListener("focusin", (event) => focusMode((event.target as Element | null)?.closest<HTMLElement>(".studio-mode") ?? null), { signal });
    menu.addEventListener("focusout", (event) => {
      const next = (event.relatedTarget as Element | null)?.closest<HTMLElement>(".studio-mode") ?? null;
      focusMode(next);
    }, { signal });
    menu.addEventListener("pointerdown", (event) => {
      const mode = (event.target as Element | null)?.closest<HTMLElement>(".studio-mode");
      if (!mode) return;
      const id = modeForElement(mode);
      mode.classList.add("studio-mode--directed-press");
      window.setTimeout(() => mode.classList.remove("studio-mode--directed-press"), 180);
      this.sparkElement(mode, MODE_COLORS[id], this.reducedMotion.matches ? 3 : 14);
    }, { signal });
    menu.addEventListener("click", (event) => {
      const mode = (event.target as Element | null)?.closest<HTMLElement>(".studio-mode");
      if (!mode) return;
      const id = modeForElement(mode);
      this.selectMode(mode, id);
    }, { capture: true, signal });

    const resetAttract = () => this.scheduleAttract(menu);
    menu.addEventListener("pointermove", resetAttract, { signal, passive: true });
    menu.addEventListener("keydown", resetAttract, { signal });
    this.scheduleAttract(menu);

    return () => {
      controller.abort();
      window.clearTimeout(this.attractTimer);
      stage.remove();
      menu.classList.remove("studio-directed", "studio-entering", "studio-entered");
    };
  }

  private scheduleAttract(menu: HTMLElement): void {
    window.clearTimeout(this.attractTimer);
    if (this.reducedMotion.matches) return;
    this.attractTimer = window.setTimeout(() => {
      if (!menu.isConnected || menu.matches(":focus-within") || menu.matches(":hover")) {
        this.scheduleAttract(menu);
        return;
      }
      const modes = [...menu.querySelectorAll<HTMLElement>(".studio-mode")];
      const mode = modes[Math.floor(Math.random() * modes.length)];
      if (mode) {
        const id = modeForElement(mode);
        menu.dataset.studioFocus = id;
        mode.classList.add("studio-mode--attract");
        this.sparkElement(mode, MODE_COLORS[id], 6);
        window.setTimeout(() => {
          mode.classList.remove("studio-mode--attract");
          if (!menu.matches(":hover") && !menu.matches(":focus-within")) menu.removeAttribute("data-studio-focus");
        }, 1250);
      }
      this.scheduleAttract(menu);
    }, 6500);
  }

  private selectMode(element: HTMLElement, id: string): void {
    document.body.dataset.studioTransition = id;
    this.flash.style.setProperty("--studio-flash-color", MODE_COLORS[id]);
    this.flash.classList.remove("studio-director-flash--go");
    void this.flash.offsetWidth;
    this.flash.classList.add("studio-director-flash--go");
    this.sparkElement(element, MODE_COLORS[id], this.reducedMotion.matches ? 6 : 28);
    window.setTimeout(() => {
      delete document.body.dataset.studioTransition;
      this.flash.classList.remove("studio-director-flash--go");
    }, 520);
  }

  private wordAccepted(element: HTMLElement): void {
    const major = element.classList.contains("score-impact--major");
    const combo = element.classList.contains("score-impact--combo");
    const color = major ? "#ffe36a" : combo ? "#55dfff" : "#ffffff";
    this.sparkElement(element, color, this.reducedMotion.matches ? 3 : major ? 32 : combo ? 22 : 14);
    document.body.classList.remove("studio-word-hit", "studio-word-hit--major");
    void document.body.offsetWidth;
    document.body.classList.add("studio-word-hit", ...(major ? ["studio-word-hit--major"] : []));
    window.setTimeout(() => document.body.classList.remove("studio-word-hit", "studio-word-hit--major"), 420);
  }

  private comboChanged(value: string): void {
    if (!value || value === this.lastCombo) return;
    const previous = Number(this.lastCombo.replace(/[^0-9.]/g, "")) || 1;
    const next = Number(value.replace(/[^0-9.]/g, "")) || 1;
    this.lastCombo = value;
    if (next <= previous || next <= 1) return;
    const combo = this.app.querySelector<HTMLElement>("#combo-value");
    if (combo) this.sparkElement(combo, next >= 5 ? "#ffe36a" : "#64e4ff", this.reducedMotion.matches ? 2 : Math.min(18, 4 + next * 2));
  }

  private scoreChanged(value: string): void {
    if (!value || value === this.lastScore) return;
    this.lastScore = value;
    const score = this.app.querySelector<HTMLElement>("#score-value");
    if (!score) return;
    score.classList.remove("studio-score-punch");
    void score.offsetWidth;
    score.classList.add("studio-score-punch");
    window.setTimeout(() => score.classList.remove("studio-score-punch"), 320);
  }

  private boardCleared(element: HTMLElement): void {
    this.flash.style.setProperty("--studio-flash-color", "#ffe16a");
    this.flash.classList.remove("studio-director-flash--board");
    void this.flash.offsetWidth;
    this.flash.classList.add("studio-director-flash--board");
    this.confettiFrom(element, this.reducedMotion.matches ? 10 : 64);
    document.body.classList.add("studio-board-clear");
    window.setTimeout(() => {
      document.body.classList.remove("studio-board-clear");
      this.flash.classList.remove("studio-director-flash--board");
    }, 900);
  }

  private newBoard(element: HTMLElement): void {
    if (this.reducedMotion.matches) return;
    this.sparkElement(element, "#65dfff", 12);
  }

  private sparkElement(element: HTMLElement, color: string, count: number): void {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = rect.left + rect.width * .5;
    const y = rect.top + rect.height * .5;
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 150;
      this.particles.push({
        x: x + (Math.random() - .5) * rect.width * .45,
        y: y + (Math.random() - .5) * rect.height * .35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 28,
        gravity: 55,
        life: .45 + Math.random() * .55,
        maxLife: .45 + Math.random() * .55,
        size: 1.5 + Math.random() * 3.5,
        color,
        spin: 0,
        angle: 0,
        kind: "spark"
      });
    }
  }

  private confettiFrom(element: HTMLElement, count: number): void {
    const rect = element.getBoundingClientRect();
    const colors = ["#ffe16a", "#ffffff", "#5fe1ff", "#66f3a5", "#c47bff"];
    for (let index = 0; index < count; index += 1) {
      const life = 1.2 + Math.random() * 1.4;
      this.particles.push({
        x: rect.left + rect.width * (.2 + Math.random() * .6),
        y: rect.top + rect.height * .45,
        vx: (Math.random() - .5) * 420,
        vy: -160 - Math.random() * 360,
        gravity: 520,
        life,
        maxLife: life,
        size: 3 + Math.random() * 6,
        color: colors[index % colors.length],
        spin: (Math.random() - .5) * 12,
        angle: Math.random() * Math.PI,
        kind: "confetti"
      });
    }
  }

  private tick(time: number): void {
    this.frame = 0;
    if (!this.visible) return;
    const dt = Math.min(.034, Math.max(.001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (this.menu && !this.reducedMotion.matches && Math.random() < dt * 5 && this.particles.length < 120) {
      const menuRect = this.menu.getBoundingClientRect();
      const life = .8 + Math.random() * 1.4;
      this.particles.push({
        x: menuRect.left + Math.random() * menuRect.width,
        y: menuRect.top + menuRect.height * (.12 + Math.random() * .65),
        vx: (Math.random() - .5) * 12,
        vy: -7 - Math.random() * 14,
        gravity: 0,
        life,
        maxLife: life,
        size: .8 + Math.random() * 1.8,
        color: Math.random() > .5 ? "#ffffff" : "#6ddfff",
        spin: 0,
        angle: 0,
        kind: "spark"
      });
    }

    const alive: Particle[] = [];
    for (const particle of this.particles) {
      particle.life -= dt;
      if (particle.life <= 0) continue;
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.angle += particle.spin * dt;
      const alpha = Math.min(1, particle.life / Math.max(.001, particle.maxLife) * 1.4);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.translate(particle.x, particle.y);
      this.ctx.rotate(particle.angle);
      this.ctx.fillStyle = particle.color;
      if (particle.kind === "confetti") this.ctx.fillRect(-particle.size, -particle.size * .55, particle.size * 2, particle.size * 1.1);
      else {
        this.ctx.shadowBlur = 9;
        this.ctx.shadowColor = particle.color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
      alive.push(particle);
    }
    this.particles = alive.slice(-220);
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }
}

const app = document.querySelector<HTMLElement>("#app");
if (app && !document.documentElement.dataset.studioDirector) {
  document.documentElement.dataset.studioDirector = "1";
  new StudioDirector(app);
}
