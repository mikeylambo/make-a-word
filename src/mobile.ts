/** Viewport plumbing only: never owns round timing or scoring. */
export function installMobileExperience(root: HTMLElement): void {
  const page = document.documentElement;
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
    page.classList.toggle('touch-layout', matchMedia('(pointer: coarse)').matches);
  };
  const schedule = () => { if (!pending) pending = requestAnimationFrame(update); };
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  const prepareInputs = () => {
    root.querySelectorAll<HTMLInputElement>('.word-entry input').forEach(input => {
      input.setAttribute('enterkeyhint', 'send');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('spellcheck', 'false');
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
