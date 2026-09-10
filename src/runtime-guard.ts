const root = document.querySelector<HTMLElement>("#app");

let backgroundPauseTimer: number | null = null;

function clearBackgroundPauseTimer(): void {
  if (backgroundPauseTimer !== null) window.clearInterval(backgroundPauseTimer);
  backgroundPauseTimer = null;
}

function ensureBackgroundPaused(): void {
  if (!root || !document.hidden) {
    clearBackgroundPauseTimer();
    return;
  }

  const screen = root.dataset.screen;
  if (screen !== "game" && screen !== "multiplayer-game") {
    clearBackgroundPauseTimer();
    return;
  }
  if (root.querySelector(".pause-card")) {
    clearBackgroundPauseTimer();
    return;
  }

  const selector = screen === "game" ? '[data-action="pause"]' : '[data-action="pause-together"]';
  const pause = root.querySelector<HTMLButtonElement>(selector);
  if (pause && !pause.disabled) {
    pause.click();
    if (root.querySelector(".pause-card")) clearBackgroundPauseTimer();
  }
}

function armBackgroundPause(): void {
  clearBackgroundPauseTimer();
  if (!document.hidden) return;
  ensureBackgroundPaused();
  // If the app was backgrounded during a countdown/deal, the pause control can
  // still be disabled. Keep checking until the playable state becomes pausable.
  if (document.hidden && !root?.querySelector(".pause-card")) {
    backgroundPauseTimer = window.setInterval(ensureBackgroundPaused, 250);
  }
}

document.addEventListener("visibilitychange", armBackgroundPause);
window.addEventListener("pagehide", armBackgroundPause);
window.addEventListener("pageshow", clearBackgroundPauseTimer);
