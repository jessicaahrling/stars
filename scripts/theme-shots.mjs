// Screenshots of one interface design in the states that matter, for working on the
// designs in src/themes/. The style sheet is read straight from src/themes/<id>.css, so
// edits show up without a build (the rest of the app comes from dist/, see npm run build).
//
//   node scripts/theme-shots.mjs <id> [out-dir]      default out-dir: /tmp/stars-themes/<id>
//   node scripts/theme-shots.mjs glas                 the current design, for comparison
//
// Prints simple layout checks too: horizontal scroll, buttons whose text does not fit,
// and buttons smaller than 30 px.
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id) throw new Error('usage: node scripts/theme-shots.mjs <id> [out-dir]');
const out = path.resolve(process.argv[3] || `/tmp/stars-themes/${id}`);
await mkdir(out, { recursive: true });
const css = id === 'glas' ? '' : await readFile(path.join(root, 'src/themes', `${id}.css`), 'utf8');
const url = pathToFileURL(path.join(root, 'index.html')).href;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const problems = [];

async function open(viewport, mobile) {
  const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await page.clock.setFixedTime(new Date(Date.UTC(2026, 0, 15, 21, 0)));
  await page.goto(url);
  await page.waitForFunction(() => window.stjarnhimlen);
  await page.evaluate(([themeId, sheet]) => {
    const a = window.stjarnhimlen;
    a.setSpeed(0);
    a.setTheme(themeId === 'glas' ? 'glas' : themeId);
    if (themeId !== 'glas') document.getElementById('theme-style').textContent = sheet;
    a.syncSkyFont();
    a.discoverPanel.render();
    a.layoutChanged();
  }, [id, css]);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return page;
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !window.stjarnhimlen.dirty && !window.stjarnhimlen.anim);
  await page.waitForTimeout(150);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  const found = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth) issues.push(`horizontal scroll ${document.documentElement.scrollWidth - innerWidth}px`);
    for (const b of document.querySelectorAll('button, select, input, label.theme-option')) {
      const r = b.getBoundingClientRect();
      if (!r.width || b.closest('[hidden]') || getComputedStyle(b).visibility === 'hidden') continue;
      const name = (b.textContent || b.getAttribute('aria-label') || b.id || b.type).trim().replace(/\s+/g, ' ').slice(0, 30);
      if (b.scrollWidth > b.clientWidth + 1 && b.tagName === 'BUTTON' && !b.closest('.discover-next, .toggles')) issues.push(`text does not fit: "${name}"`);
      if (r.height < 30 && b.type !== 'radio' && b.type !== 'range' && b.type !== 'checkbox') issues.push(`small (${Math.round(r.width)}x${Math.round(r.height)}): "${name}"`);
    }
    return issues;
  });
  console.log(`${name}.png${found.length ? `\n  ${[...new Set(found)].join('\n  ')}` : ''}`);
}

const ids = (page, list) => page.evaluate((l) => l.map((c) => window.stjarnhimlen.catalog.byId.get(c).index), list);

// Desktop
const d = await open({ width: 1280, height: 800 }, false);
await shot(d, 'desk-1-start');
await d.evaluate(() => {
  const a = window.stjarnhimlen;
  for (const c of ['Dra', 'UMi', 'CVn', 'Lyn', 'Leo']) a.discover(a.catalog.byId.get(c).index);
  a.toggleMark(a.catalog.byId.get('Leo').index);
  a.flyTo(a.catalog.byId.get('UMa').index, { instant: true });
  a.showToast('Här finns en stjärnbild du inte har hittat än. Lägg till en granne först, de har ett plus framför namnet.');
});
await d.hover('#discover-next button');
await shot(d, 'desk-2-playing');
await d.click('#btn-list');
const [leo] = await ids(d, ['Leo']);
await d.click(`#con-list li[data-index="${leo}"] .con-name`);
await d.waitForTimeout(1100);
await shot(d, 'desk-3-list-and-card');
await d.click('#btn-when');
await shot(d, 'desk-4-place-and-time');
await d.click('#btn-theme');
await shot(d, 'desk-5-design-list');
await d.click('#btn-theme-close');
await d.evaluate(() => {
  const a = window.stjarnhimlen;
  a.setDiscover(false);
  a.setLayer('art', true);
  a.setLayer('bounds', true);
  a.toggleMark(a.catalog.byId.get('Ori').index);
  Object.assign(a.view, { az: 180, alt: 30, fov: 100 });
  a.select(a.catalog.byId.get('Tau').index);
});
await d.focus('#toggles [data-layer="names"]');
await d.keyboard.press('Tab');
await shot(d, 'desk-6-whole-sky-card-focus');

// Phone
const p = await open({ width: 390, height: 844 }, true);
await shot(p, 'phone-1-start');
await p.evaluate(() => {
  const a = window.stjarnhimlen;
  for (const c of ['Dra', 'UMi', 'CVn', 'Lyn']) a.discover(a.catalog.byId.get(c).index);
  a.flyTo(a.catalog.byId.get('UMa').index, { instant: true });
});
await p.click('#btn-list');
await shot(p, 'phone-2-list');
const [lyn] = await ids(p, ['Lyn']);
await p.click(`#con-list li[data-index="${lyn}"] .con-name`);
await p.waitForTimeout(1100);
await shot(p, 'phone-3-card');
await p.click('#btn-when');
await shot(p, 'phone-4-place-and-time');
await p.click('#btn-when');
await p.click('#btn-theme');
await shot(p, 'phone-5-design-list');

await browser.close();
if (problems.length) console.log(problems.join('\n'));
console.log(`screenshots in ${out}`);
