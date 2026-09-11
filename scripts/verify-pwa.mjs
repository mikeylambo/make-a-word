import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const lifecycle = fs.readFileSync(new URL('../src/pwa.ts', import.meta.url), 'utf8');

function pngSize(url) {
  const buffer = fs.readFileSync(url);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', `not a PNG: ${url.pathname}`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

assert.equal(manifest.id, '/');
assert.equal(manifest.name, 'Make a Word');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.theme_color, '#0b1020');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest needs install icons');

for (const size of [192, 512]) {
  const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
  assert.ok(icon, `manifest needs a ${size}px icon`);
  assert.equal(icon.type, 'image/png', `${size}px install icon must be PNG`);
  const path = new URL(`../public${icon.src}`, import.meta.url);
  assert.ok(fs.existsSync(path), `missing manifest icon: ${icon.src}`);
  assert.deepEqual(pngSize(path), { width: size, height: size }, `${icon.src} dimensions are wrong`);
}

const appleIcon = new URL('../public/icons/icon-180.png', import.meta.url);
assert.ok(fs.existsSync(appleIcon), 'iOS home-screen icon is missing');
assert.deepEqual(pngSize(appleIcon), { width: 180, height: 180 }, 'iOS home-screen icon must be 180x180');

assert.ok(index.includes('rel="manifest" href="/manifest.webmanifest"'), 'index must link the manifest');
assert.ok(index.includes('rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png"'), 'index must expose the native iOS touch icon');
assert.ok(index.includes('name="apple-mobile-web-app-title" content="Make a Word"'), 'iOS standalone title is missing');
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

console.log('PWA lifecycle gate passed: native install icons, iOS standalone metadata, built shell discovery, offline navigation fallback, API isolation, and non-disruptive worker updates are intact.');
