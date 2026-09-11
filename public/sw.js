const CACHE_NAME = "make-a-word-runtime-v2";
const CORE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192.svg"
];

async function cacheResponse(cache, request, response) {
  if (!response || !response.ok || response.type === "opaque") return response;
  await cache.put(request, response.clone());
  return response;
}

async function precacheBuiltShell() {
  const cache = await caches.open(CACHE_NAME);
  const root = await fetch("/", { cache: "no-store" });
  if (!root.ok) throw new Error("Unable to fetch app shell");
  const html = await root.clone().text();
  await cache.put("/", root);

  const builtAssets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)]
    .map((match) => match[1]);
  const urls = [...new Set([...CORE_URLS.slice(1), ...builtAssets])];
  await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      await cacheResponse(cache, url, response);
    } catch {
      // A non-critical asset must not prevent the worker from installing.
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheBuiltShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("make-a-word-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, navigationFallback = false) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    return await cacheResponse(cache, request, response);
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (navigationFallback) {
      const shell = await cache.match("/");
      if (shell) return shell;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(networkFirst(request, request.mode === "navigate"));
});
