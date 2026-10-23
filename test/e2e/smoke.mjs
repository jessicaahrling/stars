// Smoke test in headless Chromium: the sky renders, a tap on a constellation toggles its
// illustration, the list opens the info card, marking works, and the sky can be
// discovered one neighbour at a time ("Upptäck"). Screenshots land in
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

/** A page at a fixed time. Most checks need the whole sky, so "Upptäck" is turned off
 * unless `discover` is set; then the view stays on Ursa Major, where discovery starts. */
async function openPage(viewport, { discover = false } = {}) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // Web fonts are optional; offline runs fall back to system fonts.
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|net::/.test(m.text())) errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.stjarnhimlen);
  // 15 January 2026, 22:00 in Stockholm, facing south.
  await page.evaluate((disc) => {
    const app = window.stjarnhimlen;
    app.setTime(Date.UTC(2026, 0, 15, 21, 0));
    app.setSpeed(0);
    if (disc) {
      app.flyTo(app.catalog.byId.get('UMa').index, { instant: true });
    } else {
      app.setDiscover(false);
      Object.assign(app.view, { az: 180, alt: 30, fov: 110 });
    }
    app.invalidate();
  }, discover);
  await settle(page);
  return page;
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

  await page.fill('#search', '');
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
  await page.reload();
  await page.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await taurusArt(), true, 'the tapped illustration is shown again after a reload');
  assert.equal(await page.getAttribute('[data-layer="art"]', 'aria-pressed'), 'true');
  await page.click('[data-layer="art"]');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').artOverrides || []).length === 0);
  await page.reload();
  await page.waitForFunction(() => window.stjarnhimlen);
  assert.equal(await taurusArt(), false, 'hiding all is remembered too');

  // "Upptäck": a first visit shows Ursa Major alone and offers its neighbours.
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
  assert.deepEqual(await discovery(), {
    on: true,
    found: ['UMa'],
    next: ['Boo', 'CVn', 'Cam', 'Com', 'Dra', 'LMi', 'Leo', 'Lyn'],
    count: '1 av 57',
    panel: true,
    pressed: 'true',
  });
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

  // A tap on a neighbour with a plus adds it, and its neighbours are offered in turn.
  const offered = await pointOver(2);
  assert.ok(offered, 'a neighbour is in view');
  await sky.mouse.click(offered.x, offered.y);
  await settle(sky);
  let d = await discovery();
  assert.deepEqual(d.found, ['UMa', offered.id].sort());
  assert.equal(d.count, '2 av 57');
  assert.ok(!d.next.includes(offered.id), 'what is found is not offered again');
  const two = await drawnStars();
  assert.ok(two.n > onlyUMa.n && two.stray === 0, `its stars appear (${onlyUMa.n} -> ${two.n})`);

  // A tap on a hidden constellation adds nothing and says why.
  await sky.evaluate(() => {
    window.stjarnhimlen.view.fov = 150;
    window.stjarnhimlen.invalidate();
  });
  await settle(sky);
  const hidden = await pointOver(0);
  assert.ok(hidden, 'some constellation is still hidden');
  await sky.mouse.click(hidden.x, hidden.y);
  assert.match(await sky.textContent('#toast'), /granne/);
  assert.deepEqual((await discovery()).found, d.found);

  // The buttons in the panel add neighbours too, and a tap on a found one shows its drawing.
  const chip = await sky.$('#discover-next button');
  const chipId = await chip.getAttribute('data-id');
  await chip.click();
  await settle(sky);
  d = await discovery();
  assert.equal(d.found.length, 3);
  assert.ok(d.found.includes(chipId));
  await sky.evaluate(() => window.stjarnhimlen.flyTo(window.stjarnhimlen.catalog.byId.get('UMa').index, { instant: true }));
  await settle(sky);
  const umaPoint = await pointOver(1, d.found.filter((x) => x !== 'UMa'));
  await sky.mouse.click(umaPoint.x, umaPoint.y);
  assert.equal(await sky.evaluate(() => window.stjarnhimlen.artShown(window.stjarnhimlen.catalog.byId.get('UMa').index)), true);
  assert.deepEqual((await discovery()).found, d.found, 'a tap on a found constellation adds nothing');
  await sky.screenshot({ path: path.join(shots, 'discover-three.png') });

  // The list holds only what has been found.
  await sky.click('#btn-list');
  const listed = await sky.$$eval('#con-list li:not([hidden]):not(.empty) strong', (els) => els.length);
  assert.equal(listed, 3);
  assert.equal(await sky.isVisible('#list-note'), true);
  await sky.click('#btn-list-close');

  // What has been found is remembered between visits.
  const foundIds = JSON.stringify(d.found);
  await sky.waitForFunction((ids) => JSON.stringify([...(JSON.parse(localStorage.getItem('stjarnhimlen:v1') || '{}').discover?.found || [])].sort()) === ids, foundIds);
  await sky.reload();
  await sky.waitForFunction(() => window.stjarnhimlen);
  assert.deepEqual((await discovery()).found, d.found);

  // "Visa hela himlen" leaves the mode, shows every star and lists every constellation;
  // "Upptäck" comes back to where it was.
  await sky.click('#btn-discover-exit');
  await settle(sky);
  d = await discovery();
  assert.deepEqual([d.on, d.panel, d.pressed, d.next], [false, false, 'false', null]);
  assert.ok((await drawnStars()).n > two.n * 3, 'the whole sky is back');
  await sky.click('#btn-list');
  assert.ok((await sky.$$eval('#con-list li:not([hidden]):not(.empty)', (els) => els.length)) > 50);
  assert.equal(await sky.isVisible('#list-note'), false);
  await sky.click('#btn-list-close');
  await sky.click('#btn-discover');
  d = await discovery();
  assert.deepEqual([d.on, d.panel, d.found.length], [true, true, 3]);

  // Another place changes the goal: fewer constellations rise in Kiruna.
  await sky.evaluate(() => window.stjarnhimlen.setPlace('kiruna'));
  assert.match((await discovery()).count, /^\d+ av 52$/);
  await sky.evaluate(() => window.stjarnhimlen.setPlace('stockholm'));

  // Collecting every neighbour finishes the sky seen from here, then the rest can follow.
  const collect = () => sky.evaluate(() => {
    const a = window.stjarnhimlen;
    while (a.discoveryInfo.next.length) a.discover(a.discoveryInfo.next[0]);
  });
  await collect();
  assert.match(await sky.textContent('#discover-hint'), /^Klart! Du har hittat alla 57 som syns från Stockholm/);
  assert.equal(await sky.textContent('#btn-discover-rest'), `Fortsätt med resten av himlen (${88 - 57} till)`);
  await sky.click('#btn-discover-rest');
  d = await discovery();
  assert.equal(d.count, '57 av 88');
  assert.ok(d.next.length > 0);
  await collect();
  d = await discovery();
  assert.deepEqual([d.found.length, d.next.length, d.count], [88, 0, '88 av 88']);
  assert.match(await sky.textContent('#discover-hint'), /^Hela himlen!/);
  assert.equal(await sky.isHidden('#btn-discover-rest'), true);

  // Starting over takes two presses.
  await sky.click('#btn-discover-restart');
  assert.equal((await discovery()).found.length, 88);
  assert.equal(await sky.textContent('#btn-discover-restart'), 'Säker? Tryck igen');
  await sky.click('#btn-discover-restart');
  d = await discovery();
  assert.deepEqual([d.found, d.count], [['UMa'], '1 av 57']);

  // On a phone the panel fits across the top.
  const phoneSky = await openPage({ width: 390, height: 844 }, { discover: true });
  assert.equal(await phoneSky.isVisible('#panel-discover'), true);
  assert.ok((await phoneSky.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'no horizontal scroll');
  await phoneSky.screenshot({ path: path.join(shots, 'phone-discover.png') });

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
