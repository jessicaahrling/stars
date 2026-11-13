// Smoke test in headless Chromium: the sky renders, a tap on a constellation toggles its
// illustration, the list opens the info card, marking works, the sky is shown as its
// groups ("Upptäck"), training with flashcards works ("Träna"), and
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

  // "Upptäck": the sky as its groups. Every group the list's filter takes in has a line
  // round it, its colour and its name; the lines and names of its constellations show for
  // the group pointed at and the one chosen.
  const sky = await openPage({ width: 1280, height: 800 }, { discover: true });
  const discovery = () => sky.evaluate(() => {
    const a = window.stjarnhimlen;
    const text = (id) => document.getElementById(id).textContent;
    return {
      on: a.discovery.on,
      shown: a.shownGroups.length,
      chosen: a.chunks[a.discovery.group]?.name ?? null,
      count: `${text('discover-count')} ${text('discover-of')}`,
      chips: document.querySelectorAll('#discover-next .chip').length,
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
  const scopeChoice = () => sky.$$eval('.discover-scope .chip', (els) => els.map((el) => `${el.textContent.replace(/\s+/g, ' ').trim()}:${el.getAttribute('aria-pressed')}`));
  assert.deepEqual(await discovery(), {
    on: true, shown: 18, chosen: null, count: '18 grupper som syns från Stockholm', chips: 18, panel: true, pressed: 'true',
  });
  assert.deepEqual(await scopeChoice(), ['Vinterhimlen 10:false', 'Syns från Stockholm 18:true', 'Alla 28:false']);
  assert.equal(await sky.textContent('#discover-hint'), 'Peka på en grupp för att se dess stjärnbilder, eller tryck på den för att välja den.');
  assert.equal(await sky.isHidden('#discover-why'), true);
  // The buttons come in the order Träna takes the groups, each in its colour on the sky.
  assert.deepEqual(await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    return [...document.querySelectorAll('#discover-next .chip')].slice(0, 3)
      .map((b) => [b.firstChild.textContent, Number(b.dataset.hue) === a.groupHue[Number(b.dataset.group)]]);
  }), [['Björnarna vid polen', true], ['Perseus räddar Andromeda', true], ['Över havet på djurens rygg', true]]);
  await sky.screenshot({ path: path.join(shots, 'discover-start.png') });

  // One frame drawn while recording whose figures, outlines, illustrations and names are
  // traced, which groups' lines and names, and how much of the sky is tinted.
  const drawnParts = (hover = null, page = sky) => page.evaluate((hoverId) => {
    const a = window.stjarnhimlen;
    a.hover = hoverId ? a.catalog.byId.get(hoverId).index : -1;
    const sl = a.skyLayer;
    const owner = new Map();
    for (const c of a.catalog.constellations) for (const part of [c.segments, c.outlines, c.art]) owner.set(part, c.id);
    const names = new Map(a.catalog.constellations.map((c) => [c.sv.toUpperCase(), c.id]));
    const groupNames = new Set(a.chunks.map((ch) => ch.name));
    const seen = { segments: new Set(), outlines: new Set(), art: new Set(), names: new Set(), texts: new Set(), focus: new Set(), groups: new Set() };
    const obstacles = a.labelObstacles();
    const boxes = [];
    let covered = 0;
    let tinted = 0;
    // Lines of the boundary round the group being learnt, and round the groups shown.
    let outlined = 0;
    let groupLined = 0;
    // Names of groups under the buttons along the top and bottom of the screen.
    const bars = a.barBoxes();
    let underBar = 0;
    const wrap = (obj, name, record) => {
      const fn = obj[name];
      obj[name] = function (...args) {
        record(...args);
        return fn.apply(this, args);
      };
    };
    wrap(sl, 'traceSegments', (segs) => owner.has(segs) && seen.segments.add(owner.get(segs)));
    wrap(sl, 'tracePolyline', (view, rings) => {
      const group = a.shownGroups.find((o) => o.outline === rings);
      if (owner.has(rings)) seen.outlines.add(owner.get(rings));
      else if (a.training.on && rings === a.trainingOutline()) outlined += rings.length;
      else if (group) seen.focus.add(group.name);
      else if (a.discovering) groupLined += rings.length;
    });
    wrap(sl, 'traceArt', (view, lines) => owner.has(lines) && seen.art.add(owner.get(lines)));
    wrap(a.hud, 'label', (text, x, y) => {
      seen.texts.add(text);
      const id = names.get(text);
      if (!id && !groupNames.has(text)) return;
      if (id) seen.names.add(id);
      else seen.groups.add(text);
      if (obstacles.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom)) covered++;
      const w = a.hud.ctx.measureText(text).width / 2;
      boxes.push([x - w, x + w, y - 5, y + 5]);
      if (!id && bars.some((r) => x + w > r.left && x - w < r.right && y + 6 > r.top && y - 6 < r.bottom)) underBar++;
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
    return { ...Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v].sort()])), covered, overlaps, tinted, outlined, groupLined, underBar };
  }, hover);
  /** The tint of a constellation on the sky's mask, or null. */
  const tintOf = (id) => sky.evaluate((c) => {
    const a = window.stjarnhimlen;
    const tints = new Map();
    a.fillTints(tints);
    return tints.get(a.catalog.byId.get(c).index) || null;
  }, id);
  const bears = (await groupNamed('Björnarna vid polen')).members;
  // Nothing pointed at: lines round the groups and their names, but no figures and no
  // names of constellations.
  const plain = await drawnParts();
  assert.deepEqual([plain.segments, plain.names, plain.outlines, plain.focus], [[], [], [], []]);
  assert.ok(plain.groupLined > 0 && plain.groups.length >= 3, `groups named: ${plain.groups}`);
  assert.deepEqual([plain.covered, plain.overlaps, plain.underBar], [0, 0, 0], 'names keep clear of the panel, the buttons and each other');
  // Pointing at Cassiopeja shows all of her group: its line stands out, and the lines and
  // names of all its constellations show.
  const perseus = await groupNamed('Perseus räddar Andromeda');
  await sky.evaluate((g) => window.stjarnhimlen.flyTo(window.stjarnhimlen.chunks[g].members, { instant: true }), perseus.g);
  await settle(sky);
  const pointed = await drawnParts('Cas');
  assert.deepEqual(pointed.segments, perseus.members, 'the lines of every constellation in the group');
  assert.deepEqual(pointed.focus, ['Perseus räddar Andromeda'], 'the line round the group stands out');
  assert.deepEqual(pointed.names, perseus.members, 'and the names of every constellation in it');
  assert.deepEqual(pointed.art, [], 'but not their illustrations: those come with a click');
  assert.ok(pointed.groups.includes('Perseus räddar Andromeda'));
  assert.deepEqual([pointed.covered, pointed.overlaps], [0, 0]);

  /** A point on the sky (not under a panel) over a constellation that is shown (1) or left out (0). */
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
  const focusNow = () => sky.evaluate(() => window.stjarnhimlen.focusGroups().map((g) => window.stjarnhimlen.chunks[g].name));

  // With the mouse: pointing at a group puts it in focus, and a click chooses it. The
  // panel then tells about it, its button is pressed, and its colour is stronger.
  const here = await pointOver(1);
  assert.ok(here, 'a group is in view');
  const groupHere = await groupOfId(here.id);
  await sky.mouse.move(here.x, here.y);
  assert.deepEqual(await focusNow(), [groupHere], 'the group under the mouse is in focus');
  const weakTint = await tintOf(here.id);
  assert.ok(weakTint, 'the groups are tinted');
  await sky.mouse.click(here.x, here.y);
  let d = await discovery();
  assert.equal(d.chosen, groupHere);
  const chosenChunk = await sky.evaluate(() => window.stjarnhimlen.chunks[window.stjarnhimlen.discovery.group]);
  assert.match(await sky.textContent('#discover-hint'), new RegExp(`^${groupHere}: [^.]+\\.$`));
  assert.deepEqual([await sky.isVisible('#discover-why'), await sky.textContent('#discover-why')], [true, chosenChunk.reason]);
  assert.equal(await sky.getAttribute(`#discover-next .chip[data-group="${await sky.evaluate(() => window.stjarnhimlen.discovery.group)}"]`, 'aria-pressed'), 'true');
  assert.ok((await tintOf(here.id)).some((x, k) => x > weakTint[k]), 'the group chosen is tinted more strongly');
  // Chosen, its constellations keep their lines and names with the mouse elsewhere.
  const chosenParts = await drawnParts();
  const chosenIds = (await groupNamed(groupHere)).members;
  assert.deepEqual([chosenParts.segments, chosenParts.focus], [chosenIds, [groupHere]]);
  // Chosen, its constellations show their illustrations too (those in view are drawn).
  assert.ok(chosenParts.art.length > 0 && chosenParts.art.every((id) => chosenIds.includes(id)), `illustrations: ${chosenParts.art}`);
  // A second click lets it go.
  await sky.mouse.click(here.x, here.y);
  assert.equal((await discovery()).chosen, null);
  assert.equal(await sky.isHidden('#discover-why'), true);
  // A double click chooses it and keeps it chosen.
  await sky.mouse.dblclick(here.x, here.y);
  assert.equal((await discovery()).chosen, groupHere, 'the second click of a double click does not let it go');
  await sky.evaluate(() => window.stjarnhimlen.chooseGroup(-1));
  // When the sky moves under a mouse that stays put, the group under it is found again.
  for (let k = 0; k < 6; k++) await sky.keyboard.press('Shift+ArrowLeft');
  const underMouse = await sky.evaluate(([x, y]) => {
    const a = window.stjarnhimlen;
    const i = a.pickShown(x, y);
    return i >= 0 ? a.chunkOf.get(i).name : null;
  }, [here.x, here.y]);
  assert.deepEqual(await focusNow(), underMouse ? [underMouse] : [], `the group under the mouse after the sky has turned (${underMouse})`);
  await sky.mouse.move(5, 300);

  // The filter: the winter sky, those seen from here, or all. It is the list's filter too,
  // and a group chosen that it leaves out is let go.
  await sky.evaluate((g) => window.stjarnhimlen.chooseGroup(g), (await groupNamed('Kronan, hjälten och läkaren')).g);
  assert.equal((await discovery()).chosen, 'Kronan, hjälten och läkaren');
  await sky.click('#discover-winter');
  d = await discovery();
  assert.deepEqual([d.shown, d.chips, d.count, d.chosen], [10, 10, '10 grupper i vinterhimlen', null]);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.list.scope), 'winter');
  // A tap on a constellation left out chooses nothing and says why. On a January evening
  // nearly all that is up belongs to the winter sky, so the ground is see-through here.
  await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    a.setLayer('seeThrough', true);
    a.flyTo(a.catalog.byId.get('Her').index, { instant: true, fov: 100 });
  });
  await settle(sky);
  const leftOut = await pointOver(0);
  assert.ok(leftOut, 'a constellation outside the winter sky is in view');
  await sky.mouse.move(leftOut.x, leftOut.y);
  assert.deepEqual(await focusNow(), [], 'it does not light up');
  await sky.mouse.click(leftOut.x, leftOut.y);
  assert.match(await sky.textContent('#toast'), /hör inte till vinterhimlen\. Välj Alla/);
  assert.equal((await discovery()).chosen, null);
  await sky.evaluate(() => window.stjarnhimlen.setLayer('seeThrough', false));
  await sky.click('#discover-all');
  assert.deepEqual(await discovery().then((x) => [x.shown, x.count]), [28, '28 grupper på hela himlen']);
  await sky.click('#discover-year');
  assert.equal((await discovery()).shown, 18);

  // The buttons in the panel choose a group too, and turn the view to it when it is out of
  // sight, here hidden behind the panel itself; a second press lets it go.
  await sky.evaluate(() => {
    window.stjarnhimlen.view.fov = 80;
    window.stjarnhimlen.invalidate();
  });
  const chipGroup = await sky.evaluate(() => {
    const b = [...document.querySelectorAll('#discover-next button')].find((e) => !e.querySelector('.state').textContent);
    return b ? Number(b.dataset.group) : null;
  });
  assert.ok(chipGroup !== null, 'a group all above the horizon is shown');
  const middle = await sky.evaluate((g) => window.stjarnhimlen.groupShape(g).middle, chipGroup);
  const behind = (await onScreen(middle)).panel;
  await placeAt(middle, behind.right - 40, (behind.top + behind.bottom) / 2);
  await settle(sky);
  assert.equal(await sky.evaluate((g) => window.stjarnhimlen.groupInView(g), chipGroup), false);
  await sky.click(`#discover-next button[data-group="${chipGroup}"]`);
  await settle(sky);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.discovery.group), chipGroup);
  const landed = await onScreen(middle);
  assert.ok(landed.x > landed.panel.right + 50, `the view turned to it, clear of the panel (${Math.round(landed.x)} > ${landed.panel.right})`);
  assert.equal(await sky.evaluate((g) => window.stjarnhimlen.groupInView(g), chipGroup), true);
  await sky.click(`#discover-next button[data-group="${chipGroup}"]`);
  assert.equal((await discovery()).chosen, null);
  // Keyboard: Enter on a button chooses its group, and the focus stays on it.
  await sky.focus('#discover-next button');
  await sky.keyboard.press('Enter');
  await settle(sky);
  assert.equal((await discovery()).chosen, 'Björnarna vid polen');
  assert.equal(await sky.evaluate(() => document.activeElement.closest('#discover-next .chip')?.firstChild.textContent), 'Björnarna vid polen');
  await sky.screenshot({ path: path.join(shots, 'discover-chosen.png') });

  // "Linjer" and "Namn" in the bar are Upptäck's own while discovering: the lines and names
  // of every group shown, leaving the layers of the whole sky as they were.
  const bar = (layer) => sky.getAttribute(`[data-layer="${layer}"]`, 'aria-pressed');
  await sky.evaluate(() => window.stjarnhimlen.chooseGroup(-1));
  assert.deepEqual([await bar('lines'), await bar('names')], ['false', 'false']);
  await sky.click('[data-layer="lines"]');
  await sky.click('[data-layer="names"]');
  assert.deepEqual([await bar('lines'), await bar('names')], ['true', 'true']);
  const everything = await drawnParts();
  assert.ok(everything.segments.length > 15 && everything.names.length > 15, `${everything.segments.length} figures, ${everything.names.length} names`);
  assert.deepEqual([everything.overlaps, everything.covered, everything.underBar], [0, 0, 0]);
  await sky.click('[data-layer="lines"]');
  await sky.click('[data-layer="names"]');
  assert.deepEqual((await drawnParts()).segments, []);
  assert.deepEqual(await sky.evaluate(() => [window.stjarnhimlen.layers.lines, window.stjarnhimlen.layers.names]), [true, true]);

  // A mark colours a constellation instead of its group, and is counted.
  const bearTint = await tintOf('UMa');
  await sky.evaluate(() => window.stjarnhimlen.toggleMark(window.stjarnhimlen.catalog.byId.get('UMa').index));
  assert.notDeepEqual(await tintOf('UMa'), bearTint, 'the mark colours Ursa Major instead of its group');
  assert.equal(await sky.textContent('#mark-count'), '1');
  // Marked, its lines show whatever is in focus; "Rensa markeringar" removes it.
  assert.deepEqual((await drawnParts()).segments, ['UMa']);
  await sky.click('#btn-list');
  await sky.click('#btn-clear');
  assert.equal(await sky.textContent('#toast'), 'Tog bort 1 markering');
  await sky.click('#btn-list-close');

  // A name that would land under the panel is left out (names of every group on here).
  await sky.evaluate(() => window.stjarnhimlen.setDiscoverAll('names', true));
  const draLabel = await sky.evaluate(() => window.stjarnhimlen.catalog.byId.get('Dra').labelVecs[0]);
  const box = (await onScreen(draLabel)).panel;
  await placeAt(draLabel, box.right - 60, box.top + 100);
  await settle(sky);
  const placed = await onScreen(draLabel);
  assert.ok(Math.hypot(placed.x - box.right + 60, placed.y - box.top - 100) < 2, `Draco's name is under the panel (${Math.round(placed.x)}, ${Math.round(placed.y)})`);
  const under = await drawnParts();
  assert.ok(!under.names.includes('Dra') && under.covered === 0, `a name under the panel is left out (${under.names})`);
  await sky.evaluate(() => window.stjarnhimlen.setDiscoverAll('names', false));

  // Upptäck draws the line round each group, from the start, with each group in its
  // colour; or each constellation's boundary; or none. "Gränser" in the bar turns them off
  // and on again, and leaves the layer of the whole sky as it was.
  await sky.evaluate(() => window.stjarnhimlen.flyTo(window.stjarnhimlen.chunks[0].members, { instant: true }));
  await settle(sky);
  const boundsChoice = () => sky.$$eval('.discover-bounds .chip', (els) => els.map((el) => `${el.textContent}:${el.getAttribute('aria-pressed')}`));
  assert.deepEqual([await boundsChoice(), await bar('bounds')], [['Inga:false', 'Stjärnbilder:false', 'Grupper:true'], 'true']);
  const grouped = await drawnParts();
  assert.ok(grouped.outlines.length === 0 && grouped.groupLined > 0, 'no boundaries of their own, a line round each group');
  await sky.click('#discover-bounds-constellation');
  assert.deepEqual(await boundsChoice(), ['Inga:false', 'Stjärnbilder:true', 'Grupper:false']);
  const byConstellation = await drawnParts();
  assert.ok(byConstellation.outlines.length > 5 && byConstellation.groupLined === 0, `boundaries of ${byConstellation.outlines.length}`);
  assert.ok(byConstellation.tinted < grouped.tinted, `the groups lose their colours (${grouped.tinted} -> ${byConstellation.tinted})`);
  assert.ok(byConstellation.groups.length > 0, 'the groups are still named');
  await sky.click('[data-layer="bounds"]');
  assert.deepEqual([await boundsChoice(), await bar('bounds')], [['Inga:true', 'Stjärnbilder:false', 'Grupper:false'], 'false']);
  assert.deepEqual((await drawnParts()).outlines, [], 'no boundaries');
  await sky.click('[data-layer="bounds"]');
  assert.deepEqual([await boundsChoice(), await bar('bounds')], [['Inga:false', 'Stjärnbilder:true', 'Grupper:false'], 'true'], 'back as chosen');
  await sky.click('#discover-bounds-group');
  // Turned off from the bar with the groups chosen: no lines or colours for the groups.
  await sky.click('[data-layer="bounds"]');
  const groupsOff = await drawnParts();
  assert.deepEqual([groupsOff.groupLined, groupsOff.outlines], [0, []]);
  assert.ok(groupsOff.tinted < grouped.tinted, 'nor colours');
  await sky.click('[data-layer="bounds"]');
  assert.deepEqual([await boundsChoice(), await bar('bounds')], [['Inga:false', 'Stjärnbilder:false', 'Grupper:true'], 'true']);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.layers.bounds), false, 'the layer of the whole sky is left alone');

  // The panel folds up to its count.
  await sky.click('#btn-discover-collapse');
  assert.equal(await sky.isHidden('#discover-body'), true);
  assert.equal(await sky.getAttribute('#btn-discover-collapse', 'aria-expanded'), 'false');
  await sky.click('#btn-discover-collapse');
  assert.equal(await sky.isVisible('#discover-next'), true);

  // The group chosen and the choices are remembered between visits.
  await sky.evaluate((g) => {
    const a = window.stjarnhimlen;
    a.chooseGroup(g);
    a.setDiscoverAll('lines', true);
    a.setDiscoverBounds('constellation');
  }, perseus.g);
  await sky.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').discover;
    return saved?.group === 'Perseus räddar Andromeda' && saved.lines === true && saved.boundsBy === 'constellation' && saved.collapsed === false;
  });
  await sky.reload();
  await sky.waitForFunction(() => window.stjarnhimlen);
  assert.deepEqual(await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    return [a.chunks[a.discovery.group]?.name, a.discovery.lines, a.discovery.names, a.discoverBounds()];
  }), ['Perseus räddar Andromeda', true, false, 'constellation']);
  assert.match(await sky.textContent('#discover-hint'), /^Perseus räddar Andromeda: /);
  await sky.evaluate(() => {
    const a = window.stjarnhimlen;
    a.setDiscoverAll('lines', false);
    a.setDiscoverBounds('group');
  });
  // Saved when Upptäck found constellations one at a time, the discovery found is not
  // needed any more, and the boundaries become the groups'. One saved since keeps its
  // choice of boundaries.
  const reopen = async (saved) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await page.addInitScript((json) => localStorage.setItem('stjarnhimlen:v1', json), JSON.stringify(saved));
    await page.goto(url);
    await page.waitForFunction(() => window.stjarnhimlen);
    const state = await page.evaluate(() => {
      const a = window.stjarnhimlen;
      return { on: a.discovering, shown: a.shownGroups.length, chosen: a.discovery.group, bounds: a.discoverBounds() };
    });
    await page.close();
    return state;
  };
  assert.deepEqual(await reopen({ layers: { bounds: false }, discover: { on: true, boundsBy: 'constellation', found: ['UMa', 'Leo', 'Cas', 'Nope'], all: true } }),
    { on: true, shown: 18, chosen: -1, bounds: 'group' });
  assert.equal((await reopen({ discover: { on: true, byGroups: true, boundsBy: 'constellation', showBounds: false } })).bounds, 'none');

  // "Sluta upptäcka" leaves the mode and shows every figure; "Upptäck" comes back to the
  // group chosen.
  await sky.click('#btn-discover-exit');
  d = await discovery();
  assert.deepEqual([d.on, d.panel, d.pressed, d.chosen], [false, false, 'false', 'Perseus räddar Andromeda']);
  assert.ok((await drawnParts()).segments.length > 15, 'every figure is drawn again');
  await sky.click('#btn-discover');
  d = await discovery();
  assert.deepEqual([d.on, d.panel, d.chosen], [true, true, 'Perseus räddar Andromeda']);
  // Zoomed out, the names of groups and of the group in focus keep apart.
  await sky.evaluate(() => {
    window.stjarnhimlen.view.fov = 160;
    window.stjarnhimlen.invalidate();
  });
  await settle(sky);
  const wide = await drawnParts('Ori');
  assert.ok(wide.groups.length > 5 && wide.overlaps === 0 && wide.covered === 0 && wide.underBar === 0,
    `${wide.groups.length} groups named, ${wide.overlaps} overlapping, ${wide.underBar} under the buttons`);

  // Another place: fewer groups rise in Kiruna.
  await sky.evaluate(() => window.stjarnhimlen.setPlace('kiruna'));
  assert.deepEqual(await discovery().then((x) => [x.shown, x.count]), [16, '16 grupper som syns från Kiruna']);
  await sky.evaluate(() => window.stjarnhimlen.setPlace('stockholm'));

  // A group chosen by its button while below the horizon: the button says so, and a note
  // explains why it cannot be seen. In mid August at 23:00 Orion's group is under the ground.
  await sky.evaluate(() => window.stjarnhimlen.setTime(Date.UTC(2026, 7, 15, 21, 0)));
  const hunter = await groupNamed('Jägaren Orion');
  assert.equal(await sky.evaluate((g) => window.stjarnhimlen.groupStateOf(g), hunter.g), 'down');
  assert.match(await sky.textContent(`#discover-next button[data-group="${hunter.g}"]`), /nere$/);
  await sky.click(`#discover-next button[data-group="${hunter.g}"]`);
  assert.match(await sky.textContent('#toast'), /^Gruppen ”Jägaren Orion” är under horisonten just nu/);

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

  // On a phone the panel fits across the top, the groups are named clear of the buttons,
  // a tap chooses a group, and notes are shown below the panel.
  const phoneSky = await openPage({ width: 390, height: 844 }, { discover: true, touch: true });
  assert.equal(await phoneSky.isVisible('#panel-discover'), true);
  assert.equal(await phoneSky.textContent('#discover-hint'), 'Tryck på en grupp för att se dess stjärnbilder.');
  await phoneSky.evaluate(() => window.stjarnhimlen.flyTo(window.stjarnhimlen.chunks[0].members, { instant: true }));
  await settle(phoneSky);
  const phoneStart = await drawnParts(null, phoneSky);
  assert.ok(phoneStart.groups.length > 2 && phoneStart.underBar === 0 && phoneStart.overlaps === 0,
    `groups named clear of the buttons on a phone (${phoneStart.groups}; ${phoneStart.underBar} under them)`);
  assert.ok((await phoneSky.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'no horizontal scroll');
  const phoneSpot = await phoneSky.evaluate(() => {
    const a = window.stjarnhimlen;
    const panel = a.discoverPanel.root.getBoundingClientRect();
    for (let y = panel.bottom + 30; y < innerHeight - 100; y += 20) {
      for (let x = 30; x < innerWidth - 30; x += 20) {
        const i = a.pick(x, y);
        if (i >= 0 && a.reveal.con[i] === 1 && document.elementFromPoint(x, y) === a.hudCanvas) return { x, y, group: a.chunkOf.get(i).name };
      }
    }
    return null;
  });
  assert.ok(phoneSpot, 'a group below the panel');
  await phoneSky.touchscreen.tap(phoneSpot.x, phoneSpot.y);
  assert.equal(await phoneSky.evaluate(() => window.stjarnhimlen.chunks[window.stjarnhimlen.discovery.group]?.name), phoneSpot.group);
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
  assert.equal(await quiz.textContent('#discover-count'), '18 grupper');
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
  // The round is shuffled, so its first card may be one that is below the horizon by now.
  assert.match(await quiz.textContent('#train-prompt'), /^Vilken stjärnbild är det här\?( Den är under horisonten just nu, så marken är genomskinlig\.)?$/);
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

  // "Sikt": a gauge of how faint the faintest stars seen are. Dragged down, only the
  // brightest are left and the Milky Way goes; up again, every star. Remembered.
  const sikt = await openPage({ width: 1280, height: 800 });
  const starsDrawn = () => sikt.evaluate(() => {
    const a = window.stjarnhimlen;
    a.draw();
    let n = 0;
    let faintest = -9;
    a.skyLayer.px.forEach((x, i) => {
      if (Number.isNaN(x)) return;
      n++;
      faintest = Math.max(faintest, a.catalog.stars.mag[i]);
    });
    return { n, faintest };
  });
  const milkyWay = () => sikt.evaluate(() => {
    const a = window.stjarnhimlen;
    let fade = null;
    const render = a.glSky.render;
    a.glSky.render = function (p) {
      fade = p.milkyWay ? (p.milkyWayFade ?? 1) : 0;
      return render.call(this, p);
    };
    a.draw();
    delete a.glSky.render;
    return fade;
  });
  const limit = () => sikt.evaluate(() => window.stjarnhimlen.limitMag);
  // Thousands are set apart by a no-break space, as Swedish writes them.
  const readout = async () => (await sikt.textContent('#sky-readout')).replace(/\u00a0/g, ' ');
  assert.deepEqual([await limit(), await sikt.getAttribute('#btn-sky', 'aria-expanded'), await sikt.isHidden('#panel-sky')], [6, 'false', true]);
  const allStars = await starsDrawn();
  await sikt.click('#btn-sky');
  assert.deepEqual([await sikt.getAttribute('#btn-sky', 'aria-expanded'), await sikt.isVisible('#panel-sky')], ['true', true]);
  assert.equal(await readout(), 'Alla 5 045 stjärnor syns, ner till magnitud 6,0.');
  assert.equal((await sikt.getAttribute('#sky-meter', 'aria-valuetext')).replace(/\u00a0/g, ' '), 'Magnitud 6,0, mörk himmel på landet, 5 045 stjärnor');
  assert.equal(await milkyWay(), 1);
  // Dragged down to 3,6, as in the middle of a big town.
  const meter = await sikt.$eval('#sky-meter', (e) => e.getBoundingClientRect().toJSON());
  const yOf = (m) => meter.bottom - ((m - 1) / 5) * meter.height;
  await sikt.mouse.move(meter.left + meter.width / 2, yOf(6));
  await sikt.mouse.down();
  await sikt.mouse.move(meter.left + meter.width / 2, yOf(4.5), { steps: 4 });
  await sikt.mouse.move(meter.left + meter.width / 2, yOf(3.6), { steps: 4 });
  await sikt.mouse.up();
  assert.ok(Math.abs((await limit()) - 3.6) < 0.051, `dragged to ${await limit()}`);
  assert.equal(await readout(), '327 stjärnor syns, ner till magnitud 3,6.');
  const city = await starsDrawn();
  assert.ok(city.n < allStars.n / 4 && city.faintest <= 3.6, `${allStars.n} -> ${city.n} stars, the faintest ${city.faintest}`);
  assert.equal(await milkyWay(), 0, 'no Milky Way in a big town');
  assert.equal(await sikt.evaluate(() => document.getElementById('btn-sky').classList.contains('limited')), true);
  assert.deepEqual(await sikt.$$eval('.sky-bar.lit', (els) => els.length), 6, 'the graph is lit up to the limit');
  // The keys of a slider, and the skies along it.
  await sikt.focus('#sky-meter');
  await sikt.keyboard.press('Home');
  assert.equal(await limit(), 1);
  const brightest = await starsDrawn();
  assert.ok(brightest.n > 0 && brightest.n <= 15 && brightest.faintest <= 1, `only the brightest: ${brightest.n}, the faintest ${brightest.faintest}`);
  assert.equal(await readout(), '15 stjärnor syns, ner till magnitud 1,0.');
  assert.equal(await sikt.$$eval('.sky-bar.lit', (els) => els.length), 1, 'the first bar, with the brightest of all, stays lit');
  // A training card's own stars show all the same, so that there is something to answer.
  const card = await sikt.evaluate(async () => {
    const a = window.stjarnhimlen;
    a.setTraining(true);
    a.anim = null;
    a.draw();
    const own = a.training.stars;
    let ownFaint = 0;
    let otherFaint = 0;
    a.skyLayer.px.forEach((x, i) => {
      if (Number.isNaN(x) || a.catalog.stars.mag[i] <= 1) return;
      if (own[i]) ownFaint++;
      else otherFaint++;
    });
    a.setTraining(false);
    return { ownFaint, otherFaint };
  });
  assert.ok(card.ownFaint > 0 && card.otherFaint === 0, `card stars fainter than the limit: ${card.ownFaint}, others: ${card.otherFaint}`);
  await sikt.keyboard.press('ArrowUp');
  await sikt.keyboard.press('PageUp');
  assert.equal(await limit(), 1.6);
  await sikt.keyboard.press('End');
  assert.equal(await limit(), 6);
  assert.equal((await starsDrawn()).n, allStars.n, 'every star again');
  await sikt.click('.sky-preset:has-text("Stad")');
  assert.deepEqual([await limit(), await sikt.getAttribute('.sky-preset:has-text("Stad")', 'aria-pressed')], [4.5, 'true']);
  // Closed in the middle of a drag, the limit stays where the drag had it.
  await sikt.focus('#sky-meter');
  const meter2 = await sikt.$eval('#sky-meter', (e) => e.getBoundingClientRect().toJSON());
  await sikt.mouse.move(meter2.left + meter2.width / 2, meter2.bottom - ((4.5 - 1) / 5) * meter2.height);
  await sikt.mouse.down();
  await sikt.mouse.move(meter2.left + meter2.width / 2, meter2.bottom - ((4.8 - 1) / 5) * meter2.height, { steps: 3 });
  const midDrag = await limit();
  await sikt.keyboard.press('Escape');
  await sikt.mouse.move(meter2.left + meter2.width / 2, meter2.bottom - 5, { steps: 3 });
  await sikt.mouse.up();
  assert.equal(await limit(), midDrag, 'closing ends the drag');
  await sikt.click('#btn-sky');
  await sikt.click('.sky-preset:has-text("Stad")');
  // Escape closes it and gives the focus back to its button; the limit stays.
  await sikt.focus('#sky-meter');
  await sikt.keyboard.press('Escape');
  assert.deepEqual([await sikt.isHidden('#panel-sky'), await sikt.evaluate(() => document.activeElement.id)], [true, 'btn-sky']);
  await sikt.waitForFunction(() => JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').limitMag === 4.5);
  await sikt.reload();
  await sikt.waitForFunction(() => window.stjarnhimlen);
  assert.deepEqual([await limit(), await sikt.evaluate(() => document.getElementById('btn-sky').classList.contains('limited'))], [4.5, true]);
  await sikt.screenshot({ path: path.join(shots, 'sikt.png') });
  // On a phone the games' panel gives way to Sikt, the zoom buttons give their room to the
  // games, and the gauge can be dragged with a finger.
  const siktPhone = await openPage({ width: 390, height: 844 }, { discover: true, touch: true });
  await siktPhone.click('#btn-sky');
  assert.deepEqual(await siktPhone.evaluate(() => {
    const at = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest(sel) !== null;
    };
    const toggles = document.getElementById('toggles').getBoundingClientRect();
    const over = document.getElementById('btn-overview').getBoundingClientRect();
    return [at('#btn-sky-close'), at('#sky-meter'), getComputedStyle(document.getElementById('zoom-in')).display, over.right <= toggles.right + 1];
  }), [true, true, 'none', true]);

  // "Rikta mot himlen": on a touch phone the compass button lets the phone's orientation
  // turn the view; a sideways drag corrects the direction; a flight only zooms. On a
  // computer there is no such button. Readings are made up here, as a phone would send them.
  assert.equal(await sikt.isHidden('#btn-point'), true, 'no compass button on a computer');
  const point = await openPage({ width: 390, height: 844 }, { touch: true });
  assert.equal(await point.isVisible('#btn-point'), true);
  const aimAt = (type, o) => point.evaluate(([t, r]) => window.dispatchEvent(new DeviceOrientationEvent(t, r)), [type, o]);
  const facing = () => point.evaluate(() => ({ az: window.stjarnhimlen.view.az, alt: window.stjarnhimlen.view.alt, fov: window.stjarnhimlen.view.fov }));
  /** Waits until the view has turned to the given azimuth and altitude. */
  const settlesAt = (az, alt) => point.waitForFunction(([z, a]) => {
    const v = window.stjarnhimlen.view;
    return Math.abs(((v.az - z + 540) % 360) - 180) < 0.3 && Math.abs(v.alt - a) < 0.3;
  }, [az, alt], { timeout: 10000 });
  await point.click('#btn-point');
  assert.equal(await point.getAttribute('#btn-point', 'aria-pressed'), 'true');
  assert.match(await point.textContent('#toast'), /^Håll upp telefonen mot himlen/);
  // Upright, its back to the west (alpha 90): west, on the horizon, with the compass's
  // north turned to true north (about 6 degrees in Sweden).
  await aimAt('deviceorientationabsolute', { alpha: 90, beta: 90, gamma: 0, absolute: true });
  await settlesAt(276, 0);
  // Tilted back 45 degrees: up at 45.
  await aimAt('deviceorientationabsolute', { alpha: 90, beta: 135, gamma: 0, absolute: true });
  await settlesAt(276, 45);
  // A sideways drag corrects the direction and leaves the height to the phone.
  const beforeDrag = await facing();
  await point.evaluate(() => window.stjarnhimlen.pan(-120, 80));
  const corrected = (await facing()).az;
  assert.ok(Math.abs(((corrected - beforeDrag.az + 540) % 360) - 180) > 5, `the drag turned the view (${beforeDrag.az} -> ${corrected})`);
  await aimAt('deviceorientationabsolute', { alpha: 90, beta: 135, gamma: 0, absolute: true });
  await settlesAt(corrected, 45);
  // A flight only zooms: the learner turns the phone.
  await point.evaluate(() => window.stjarnhimlen.flyTo(window.stjarnhimlen.catalog.byId.get('Ori').index));
  const flown = await facing();
  assert.ok(Math.abs(((flown.az - corrected + 540) % 360) - 180) < 0.5 && Math.abs(flown.alt - 45) < 0.5, 'the flight did not turn the view');
  // Off: readings no longer turn the view.
  await point.click('#btn-point');
  assert.equal(await point.getAttribute('#btn-point', 'aria-pressed'), 'false');
  await aimAt('deviceorientationabsolute', { alpha: 0, beta: 90, gamma: 0, absolute: true });
  await point.waitForTimeout(200);
  assert.ok(Math.abs((await facing()).alt - 45) < 0.5, 'off, the phone does not steer');
  // A phone that gives no north: the sky starts where it was, and turns with the phone.
  await point.click('#btn-point');
  await aimAt('deviceorientation', { alpha: 0, beta: 90, gamma: 0, absolute: false });
  assert.match(await point.textContent('#toast'), /säger inte var norr är/);
  const start = (await facing()).az;
  await aimAt('deviceorientation', { alpha: 90, beta: 90, gamma: 0, absolute: false });
  await settlesAt((start + 270) % 360, 0);
  await point.click('#btn-point');
  // A phone (or a page) that gives no readings: said so after a few seconds, and off again.
  await point.click('#btn-point');
  await point.waitForFunction(() => !window.stjarnhimlen.pointing.on, null, { timeout: 6000 });
  assert.match(await point.textContent('#toast'), /^Telefonen ger ingen riktning här/);
  assert.equal(await point.getAttribute('#btn-point', 'aria-pressed'), 'false');

  assert.deepEqual(errors, [], 'no errors in the console');
  console.log('e2e smoke: ok');
} finally {
  await browser.close();
}
