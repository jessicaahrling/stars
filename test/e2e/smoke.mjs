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
  // The tap also showed Orion's illustration; the card's button hides it again.
  const orionArt = () => page.evaluate(() => window.stjarnhimlen.artShown(window.stjarnhimlen.catalog.byId.get('Ori').index));
  assert.equal(await orionArt(), true, 'tapping a constellation shows its illustration');
  assert.equal(await page.textContent('#card [data-action="art"]'), 'Dölj illustration');
  await page.click('#card [data-action="art"]');
  assert.equal(await orionArt(), false);
  assert.equal(await page.textContent('#card [data-action="art"]'), 'Visa illustration');

  await page.click('#card .chip.primary');
  assert.equal(await page.textContent('#mark-count'), '1');
  await page.screenshot({ path: path.join(shots, 'desktop-orion-marked.png') });

  // "Bara figurstjärnor" hides every star outside the stick figures.
  // Drawn stars as "index@x,y", plus which of them are figure stars.
  const drawn = () => page.evaluate(() => {
    const app = window.stjarnhimlen;
    const all = [];
    const figure = [];
    app.skyLayer.px.forEach((x, i) => {
      if (Number.isNaN(x)) return;
      const key = `${i}@${x.toFixed(2)},${app.skyLayer.py[i].toFixed(2)}`;
      all.push(key);
      if (app.catalog.stars.inFigure[i]) figure.push(key);
    });
    return { all, figure };
  });
  const full = await drawn();
  await page.click('[data-layer="figureStarsOnly"]');
  await settle(page);
  assert.equal(await page.getAttribute('[data-layer="figureStarsOnly"]', 'aria-pressed'), 'true');
  const figureOnly = await drawn();
  assert.ok(full.figure.length > 20 && full.figure.length < full.all.length);
  assert.deepEqual(figureOnly.all, full.figure, 'exactly the figure stars stay, in the same places');
  await page.screenshot({ path: path.join(shots, 'desktop-figure-stars.png') });
  await page.click('[data-layer="figureStarsOnly"]');
  await settle(page);
  assert.deepEqual((await drawn()).all, full.all);

  // "Illustrationer" draws each constellation's figure under the stars.
  const ink = () => page.evaluate(() => {
    const canvas = document.getElementById('layer-stars');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) sum += data[i];
    return Math.round(sum / 255);
  });
  // Chromium may switch a canvas that is read back often to another rasterizer, which
  // changes anti-aliasing slightly, so compare the total amount of ink (summed alpha).
  await page.hover('[data-layer="art"]');
  await settle(page);
  const bare = await ink();
  await page.click('[data-layer="art"]');
  await settle(page);
  assert.equal(await page.getAttribute('[data-layer="art"]', 'aria-pressed'), 'true');
  const inked = await ink();
  assert.ok(inked > bare * 1.05, `illustrations add ink (${bare} -> ${inked})`);
  await page.screenshot({ path: path.join(shots, 'desktop-art.png') });
  await page.click('[data-layer="art"]');
  await settle(page);
  const after = await ink();
  assert.ok(Math.abs(after - bare) < bare * 0.02, `turning illustrations off removes them (${bare} -> ${after})`);

  // A tap on a constellation toggles just its illustration (the tap also selects it,
  // which highlights its figure, so compare with it selected and its illustration off).
  const taurus = await centerOf(page, 'Tau');
  const taurusArt = () => page.evaluate(() => window.stjarnhimlen.artShown(window.stjarnhimlen.catalog.byId.get('Tau').index));
  await page.mouse.click(taurus.x, taurus.y);
  await settle(page);
  assert.equal(await taurusArt(), true, 'first tap shows the illustration');
  const oneOn = await ink();
  assert.ok(oneOn < inked, `only one illustration is drawn (${oneOn} < ${inked})`);
  await page.screenshot({ path: path.join(shots, 'desktop-taurus-art.png') });
  await page.mouse.click(taurus.x, taurus.y);
  await settle(page);
  assert.equal(await taurusArt(), false, 'second tap hides it');
  const oneOff = await ink();
  assert.ok(oneOn > oneOff * 1.01, `the illustration adds ink (${oneOff} -> ${oneOn})`);
  await page.mouse.click(taurus.x, taurus.y);
  await settle(page);
  const again = await ink();
  assert.ok(Math.abs(again - oneOn) < oneOn * 0.02, `third tap shows it again (${oneOn} -> ${again})`);

  // While any illustration is drawn the button reads as pressed, and pressing it hides all
  // and forgets the one-by-one choices.
  const artState = () => page.evaluate(() => {
    const a = window.stjarnhimlen;
    return { all: a.layers.art, overrides: a.artOverrides.size, pressed: document.querySelector('[data-layer="art"]').getAttribute('aria-pressed') };
  });
  assert.deepEqual(await artState(), { all: false, overrides: 1, pressed: 'true' });
  await page.click('[data-layer="art"]');
  await settle(page);
  assert.deepEqual(await artState(), { all: false, overrides: 0, pressed: 'false' });
  assert.equal(await taurusArt(), false);
  assert.ok(Math.abs((await ink()) - oneOff) < oneOff * 0.02, 'pressing it hid the tapped illustration');

  // With all illustrations on, a tap hides just the tapped one.
  await page.click('[data-layer="art"]');
  await settle(page);
  const allOn = await ink();
  await page.mouse.click(taurus.x, taurus.y);
  await settle(page);
  assert.equal(await taurusArt(), false, 'a tap hides one illustration while all are on');
  assert.equal(await page.textContent('#card [data-action="art"]'), 'Visa illustration');
  assert.ok((await ink()) < allOn / 1.005, 'one fewer illustration is drawn');
  await page.mouse.click(taurus.x, taurus.y);
  await settle(page);
  assert.deepEqual(await artState(), { all: true, overrides: 0, pressed: 'true' });
  await page.click('[data-layer="art"]');
  await settle(page);

  // A touch that stops a coasting sky only stops it. Playwright's mouse is too slow to
  // flick, so the gesture is dispatched in the page with a steady pace.
  const flick = await page.evaluate(() => {
    const app = window.stjarnhimlen;
    const el = app.hudCanvas;
    el.setPointerCapture = () => {};
    const r = el.getBoundingClientRect();
    const send = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, bubbles: true, clientX: r.left + x, clientY: r.top + y,
    }));
    const wait = (ms) => { const t = performance.now(); while (performance.now() - t < ms); };
    send('pointerdown', 500, 300);
    for (let k = 1; k <= 6; k++) {
      wait(8);
      send('pointermove', 500 + k * 25, 300);
    }
    send('pointerup', 650, 300);
    const coasting = Boolean(app.velocity);
    const selected = app.selected;
    send('pointerdown', 640, 300);
    wait(30);
    send('pointerup', 640, 300);
    return { coasting, stopped: app.velocity === null, selectedSame: app.selected === selected, overrides: app.artOverrides.size };
  });
  assert.deepEqual(flick, { coasting: true, stopped: true, selectedSame: true, overrides: 0 }, 'the stopping touch is not a tap');

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

  // Clicking the ground selects nothing. Let the flight to Leo finish first, or it would
  // overwrite the direction set here.
  await settle(page);
  await page.evaluate(() => {
    Object.assign(window.stjarnhimlen.view, { alt: -60 });
    window.stjarnhimlen.invalidate();
  });
  await settle(page);
  await page.mouse.click(150, 250);
  assert.equal(await page.isHidden('#card'), true);

  // One-by-one illustration choices are remembered between visits.
  const savedArt = () => page.evaluate(() => JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').artOverrides || []);
  await page.evaluate(() => window.stjarnhimlen.toggleArt(window.stjarnhimlen.catalog.byId.get('Tau').index));
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').artOverrides || []).length === 1);
  assert.deepEqual(await savedArt(), [['Tau', true]]);
  await page.reload();
  await page.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await taurusArt(), true, 'the tapped illustration is shown again after a reload');
  assert.equal(await page.getAttribute('[data-layer="art"]', 'aria-pressed'), 'true');
  await page.click('[data-layer="art"]');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').artOverrides || []).length === 0);
  await page.reload();
  await page.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await taurusArt(), false, 'hiding all is remembered too');

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
