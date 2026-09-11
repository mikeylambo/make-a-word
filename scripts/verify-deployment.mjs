import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const worker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

assert.ok(Array.isArray(config.headers), 'vercel headers configuration is missing');

function headerRule(source) {
  return config.headers.find((entry) => entry.source === source);
}
function headerValue(rule, key) {
  return rule?.headers?.find((entry) => entry.key.toLowerCase() === key.toLowerCase())?.value;
}

const swRule = headerRule('/sw.js');
const manifestRule = headerRule('/manifest.webmanifest');
const globalRule = headerRule('/(.*)');

assert.ok(swRule, 'service worker cache policy is missing');
assert.ok(manifestRule, 'manifest cache policy is missing');
assert.match(headerValue(swRule, 'Cache-Control') ?? '', /max-age=0/);
assert.match(headerValue(swRule, 'Cache-Control') ?? '', /must-revalidate/);
assert.match(headerValue(manifestRule, 'Cache-Control') ?? '', /max-age=0/);
assert.equal(headerValue(globalRule, 'X-Content-Type-Options'), 'nosniff');
assert.equal(headerValue(globalRule, 'Referrer-Policy'), 'same-origin');
assert.equal(headerValue(globalRule, 'Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');

assert.ok(worker.includes('const CACHE_NAME = "make-a-word-runtime-v2"'), 'offline cache schema must be versioned after install-asset changes');
for (const icon of ['/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png']) {
  assert.ok(worker.includes(`"${icon}"`), `offline install cache is missing ${icon}`);
}
assert.ok(worker.includes('.filter((key) => key.startsWith("make-a-word-") && key !== CACHE_NAME)'), 'obsolete app caches must be removed on activation');

console.log('Deployment gate passed: worker/manifest freshness, global safe headers, versioned offline cache cleanup, and native install assets are protected.');
