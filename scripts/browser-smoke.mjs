import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';

async function waitForScreen(page, screen) {
  await page.waitForFunction((value) => document.querySelector('#app')?.dataset.screen === value, screen, { timeout: 15_000 });
}

async function waitForPlayableWordInput(page) {
  await page.waitForSelector('.word-entry input', { state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => {
    const input = document.querySelector('.word-entry input');
    return input instanceof HTMLInputElement && !input.disabled;
  }, null, { timeout: 15_000 });
}

async function desktopJourney(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await waitForScreen(page, 'menu');
  assert.equal(await page.locator('[data-mode="classic"]').count(), 1, `${engine}: Classic must be directly available from the menu`);
  assert.equal(await page.locator('[data-mode="daily"]').count(), 1, `${engine}: Daily must be directly available from the menu`);
  assert.equal(await page.locator('[data-mode="burn"]').count(), 1, `${engine}: Burn must be directly available from the menu`);

  await page.locator('[data-action="settings"]').first().click();
  await waitForScreen(page, 'settings');
  assert.equal(await page.locator('[data-action="settings-back"]').count(), 1, `${engine}: Settings must expose a back action`);
  await page.locator('[data-action="settings-back"]').click();
  await waitForScreen(page, 'menu');

  await page.locator('[data-mode="classic"]').click();
  await waitForScreen(page, 'game');
  await waitForPlayableWordInput(page);
  const input = page.locator('.word-entry input');
  await input.fill('XYZ');
  await input.press('Enter');
  await waitForScreen(page, 'game');
  assert.equal(await page.locator('#app[data-screen="settings"]').count(), 0, `${engine}: Enter inside word input must never open Settings`);

  // Give the round a real timer tick so its resumable snapshot is persisted.
  await page.waitForTimeout(1_250);
  const timeBeforeReload = await page.locator('.hud-stat strong').allTextContents();
  await page.reload({ waitUntil: 'networkidle' });
  await waitForScreen(page, 'game');
  await waitForPlayableWordInput(page);
  assert.equal(await page.locator('.word-entry input').count(), 1, `${engine}: recent solo run must restore after reload`);
  const timeAfterReload = await page.locator('.hud-stat strong').allTextContents();
  assert.ok(timeAfterReload.length > 0 && timeBeforeReload.length > 0, `${engine}: HUD must survive round reload recovery`);

  await context.close();
}

async function mobileJourney(browser, engine) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await waitForScreen(page, 'menu');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${engine}: mobile menu overflows horizontally by ${overflow}px`);

  await page.locator('[data-mode="classic"]').click();
  await waitForScreen(page, 'game');
  await waitForPlayableWordInput(page);
  const attrs = await page.locator('.word-entry input').evaluate((element) => ({
    enterkeyhint: element.getAttribute('enterkeyhint'),
    autocorrect: element.getAttribute('autocorrect'),
    autocapitalize: element.getAttribute('autocapitalize'),
    spellcheck: element.getAttribute('spellcheck')
  }));
  assert.deepEqual(attrs, {
    enterkeyhint: 'send',
    autocorrect: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false'
  }, `${engine}: mobile word-entry metadata drifted`);

  await page.locator('.word-entry input').fill('XYZ');
  await page.locator('.word-entry input').press('Enter');
  await waitForScreen(page, 'game');
  assert.equal(await page.locator('#app[data-screen="settings"]').count(), 0, `${engine}: mobile Enter must remain scoped to word submission`);

  await context.close();
}

async function offlineJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await waitForScreen(page, 'menu');
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  }, null, { timeout: 15_000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForScreen(page, 'menu');
  assert.equal(await page.locator('[data-mode="classic"]').count(), 1, 'Chromium: cached app shell must boot offline');
  await context.setOffline(false);
  await context.close();
}

const engines = [
  ['Chromium', chromium, true],
  ['Firefox', firefox, false],
  ['WebKit', webkit, true]
];

for (const [name, browserType, runMobile] of engines) {
  const browser = await browserType.launch({ headless: true });
  try {
    await desktopJourney(browser, name);
    if (runMobile) await mobileJourney(browser, name);
    if (name === 'Chromium') await offlineJourney(browser);
    console.log(`${name} browser smoke passed.`);
  } finally {
    await browser.close();
  }
}

console.log('Cross-browser smoke passed: Chromium, Firefox, and WebKit desktop journeys are stable; Chromium/WebKit mobile behavior is stable; Chromium offline app-shell recovery works.');
