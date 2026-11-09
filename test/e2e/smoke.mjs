// Smoke test in headless Chromium: the sky renders, a tap on a constellation toggles its
// illustration, the list opens the info card, marking works, the sky can be discovered
// one neighbouring group at a time ("Upptäck"), training with flashcards works ("Träna"), and
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
  // "Vinterhimlen" keeps the 34 seen at ten on winter evenings from Stockholm and Göteborg.
  const listNames = () => page.$$eval('#con-list li:not([hidden]) strong', (els) => els.map((e) => e.textContent));
  const listChips = () => page.$$eval('#filter-visible, #filter-winter, #filter-all', (els) => els.map((e) => e.getAttribute('aria-pressed')));
  assert.deepEqual([await page.textContent('#filter-count'), await page.textContent('#filter-winter-count')], ['57', '34']);
  assert.equal((await listNames()).length, 57);
  await page.click('#filter-winter');
  assert.deepEqual(await listChips(), ['false', 'true', 'false']);
  assert.deepEqual([await page.textContent('#filter-count'), await page.textContent('#filter-winter-count')], ['57', '34']);
  const winterNames = await listNames();
  assert.equal(winterNames.length, 34);
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
  assert.equal(await page.textContent('#filter-winter-count'), '34', 'the winter sky is the same from every place');
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

  // "Upptäck": a first visit opens on the group of the bears round the pole, and offers the
  // groups next to it.
  const sky = await openPage({ width: 1280, height: 800 }, { discover: true });
  const discovery = () => sky.evaluate(() => {
    const a = window.stjarnhimlen;
    const id = (i) => a.catalog.constellations[i].id;
    return {
      on: a.discovery.on,
      groups: [...a.discovery.groups].sort((x, y) => x - y).map((g) => a.chunks[g].name),
      found: [...a.discovery.found].map(id).sort(),
      next: a.discoveryInfo ? a.discoveryInfo.next.map((g) => a.chunks[g].name) : null,
      count: document.getElementById('discover-count').textContent,
      panel: !document.getElementById('panel-discover').hidden,
      pressed: document.getElementById('btn-discover').getAttribute('aria-pressed'),
    };
  });
  const inView = (id) => sky.evaluate((c) => window.stjarnhimlen.inView(window.stjarnhimlen.catalog.byId.get(c).index), id);
  /** A group by name: its index and its members' ids. */
  const groupNamed = (name) => sky.evaluate((n) => {
    const a = window.stjarnhimlen;
    const g = a.chunks.findIndex((ch) => ch.name === n);
    return { g, members: a.chunks[g].members.map((i) => a.catalog.constellations[i].id).sort() };
  }, name);
  /** The name of the group a constellation belongs to. */
  const groupOfId = (id) => sky.evaluate((c) => window.stjarnhimlen.chunkOf.get(window.stjarnhimlen.catalog.byId.get(c).index).name, id);
  /** Screen position of a direction, and the panel's box. */
  const onScreen = (vec) => sky.evaluate((v) => {
    const a = window.stjarnhimlen;
    a.view.timeMs = a.now();
    a.view.update();
    const p = { x: 0, y: 0, z: 0 };
    a.view.projectEq(v, p);
    return { x: p.x, y: p.y, panel: a.discoverPanel.root.getBoundingClientRect().toJSON() };
  }, vec);
  /** Turns the view so that a direction lands on a screen point (Newton's method, in steps of at most 10 degrees). */
  const placeAt = (vec, x, y) => sky.evaluate(([v, tx, ty]) => {
    const a = window.stjarnhimlen;
    const p = { x: 0, y: 0, z: 0 };
    const miss = (az, alt) => {
      Object.assign(a.view, { az, alt, timeMs: a.now() });
      a.view.update();
      a.view.projectEq(v, p);
      return [p.x - tx, p.y - ty];
    };
    const step = (d) => Math.max(-10, Math.min(10, d));
    let { az, alt } = a.view;
    for (let k = 0; k < 60; k++) {
      const f = miss(az, alt);
      if (Math.hypot(...f) < 0.5) break;
      const fa = miss(az + 0.01, alt);
      const fb = miss(az, alt + 0.01);
      const j = [(fa[0] - f[0]) / 0.01, (fb[0] - f[0]) / 0.01, (fa[1] - f[1]) / 0.01, (fb[1] - f[1]) / 0.01];
      const det = j[0] * j[3] - j[1] * j[2];
      az -= step((j[3] * f[0] - j[1] * f[1]) / det);
      alt = Math.max(-89, Math.min(89, alt - step((j[0] * f[1] - j[2] * f[0]) / det)));
    }
    miss(az, alt);
    a.invalidate();
  }, [vec, x, y]);
  const bears = ['Dra', 'UMa', 'UMi'];
  assert.deepEqual(await discovery(), {
    on: true,
    groups: ['Björnarna vid polen'],
    found: bears,
    next: ['Perseus räddar Andromeda', 'Herakles fiender', 'Björnvaktaren och hundarna', 'Svanen och Lyran', 'Gömda djur kring björnen',
      'Kronan, hjälten och läkaren'],
    count: '1 av 18',
    panel: true,
    pressed: 'true',
  });
  assert.equal(await sky.textContent('#discover-of'), 'grupper som syns från Stockholm');
  assert.match(await sky.textContent('#discover-hint'), /^Här är Björnarna vid polen: Stora björnen, Lilla björnen och Draken\. Lägg till en grannegrupp/);
  for (const id of bears) assert.equal(await inView(id), true, `the view opens on the bears, ${id} clear of the panel`);
  assert.deepEqual(await sky.$$eval('#discover-next button', (els) => els.map((b) => b.firstChild.textContent)),
    (await discovery()).next.map((n) => `+ ${n}`));
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
  const start = await drawnStars();
  assert.ok(start.n > 40, `the bears' stars are drawn (${start.n})`);
  assert.equal(start.stray, 0, 'no other stars are drawn');
  await sky.screenshot({ path: path.join(shots, 'discover-start.png') });

  // Nothing else of a hidden constellation is drawn either, with every layer on and a mark
  // on it: one frame is drawn while recording whose figures, outlines, illustrations and
  // names are traced, which groups' lines and names, and how much of the sky is tinted.
  const drawnParts = (hover = null, page = sky) => page.evaluate((hoverId) => {
    const a = window.stjarnhimlen;
    if (hoverId) a.hover = a.catalog.byId.get(hoverId).index;
    const sl = a.skyLayer;
    const owner = new Map();
    for (const c of a.catalog.constellations) for (const part of [c.segments, c.outlines, c.art]) owner.set(part, c.id);
    const names = new Map(a.catalog.constellations.map((c) => [c.sv.toUpperCase(), c.id]));
    const groupNames = new Set(a.chunks.map((ch) => ch.name));
    const seen = { segments: new Set(), outlines: new Set(), art: new Set(), names: new Set(), texts: new Set(), offers: new Set() };
    const obstacles = a.labelObstacles();
    const boxes = [];
    let covered = 0;
    let tinted = 0;
    // Lines of the boundary round the group being learnt, and round the groups found.
    let outlined = 0;
    let groupLined = 0;
    const wrap = (obj, name, record) => {
      const fn = obj[name];
      obj[name] = function (...args) {
        record(...args);
        return fn.apply(this, args);
      };
    };
    wrap(sl, 'traceSegments', (segs) => owner.has(segs) && seen.segments.add(owner.get(segs)));
    wrap(sl, 'tracePolyline', (view, rings) => {
      const offer = a.offers.find((o) => o.outline === rings);
      if (owner.has(rings)) seen.outlines.add(owner.get(rings));
      else if (a.training.on && rings === a.trainingOutline()) outlined += rings.length;
      else if (offer) seen.offers.add(offer.name);
      else if (a.discovering) groupLined += rings.length;
    });
    wrap(sl, 'traceArt', (view, lines) => owner.has(lines) && seen.art.add(owner.get(lines)));
    wrap(a.hud, 'label', (text, x, y) => {
      seen.texts.add(text);
      const id = names.get(text);
      if (!id && !groupNames.has(text.replace(/^\+ /, ''))) return;
      if (id) seen.names.add(id);
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
    return { ...Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v].sort()])), covered, overlaps, tinted, outlined, groupLined };
  }, hover);
  const offer = (await discovery()).next;
  const plain = await drawnParts();
  await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    for (const layer of ['art', 'bounds', 'names']) a.setLayer(layer, true);
    a.toggleMark(a.catalog.byId.get('Ori').index);
    a.markAllUp();
  });
  // With the mouse on Cassiopeja, in a group on offer, so that the line round the group
  // lights up but not its figure.
  const parts = await drawnParts('Cas');
  assert.deepEqual(parts.segments, bears, 'only found figures are drawn');
  assert.deepEqual(parts.art, bears, 'only found illustrations are drawn');
  assert.ok(parts.outlines.every((id) => bears.includes(id)), `outlines of their own: only found ones (${parts.outlines})`);
  assert.deepEqual(parts.offers, [...offer].sort(), 'a line round each group on offer');
  assert.ok(parts.groupLined > 0, 'a line round the group found');
  assert.ok(parts.names.includes('UMa') && parts.names.every((id) => bears.includes(id)), `names: ${parts.names}`);
  const plus = parts.texts.filter((t) => t.startsWith('+ '));
  assert.ok(plus.includes('+ Perseus räddar Andromeda') && plus.every((t) => offer.includes(t.slice(2))), `the groups on offer are named: ${plus}`);
  assert.ok(parts.texts.includes('Björnarna vid polen'), 'the group found is named');
  assert.equal(parts.covered, 0, 'no name is drawn under the panel or the brand');
  assert.equal(parts.overlaps, 0, 'names do not run into each other');
  // A name that would land under the panel is left out.
  const draLabel = await sky.evaluate(() => window.stjarnhimlen.catalog.byId.get('Dra').labelVecs[0]);
  const box = (await onScreen(draLabel)).panel;
  await placeAt(draLabel, box.right - 60, box.top + 100);
  await settle(sky);
  const placed = await onScreen(draLabel);
  assert.ok(Math.hypot(placed.x - box.right + 60, placed.y - box.top - 100) < 2, `Draco's name is under the panel (${Math.round(placed.x)}, ${Math.round(placed.y)})`);
  const under = await drawnParts();
  assert.ok(!under.names.includes('Dra') && under.covered === 0, `a name under the panel is left out (${under.names})`);
  await sky.evaluate(() => window.stjarnhimlen.flyTo(window.stjarnhimlen.catalog.byId.get('UMa').index, { instant: true }));
  await settle(sky);
  // The marks tint the found constellations instead of their group's colour, and the
  // hidden Orion is not tinted at all.
  assert.equal(parts.tinted, plain.tinted, 'marks tint nothing beyond what is found and on offer');
  const marked = await sky.evaluate(() => [...window.stjarnhimlen.marks.keys()].map((i) => window.stjarnhimlen.catalog.constellations[i].id).sort());
  assert.ok(marked.includes('Ori') && marked.includes('UMa') && marked.every((id) => id === 'Ori' || bears.includes(id)), `marked: ${marked}`);
  const shownMarks = marked.length - 1;
  assert.equal(await sky.textContent('#mark-count'), String(shownMarks), 'the hidden mark is not counted');
  // "Rensa markeringar" removes the marks that can be seen and keeps the hidden one.
  await sky.click('#btn-list');
  await sky.click('#btn-clear');
  assert.equal(await sky.textContent('#toast'), `Tog bort ${shownMarks} ${shownMarks === 1 ? 'markering' : 'markeringar'}`);
  assert.deepEqual(await sky.evaluate(() => [...window.stjarnhimlen.marks.keys()].map((i) => window.stjarnhimlen.catalog.constellations[i].id)), ['Ori']);
  await sky.click('#btn-list-close');
  // Upptäck draws the line round each group, from the start, with each group found in a
  // colour of its own; or each constellation's boundary; or none. "Gränser" in the bar
  // turns them off and on again, and leaves the layer of the whole sky as it was.
  const boundsChoice = () => sky.$$eval('.discover-bounds .chip', (els) => els.map((el) => `${el.textContent}:${el.getAttribute('aria-pressed')}`));
  const barBounds = () => sky.getAttribute('[data-layer="bounds"]', 'aria-pressed');
  await sky.evaluate(() => window.stjarnhimlen.setLayer('bounds', false));
  assert.deepEqual([await boundsChoice(), await barBounds()], [['Inga:false', 'Stjärnbilder:false', 'Grupper:true'], 'true']);
  const grouped = await drawnParts();
  assert.ok(grouped.outlines.length === 0 && grouped.groupLined > 0, 'no boundary of their own round the bears, a line round their group');
  assert.deepEqual(await sky.evaluate(() => {
    const lines = window.stjarnhimlen.discoverGroupOutlines();
    return [lines.length, Math.hypot(...lines[0][0].map((x, k) => x - lines[0].at(-1)[k])) < 1e-6];
  }), [1, true], 'one closed line round the bears');
  await sky.click('#discover-bounds-constellation');
  assert.deepEqual(await boundsChoice(), ['Inga:false', 'Stjärnbilder:true', 'Grupper:false']);
  const byConstellation = await drawnParts();
  assert.deepEqual([byConstellation.outlines, byConstellation.groupLined], [bears, 0]);
  assert.ok(byConstellation.tinted < grouped.tinted, `the group found loses its colour (${grouped.tinted} -> ${byConstellation.tinted})`);
  await sky.click('[data-layer="bounds"]');
  assert.deepEqual([await boundsChoice(), await barBounds()], [['Inga:true', 'Stjärnbilder:false', 'Grupper:false'], 'false']);
  assert.deepEqual((await drawnParts()).outlines, [], 'no boundaries');
  await sky.click('[data-layer="bounds"]');
  assert.deepEqual([await boundsChoice(), await barBounds()], [['Inga:false', 'Stjärnbilder:true', 'Grupper:false'], 'true'], 'back as chosen');
  await sky.click('#discover-bounds-none');
  assert.equal(await barBounds(), 'false');
  await sky.click('#discover-bounds-group');
  assert.deepEqual([await boundsChoice(), await barBounds()], [['Inga:false', 'Stjärnbilder:false', 'Grupper:true'], 'true']);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.layers.bounds), false, 'the layer of the whole sky is left alone');
  await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    a.marks.clear();
    a.marksChanged();
    a.setLayer('art', false);
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

  // A tap on a constellation in a group on offer adds the whole group, and the groups next
  // to it are offered in turn.
  const offered = await pointOver(2);
  assert.ok(offered, 'a group on offer is in view');
  await sky.mouse.move(offered.x, offered.y);
  assert.equal(await hoverId(), offered.id, 'a group on offer lights up under the mouse');
  await sky.mouse.click(offered.x, offered.y);
  await settle(sky);
  const firstName = await groupOfId(offered.id);
  const first = await groupNamed(firstName);
  let d = await discovery();
  assert.deepEqual(d.groups.sort(), ['Björnarna vid polen', firstName].sort());
  assert.deepEqual(d.found, [...bears, ...first.members].sort());
  assert.equal(d.count, '2 av 18');
  assert.ok(!d.next.includes(firstName), 'what is found is not offered again');
  assert.match(await sky.textContent('#discover-hint'), new RegExp(`^${firstName} är upptäckt: [^.]+\\. Lägg till en grannegrupp:$`));
  const two = await drawnStars();
  assert.ok(two.n > start.n && two.stray === 0, `its stars appear (${start.n} -> ${two.n})`);

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

  // The buttons in the panel add groups too, and turn the view to one that is out of
  // sight, here hidden behind the panel itself.
  await sky.evaluate(() => {
    window.stjarnhimlen.view.fov = 80;
    window.stjarnhimlen.invalidate();
  });
  const chipGroup = await sky.evaluate(() => {
    const b = [...document.querySelectorAll('#discover-next button')].find((e) => !e.querySelector('.state').textContent);
    return b ? Number(b.dataset.group) : null;
  });
  assert.ok(chipGroup !== null, 'a group all above the horizon is on offer');
  const middle = await sky.evaluate((g) => window.stjarnhimlen.groupShape(g).middle, chipGroup);
  const behind = (await onScreen(middle)).panel;
  await placeAt(middle, behind.right - 40, (behind.top + behind.bottom) / 2);
  await settle(sky);
  assert.equal(await sky.evaluate((g) => window.stjarnhimlen.groupInView(g), chipGroup), false);
  await sky.click(`#discover-next button[data-group="${chipGroup}"]`);
  await settle(sky);
  d = await discovery();
  assert.equal(d.groups.length, 3);
  const chipMembers = await sky.evaluate((g) => window.stjarnhimlen.chunks[g].members.map((i) => window.stjarnhimlen.catalog.constellations[i].id), chipGroup);
  assert.ok(chipMembers.every((id) => d.found.includes(id)), 'all of the group is found');
  const landed = await onScreen(middle);
  assert.ok(landed.x > landed.panel.right + 50, `the view turned to it, clear of the panel (${Math.round(landed.x)} > ${landed.panel.right})`);
  assert.equal(await sky.evaluate((g) => window.stjarnhimlen.groupInView(g), chipGroup), true);
  // Keyboard: Enter on a button adds it and keeps the focus in the row.
  await sky.focus('#discover-next button');
  await sky.keyboard.press('Enter');
  await settle(sky);
  assert.equal((await discovery()).groups.length, 4);
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
  const chipId = chipMembers[0];
  const chipVec = await sky.evaluate((c) => window.stjarnhimlen.catalog.byId.get(c).centerVec, chipId);
  await sky.click('#btn-list');
  await sky.click(`#con-list li[data-index="${await sky.evaluate((c) => window.stjarnhimlen.catalog.byId.get(c).index, chipId)}"] .con-name`);
  await settle(sky);
  const between = await onScreen(chipVec);
  const listLeft = await sky.$eval('#panel-list', (e) => e.getBoundingClientRect().left);
  const gap = (between.panel.right + listLeft) / 2;
  assert.ok(Math.abs(between.x - gap) < 40, `centred between the panel and the list (${Math.round(between.x)}, gap centre ${Math.round(gap)})`);
  await sky.click('#card .icon-btn');
  const listed = await sky.$$eval('#con-list li:not([hidden]):not(.empty) strong', (els) => els.length);
  assert.equal(listed, d.found.length);
  assert.equal(await sky.isVisible('#list-note'), true);
  // Vattumannen's group is two groups away from any next to the bears.
  await sky.fill('#search', 'vattumannen');
  assert.equal(await sky.textContent('#con-list .empty'), 'Vattumannen har du inte upptäckt än.');
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
    return saved?.collapsed === false && saved.byGroups === true && JSON.stringify([...saved.found].sort()) === ids;
  }, foundIds);
  await sky.reload();
  await sky.waitForFunction(() => window.stjarnhimlen);
  assert.deepEqual(await discovery().then((x) => [x.groups, x.found]), [d.groups, d.found]);
  assert.deepEqual(await boundsChoice(), ['Inga:false', 'Stjärnbilder:false', 'Grupper:true']);

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
  assert.ok(whole.n > discovering.n * 1.5, `the whole sky is back (${discovering.n} -> ${whole.n} stars)`);
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
  assert.deepEqual([d.on, d.panel, d.groups.length], [true, true, 4]);
  // Zoomed out while discovering, the names of constellations and groups keep apart too.
  await sky.evaluate(() => {
    window.stjarnhimlen.view.fov = 160;
    window.stjarnhimlen.invalidate();
  });
  await settle(sky);
  const wide = await drawnParts();
  assert.ok(wide.texts.some((t) => t.startsWith('+ ')) && wide.overlaps === 0 && wide.covered === 0, `${wide.texts.length} names, ${wide.overlaps} overlapping`);

  // Another place changes the goal: fewer groups rise in Kiruna.
  await sky.evaluate(() => window.stjarnhimlen.setPlace('kiruna'));
  assert.match((await discovery()).count, /^\d+ av 16$/);
  await sky.evaluate(() => window.stjarnhimlen.setPlace('stockholm'));

  // Collecting every group on offer finishes the sky seen from here. The rest never rise
  // here, so going on makes the ground see-through and turns to one of them.
  const collect = () => sky.evaluate(() => {
    const a = window.stjarnhimlen;
    while (a.discoveryInfo.next.length) a.discoverGroup(a.discoveryInfo.next[0]);
  });
  await collect();
  assert.match(await sky.textContent('#discover-hint'), /Klart! Du har hittat alla 18 grupper som syns från Stockholm\.$/);
  assert.equal(await sky.textContent('#btn-discover-rest'), 'Fortsätt med resten av himlen (10 grupper till)');
  const hiddenAfterDone = await pointOver(0);
  if (hiddenAfterDone) {
    await sky.mouse.click(hiddenAfterDone.x, hiddenAfterDone.y);
    assert.match(await sky.textContent('#toast'), /Fortsätt med resten av himlen/);
  }
  await sky.click('#btn-discover-rest');
  await settle(sky);
  d = await discovery();
  assert.equal(d.count, '18 av 28');
  assert.equal(await sky.textContent('#discover-of'), 'grupper');
  assert.ok(d.next.length > 0);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.layers.seeThrough), true);
  assert.ok(await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    return a.discoveryInfo.next.some((g) => a.vecInView(a.groupShape(g).middle));
  }), 'one of the rest is in view');
  assert.match(await sky.textContent('#discover-hint'), /syns aldrig från Stockholm, så marken är genomskinlig/);
  // Going on is remembered too.
  const found19 = await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    a.discoverGroup(a.discoveryInfo.next[0]);
    return a.discovery.found.size;
  });
  await sky.waitForFunction((n) => {
    const saved = JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').discover;
    return saved?.on === true && saved.all === true && saved.found.length === n;
  }, found19);
  await sky.reload();
  await sky.waitForFunction(() => window.stjarnhimlen);
  assert.equal((await discovery()).count, '19 av 28');
  await collect();
  d = await discovery();
  assert.deepEqual([d.found.length, d.groups.length, d.next.length, d.count], [88, 28, 0, '28 av 28']);
  assert.match(await sky.textContent('#discover-hint'), /Hela himlen! Du har hittat alla 28 grupper, alla 88 stjärnbilder\.$/);
  assert.equal(await sky.isHidden('#btn-discover-rest'), true);

  // Starting over takes two presses and turns back to the bears.
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
  assert.deepEqual([d.groups, d.found, d.count], [['Björnarna vid polen'], bears, '1 av 18']);
  assert.equal(await inView('UMa'), true);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.layers.seeThrough), false, 'the see-through ground it turned on is off again');
  // Turning the mode back on with only the bears found turns to them as well.
  await sky.click('#btn-discover-exit');
  await sky.evaluate(() => {
    Object.assign(window.stjarnhimlen.view, { az: 180, alt: 20, fov: 60 });
    window.stjarnhimlen.invalidate();
  });
  await sky.click('#btn-discover');
  await settle(sky);
  assert.equal(await inView('UMa'), true);

  // A group added by its button while below the horizon: the button says so, and a note
  // explains why it cannot be seen. In mid August at 23:00 Herakles' foes are under the ground.
  await sky.evaluate(() => window.stjarnhimlen.setTime(Date.UTC(2026, 7, 15, 21, 0)));
  const foes = await groupNamed('Herakles fiender');
  assert.match(await sky.textContent(`#discover-next button[data-group="${foes.g}"]`), /nere|delvis uppe/);
  await sky.click(`#discover-next button[data-group="${foes.g}"]`);
  assert.match(await sky.textContent('#toast'), /^(En del av )?Herakles fiender är under horisonten just nu/);

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

  // "Träna": flashcards. Play starts with the first group, the bears at the pole, Ursa
  // Major first, shown with its stars only; then its lines, then its name and drawing.
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
  // The first group is shown whole first: its members together, with lines, drawings and names.
  const viewOf = (page) => page.evaluate(() => {
    const a = window.stjarnhimlen;
    const v = a.training.view;
    return v ? `${v.kind}:${a.chunks[v.group].name}` : null;
  });
  const passGroup = (page) => page.evaluate(() => {
    const a = window.stjarnhimlen;
    a.training.namedAt -= 1000;
    a.leaveTrainingGroup();
  });
  assert.equal(await viewOf(quiz), 'intro:Björnarna vid polen');
  assert.match(await quiz.textContent('#train-prompt'), /^Här är gruppen ”Björnarna vid polen”: Stora björnen, Lilla björnen och Draken, tillsammans på himlen\.$/);
  assert.match(await quiz.textContent('#train-group-why'), /^Karlavagnen hör till Stora björnen/);
  const together = await quizParts();
  assert.deepEqual([together.segments, together.art, together.names].map((list) => [...list].sort()), [['Dra', 'UMa', 'UMi'], ['Dra', 'UMa', 'UMi'], ['Dra', 'UMa', 'UMi']]);
  assert.deepEqual([together.outlines, together.outlined], [[], 1], 'one line round the group, none round each of them');
  // "Fortsätt" (here by Space, focus being on it) goes on to the first card.
  await quiz.evaluate(() => { window.stjarnhimlen.training.namedAt -= 1000; });
  await quiz.keyboard.press(' ');
  await settle(quiz);
  assert.deepEqual(await quizState(), { on: true, card: 'UMa', step: 1, inPlay: 3, panel: true, discovering: false });
  assert.equal(await quiz.evaluate(() => Math.round(window.stjarnhimlen.view.fov * 1000) / 1000), 100, 'the field of view the sky opens with');
  assert.match(await quiz.textContent('#train-prompt'), /^En ny stjärnbild!/);
  // One group at a time: the panel says which, and how much of it is known.
  assert.equal(await quiz.textContent('#train-group'), 'Grupp 1 av 28: Björnarna vid polen · 0 av 3 kan du');
  assert.equal(await quiz.getAttribute('#btn-train', 'aria-pressed'), 'true');
  assert.equal(await quiz.getAttribute('#btn-discover', 'aria-pressed'), 'false');
  // The list would give the answers away, and the cards decide on lines, names and drawings.
  assert.equal(await quiz.isDisabled('#btn-list'), true);
  assert.equal(await quiz.isDisabled('[data-layer="lines"]'), true);
  assert.equal(await quiz.getAttribute('[data-layer="lines"]', 'aria-pressed'), 'false');
  let seenNow = await quizParts();
  assert.deepEqual([seenNow.segments, seenNow.outlines, seenNow.art, seenNow.names], [[], [], [], []], 'stars only: no lines, outlines, drawings or names');
  assert.equal(seenNow.outlined, 1, 'but the boundary round the group, which the panel names anyway');
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
  // The boundary round the group can be turned off and on, at any step: G, "Gränser" in
  // the panel, or "Gränser" at the bottom, which while training is the group's.
  const boundsState = () => quiz.evaluate(() => {
    const bar = document.querySelector('[data-layer="bounds"]');
    return [window.stjarnhimlen.training.showBounds, document.getElementById('btn-train-bounds').getAttribute('aria-pressed'), bar.getAttribute('aria-pressed'), bar.disabled];
  });
  assert.deepEqual(await boundsState(), [true, 'true', 'true', false]);
  await quiz.keyboard.press('g');
  assert.deepEqual(await boundsState(), [false, 'false', 'false', false]);
  assert.equal((await quizParts()).outlined, 0, 'turned off');
  await quiz.waitForFunction(() => JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').training?.bounds === false);
  // Clicked, either gives focus back to the card, so that Space goes on with it.
  const focused = () => quiz.evaluate(() => document.activeElement.textContent);
  await quiz.click('#btn-train-bounds');
  assert.deepEqual([...await boundsState(), await focused()], [true, 'true', 'true', false, 'Visa svaret']);
  await quiz.click('[data-layer="bounds"]');
  assert.deepEqual([...await boundsState(), await focused()], [false, 'false', 'false', false, 'Visa svaret']);
  assert.equal(await quiz.evaluate(() => window.stjarnhimlen.layers.bounds), false, 'the boundaries of every constellation stay as they were');
  await quiz.keyboard.press('G');
  assert.deepEqual([(await quizParts()).outlined, (await quizState()).step], [1, 2], 'on again, and still the second step');
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
  // So is why its group belongs together.
  assert.equal(await quiz.textContent('#train-story-group'), 'Grupp 1, Björnarna vid polen:');
  assert.match(await quiz.textContent('#train-group-text'), /^Karlavagnen hör till Stora björnen/);
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
  assert.deepEqual(await quizState(), { on: true, card: 'UMi', step: 1, inPlay: 3, panel: true, discovering: false });
  assert.equal(await quiz.evaluate(() => window.stjarnhimlen.training.cards.get(window.stjarnhimlen.catalog.byId.get('UMa').index).level), 1);
  // Stora björnen, known now, stays on the sky around the next card of its group.
  const around = await quizParts();
  assert.deepEqual([around.segments, around.art, around.names].map((list) => [...list]), [['UMa'], ['UMa'], ['UMa']]);
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  assert.equal((await quizState()).step, 3);
  assert.deepEqual(await quiz.$$eval('#train-actions button', (els) => els.map((e) => e.textContent)), ['Fel', 'Kan för tillfället', 'Kan permanent']);
  assert.equal(await quiz.getAttribute('#btn-train-art', 'aria-pressed'), 'false', 'the choice of drawing stays for the next card');
  assert.deepEqual(await quiz.evaluate(() => [document.querySelector('#train-story').open, document.querySelector('#train-story-title').textContent]), [false, 'Om Lilla björnen'], 'and so does the folded story');
  assert.match(await quiz.textContent('#train-story-text'), /Kynosura/);
  await quiz.click('#train-story summary');
  assert.deepEqual([...(await quizParts()).art], ['UMa'], 'only the known one around it');
  await quiz.click('#btn-train-art');
  assert.deepEqual([...(await quizParts()).art].sort(), ['UMa', 'UMi']);
  await quiz.click('#train-actions button:has-text("Fel")');
  assert.equal((await quizState()).card, 'Dra');
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
  // The group is not left while the miss rests: a card of it already known fills in.
  assert.deepEqual([(await quizState()).card, (await quizState()).inPlay], ['UMa', 3]);
  assert.equal(await quiz.textContent('#train-group'), 'Grupp 1 av 28: Björnarna vid polen · 2 av 3 kan du');
  const levelOf = (cid) => quiz.evaluate((c) => window.stjarnhimlen.training.cards.get(window.stjarnhimlen.catalog.byId.get(c).index).level, cid);
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  await quiz.click('#train-actions button:has-text("Kan för tillfället")');
  assert.equal(await levelOf('UMa'), 2, '"Kan för tillfället" counts it as known for now, once more');
  assert.equal((await quizState()).card, 'UMi', 'the missed card comes back after two others');

  // Key 3 is "Kan permanent". With all three known the group is learnt, and the next comes.
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  await quiz.keyboard.press('3');
  assert.equal(await levelOf('UMi'), 9, 'key 3 is "Kan permanent"');
  // The group learnt is shown whole; then the next, as it is taken up; then its first card.
  assert.equal(await viewOf(quiz), 'done:Björnarna vid polen');
  assert.match(await quiz.textContent('#train-prompt'), /^Du kan gruppen ”Björnarna vid polen”! Så här ligger de tillsammans: Stora björnen, Lilla björnen och Draken\.$/);
  assert.equal(await quiz.textContent('#train-group'), 'Grupp 1 av 28: Björnarna vid polen · 3 av 3 kan du');
  assert.match(await quiz.textContent('#train-count'), /^3 av 34$/);
  assert.equal((await quizParts()).outlined, 1, 'with the boundary round it');
  // Leaving training while it is shown and coming back shows it again. Out of training,
  // back in Upptäck, "Gränser" is Upptäck's boundaries again, round the groups from the start.
  await quiz.click('#btn-train-exit');
  assert.deepEqual(await boundsState(), [true, 'true', 'true', false]);
  assert.equal(await quiz.evaluate(() => window.stjarnhimlen.discoverBounds()), 'group');
  await quiz.click('#btn-train');
  assert.equal(await viewOf(quiz), 'done:Björnarna vid polen');
  await passGroup(quiz);
  assert.equal(await viewOf(quiz), 'intro:Perseus räddar Andromeda');
  assert.equal(await quiz.textContent('#train-group'), 'Grupp 2 av 28: Perseus räddar Andromeda · 0 av 4 kan du');
  assert.deepEqual([...(await quizParts()).segments].sort(), ['And', 'Cas', 'Cep', 'Per']);
  await passGroup(quiz);
  let q = await quizState();
  assert.deepEqual([q.inPlay, q.card], [7, 'Cas']);
  assert.match(await quiz.textContent('#train-prompt'), /^En ny stjärnbild!/);
  // "Kan permanent" counts it as known for good.
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  await quiz.click('#train-actions button:has-text("Kan permanent")');
  assert.match(await quiz.textContent('#train-count'), /^4 av 34$/);
  assert.match(await quiz.textContent('#train-of'), /^kan du i vinterhimlen · 2 permanent · 7 i spel$/);
  q = await quizState();

  // "Upptäck" takes over and keeps its own progress; "Träna" comes back to the same card.
  const cardBefore = q.card;
  await quiz.click('#btn-discover');
  q = await quizState();
  assert.deepEqual([q.on, q.panel, q.discovering], [false, false, true]);
  assert.equal(await quiz.textContent('#discover-count'), '1 av 18');
  assert.equal(await quiz.isDisabled('#btn-list'), false);
  assert.equal(await quiz.isDisabled('[data-layer="lines"]'), false);
  await quiz.click('#btn-train');
  q = await quizState();
  assert.deepEqual([q.on, q.card, q.step], [true, cardBefore, 1]);

  // What is learnt is remembered, levels, rests and all.
  await quiz.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').training;
    return saved?.v === 2 && saved.on === true && saved.cards.length === 7 && saved.turn === window.stjarnhimlen.training.turn;
  });
  const learnt = () => quiz.evaluate(() => JSON.stringify([window.stjarnhimlen.training.turn, ...window.stjarnhimlen.training.cards]));
  const learntBefore = await learnt();
  await quiz.reload();
  await quiz.waitForFunction(() => window.stjarnhimlen);
  q = await quizState();
  assert.deepEqual([q.on, q.inPlay, q.panel, q.step], [true, 7, true, 1]);
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
  assert.deepEqual(await quiz.evaluate(() => [...window.stjarnhimlen.training.cards].filter(([, c]) => c.n > 0).map(([i, c]) => [window.stjarnhimlen.catalog.constellations[i].id, c.level, c.dueTurn, c.dueAt !== null])), [['UMa', 3, 0, false], ['Cas', 0, 0, false], ['Ori', 4, 80, true]]);
  assert.deepEqual([(await quizState()).card, await quiz.textContent('#train-group')], ['UMa', 'Grupp 1 av 28: Björnarna vid polen · 0 av 3 kan du'], 'the first group not learnt is taken up');

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
  assert.equal(await viewOf(quiz), 'intro:Björnarna vid polen');
  // Choosing how far to go while a group is shown whole keeps it shown.
  await quiz.click('#btn-train-groups');
  await quiz.click('#train-goal-winter');
  await quiz.click('#train-goal-all');
  await quiz.keyboard.press('Escape');
  assert.equal(await viewOf(quiz), 'intro:Björnarna vid polen');
  await passGroup(quiz);
  q = await quizState();
  assert.deepEqual([q.card, q.inPlay, q.step], ['UMa', 3, 1]);

  // "Grupper": an overview of all 28 groups, step by step, and a way to take one up now.
  await quiz.click('#btn-train-groups');
  assert.equal(await quiz.isVisible('#panel-groups'), true);
  const groupRows = await quiz.$$eval('#group-list li', (els) => els.map((li) => (li.classList.contains('group-stage') ? `# ${li.querySelector('.group-stage-name').textContent}`
    : `${li.querySelector('strong').textContent}|${li.querySelector('.state').textContent}`)));
  assert.equal(groupRows.filter((r) => !r.startsWith('#')).length, 28);
  assert.deepEqual(groupRows.filter((r) => r.startsWith('#')), ['# 1. Vinterhimlen · 10 grupper', '# 2. Resten av Sverige · 8 grupper', '# 3. Resten av himlen · 10 grupper']);
  assert.equal(groupRows[1], '1. Björnarna vid polen|tränas nu');
  await quiz.click('#group-list button:has-text("Jägaren Orion")');
  assert.equal(await quiz.isHidden('#panel-groups'), true);
  assert.equal(await viewOf(quiz), 'intro:Jägaren Orion', 'a group chosen is shown whole first');
  await passGroup(quiz);
  q = await quizState();
  assert.deepEqual([q.card, q.step], ['Ori', 1]);
  assert.equal(await quiz.textContent('#train-group'), 'Grupp 4 av 28: Jägaren Orion · 0 av 4 kan du');
  await quiz.click('#btn-train-groups');
  assert.equal(await quiz.textContent('#group-list li.is-selected .state'), 'tränas nu');
  // Choosing the group being learnt shows it whole too, and goes on where it was.
  await quiz.click('#group-list li.is-selected button');
  assert.deepEqual([await viewOf(quiz), await quiz.isHidden('#panel-groups')], ['intro:Jägaren Orion', true]);
  await passGroup(quiz);
  assert.equal((await quizState()).card, 'Ori');
  // Opened and closed with its own button, the overview gives focus back to the card.
  await quiz.click('#btn-train-groups');
  await quiz.click('#btn-train-groups');
  await quiz.keyboard.press(' ');
  assert.equal((await quizState()).step, 2);
  await quiz.click('#btn-train-groups');

  // How far to go, chosen in the overview: the winter sky only, all of Sweden's or the whole
  // sky. Cards beyond the choice are neither asked nor counted, and the choice is remembered.
  const goalChips = () => quiz.$$eval('#train-goal button', (els) => els.map((e) => `${e.textContent.replace(/\s+/g, ' ').trim()}:${e.getAttribute('aria-pressed')}`));
  assert.deepEqual(await goalChips(), ['Vinter 34:false', 'Sverige 59:false', 'Alla 88:true']);
  await quiz.evaluate(() => window.stjarnhimlen.nextTrainingCard({ again: window.stjarnhimlen.catalog.byId.get('Sco').index, instant: true }));
  assert.equal((await quizState()).card, 'Sco');
  await quiz.click('#train-goal-winter');
  assert.deepEqual(await goalChips(), ['Vinter 34:true', 'Sverige 59:false', 'Alla 88:false']);
  assert.match(await quiz.textContent('#train-count'), /^0 av 34$/);
  assert.match(await quiz.getAttribute('#train-meter', 'aria-valuetext'), /^Du kan 0 av 34 i vinterhimlen/);
  q = await quizState();
  assert.ok(q.card !== 'Sco' && await quiz.evaluate(() => window.stjarnhimlen.stages[window.stjarnhimlen.training.card] === 1), `Skorpionen gives way to one of the winter sky (${q.card})`);
  // Escape closes the overview, and Space then shows the next step.
  await quiz.keyboard.press('Escape');
  assert.equal(await quiz.isHidden('#panel-groups'), true);
  await quiz.keyboard.press(' ');
  assert.equal((await quizState()).step, 2);
  await quiz.waitForFunction(() => JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').training?.goal === 'winter');
  await quiz.reload();
  await quiz.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await quiz.getAttribute('#train-goal-winter', 'aria-pressed'), 'true');
  assert.match(await quiz.textContent('#train-count'), /^0 av 34$/);
  // With every group of the winter sky learnt, a milestone: the whole winter sky together,
  // with its lines, the names that find room and the boundary round it, confetti, a badge
  // that stays, and the way on and a practice round over it on offer. It comes once.
  const milestone = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    a.training.group = -1;
    a.stages.forEach((st, i) => { if (st === 1) a.training.cards.set(i, { level: 1, dueTurn: 1000, dueAt: null, n: 1 }); });
    a.nextTrainingCard({ instant: true });
    const v = a.training.view;
    return {
      view: v && `${v.kind}:${v.stage}`,
      line: document.getElementById('train-group').textContent.trim(),
      prompt: document.getElementById('train-prompt').textContent,
      actions: [...document.querySelectorAll('#train-actions button')].map((b) => b.textContent),
      badges: document.getElementById('train-milestones').textContent,
      confetti: Boolean(document.querySelector('canvas.confetti')),
      outlined: a.trainingOutline() === a.groupOutlines.get('winter') && a.trainingOutline().length > 0,
      saved: [...a.training.milestones],
    };
  });
  assert.deepEqual(milestone, {
    view: 'milestone:winter', line: '★ Milstolpe: Vinterhimlen · 34 av 34 kan du',
    prompt: 'Hurra, en milstolpe! Du kan hela vinterhimlen: alla 34 stjärnbilder som syns en vinterkväll kl. 22. Här är de tillsammans.',
    actions: ['Vidare till resten av Sverige', 'Öva på vinterhimlen'], badges: '★ Vinterhimlen', confetti: true, outlined: true, saved: ['winter'],
  });
  const wholeSky = await quizParts();
  assert.deepEqual([wholeSky.segments.length, wholeSky.art.length], [34, 0], 'every one of the winter sky with its lines, no drawings');
  assert.ok(wholeSky.names.length >= 12 && wholeSky.overlaps === 0, `names that find room, none on another (${wholeSky.names.length})`);
  // In the overview the step is done, and can be practised as a whole from there.
  await quiz.click('#btn-train-groups');
  const stageHeads = () => quiz.$$eval('#group-list .group-stage', (els) => els.map((h) => `${h.querySelector('.group-stage-state').textContent}|${h.querySelector('.group-practice').hidden ? '' : h.querySelector('.group-practice').textContent}`));
  assert.deepEqual(await stageHeads(), ['★ klar|Öva på vinterhimlen', '|', '|']);
  await quiz.click('#group-list .group-practice:not([hidden])');
  // A practice round: each of the winter sky once, shuffled; a miss comes back after three others.
  const practiceState = () => quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    const p = a.training.practice;
    return {
      practice: p && `${p.stage} ${p.total - p.queue.length}/${p.total}`, view: a.training.view?.kind ?? null,
      line: document.getElementById('train-group').textContent.trim(), stop: !document.getElementById('btn-train-practice-stop').hidden,
      restart: !document.getElementById('btn-train-restart').hidden, overview: !document.getElementById('panel-groups').hidden,
    };
  });
  assert.deepEqual(await practiceState(), { practice: 'winter 0/34', view: null, line: 'Övning: Vinterhimlen · 0 av 34 klara', stop: true, restart: false, overview: false });
  assert.equal(await quiz.textContent('#train-prompt'), 'Vilken stjärnbild är det här?');
  const firstInRound = await quiz.evaluate(() => window.stjarnhimlen.training.card);
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  await quiz.click('#train-actions button:has-text("Fel")');
  assert.equal(await quiz.evaluate(() => window.stjarnhimlen.training.practice.queue[3]), firstInRound, 'the miss comes back after three others');
  await quiz.click('#train-actions button:has-text("Visa svaret")');
  await quiz.click('#train-actions button:has-text("Kan för tillfället")');
  assert.equal((await practiceState()).line, 'Övning: Vinterhimlen · 1 av 34 klara');
  // "Sluta öva" ends it; a whole round without a miss is celebrated too.
  await quiz.click('#btn-train-practice-stop');
  assert.deepEqual((await practiceState()).practice, null);
  const round = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    document.querySelector('canvas.confetti')?.remove();
    a.startPractice('winter');
    let answers = 0;
    while (a.training.practice && !a.training.view && answers < 100) {
      a.revealTraining();
      a.answerTraining('now');
      answers++;
    }
    return {
      answers, view: `${a.training.view.kind}:${a.training.view.stage}`, line: document.getElementById('train-group').textContent.trim(),
      prompt: document.getElementById('train-prompt').textContent, confetti: Boolean(document.querySelector('canvas.confetti')),
      actions: [...document.querySelectorAll('#train-actions button')].map((b) => b.textContent),
    };
  });
  assert.deepEqual(round, {
    answers: 34, view: 'practiced:winter', line: 'Övning klar: Vinterhimlen · 34 av 34 rätt direkt',
    prompt: 'Perfekt! Du kunde hela vinterhimlen på första försöket, alla 34.', confetti: true, actions: ['Fortsätt', 'Öva en gång till'],
  });
  await passGroup(quiz);
  assert.equal((await practiceState()).practice, null);

  // With every group of the winter sky learnt every card is a repetition, and the group
  // marked is the card's own: its boundary is drawn, and "Gränser" and G turn it off and on.
  // The milestone is not celebrated again.
  const allDone = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    a.training.group = -1;
    a.stages.forEach((st, i) => { if (st === 1) a.training.cards.set(i, { level: 1, dueTurn: 1000, dueAt: null, n: 1 }); });
    a.nextTrainingCard({ instant: true });
    if (a.training.view) {
      a.training.namedAt -= 1000;
      a.leaveTrainingGroup();
    }
    const own = a.chunks.indexOf(a.chunkOf.get(a.training.card));
    const bar = document.querySelector('[data-layer="bounds"]');
    const line = document.getElementById('train-group').textContent;
    return [a.training.group, a.trainingOutline() === a.groupOutlines.get(own), bar.disabled, bar.getAttribute('aria-pressed'), document.getElementById('btn-train-bounds').hidden,
      line.trim() === `Repetition från grupp ${own + 1} av 28` || line];
  });
  assert.deepEqual(allDone, [-1, true, false, 'true', false, true]);
  // The goal stopped at the winter sky: the next step stays on offer.
  assert.equal(await quiz.evaluate(() => { const b = document.getElementById('btn-train-next-goal'); return b.hidden ? '' : b.textContent; }), 'Vidare till resten av Sverige');
  await quiz.keyboard.press('g');
  assert.equal(await quiz.evaluate(() => window.stjarnhimlen.training.showBounds), false);
  await quiz.keyboard.press('g');
  assert.equal(await quiz.evaluate(() => window.stjarnhimlen.training.showBounds), true);
  // Once the winter sky is known, the progress moves on to the rest of Sweden, and then to the rest.
  await quiz.click('#btn-train-groups');
  await quiz.click('#train-goal-all');
  await quiz.keyboard.press('Escape');
  const knownUpTo = (stage) => quiz.evaluate((s) => {
    const a = window.stjarnhimlen;
    a.training.group = -1;
    a.stages.forEach((st, i) => { if (st <= s) a.training.cards.set(i, { level: 1, dueTurn: 1000, dueAt: null, n: 1 }); });
    a.trainPanel.render();
    return [document.getElementById('train-count').textContent, document.getElementById('train-of').textContent];
  }, stage);
  assert.deepEqual(await knownUpTo(1), ['34 av 59', 'kan du av dem som syns från Sverige · 0 permanent · 34 i spel']);
  // The next group is from the rest of Sweden, and a miss on the winter sky then does not
  // take the progress back a step.
  const missed = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    a.nextTrainingCard({ instant: true });
    const shown = a.training.view && a.chunks[a.training.view.group].name;
    a.training.namedAt -= 1000;
    a.leaveTrainingGroup();
    const card = `${shown}: ${a.catalog.constellations[a.training.card].id}`;
    a.training.cards.set(a.catalog.byId.get('Cas').index, { level: 0, dueTurn: 1000, dueAt: null, n: 2 });
    a.trainPanel.render();
    return [card, document.getElementById('train-count').textContent, document.getElementById('train-of').textContent];
  });
  assert.deepEqual(missed, ['Jungfrun och korpen som ljög: Vir', '33 av 59', 'kan du av dem som syns från Sverige · 0 permanent · 37 i spel']);
  // A card repeated from a group learnt before marks that group: the boundary goes round
  // it, the panel says so and the overview picks it out as "repeteras nu", while the group
  // being learnt stays "tränas nu". The rest of its group is not drawn round the card, and
  // the group's name and count, which could give the answer, wait for the name.
  const repeated = await quiz.evaluate(() => {
    const a = window.stjarnhimlen;
    const line = () => document.getElementById('train-group').textContent.trim();
    a.nextTrainingCard({ again: a.catalog.byId.get('Cas').index, instant: true });
    a.groupsPanel.toggle(true);
    const rows = [...document.querySelectorAll('#group-list li:not(.group-stage)')];
    const state = (name) => rows.find((li) => li.querySelector('strong').textContent.endsWith(name)).querySelector('.state').textContent;
    const out = [line(), document.getElementById('train-prompt').textContent, a.trainingOutline() === a.groupOutlines.get(1), a.trainingContext().length,
      state('Perseus räddar Andromeda'), state('Jungfrun och korpen som ljög'), document.querySelector('#group-list li.is-selected strong').textContent];
    a.groupsPanel.toggle(false);
    a.revealTraining();
    return [...out, line()];
  });
  assert.deepEqual(repeated, ['Repetition från grupp 2 av 28', 'Repetition: vilken stjärnbild är det här?', true, 0, 'repeteras nu', 'tränas nu', '2. Perseus räddar Andromeda',
    'Repetition från grupp 2 av 28: Perseus räddar Andromeda · 3 av 4 kan du']);
  // One seen only further south in Sweden says so.
  await quiz.evaluate(() => window.stjarnhimlen.nextTrainingCard({ again: window.stjarnhimlen.catalog.byId.get('Mic').index, instant: true }));
  assert.match(await quiz.textContent('#train-prompt'), /Den går aldrig upp från Stockholm, bara längre söderut i Sverige/);
  assert.deepEqual(await knownUpTo(2), ['59 av 88', 'kan du på hela himlen · 0 permanent · 59 i spel']);
  await quiz.click('#btn-train-exit');
  assert.equal((await quizState()).on, false);

  // On a phone the panel fits, and a tap on the sky shows the next step.
  const phoneQuiz = await openPage({ width: 390, height: 844 }, { discover: true });
  await phoneQuiz.click('#btn-train');
  await settle(phoneQuiz);
  await phoneQuiz.screenshot({ path: path.join(shots, 'phone-training-group.png') });
  await passGroup(phoneQuiz);
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

  // On a touch screen, the tap that shows the name changes the panel under the finger;
  // the click the browser makes up from that tap must not press a button now there.
  const touchQuiz = await openPage({ width: 390, height: 844 }, { discover: true, touch: true });
  await touchQuiz.evaluate(() => window.stjarnhimlen.setTraining(true));
  await settle(touchQuiz);
  await passGroup(touchQuiz);
  await touchQuiz.evaluate(() => window.stjarnhimlen.revealTraining());
  const named = await touchQuiz.$$eval('#panel-train button', (bs) => bs.filter((b) => b.offsetParent)
    .map((b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent }; }));
  await touchQuiz.evaluate(() => window.stjarnhimlen.answerTraining('now'));
  await settle(touchQuiz);
  await touchQuiz.evaluate(() => window.stjarnhimlen.advanceTraining());
  const panelBottom = await touchQuiz.$eval('#panel-train', (p) => p.getBoundingClientRect().bottom);
  const spot = named.find((b) => b.y > panelBottom + 4);
  assert.ok(spot, 'at step 2 the sky shows where a button of the named card will be');
  const touched = (await cardOf(touchQuiz)).card;
  await touchQuiz.touchscreen.tap(spot.x, spot.y);
  await settle(touchQuiz);
  assert.deepEqual([await cardOf(touchQuiz), await touchQuiz.evaluate(() => window.stjarnhimlen.training.on)], [{ card: touched, step: 3, levels: ['UMa:1'] }, true], 'the tap showed the name and pressed nothing');
  const underFinger = await touchQuiz.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent, [spot.x, spot.y]);
  assert.equal(underFinger, spot.text, `though "${spot.text}" came up under the finger`);

  // "Design": a list of interface designs. Each one is put on the page when chosen, keeps
  // the layout in one piece on a desktop and a phone, and is remembered.
  const themeIds = await phone.evaluate(() => [...document.querySelectorAll('#theme-list input')].map((i) => i.value));
  assert.deepEqual(themeIds, ['lekfull', 'glas', 'mcc', 'dsky', 'crt', 'nasa75', 'checklista']);
  for (const [page, kind] of [[await openPage({ width: 1280, height: 800 }, { discover: true }), 'desktop'], [phone, 'phone']]) {
    await page.click('#btn-theme');
    assert.equal(await page.isVisible('#panel-theme'), true);
    assert.equal(await page.isChecked('#theme-list input[value="lekfull"]'), true, 'the playful design is chosen at first');
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
  // Saved before the playful design came, the glass design was only the default, and the
  // new default takes its place; chosen since, it stays.
  for (const [saved, shown] of [[{ theme: 'glas' }, 'lekfull'], [{ theme: 'glas', themes: 2 }, 'glas']]) {
    await phone.evaluate((s) => {
      clearTimeout(window.stjarnhimlen.saveTimer);
      localStorage.setItem('stjarnhimlen:v1', JSON.stringify(s));
    }, saved);
    await phone.reload();
    await phone.waitForFunction(() => window.stjarnhimlen);
    assert.equal(await phone.evaluate(() => document.documentElement.dataset.theme), shown, JSON.stringify(saved));
  }

  // "Överblick": the sky to look at, filtered as the list is, with the pictures on or off;
  // a tap opens a constellation's card. It ends Upptäck, and is remembered.
  const over = await openPage({ width: 1280, height: 800 }, { discover: true });
  const overState = () => over.evaluate(() => {
    const a = window.stjarnhimlen;
    return {
      on: a.overviewing, discovering: a.discovering, panel: !document.getElementById('panel-overview').hidden,
      upptack: document.getElementById('btn-discover').getAttribute('aria-pressed'), scope: a.list.scope,
      drawn: a.catalog.constellations.filter((c) => a.isFound(c.index)).length, count: document.getElementById('overview-count').textContent,
      card: document.getElementById('card').hidden ? null : document.querySelector('#card h3').textContent,
    };
  });
  await over.click('#btn-overview');
  assert.deepEqual(await overState(), { on: true, discovering: false, panel: true, upptack: 'false', scope: 'year', drawn: 57, count: '57', card: null });
  assert.equal(await over.textContent('#overview-hint'), 'Tryck på en stjärnbild för att läsa mer om den.');
  // Only the winter sky: its figures alone on the sky, and in the list.
  await over.click('#overview-winter');
  assert.deepEqual([(await overState()).scope, (await overState()).drawn, (await overState()).count], ['winter', 34, '34']);
  assert.equal(await over.getAttribute('#filter-winter', 'aria-pressed'), 'true', 'the list filters the same');
  const inWinter = await over.evaluate(() => window.stjarnhimlen.catalog.constellations.filter((c) => window.stjarnhimlen.inScope(c.index, 'winter')).map((c) => c.id));
  // All the pictures on, then off.
  assert.equal(await over.getAttribute('#overview-art', 'aria-pressed'), 'false');
  await over.click('#overview-art');
  assert.equal(await over.getAttribute('#overview-art', 'aria-pressed'), 'true');
  const overParts = await drawnParts(null, over);
  assert.ok(overParts.art.length >= 8, `pictures drawn (${overParts.art.length})`);
  assert.deepEqual([...overParts.art, ...overParts.names, ...overParts.segments].filter((id) => !inWinter.includes(id)), [], 'none outside the winter sky');
  // A tap on Orion opens its card, a second one closes it.
  const tapOn = async (id) => {
    const p = await over.evaluate((cid) => {
      const a = window.stjarnhimlen;
      a.flyTo(a.catalog.byId.get(cid).index, { instant: true });
      a.view.timeMs = a.now();
      a.view.update();
      const q = {};
      a.view.projectEq(a.catalog.byId.get(cid).centerVec, q);
      return q;
    }, id);
    await settle(over);
    await over.mouse.click(p.x, p.y);
  };
  await tapOn('Ori');
  assert.equal((await overState()).card, 'Orion');
  assert.match(await over.textContent('#overview-hint'), /^Det här är Orion\./);
  await tapOn('Ori');
  assert.equal((await overState()).card, null);
  // One left out says so, and opens nothing. (On a winter evening those up are the winter
  // sky, so this one is looked for below the horizon, through the ground.)
  await over.evaluate(() => window.stjarnhimlen.setLayer('seeThrough', true));
  await tapOn('Sco');
  assert.equal((await overState()).card, null);
  assert.equal(await over.textContent('#toast'), 'Skorpionen hör inte till vinterhimlen. Välj Alla för att se den.');
  await over.evaluate(() => window.stjarnhimlen.setLayer('seeThrough', false));
  await over.click('#overview-art');
  // Träna pauses it, as it pauses Upptäck.
  await over.click('#btn-train');
  assert.deepEqual([(await overState()).on, (await overState()).panel], [false, false]);
  await over.click('#btn-train');
  assert.deepEqual([(await overState()).on, (await overState()).panel, (await overState()).scope], [true, true, 'winter']);
  // Remembered; Upptäck ends it.
  await over.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}');
    return saved.overview?.on === true && saved.training?.on === false;
  });
  await over.reload();
  await over.waitForFunction(() => window.stjarnhimlen);
  assert.deepEqual([(await overState()).on, (await overState()).scope], [true, 'winter']);
  await over.click('#btn-discover');
  assert.deepEqual([(await overState()).on, (await overState()).panel, (await overState()).discovering], [false, false, true]);

  assert.deepEqual(errors, [], 'no errors in the console');
  console.log('e2e smoke: ok');
} finally {
  await browser.close();
}
