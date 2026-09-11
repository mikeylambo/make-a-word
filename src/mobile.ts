/** Viewport plumbing only: never owns round timing or scoring. */
export function installMobileExperience(root: HTMLElement): void {
  const page = document.documentElement;
  const coarsePointer = matchMedia('(pointer: coarse)');
  let pending = 0;

  const update = () => {
    pending = 0;
    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    const editing = document.activeElement?.matches('input:not([type="range"]), textarea') ?? false;
    const keyboard = editing && window.innerHeight - height > 120;
    page.style.setProperty('--visible-height', `${Math.round(height)}px`);
    page.style.setProperty('--visible-top', `${Math.round(viewport?.offsetTop ?? 0)}px`);
    page.classList.toggle('keyboard-open', keyboard);
    page.classList.toggle('touch-layout', coarsePointer.matches);
  };

  const schedule = () => {
    if (!pending) pending = requestAnimationFrame(update);
  };

  const settleViewport = () => {
    schedule();
    // Mobile Safari/Chrome can report an intermediate viewport while rotating,
    // restoring from the app switcher, or collapsing browser chrome.
    window.setTimeout(schedule, 150);
    window.setTimeout(schedule, 500);
  };

  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', settleViewport);
  window.addEventListener('pageshow', settleViewport);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) settleViewport();
  });
  coarsePointer.addEventListener?.('change', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);

  const prepareInputs = () => {
    root.querySelectorAll<HTMLInputElement>('.word-entry input').forEach(input => {
      input.setAttribute('enterkeyhint', 'send');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('autocapitalize', 'characters');
    });
    schedule();
  };

  new MutationObserver(prepareInputs).observe(root, { childList: true, subtree: true });

  // Keep the native keyboard alive when banking or submitting by touch.
  root.addEventListener('pointerdown', event => {
    const target = event.target as Element;
    if (target.closest('.submit-word, .chain-cash') && document.activeElement?.matches('.word-entry input')) {
      event.preventDefault();
    }
  });

  prepareInputs();
}
