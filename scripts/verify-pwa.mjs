import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const lifecycle = fs.readFileSync(new URL('../src/pwa.ts', import.meta.url), 'utf8');

assert.equal(manifest.name, 'Make a Word');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.theme_color, '#0b1020');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest needs install icons');
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'), 'manifest needs a 192px icon');
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'), 'manifest needs a 512px icon');
for (const icon of manifest.icons) {
  const path = new URL(`../public${icon.src}`, import.meta.url);
  assert.ok(fs.existsSync(path), `missing manifest icon: ${icon.src}`);
}

assert.ok(index.includes('rel="manifest" href="/manifest.webmanifest"'), 'index must link the manifest');
assert.ok(index.includes('src="/src/pwa.ts"'), 'index must boot the PWA lifecycle');
assert.ok(lifecycle.includes('navigator.serviceWorker.register("/sw.js"'), 'service worker registration is missing');
assert.ok(lifecycle.includes('updateViaCache: "none"'), 'service worker updates must bypass HTTP cache');
assert.ok(lifecycle.includes('.catch(() =>'), 'registration failure must remain non-fatal');
assert.ok(!lifecycle.includes('location.reload'), 'worker updates must not force-reload an active round');

assert.ok(worker.includes('if (request.method !== "GET") return;'), 'non-GET requests must never enter runtime cache');
assert.ok(worker.includes('if (url.origin !== self.location.origin) return;'), 'cross-origin responses must not enter runtime cache');
assert.ok(worker.includes('if (url.pathname.startsWith("/api/")) return;'), 'online/API traffic must never be cached');
assert.ok(worker.includes('request.mode === "navigate"'), 'navigation fallback is missing');
assert.ok(worker.includes('const shell = await cache.match("/")'), 'offline navigation must fall back to the cached shell');
assert.ok(worker.includes('fetch(request)'), 'runtime strategy must try the network before cache');
assert.ok(worker.includes('cache.put(request, response.clone())'), 'successful runtime responses must refresh the cache');
assert.ok(worker.includes('self.skipWaiting()'), 'new worker should activate without waiting on a closed tab');
assert.ok(worker.includes('self.clients.claim()'), 'activated worker must claim existing clients');
assert.ok(worker.includes('/(?:src|href)='), 'install step must discover Vite-built shell assets');

console.log('PWA lifecycle gate passed: install metadata is complete, built shell assets are discoverable, navigation has an offline fallback, API traffic stays network-only, and worker updates never force-reload active play.');
