function canRegisterServiceWorker(): boolean {
  if (!("serviceWorker" in navigator)) return false;
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

export function installPwaLifecycle(): void {
  if (!canRegisterServiceWorker()) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Offline support is progressive enhancement. A registration failure
      // must never prevent the game itself from starting.
    });
  }, { once: true });
}

installPwaLifecycle();
