// Smoke test in headless Chromium: the sky renders, a tap on a constellation toggles its
// illustration, the list opens the info card, marking works, the sky can be discovered
// one neighbour at a time ("Upptäck"), training with flashcards works ("Träna"), and
// the interface designs switch. Screenshots land in test/e2e/screenshots/ (git-ignored).
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

/** A page at a fixed time. Most checks need the whole sky facing south, so "Upptäck" is
 * turned off unless `discover` is set; then the page keeps the view it opened with. */
async function openPage(viewport, { discover = false, touch = false } = {}) {
  const page = await browser.newPage({ viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // Web fonts are optional and blocked here (see below).
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|net::/.test(m.text())) errors.push(m.text());
  });
  // Web fonts are left out, so that the test does not wait on the network and every
  // design is checked with its fallback fonts.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  // 15 January 2026, 22:00 in Stockholm, from the very start.
  await fixDate(page, Date.UTC(2026, 0, 15, 21, 0));
  await page.goto(url);
  await page.waitForFunction(() => window.stjarnhimlen);
  await page.evaluate((disc) => {
    const app = window.stjarnhimlen;
    app.setTime(Date.UTC(2026, 0, 15, 21, 0));
    app.setSpeed(0);
    if (!disc) {
      app.setDiscover(false);
      Object.assign(app.view, { az: 180, alt: 30, fov: 110 });
    }
    app.invalidate();
  }, discover);
  await settle(page);
  return page;
}

/**
 * Fixes what Date says, for the sky's clock and the training cards; the test can move it
 * with window.setTestNow(ms). Playwright's own clock is not used: it also holds back the
 * frame timestamps that the camera's flights are timed by.
 */
function fixDate(page, start) {
  return page.addInitScript((ms) => {
    const RealDate = Date;
    let now = ms;
    window.Date = class extends RealDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super(now);
      }

      static now() {
        return now;
      }
    };
    window.setTestNow = (t) => {
      now = t;
    };
  }, start);
}

/** Waits until the latest change has been drawn (picking uses the drawn frame). */
async function settle(page) {
  await page.waitForFunction(() => !window.stjarnhimlen.dirty && !window.stjarnhimlen.anim);
}

/** Whether a constellation's illustration is drawn. */
function artOf(page, id) {
  return page.evaluate((cid) => window.stjarnhimlen.artShown(window.stjarnhimlen.catalog.byId.get(cid).index), id);
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

  // A tap on a constellation shows its illustration and opens no info card.
  const orion = await centerOf(page, 'Ori');
  await page.mouse.click(orion.x, orion.y);
  await settle(page);
  assert.equal(await artOf(page, 'Ori'), true, 'tapping a constellation shows its illustration');
  assert.equal(await page.isHidden('#card'), true, 'a tap opens no info card');
  assert.equal(await page.evaluate(() => window.stjarnhimlen.selected), -1, 'a tap selects nothing');
  await page.mouse.click(orion.x, orion.y);
  await settle(page);
  assert.equal(await artOf(page, 'Ori'), false, 'a second tap hides it');

  // Marking is done in the list.
  await page.click('#btn-list');
  await page.fill('#search', 'orion');
  await page.click('#con-list li:not([hidden]) .mark-box');
  assert.equal(await page.textContent('#mark-count'), '1');
  await page.fill('#search', '');
  await page.click('#btn-list-close');
  await settle(page);
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

  // A tap on a constellation toggles just its illustration (the mouse then rests on it,
  // which highlights its figure, so compare with it hovered and its illustration off).
  const taurus = await centerOf(page, 'Tau');
  const taurusArt = () => artOf(page, 'Tau');
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
  assert.ok(Math.abs((await ink()) - bare) < bare * 0.02, 'pressing it hid the tapped illustration');

  // With all illustrations on, a tap hides just the tapped one (measure both with the
  // mouse resting on it, as it does after the tap).
  await page.click('[data-layer="art"]');
  await page.mouse.move(taurus.x, taurus.y);
  await settle(page);
  const allOn = await ink();
  await page.mouse.click(taurus.x, taurus.y);
  await settle(page);
  assert.equal(await taurusArt(), false, 'a tap hides one illustration while all are on');
  assert.equal(await page.isHidden('#card'), true);
  assert.ok((await ink()) < allOn / 1.005, 'one fewer illustration is drawn');
  await page.mouse.click(taurus.x, taurus.y);
  await settle(page);
  assert.deepEqual(await artState(), { all: true, overrides: 0, pressed: 'true' });
  await page.click('[data-layer="art"]');
  await settle(page);

  // A touch that stops a coasting sky only stops it: it neither toggles an illustration
  // nor closes the info card. Playwright's mouse is too slow to flick, so the gesture is
  // dispatched in the page with a steady pace.
  const flick = await page.evaluate(() => {
    const app = window.stjarnhimlen;
    app.select(app.catalog.byId.get('Ori').index);
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
    send('pointerdown', 640, 300);
    wait(30);
    send('pointerup', 640, 300);
    const result = { coasting, stopped: app.velocity === null, cardOpen: !app.card.root.hidden, overrides: app.artOverrides.size };
    app.select(-1);
    return result;
  });
  assert.deepEqual(flick, { coasting: true, stopped: true, cardOpen: true, overrides: 0 }, 'the stopping touch is not a tap');

  await page.click('#btn-list');
  await page.fill('#search', 'lejon');
  const rows = await page.$$eval('#con-list li:not([hidden]) strong', (els) => els.map((e) => e.textContent));
  assert.deepEqual(rows, ['Lejonet', 'Lilla lejonet']);
  await page.click('#con-list li:not([hidden]) .con-name');
  await page.waitForFunction(() => document.querySelector('#card h3')?.textContent === 'Lejonet');
  assert.match(await page.textContent('#card .facts'), /Uppe nu/);
  // Under the facts, a short story: where it comes from, who it is, what stands out.
  assert.match(await page.textContent('#card .story'), /^Grekisk mytologi.*nemeiska lejonet.*Speciellt: .*Regulus/);

  await page.fill('#search', '');
  // "Vinterkvällar" keeps those seen on winter evenings: 45 of the 57 seen from Stockholm.
  const listNames = () => page.$$eval('#con-list li:not([hidden]) strong', (els) => els.map((e) => e.textContent));
  const listChips = () => page.$$eval('#filter-visible, #filter-winter, #filter-all', (els) => els.map((e) => e.getAttribute('aria-pressed')));
  assert.deepEqual([await page.textContent('#filter-count'), await page.textContent('#filter-winter-count')], ['57', '45']);
  assert.equal((await listNames()).length, 57);
  await page.click('#filter-winter');
  assert.deepEqual(await listChips(), ['false', 'true', 'false']);
  assert.deepEqual([await page.textContent('#filter-count'), await page.textContent('#filter-winter-count')], ['57', '45']);
  const winterNames = await listNames();
  assert.equal(winterNames.length, 45);
  assert.ok(winterNames.includes('Orion') && winterNames.includes('Stora björnen') && !winterNames.includes('Skorpionen'));
  await page.click('#filter-all');
  assert.equal((await listNames()).length, 88);
  assert.deepEqual(await listChips(), ['false', 'false', 'true']);
  await page.click('#filter-visible');
  const before = await page.textContent('#filter-count');
  await page.click('#btn-list-close');

  // The card's buttons show and hide the illustration and mark the constellation.
  assert.equal(await page.textContent('#card [data-action="art"]'), 'Visa illustration');
  await page.click('#card [data-action="art"]');
  assert.equal(await artOf(page, 'Leo'), true);
  assert.equal(await page.textContent('#card [data-action="art"]'), 'Dölj illustration');
  await page.click('#card [data-action="art"]');
  assert.equal(await artOf(page, 'Leo'), false);
  await page.click('#card .chip.primary');
  assert.equal(await page.textContent('#mark-count'), '2');
  assert.equal(await page.textContent('#card .chip[aria-pressed="true"]'), 'Avmarkera');

  // A tap on the card's own constellation keeps the card and toggles the illustration.
  await settle(page);
  const leo = await centerOf(page, 'Leo');
  await page.mouse.click(leo.x, leo.y);
  assert.equal(await artOf(page, 'Leo'), true);
  assert.equal(await page.isHidden('#card'), false, 'a tap on the card\'s constellation keeps the card');
  assert.equal(await page.textContent('#card h3'), 'Lejonet');
  assert.equal(await page.textContent('#card [data-action="art"]'), 'Dölj illustration');
  await page.mouse.click(leo.x, leo.y);
  assert.equal(await artOf(page, 'Leo'), false);
  assert.equal(await page.isHidden('#card'), false);

  // A tap on another constellation closes the card and toggles that one's illustration.
  const other = await page.evaluate(() => {
    const app = window.stjarnhimlen;
    for (let y = 100; y < innerHeight; y += 40) {
      for (let x = 40; x < innerWidth; x += 40) {
        const i = app.pick(x, y);
        if (i >= 0 && i !== app.selected && document.elementFromPoint(x, y) === app.hudCanvas) {
          return { x, y, id: app.catalog.constellations[i].id };
        }
      }
    }
    return null;
  });
  assert.ok(other, 'some other constellation is in view');
  await page.mouse.click(other.x, other.y);
  assert.equal(await page.isHidden('#card'), true, 'a tap on another constellation closes the info card');
  assert.equal(await artOf(page, other.id), true);
  await page.mouse.click(other.x, other.y);
  assert.equal(await artOf(page, other.id), false);
  assert.equal(await page.isHidden('#card'), true);

  await page.click('#btn-when');
  await page.selectOption('#place', 'kiruna');
  assert.equal(await page.textContent('#when-place'), 'Kiruna');
  assert.notEqual(await page.textContent('#filter-count'), before, 'fewer constellations rise in Kiruna');
  assert.equal(await page.textContent('#filter-winter-count'), '41');
  await page.click('#btn-when');

  // Clicking the ground closes the card and toggles no illustration.
  await settle(page);
  await page.evaluate(() => {
    const app = window.stjarnhimlen;
    Object.assign(app.view, { alt: -60 });
    app.select(app.catalog.byId.get('Leo').index);
    app.invalidate();
  });
  await settle(page);
  assert.equal(await page.isHidden('#card'), false);
  await page.mouse.click(150, 250);
  assert.equal(await page.isHidden('#card'), true);
  assert.equal(await page.evaluate(() => window.stjarnhimlen.artOverrides.size), 0);

  // One-by-one illustration choices are remembered between visits.
  // Saves wait until things have been still for a moment, so wait for this very value
  // rather than any one-element list an earlier save may have left.
  await page.evaluate(() => window.stjarnhimlen.toggleArt(window.stjarnhimlen.catalog.byId.get('Tau').index));
  await page.waitForFunction(() => JSON.stringify(JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').artOverrides) === '[["Tau",true]]');
  // So is the list's filter.
  await page.evaluate(() => window.stjarnhimlen.list.setScope('winter'));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').listScope === 'winter');
  await page.reload();
  await page.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await taurusArt(), true, 'the tapped illustration is shown again after a reload');
  assert.equal(await page.getAttribute('#filter-winter', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('[data-layer="art"]', 'aria-pressed'), 'true');
  await page.click('[data-layer="art"]');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').artOverrides || []).length === 0);
  await page.reload();
  await page.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await taurusArt(), false, 'hiding all is remembered too');

  // "Upptäck": a first visit opens on Ursa Major alone and offers its neighbours.
  const sky = await openPage({ width: 1280, height: 800 }, { discover: true });
  const discovery = () => sky.evaluate(() => {
    const a = window.stjarnhimlen;
    const id = (i) => a.catalog.constellations[i].id;
    return {
      on: a.discovery.on,
      found: [...a.discovery.found].map(id).sort(),
      next: a.discoveryInfo ? a.discoveryInfo.next.map(id).sort() : null,
      count: document.getElementById('discover-count').textContent,
      panel: !document.getElementById('panel-discover').hidden,
      pressed: document.getElementById('btn-discover').getAttribute('aria-pressed'),
    };
  });
  const inView = (id) => sky.evaluate((c) => window.stjarnhimlen.inView(window.stjarnhimlen.catalog.byId.get(c).index), id);
  /** Screen position of a direction, and the panel's box. */
  const onScreen = (vec) => sky.evaluate((v) => {
    const a = window.stjarnhimlen;
    a.view.timeMs = a.now();
    a.view.update();
    const p = { x: 0, y: 0, z: 0 };
    a.view.projectEq(v, p);
    return { x: p.x, y: p.y, panel: a.discoverPanel.root.getBoundingClientRect().toJSON() };
  }, vec);
  /** Turns the view so that a direction lands on a screen point. */
  const placeAt = (vec, x, y) => sky.evaluate(([v, tx, ty]) => {
    const a = window.stjarnhimlen;
    const p = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < 4; k++) {
      a.view.timeMs = a.now();
      a.view.update();
      a.view.projectEq(v, p);
      a.pan(tx - p.x, ty - p.y);
    }
    a.invalidate();
  }, [vec, x, y]);
  const centerVec = (id) => sky.evaluate((c) => window.stjarnhimlen.catalog.byId.get(c).centerVec, id);
  assert.deepEqual(await discovery(), {
    on: true,
    found: ['UMa'],
    next: ['Boo', 'CVn', 'Cam', 'Com', 'Dra', 'LMi', 'Leo', 'Lyn'],
    count: '1 av 57',
    panel: true,
    pressed: 'true',
  });
  assert.equal(await inView('UMa'), true, 'the view opens on Ursa Major, clear of the panel');
  assert.equal((await sky.$$('#discover-next button')).length, 8);
  // Drawn stars: how many, and whether each lies in, or belongs to the figure of, a found constellation.
  const drawnStars = () => sky.evaluate(() => {
    const a = window.stjarnhimlen;
    const found = [...a.discovery.found];
    const figure = new Set(found.flatMap((i) => a.catalog.constellations[i].figureStars));
    let n = 0;
    let stray = 0;
    a.skyLayer.px.forEach((x, i) => {
      if (Number.isNaN(x)) return;
      n++;
      if (a.discovery.on && !found.includes(a.catalog.stars.con[i]) && !figure.has(i)) stray++;
    });
    return { n, stray };
  });
  const onlyUMa = await drawnStars();
  assert.ok(onlyUMa.n > 20, `Ursa Major's stars are drawn (${onlyUMa.n})`);
  assert.equal(onlyUMa.stray, 0, 'no other stars are drawn');
  await sky.screenshot({ path: path.join(shots, 'discover-start.png') });

  // Nothing else of a hidden constellation is drawn either, with every layer on and a mark
  // on it: one frame is drawn while recording whose figures, outlines, illustrations and
  // names are traced, and how much of the sky is tinted.
  const drawnParts = (hover = null, page = sky) => page.evaluate((hoverId) => {
    const a = window.stjarnhimlen;
    if (hoverId) a.hover = a.catalog.byId.get(hoverId).index;
    const sl = a.skyLayer;
    const owner = new Map();
    for (const c of a.catalog.constellations) for (const part of [c.segments, c.outlines, c.art]) owner.set(part, c.id);
    const names = new Map(a.catalog.constellations.map((c) => [c.sv.toUpperCase(), c.id]));
    const seen = { segments: new Set(), outlines: new Set(), art: new Set(), names: new Set(), texts: new Set() };
    const obstacles = a.labelObstacles();
    const boxes = [];
    let covered = 0;
    let tinted = 0;
    const wrap = (obj, name, record) => {
      const fn = obj[name];
      obj[name] = function (...args) {
        record(...args);
        return fn.apply(this, args);
      };
    };
    wrap(sl, 'traceSegments', (segs) => owner.has(segs) && seen.segments.add(owner.get(segs)));
    wrap(sl, 'tracePolyline', (view, rings) => owner.has(rings) && seen.outlines.add(owner.get(rings)));
    wrap(sl, 'traceArt', (view, lines) => owner.has(lines) && seen.art.add(owner.get(lines)));
    wrap(a.hud, 'label', (text, x, y) => {
      seen.texts.add(text);
      const id = names.get(text.replace(/^\+ /, ''));
      if (!id) return;
      seen.names.add(id);
      if (obstacles.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom)) covered++;
      const w = a.hud.ctx.measureText(text).width / 2;
      boxes.push([x - w, x + w, y - 5, y + 5]);
    });
    wrap(a.glSky, 'setMask', (w, h, data) => {
      for (let k = 3; k < data.length; k += 4) if (data[k]) tinted++;
    });
    a.maskDirty = true;
    a.draw();
    a.hover = -1;
    for (const name of ['traceSegments', 'tracePolyline', 'traceArt']) delete sl[name];
    delete a.hud.label;
    delete a.glSky.setMask;
    let overlaps = 0;
    boxes.forEach((p, i) => boxes.slice(i + 1).forEach((q) => {
      if (p[0] < q[1] && q[0] < p[1] && p[2] < q[3] && q[2] < p[3]) overlaps++;
    }));
    return { ...Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v].sort()])), covered, overlaps, tinted };
  }, hover);
  const offer = (await discovery()).next;
  const plain = await drawnParts();
  await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    for (const layer of ['art', 'bounds', 'names']) a.setLayer(layer, true);
    a.toggleMark(a.catalog.byId.get('Ori').index);
    a.markAllUp();
  });
  // With the mouse on a neighbour on offer, so that its outline lights up but not its figure.
  const parts = await drawnParts('Dra');
  assert.deepEqual(parts.segments, ['UMa'], 'only found figures are drawn');
  assert.deepEqual(parts.art, ['UMa'], 'only found illustrations are drawn');
  assert.deepEqual(parts.outlines, ['UMa', ...offer].sort(), 'outlines: found and on offer');
  assert.ok(parts.names.includes('UMa') && parts.names.every((id) => id === 'UMa' || offer.includes(id)), `names: ${parts.names}`);
  assert.equal(parts.covered, 0, 'no name is drawn under the panel or the brand');
  assert.equal(parts.overlaps, 0, 'names do not run into each other');
  // A name that would land under the panel is left out.
  const umaLabel = await sky.evaluate(() => window.stjarnhimlen.catalog.byId.get('UMa').labelVecs[0]);
  const box = (await onScreen(umaLabel)).panel;
  await placeAt(umaLabel, (box.left + box.right) / 2, (box.top + box.bottom) / 2);
  await settle(sky);
  const under = await drawnParts();
  assert.ok(!under.names.includes('UMa') && under.covered === 0, `a name under the panel is left out (${under.names})`);
  await sky.evaluate(() => window.stjarnhimlen.flyTo(window.stjarnhimlen.catalog.byId.get('UMa').index, { instant: true }));
  await settle(sky);
  assert.ok(parts.tinted > plain.tinted, 'the found and marked Ursa Major is tinted');
  assert.equal(await sky.evaluate(() => [...window.stjarnhimlen.marks.keys()].length), 2, 'Orion and Ursa Major are marked');
  assert.equal(await sky.textContent('#mark-count'), '1', 'the hidden mark is not counted');
  await sky.evaluate(() => window.stjarnhimlen.toggleMark(window.stjarnhimlen.catalog.byId.get('UMa').index));
  assert.equal((await drawnParts()).tinted, plain.tinted, 'the hidden Orion is not tinted');
  // "Rensa markeringar" removes the marks that can be seen and keeps the hidden one.
  await sky.evaluate(() => window.stjarnhimlen.toggleMark(window.stjarnhimlen.catalog.byId.get('UMa').index));
  await sky.click('#btn-list');
  await sky.click('#btn-clear');
  assert.equal(await sky.textContent('#toast'), 'Tog bort 1 markering');
  assert.deepEqual(await sky.evaluate(() => [...window.stjarnhimlen.marks.keys()].map((i) => window.stjarnhimlen.catalog.constellations[i].id)), ['Ori']);
  await sky.click('#btn-list-close');
  await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    a.marks.clear();
    a.marksChanged();
    for (const layer of ['art', 'bounds']) a.setLayer(layer, false);
  });

  /** A point on the sky (not under a panel) over a constellation in the given state: 1 found, 2 on offer, 0 hidden. */
  const pointOver = (state, avoid = []) => sky.evaluate(([st, skip]) => {
    const a = window.stjarnhimlen;
    for (let y = 90; y < innerHeight - 90; y += 20) {
      for (let x = 20; x < innerWidth - 20; x += 20) {
        const i = a.pick(x, y);
        if (i < 0 || a.reveal.con[i] !== st || skip.includes(a.catalog.constellations[i].id)) continue;
        if (document.elementFromPoint(x, y) === a.hudCanvas) return { x, y, id: a.catalog.constellations[i].id };
      }
    }
    return null;
  }, [state, avoid]);
  const hoverId = () => sky.evaluate(() => {
    const a = window.stjarnhimlen;
    return a.hover >= 0 ? a.catalog.constellations[a.hover].id : null;
  });

  // A tap on a neighbour with a plus adds it, and its neighbours are offered in turn.
  const offered = await pointOver(2);
  assert.ok(offered, 'a neighbour is in view');
  await sky.mouse.move(offered.x, offered.y);
  assert.equal(await hoverId(), offered.id, 'a neighbour on offer lights up under the mouse');
  await sky.mouse.click(offered.x, offered.y);
  await settle(sky);
  let d = await discovery();
  assert.deepEqual(d.found, ['UMa', offered.id].sort());
  assert.equal(d.count, '2 av 57');
  assert.ok(!d.next.includes(offered.id), 'what is found is not offered again');
  assert.match(await sky.textContent('#discover-hint'), /är upptäckt! Lägg till en granne:/);
  const two = await drawnStars();
  assert.ok(two.n > onlyUMa.n && two.stray === 0, `its stars appear (${onlyUMa.n} -> ${two.n})`);

  // A tap on a hidden constellation adds nothing and says why; it does not light up either.
  await sky.evaluate(() => {
    window.stjarnhimlen.view.fov = 150;
    window.stjarnhimlen.invalidate();
  });
  await settle(sky);
  const hidden = await pointOver(0);
  assert.ok(hidden, 'some constellation is still hidden');
  await sky.mouse.move(hidden.x, hidden.y);
  assert.equal(await hoverId(), null, 'a hidden constellation does not light up under the mouse');
  await sky.mouse.click(hidden.x, hidden.y);
  assert.match(await sky.textContent('#toast'), /inte har hittat än|aldrig syns/);
  assert.deepEqual((await discovery()).found, d.found);

  // The buttons in the panel add neighbours too, and turn the view to one that is out of
  // sight, here hidden behind the panel itself.
  await sky.evaluate(() => {
    window.stjarnhimlen.view.fov = 80;
    window.stjarnhimlen.invalidate();
  });
  const chipId = await sky.evaluate(() => {
    const b = [...document.querySelectorAll('#discover-next button')].find((e) => !e.querySelector('.state').textContent);
    return b ? b.dataset.id : null;
  });
  assert.ok(chipId, 'a neighbour above the horizon is on offer');
  const chipVec = await centerVec(chipId);
  const behind = (await onScreen(chipVec)).panel;
  // Under the panel's right edge, where the centre would otherwise count as well in view.
  await placeAt(chipVec, behind.right - 40, (behind.top + behind.bottom) / 2);
  await settle(sky);
  assert.equal(await inView(chipId), false);
  await sky.click(`#discover-next button[data-id="${chipId}"]`);
  await settle(sky);
  d = await discovery();
  assert.equal(d.found.length, 3);
  assert.ok(d.found.includes(chipId));
  const landed = await onScreen(chipVec);
  assert.ok(landed.x > landed.panel.right + 50, `the view turned to it, clear of the panel (${Math.round(landed.x)} > ${landed.panel.right})`);
  assert.equal(await inView(chipId), true);
  // Keyboard: Enter on a button adds it and keeps the focus in the row.
  await sky.focus('#discover-next button');
  await sky.keyboard.press('Enter');
  assert.equal((await discovery()).found.length, 4);
  assert.equal(await sky.evaluate(() => document.activeElement.closest('#discover-next') !== null), true, 'focus stays among the neighbours');
  d = await discovery();

  // A tap on a found constellation shows its drawing and adds nothing.
  await sky.evaluate(() => window.stjarnhimlen.flyTo(window.stjarnhimlen.catalog.byId.get('UMa').index, { instant: true }));
  await settle(sky);
  const umaPoint = await pointOver(1, d.found.filter((x) => x !== 'UMa'));
  await sky.mouse.click(umaPoint.x, umaPoint.y);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.artShown(window.stjarnhimlen.catalog.byId.get('UMa').index)), true);
  assert.deepEqual((await discovery()).found, d.found, 'a tap on a found constellation adds nothing');
  await sky.screenshot({ path: path.join(shots, 'discover-four.png') });

  // The list holds only what has been found, and says so when a search finds a hidden one.
  // Choosing one there turns the view so that it lands between the panel and the list.
  await sky.click('#btn-list');
  await sky.click(`#con-list li[data-index="${await sky.evaluate((c) => window.stjarnhimlen.catalog.byId.get(c).index, chipId)}"] .con-name`);
  await settle(sky);
  const between = await onScreen(chipVec);
  const listLeft = await sky.$eval('#panel-list', (e) => e.getBoundingClientRect().left);
  const gap = (between.panel.right + listLeft) / 2;
  assert.ok(Math.abs(between.x - gap) < 40, `centred between the panel and the list (${Math.round(between.x)}, gap centre ${Math.round(gap)})`);
  await sky.click('#card .icon-btn');
  const listed = await sky.$$eval('#con-list li:not([hidden]):not(.empty) strong', (els) => els.length);
  assert.equal(listed, 4);
  assert.equal(await sky.isVisible('#list-note'), true);
  await sky.fill('#search', 'orion');
  assert.equal(await sky.textContent('#con-list .empty'), 'Orion har du inte upptäckt än.');
  await sky.fill('#search', '');
  await sky.click('#btn-list-close');

  // The panel folds up to its progress line.
  await sky.click('#btn-discover-collapse');
  assert.equal(await sky.isHidden('#discover-body'), true);
  assert.equal(await sky.getAttribute('#btn-discover-collapse', 'aria-expanded'), 'false');
  await sky.click('#btn-discover-collapse');
  assert.equal(await sky.isVisible('#discover-next'), true);

  // What has been found is remembered between visits.
  const foundIds = JSON.stringify(d.found);
  await sky.waitForFunction((ids) => {
    const saved = JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').discover;
    return saved?.collapsed === false && JSON.stringify([...saved.found].sort()) === ids;
  }, foundIds);
  await sky.reload();
  await sky.waitForFunction(() => window.stjarnhimlen);
  assert.deepEqual((await discovery()).found, d.found);

  // "Visa hela himlen" leaves the mode, shows every star and lists every constellation;
  // "Upptäck" comes back to where it was.
  await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    a.flyTo(a.catalog.byId.get('UMa').index, { instant: true });
    a.view.fov = 120;
    a.invalidate();
  });
  await settle(sky);
  const discovering = await drawnStars();
  await sky.click('#btn-discover-exit');
  await settle(sky);
  d = await discovery();
  assert.deepEqual([d.on, d.panel, d.pressed, d.next], [false, false, 'false', null]);
  const whole = await drawnStars();
  assert.ok(whole.n > discovering.n * 2, `the whole sky is back (${discovering.n} -> ${whole.n} stars)`);
  // Zoomed all the way out, crowded names are left out rather than drawn over each other.
  await sky.evaluate(() => {
    window.stjarnhimlen.view.fov = 160;
    window.stjarnhimlen.invalidate();
  });
  await settle(sky);
  const crowded = await drawnParts();
  assert.ok(crowded.names.length > 20 && crowded.overlaps === 0, `${crowded.names.length} names, ${crowded.overlaps} overlapping`);
  await sky.click('#btn-list');
  assert.ok((await sky.$$eval('#con-list li:not([hidden]):not(.empty)', (els) => els.length)) > 50);
  assert.equal(await sky.isVisible('#list-note'), false);
  await sky.click('#btn-list-close');
  await sky.click('#btn-discover');
  d = await discovery();
  assert.deepEqual([d.on, d.panel, d.found.length], [true, true, 4]);

  // Another place changes the goal: fewer constellations rise in Kiruna.
  await sky.evaluate(() => window.stjarnhimlen.setPlace('kiruna'));
  assert.match((await discovery()).count, /^\d+ av 52$/);
  await sky.evaluate(() => window.stjarnhimlen.setPlace('stockholm'));

  // Collecting every neighbour finishes the sky seen from here. The rest never rise here,
  // so going on makes the ground see-through and turns to one of them.
  const collect = () => sky.evaluate(() => {
    const a = window.stjarnhimlen;
    while (a.discoveryInfo.next.length) a.discover(a.discoveryInfo.next[0]);
  });
  await collect();
  assert.match(await sky.textContent('#discover-hint'), /Klart! Du har hittat alla 57 som syns från Stockholm/);
  assert.equal(await sky.textContent('#btn-discover-rest'), `Fortsätt med resten av himlen (${88 - 57} till)`);
  const hiddenAfterDone = await pointOver(0);
  if (hiddenAfterDone) {
    await sky.mouse.click(hiddenAfterDone.x, hiddenAfterDone.y);
    assert.match(await sky.textContent('#toast'), /Fortsätt med resten av himlen/);
  }
  await sky.click('#btn-discover-rest');
  await settle(sky);
  d = await discovery();
  assert.equal(d.count, '57 av 88');
  assert.ok(d.next.length > 0);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.layers.seeThrough), true);
  assert.ok((await Promise.all(d.next.map(inView))).some(Boolean), 'one of the rest is in view');
  assert.match(await sky.textContent('#discover-hint'), /syns aldrig från Stockholm, så marken är genomskinlig/);
  // Going on is remembered too.
  await sky.evaluate(() => window.stjarnhimlen.discover(window.stjarnhimlen.discoveryInfo.next[0]));
  await sky.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').discover;
    return saved?.on === true && saved.all === true && saved.found.length === 58;
  });
  await sky.reload();
  await sky.waitForFunction(() => window.stjarnhimlen);
  assert.equal((await discovery()).count, '58 av 88');
  await collect();
  d = await discovery();
  assert.deepEqual([d.found.length, d.next.length, d.count], [88, 0, '88 av 88']);
  assert.match(await sky.textContent('#discover-hint'), /^Hela himlen!/);
  assert.equal(await sky.isHidden('#btn-discover-rest'), true);

  // Starting over takes two presses and turns back to Ursa Major.
  await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    Object.assign(a.view, { az: 180, alt: 20, fov: 60 });
    a.invalidate();
  });
  await sky.click('#btn-discover-restart');
  assert.equal((await discovery()).found.length, 88);
  assert.equal(await sky.textContent('#btn-discover-restart'), 'Säker? Tryck igen');
  await sky.click('#btn-discover-restart');
  await settle(sky);
  d = await discovery();
  assert.deepEqual([d.found, d.count], [['UMa'], '1 av 57']);
  assert.equal(await inView('UMa'), true);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.layers.seeThrough), false, 'the see-through ground it turned on is off again');
  // Turning the mode back on with only Ursa Major found turns to it as well.
  await sky.click('#btn-discover-exit');
  await sky.evaluate(() => {
    Object.assign(window.stjarnhimlen.view, { az: 180, alt: 20, fov: 60 });
    window.stjarnhimlen.invalidate();
  });
  await sky.click('#btn-discover');
  await settle(sky);
  assert.equal(await inView('UMa'), true);

  // A neighbour added by its button while below the horizon: the button says so, and a
  // note explains why it cannot be seen. In mid August at 23:00 Leo is under the ground.
  await sky.evaluate(() => window.stjarnhimlen.setTime(Date.UTC(2026, 7, 15, 21, 0)));
  assert.match(await sky.textContent('#discover-next button[data-id="Leo"]'), /nere|delvis uppe/);
  await sky.click('#discover-next button[data-id="Leo"]');
  assert.match(await sky.textContent('#toast'), /^Lejonet är (delvis )?under horisonten just nu/);

  // A flight frames a constellation's name too; Cassiopeja's sits well outside its W.
  const casNamed = (page) => page.evaluate(() => {
    const a = window.stjarnhimlen;
    // 24 October 00:10, when the name stands to the side of the W.
    a.setTime(Date.UTC(2026, 9, 23, 22, 10));
    const cas = a.catalog.byId.get('Cas');
    a.flyTo(cas.index, { instant: true });
    a.view.update();
    const p = { x: 0, y: 0, z: 0 };
    return cas.labelVecs.some((v) => a.view.projectEq(v, p) && p.x > 20 && p.x < innerWidth - 20 && p.y > 0 && p.y < innerHeight - 60);
  });
  assert.ok(await casNamed(sky), 'Cassiopeja is named on screen after a flight');

  // On a phone the panel fits across the top, the view opens below it, and notes are
  // shown below it too.
  const phoneSky = await openPage({ width: 390, height: 844 }, { discover: true });
  assert.equal(await phoneSky.isVisible('#panel-discover'), true);
  assert.ok((await phoneSky.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'no horizontal scroll');
  assert.equal(await phoneSky.evaluate(() => window.stjarnhimlen.inView(window.stjarnhimlen.catalog.byId.get('UMa').index)), true);
  await phoneSky.evaluate(() => window.stjarnhimlen.showToast('Prov'));
  const [panelBox, toastBox] = await Promise.all(['#panel-discover', '#toast'].map((sel) => phoneSky.$eval(sel, (e) => e.getBoundingClientRect().toJSON())));
  assert.ok(toastBox.top >= panelBox.bottom, 'the note does not cover the panel');
  await phoneSky.screenshot({ path: path.join(shots, 'phone-discover.png') });
  assert.ok(await casNamed(phoneSky), 'Cassiopeja is named on a phone screen after a flight');
  // Names crowd on a narrow screen; they are left out rather than drawn over each other.
  await phoneSky.evaluate(() => {
    const a = window.stjarnhimlen;
    a.setDiscover(false);
    a.view.fov = 160;
    a.invalidate();
  });
  await settle(phoneSky);
  const phoneNames = await drawnParts(null, phoneSky);
  assert.ok(phoneNames.names.length > 15 && phoneNames.overlaps === 0, `${phoneNames.names.length} names, ${phoneNames.overlaps} overlapping`);

  const phone = await openPage({ width: 390, height: 844 });
  await phone.evaluate(() => window.stjarnhimlen.select(window.stjarnhimlen.catalog.byId.get('UMa').index, { fly: true }));
  await settle(phone);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `no horizontal scroll on phones (overflow ${overflow}px)`);
  await phone.screenshot({ path: path.join(shots, 'phone-ursa-major.png') });

  // "Träna": flashcards. Play starts with four striking constellations, Ursa Major first,
  // shown with its stars only; then its lines, then its name and drawing.
  const quiz = await openPage({ width: 1280, height: 800 }, { discover: true });
  const quizState = () => quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    const t = a.training;
    return {
      on: t.on,
      card: t.card >= 0 ? a.catalog.constellations[t.card].id : null,
      step: t.step,
      inPlay: t.cards.size,
      panel: !document.getElementById('panel-train').hidden,
      discovering: !document.getElementById('panel-discover').hidden,
    };
  });
  const quizParts = () => drawnParts(null, quiz);
  const CARDINALS = /^(N|NO|Ö|SO|S|SV|V|NV)$/;
  /** Before the last step nothing names the card: no names on the sky, no answer in the panel. */
  const unnamed = async (parts) => {
    assert.ok(parts.texts.every((text) => CARDINALS.test(text)), `nothing named on the sky: ${parts.texts}`);
    assert.equal(await quiz.isHidden('#train-answer'), true, 'the answer waits');
    assert.equal(await quiz.isHidden('#train-view'), true, 'and so do the switches for lines and drawing');
    assert.equal(await quiz.isHidden('#train-story'), true, 'and its story');
    assert.doesNotMatch(await quiz.textContent('#train-prompt'), /Stora björnen|Ursa/);
  };
  const umaCard = () => quiz.evaluate(() => JSON.stringify(window.stjarnhimlen.training.cards.get(window.stjarnhimlen.catalog.byId.get('UMa').index)));
  await quiz.click('#btn-train');
  await settle(quiz);
  assert.deepEqual(await quizState(), { on: true, card: 'UMa', step: 1, inPlay: 4, panel: true, discovering: false });
  assert.equal(await quiz.evaluate(() => Math.round(window.stjarnhimlen.view.fov * 1000) / 1000), 100, 'the field of view the sky opens with');
  assert.equal(await quiz.getAttribute('#btn-train', 'aria-pressed'), 'true');
  assert.equal(await quiz.getAttribute('#btn-discover', 'aria-pressed'), 'false');
  // The list would give the answers away, and the cards decide on lines, names and drawings.
  assert.equal(await quiz.isDisabled('#btn-list'), true);
  assert.equal(await quiz.isDisabled('[data-layer="lines"]'), true);
  assert.equal(await quiz.getAttribute('[data-layer="lines"]', 'aria-pressed'), 'false');
  let seenNow = await quizParts();
  assert.deepEqual([seenNow.segments, seenNow.outlines, seenNow.art, seenNow.names], [[], [], [], []], 'stars only: no lines, outlines, drawings or names');
  await unnamed(seenNow);
  assert.match(await quiz.textContent('#train-prompt'), /En ny stjärnbild/);
  const stars = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    const sl = a.skyLayer;
    const fig = a.catalog.byId.get('UMa').figureStars;
    let context = 0;
    sl.px.forEach((x, i) => { if (!Number.isNaN(x) && sl.dim[i]) context++; });
    return { drawn: fig.filter((i) => !Number.isNaN(sl.px[i])).length, bright: fig.every((i) => !sl.dim[i]), context };
  });
  assert.ok(stars.drawn >= 15 && stars.bright, `its stars are drawn in full (${stars.drawn})`);
  assert.ok(stars.context > 50, 'the stars around it stay as faint context');
  // Keys that answer do nothing before the name is shown.
  const umaBefore = await umaCard();
  await quiz.keyboard.press('2');
  assert.deepEqual([(await quizState()).step, await umaCard()], [1, umaBefore]);
  // Space right after choosing "Träna" shows the lines (focus has moved to "Visa linjerna").
  await quiz.keyboard.press(' ');
  await settle(quiz);
  seenNow = await quizParts();
  assert.deepEqual([(await quizState()).on, (await quizState()).step], [true, 2]);
  assert.deepEqual([seenNow.segments, seenNow.names, seenNow.art], [['UMa'], [], []], 'its lines, still without its name or drawing');
  await unnamed(seenNow);
  await quiz.keyboard.press('1');
  assert.equal((await quizState()).step, 2);
  // A tap on the sky shows the name and the drawing.
  await quiz.mouse.click(700, 400);
  await settle(quiz);
  seenNow = await quizParts();
  assert.deepEqual([seenNow.segments, seenNow.names, seenNow.art], [['UMa'], ['UMa'], ['UMa']], 'a tap shows the name and the drawing');
  assert.equal(await quiz.textContent('#train-name'), 'Stora björnen');
  assert.equal(await quiz.isVisible('#train-answer'), true);
  assert.match(await quiz.textContent('#train-prompt'), /^Det var Stora björnen \(Ursa Major\)\. Kunde du den\? Tryck på himlen igen om du kan den för tillfället\.$/);
  // A tap or Space right on the heels of the tap that showed the name does not answer
  // yet, so that a double click cannot skip past the name.
  const onHeels = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    a.training.namedAt = performance.now();
    const el = a.hudCanvas;
    el.setPointerCapture = () => {};
    const r = el.getBoundingClientRect();
    const send = (type) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true, clientX: r.left + 700, clientY: r.top + 400 }));
    send('pointerdown');
    send('pointerup');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    return [a.catalog.constellations[a.training.card].id, a.training.step];
  });
  assert.deepEqual(onHeels, ['UMa', 3]);
  // Once named, its lines and drawing can be turned off and on to learn the shape (L, B).
  await quiz.click('#btn-train-lines');
  seenNow = await quizParts();
  assert.deepEqual([seenNow.segments, seenNow.art, seenNow.names], [[], ['UMa'], ['UMa']], 'lines off; drawing and name stay');
  await quiz.keyboard.press('b');
  seenNow = await quizParts();
  assert.deepEqual([seenNow.segments, seenNow.art, seenNow.names], [[], [], ['UMa']], 'drawing off too: the bare stars, named');
  await quiz.keyboard.press('l');
  seenNow = await quizParts();
  assert.deepEqual([seenNow.segments, seenNow.art], [['UMa'], []]);
  assert.deepEqual(await quiz.$$eval('#train-view button', (els) => els.map((e) => `${e.textContent}:${e.getAttribute('aria-pressed')}`)), ['Linjer:true', 'Bild:false']);
  // Its story is open below, and can be folded away.
  assert.deepEqual(await quiz.evaluate(() => [document.querySelector('#train-story').open, document.querySelector('#train-story-title').textContent]), [true, 'Om Stora björnen']);
  assert.match(await quiz.textContent('#train-story-origin'), /^Grekisk mytologi$/);
  assert.match(await quiz.textContent('#train-story-text'), /Kallisto/);
  assert.match(await quiz.textContent('#train-story-special'), /Karlavagnen/);
  await quiz.click('#train-story summary');
  await quiz.waitForFunction(() => window.stjarnhimlen.training.showStory === false);
  // Space on the story's heading opens and folds it; it does not answer.
  await quiz.focus('#train-story summary');
  await quiz.keyboard.press(' ');
  await quiz.waitForFunction(() => window.stjarnhimlen.training.showStory === true);
  await quiz.keyboard.press(' ');
  await quiz.waitForFunction(() => window.stjarnhimlen.training.showStory === false);
  assert.deepEqual([(await quizState()).card, (await quizState()).step], ['UMa', 3]);

  // The second click of a double click, as the system counts it, does not answer either.
  await quiz.mouse.move(700, 400);
  await quiz.mouse.down({ clickCount: 2 });
  await quiz.mouse.up({ clickCount: 2 });
  assert.deepEqual([(await quizState()).card, (await quizState()).step], ['UMa', 3]);

  // Answers: a third tap on the sky is "Kan för tillfället", and the next card comes;
  // "Visa svaret" goes straight to the name. A miss ("Fel") comes back after two other cards.
  await quiz.mouse.click(700, 400);
  await settle(quiz);
  assert.deepEqual(await quizState(), { on: true, card: 'Cas', step: 1, inPlay: 4, panel: true, discovering: false });
  assert.equal(await quiz.evaluate(() => window.stjarnhimlen.training.cards.get(window.stjarnhimlen.catalog.byId.get('UMa').index).level), 1);
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  assert.equal((await quizState()).step, 3);
  assert.deepEqual(await quiz.$$eval('#train-actions button', (els) => els.map((e) => e.textContent)), ['Fel', 'Kan för tillfället', 'Kan permanent']);
  assert.equal(await quiz.getAttribute('#btn-train-art', 'aria-pressed'), 'false', 'the choice of drawing stays for the next card');
  assert.deepEqual(await quiz.evaluate(() => [document.querySelector('#train-story').open, document.querySelector('#train-story-title').textContent]), [false, 'Om Cassiopeja'], 'and so does the folded story');
  assert.match(await quiz.textContent('#train-story-text'), /Andromeda/);
  await quiz.click('#train-story summary');
  assert.deepEqual((await quizParts()).art, []);
  await quiz.click('#btn-train-art');
  assert.deepEqual((await quizParts()).art, ['Cas']);
  await quiz.click('#train-actions button:has-text("Fel")');
  assert.equal((await quizState()).card, 'Ori');
  // A touch during the flight to the next card lands it rather than stopping halfway.
  // Every card is shown at the field of view the sky opens with, even after zooming in.
  const flight = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    a.zoomAt(0.4, 640, 400);
    a.answerTraining('now');
    const to = a.anim && { ...a.anim.to };
    const el = a.hudCanvas;
    el.setPointerCapture = () => {};
    const r = el.getBoundingClientRect();
    const send = (type) => el.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, bubbles: true, clientX: r.left + 700, clientY: r.top + 400 }));
    send('pointerdown');
    send('pointerup');
    return { to, az: a.view.az, alt: a.view.alt, fov: Math.round(a.view.fov * 1000) / 1000, step: a.training.step, anim: a.anim };
  });
  assert.ok(flight.to && Math.abs(flight.az - flight.to.az) < 1e-6 && Math.abs(flight.alt - flight.to.alt) < 1e-6, 'the flight landed');
  assert.deepEqual([flight.to.fov, flight.fov], [100, 100], 'zoomed out again');
  assert.deepEqual([flight.step, flight.anim], [1, null], 'and the touch did not count as a tap');
  assert.equal((await quizState()).card, 'Cyg');
  const levelOf = (cid) => quiz.evaluate((c) => window.stjarnhimlen.training.cards.get(window.stjarnhimlen.catalog.byId.get(c).index).level, cid);
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  await quiz.click('#train-actions button:has-text("Kan för tillfället")');
  assert.equal(await levelOf('Cyg'), 1, '"Kan för tillfället" counts it as known for now');
  assert.equal((await quizState()).card, 'Cas', 'the missed card comes back after two others');

  // Two more come in as soon as none is due.
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  await quiz.keyboard.press('3');
  assert.equal(await levelOf('Cas'), 9, 'key 3 is "Kan permanent"');
  let q = await quizState();
  assert.deepEqual([q.inPlay, q.card], [6, 'Leo']);
  assert.match(await quiz.textContent('#train-count'), /^4 av 57$/);
  // "Kan permanent" counts it as known for good.
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  await quiz.click('#train-actions button:has-text("Kan permanent")');
  assert.match(await quiz.textContent('#train-count'), /^5 av 57$/);
  assert.match(await quiz.textContent('#train-of'), /^kan du · 2 permanent · 6 i spel$/);
  q = await quizState();

  // "Upptäck" takes over and keeps its own progress; "Träna" comes back to the same card.
  const cardBefore = q.card;
  await quiz.click('#btn-discover');
  q = await quizState();
  assert.deepEqual([q.on, q.panel, q.discovering], [false, false, true]);
  assert.equal(await quiz.textContent('#discover-count'), '1 av 57');
  assert.equal(await quiz.isDisabled('#btn-list'), false);
  assert.equal(await quiz.isDisabled('[data-layer="lines"]'), false);
  await quiz.click('#btn-train');
  q = await quizState();
  assert.deepEqual([q.on, q.card, q.step], [true, cardBefore, 1]);

  // What is learnt is remembered, levels, rests and all.
  await quiz.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').training;
    return saved?.v === 2 && saved.on === true && saved.cards.length === 6 && saved.turn === window.stjarnhimlen.training.turn;
  });
  const learnt = () => quiz.evaluate(() => JSON.stringify([window.stjarnhimlen.training.turn, ...window.stjarnhimlen.training.cards]));
  const learntBefore = await learnt();
  await quiz.reload();
  await quiz.waitForFunction(() => window.stjarnhimlen);
  q = await quizState();
  assert.deepEqual([q.on, q.inPlay, q.panel, q.step], [true, 6, true, 1]);
  assert.equal(await learnt(), learntBefore);
  assert.equal(await quiz.evaluate(() => window.stjarnhimlen.training.showStory), true, 'the story stays open');

  // Progress saved by the first version still loads: what was known stays known for now,
  // one level per box, and a card that was still resting keeps resting.
  await quiz.evaluate(() => {
    clearTimeout(window.stjarnhimlen.saveTimer);
    const later = Date.now() + 5 * 86_400_000;
    localStorage.setItem('stjarnhimlen:v1', JSON.stringify({ training: { on: true, cards: [['UMa', 3, 0, 4], ['Cas', 0, 0, 2], ['Ori', 6, later, 7]] } }));
  });
  await quiz.reload();
  await quiz.waitForFunction(() => window.stjarnhimlen);
  assert.deepEqual(await quiz.evaluate(() => [...window.stjarnhimlen.training.cards].map(([i, c]) => [window.stjarnhimlen.catalog.constellations[i].id, c.level, c.dueTurn, c.dueAt !== null])), [['UMa', 3, 0, false], ['Cas', 0, 0, false], ['Ori', 4, 80, true]]);
  assert.equal((await quizState()).card, 'Cas', 'the missed one comes first');

  // A card below the horizon is shown through see-through ground, without changing the
  // setting, and stays in view when the time changes. Leaving training lifts the view
  // back above the opaque ground.
  const below = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    a.setTime(Date.UTC(2026, 7, 15, 21, 0));
    a.setSpeed(0);
    const kept = a.inView(a.training.card);
    a.nextTrainingCard({ again: a.catalog.byId.get('Ori').index, instant: true });
    return { kept, below: a.training.below, ground: a.seeThroughNow(), setting: a.layers.seeThrough, alt: a.view.alt < 0 };
  });
  assert.deepEqual(below, { kept: true, below: true, ground: true, setting: false, alt: true });
  assert.match(await quiz.textContent('#train-prompt'), /under horisonten/);
  await quiz.click('#btn-train-exit');
  await settle(quiz);
  assert.ok(await quiz.evaluate(() => window.stjarnhimlen.view.alt > 5), 'the view is above the ground again');
  await quiz.click('#btn-train');

  // Starting over takes two presses.
  await quiz.click('#btn-train-restart');
  assert.equal(await quiz.textContent('#btn-train-restart'), 'Säker? Tryck igen');
  await quiz.click('#btn-train-restart');
  q = await quizState();
  assert.deepEqual([q.card, q.inPlay, q.step], ['UMa', 4, 1]);

  // "Vinterkvällar": only those seen on winter evenings are asked and counted, and the
  // choice is remembered.
  const goalChips = () => quiz.$$eval('#train-goal button', (els) => els.map((e) => `${e.textContent.replace(/\s+/g, ' ').trim()}:${e.getAttribute('aria-pressed')}`));
  assert.deepEqual(await goalChips(), ['Hela året 57:true', 'Vinterkvällar 45:false']);
  await quiz.evaluate(() => window.stjarnhimlen.nextTrainingCard({ again: window.stjarnhimlen.catalog.byId.get('Sco').index, instant: true }));
  assert.equal((await quizState()).card, 'Sco');
  await quiz.click('#train-goal-winter');
  assert.deepEqual(await goalChips(), ['Hela året 57:false', 'Vinterkvällar 45:true']);
  assert.match(await quiz.textContent('#train-count'), /^0 av 45$/);
  assert.match(await quiz.getAttribute('#train-meter', 'aria-valuetext'), /som syns från Stockholm på vinterkvällar/);
  q = await quizState();
  assert.ok(q.card !== 'Sco' && await quiz.evaluate(() => window.stjarnhimlen.winterSet().has(window.stjarnhimlen.training.card)), `Skorpionen gives way to one seen in winter (${q.card})`);
  // Space then shows the next step, not the chip again.
  await quiz.keyboard.press(' ');
  assert.equal((await quizState()).step, 2);
  await quiz.waitForFunction(() => JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').training?.goal === 'winter');
  await quiz.reload();
  await quiz.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await quiz.getAttribute('#train-goal-winter', 'aria-pressed'), 'true');
  assert.match(await quiz.textContent('#train-count'), /^0 av 45$/);
  await quiz.click('#train-goal-year');
  assert.match(await quiz.textContent('#train-count'), /^0 av 57$/);
  await quiz.click('#btn-train-exit');
  assert.equal((await quizState()).on, false);

  // On a phone the panel fits, and a tap on the sky shows the next step.
  const phoneQuiz = await openPage({ width: 390, height: 844 }, { discover: true });
  await phoneQuiz.click('#btn-train');
  await settle(phoneQuiz);
  assert.ok((await phoneQuiz.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'no horizontal scroll');
  await phoneQuiz.mouse.click(195, 600);
  assert.equal(await phoneQuiz.evaluate(() => window.stjarnhimlen.training.step), 2);
  await phoneQuiz.screenshot({ path: path.join(shots, 'phone-training.png') });
  // Named, its story waits folded, so that the panel leaves the sky in view.
  await phoneQuiz.mouse.click(195, 600);
  await settle(phoneQuiz);
  assert.deepEqual(await phoneQuiz.evaluate(() => [window.stjarnhimlen.training.step, document.querySelector('#train-story').hidden, document.querySelector('#train-story').open]), [3, false, false]);
  // One more tap means "Kan för tillfället"; so does Space, once per press: held down it
  // does not go on into the next card. And 2 too.
  const cardOf = (page) => page.evaluate(() => {
    const a = window.stjarnhimlen;
    return { card: a.catalog.constellations[a.training.card].id, step: a.training.step, levels: [...a.training.cards].filter(([, c]) => c.n > 0).map(([i, c]) => `${a.catalog.constellations[i].id}:${c.level}`) };
  });
  const phoneCard = () => cardOf(phoneQuiz);
  const firstCard = (await phoneCard()).card;
  await phoneQuiz.evaluate(() => { window.stjarnhimlen.training.namedAt -= 1000; });
  await phoneQuiz.mouse.click(195, 600);
  await settle(phoneQuiz);
  let answered = await phoneCard();
  assert.deepEqual([answered.step, answered.levels], [1, [`${firstCard}:1`]]);
  const secondCard = answered.card;
  await phoneQuiz.keyboard.press(' ');
  await phoneQuiz.keyboard.press(' ');
  assert.equal((await phoneCard()).step, 3);
  await phoneQuiz.evaluate(() => { window.stjarnhimlen.training.namedAt -= 1000; });
  for (let k = 0; k < 6; k++) await phoneQuiz.keyboard.down(' ');
  await phoneQuiz.keyboard.up(' ');
  await settle(phoneQuiz);
  answered = await phoneCard();
  assert.deepEqual([answered.step, answered.levels], [1, [`${firstCard}:1`, `${secondCard}:1`]], 'Space held down answers once and goes no further');
  const thirdCard = answered.card;
  await phoneQuiz.click('#train-actions button:has-text("Visa svaret")');
  await phoneQuiz.keyboard.press('2');
  assert.deepEqual((await phoneCard()).levels, [`${firstCard}:1`, `${secondCard}:1`, `${thirdCard}:1`]);

  // On a touch screen, the tap that shows the name makes the panel grow under the finger;
  // the click the browser makes up from that tap must not press the answer now there.
  const touchQuiz = await openPage({ width: 390, height: 844 }, { discover: true, touch: true });
  await touchQuiz.evaluate(() => window.stjarnhimlen.setTraining(true));
  await settle(touchQuiz);
  await touchQuiz.evaluate(() => window.stjarnhimlen.revealTraining());
  const fel = await touchQuiz.$eval('#train-actions button', (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent }; });
  assert.equal(fel.text, 'Fel');
  await touchQuiz.evaluate(() => window.stjarnhimlen.answerTraining('now'));
  await settle(touchQuiz);
  await touchQuiz.evaluate(() => window.stjarnhimlen.advanceTraining());
  const panelBottom = await touchQuiz.$eval('#panel-train', (p) => p.getBoundingClientRect().bottom);
  assert.ok(panelBottom < fel.y, 'at step 2 the sky shows where Fel will be');
  const touched = (await cardOf(touchQuiz)).card;
  await touchQuiz.touchscreen.tap(fel.x, fel.y);
  await settle(touchQuiz);
  assert.deepEqual(await cardOf(touchQuiz), { card: touched, step: 3, levels: ['UMa:1'] }, 'the tap showed the name and pressed nothing');
  const underFinger = await touchQuiz.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent, [fel.x, fel.y]);
  assert.equal(underFinger, 'Fel', 'though Fel came up under the finger');

  // "Design": a list of interface designs. Each one is put on the page when chosen, keeps
  // the layout in one piece on a desktop and a phone, and is remembered.
  const themeIds = await phone.evaluate(() => [...document.querySelectorAll('#theme-list input')].map((i) => i.value));
  assert.deepEqual(themeIds, ['glas', 'mcc', 'dsky', 'crt', 'nasa75', 'checklista']);
  for (const [page, kind] of [[await openPage({ width: 1280, height: 800 }, { discover: true }), 'desktop'], [phone, 'phone']]) {
    await page.click('#btn-theme');
    assert.equal(await page.isVisible('#panel-theme'), true);
    assert.equal(await page.isChecked('#theme-list input[value="glas"]'), true, 'the current design is chosen at first');
    for (const themeId of themeIds) {
      await page.click(`#theme-list input[value="${themeId}"]`);
      const state = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        css: document.getElementById('theme-style').textContent.length,
        overflow: document.documentElement.scrollWidth - innerWidth,
        toggles: document.getElementById('toggles').getBoundingClientRect().height,
      }));
      assert.equal(state.theme, themeId);
      assert.ok(themeId === 'glas' ? state.css === 0 : state.css > 2000, `${themeId}: its style sheet is on the page (${state.css} characters)`);
      assert.ok(state.overflow <= 0, `${themeId} on a ${kind}: no horizontal scroll`);
      assert.ok(state.toggles >= 30 && state.toggles < 80, `${themeId} on a ${kind}: the toggles keep their row (${state.toggles}px)`);
      await settle(page);
      await page.waitForTimeout(250); // colour transitions between designs
      await page.screenshot({ path: path.join(shots, `design-${themeId}-${kind}.png`) });
    }
    // Escape closes the list of designs; opening the constellation list closes it too.
    await page.keyboard.press('Escape');
    assert.equal(await page.isHidden('#panel-theme'), true);
    await page.click('#btn-theme');
    await page.click('#btn-list');
    assert.equal(await page.isHidden('#panel-theme'), true);
    await page.click('#btn-list-close');
  }
  // On the published page the host puts the base style sheet in <body>. The designs must
  // still restyle what looks most generic in the base: the round buttons, their font and
  // the dots on the toggles.
  const hostedLooks = await phone.evaluate((ids) => {
    document.body.prepend(document.querySelector('head style'));
    const looks = {};
    for (const id of ids) {
      window.stjarnhimlen.setTheme(id);
      const chip = document.querySelector('[data-layer="lines"]');
      const dot = getComputedStyle(chip, '::before');
      looks[id] = {
        round: getComputedStyle(chip).borderRadius === '999px',
        jost: getComputedStyle(chip).fontFamily.startsWith('Jost'),
        dot: dot.content !== 'none' && dot.borderRadius === '50%',
      };
    }
    return looks;
  }, themeIds);
  for (const id of themeIds) {
    const base = id === 'glas';
    assert.deepEqual(hostedLooks[id], { round: base, jost: base, dot: base }, `${id} restyles the buttons on the published page`);
  }

  // The choice is remembered.
  await phone.evaluate(() => window.stjarnhimlen.setTheme('crt'));
  await phone.waitForFunction(() => JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').theme === 'crt');
  await phone.reload();
  await phone.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await phone.evaluate(() => document.documentElement.dataset.theme), 'crt');
  await phone.click('#btn-theme');
  assert.equal(await phone.isChecked('#theme-list input[value="crt"]'), true);

  assert.deepEqual(errors, [], 'no errors in the console');
  console.log('e2e smoke: ok');
} finally {
  await browser.close();
}
