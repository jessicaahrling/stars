// Smoke test in headless Chromium: the sky renders, a constellation can be picked
// from the sky and from the list, and marking works. Screenshots land in
// test/e2e/screenshots/ (git-ignored).
//
//   npm run test:e2e
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/screenshots');
await mkdir(shots, { recursive: true });
const url = pathToFileURL(path.join(root, 'index.html')).href;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const errors = [];

async function openPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // Web fonts are optional; offline runs fall back to system fonts.
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|net::/.test(m.text())) errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.stjarnhimlen);
  // 15 January 2026, 22:00 in Stockholm, facing south.
  await page.evaluate(() => {
    const app = window.stjarnhimlen;
    app.setTime(Date.UTC(2026, 0, 15, 21, 0));
    app.setSpeed(0);
    Object.assign(app.view, { az: 180, alt: 30, fov: 110 });
    app.invalidate();
  });
  await settle(page);
  return page;
}

/** Waits until the latest change has been drawn (picking uses the drawn frame). */
async function settle(page) {
  await page.waitForFunction(() => !window.stjarnhimlen.dirty && !window.stjarnhimlen.anim);
}

/** Screen position of a constellation's framing centre. */
function centerOf(page, id) {
  return page.evaluate((cid) => {
    const app = window.stjarnhimlen;
    const p = {};
    app.view.projectEq(app.catalog.byId.get(cid).centerVec, p);
    return p;
  }, id);
}

try {
  const page = await openPage({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(shots, 'desktop-south.png') });

  const orion = await centerOf(page, 'Ori');
  await page.mouse.click(orion.x, orion.y);
  await page.waitForSelector('#card:not([hidden]) h3');
  assert.equal(await page.textContent('#card h3'), 'Orion');
  assert.match(await page.textContent('#card .facts'), /Uppe nu/);

  await page.click('#card .chip.primary');
  assert.equal(await page.textContent('#mark-count'), '1');
  await page.screenshot({ path: path.join(shots, 'desktop-orion-marked.png') });

  await page.click('#btn-list');
  await page.fill('#search', 'lejon');
  const rows = await page.$$eval('#con-list li:not([hidden]) strong', (els) => els.map((e) => e.textContent));
  assert.deepEqual(rows, ['Lejonet', 'Lilla lejonet']);
  await page.click('#con-list li:not([hidden]) .con-name');
  await page.waitForFunction(() => document.querySelector('#card h3')?.textContent === 'Lejonet');

  await page.fill('#search', '');
  const before = await page.textContent('#filter-count');
  await page.click('#btn-list-close');
  await page.click('#btn-when');
  await page.selectOption('#place', 'kiruna');
  assert.equal(await page.textContent('#when-place'), 'Kiruna');
  assert.notEqual(await page.textContent('#filter-count'), before, 'fewer constellations rise in Kiruna');
  await page.click('#btn-when');

  // Clicking the ground selects nothing.
  await page.evaluate(() => {
    Object.assign(window.stjarnhimlen.view, { alt: -60 });
    window.stjarnhimlen.invalidate();
  });
  await settle(page);
  await page.mouse.click(150, 250);
  assert.equal(await page.isHidden('#card'), true);

  const phone = await openPage({ width: 390, height: 844 });
  await phone.evaluate(() => window.stjarnhimlen.select(window.stjarnhimlen.catalog.byId.get('UMa').index, { fly: true }));
  await settle(phone);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `no horizontal scroll on phones (overflow ${overflow}px)`);
  await phone.screenshot({ path: path.join(shots, 'phone-ursa-major.png') });

  assert.deepEqual(errors, [], 'no errors in the console');
  console.log('e2e smoke: ok');
} finally {
  await browser.close();
}
