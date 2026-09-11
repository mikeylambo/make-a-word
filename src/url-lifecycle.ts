import { loadOnlineCredentials } from "./online-client";

function replaceSearch(mutator: (params: URLSearchParams) => void): void {
  const url = new URL(location.href);
  mutator(url.searchParams);
  url.hash = "";
  history.replaceState(history.state ?? {}, "", `${url.pathname}${url.search}`);
}

function removeParam(name: string): void {
  if (!new URLSearchParams(location.search).has(name)) return;
  replaceSearch((params) => params.delete(name));
}

function clearConsumedRoomLink(): void {
  const code = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  if (!/^[A-Z0-9]{6}$/.test(code)) return;
  if (!loadOnlineCredentials(code)) removeParam("room");
}

// Deep-link parameters are invitations, not permanent navigation state. Once
// the app has consumed a challenge or returned from room flow, leaving the
// query in place makes a later refresh unexpectedly reopen the old invite.
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
  const action = target?.dataset.action;
  if (action === "play-challenge" || action === "dismiss-challenge") removeParam("challenge");
  if (action === "multiplayer" || action === "online-cancel") removeParam("room");
});

// `main.ts` consumes the initial room code before DOMContentLoaded. A new
// visitor has no room credential yet, so the join form keeps the code in its
// own input while the URL is cleaned. Existing room members keep the deep link
// so reload/reconnect remains durable.
window.addEventListener("DOMContentLoaded", clearConsumedRoomLink, { once: true });

// A terminal room failure clears credentials asynchronously. Re-check once
// after the network request timeout window so expired/not-found invites do not
// become sticky refresh loops. Transient failures retain credentials and URL.
window.setTimeout(clearConsumedRoomLink, 9_000);
