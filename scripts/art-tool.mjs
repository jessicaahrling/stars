// Tools for drawing the constellation illustrations in art/<id>.svg.
//
//   node scripts/art-tool.mjs kit <id>                 drawing kit: stars, figure, boundary in frame units
//   node scripts/art-tool.mjs preview <id> [--out f.png] [--no-lines] [--size 900]
//                                                      validate art/<id>.svg and render it over its stars
//   node scripts/art-tool.mjs sheet --out f.png [ids…] contact sheet of many illustrations
//
// Frame units: 10 units = 1 degree near the centre; x grows to the west (right) and
// y to the south (down), i.e. the sky as seen with north up. See src/sky/art-frame.js.
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCatalog } from '../src/sky/catalog.js';
import { artFrame, toArt } from '../src/sky/art-frame.js';
import { angleBetween } from '../src/astro/math.js';
import { parseArtSvg, readArt } from './lib/svg-art.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = buildCatalog();
const r1 = (x) => Math.round(x * 10) / 10;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

function constellation(id) {
  const c = catalog.byId.get(id);
  if (!c) throw new Error(`unknown constellation id "${id}" (use the IAU abbreviation, e.g. Ori, UMa, CVn)`);
  return c;
}

/** Everything an illustrator needs, in frame units. */
function kit(id) {
  const c = constellation(id);
  const frame = artFrame(c.centerVec);
  const { stars } = catalog;
  const list = [];
  const indexOf = new Map();
  const add = (i, fig) => {
    if (indexOf.has(i)) return;
    indexOf.set(i, list.length);
    const [x, y] = toArt(frame, catalog.starVec(i));
    list.push({
      name: catalog.starNames[i] || null,
      bayer: catalog.bayer[i] || null,
      hip: stars.hip[i],
      mag: Math.round(stars.mag[i] * 100) / 100,
      x: r1(x),
      y: r1(y),
      figure: fig,
    });
  };
  for (const i of c.figureStars) add(i, true);
  for (let i = 0; i < stars.count && stars.mag[i] <= 4.5; i++) if (stars.con[i] === c.index) add(i, false);
  const lines = [];
  for (let k = 0; k < c.segments.length; k += 2) lines.push([indexOf.get(c.segments[k]), indexOf.get(c.segments[k + 1])]);
  const boundary = c.outlines.map((ring) => ring.filter((_, k) => k % 3 === 0).map((v) => toArt(frame, v).map(r1)));
  const neighbours = catalog.constellations
    .filter((o) => o !== c && angleBetween(o.centerVec, c.centerVec) < 45)
    .map((o) => {
      const [x, y] = toArt(frame, o.centerVec);
      return { id: o.id, latin: o.la, x: r1(x), y: r1(y) };
    });
  const xs = list.filter((s) => s.figure).map((s) => s.x);
  const ys = list.filter((s) => s.figure).map((s) => s.y);
  return {
    id,
    latin: c.la,
    genitive: c.gen,
    swedish: c.sv,
    units: '10 units = 1 degree; x grows west (right), y grows south (down); north up, east left, as seen on the sky',
    figureBox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(r1),
    stars: list,
    lines,
    boundary,
    neighbours,
  };
}

async function readSvg(id) {
  const file = path.join(root, 'art', `${id}.svg`);
  if (!existsSync(file)) return null;
  return readFile(file, 'utf8');
}

/** Inner SVG markup for one constellation: boundary, figure, stars, art. */
function scene(id, polylines, { lines = true, labels = true, unit = 1 } = {}) {
  const k = kit(id);
  const parts = [];
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  const grow = (x, y) => {
    xmin = Math.min(xmin, x);
    xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  };
  for (const ring of k.boundary) {
    for (const [x, y] of ring) grow(x, y);
    parts.push(`<polygon points="${ring.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#5f73a8" stroke-opacity="0.55" stroke-dasharray="${4 * unit} ${4 * unit}" stroke-width="${unit}"/>`);
  }
  for (const pl of polylines || []) for (let i = 0; i < pl.pts.length; i += 2) grow(pl.pts[i], pl.pts[i + 1]);
  if (lines) {
    for (const [a, b] of k.lines) {
      const s = k.stars[a];
      const t = k.stars[b];
      parts.push(`<line x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}" stroke="#86a2dc" stroke-opacity="0.6" stroke-width="${1.2 * unit}"/>`);
    }
  }
  for (const pl of polylines || []) {
    const pts = [];
    for (let i = 0; i < pl.pts.length; i += 2) pts.push(`${pl.pts[i]},${pl.pts[i + 1]}`);
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#e8cf9f" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${pl.fine ? 0.55 : 0.95}" stroke-width="${(pl.fine ? 1.1 : 2) * unit}"/>`);
  }
  for (const s of k.stars) {
    const r = (0.8 + 0.55 * Math.max(0, 6.2 - s.mag)) * unit;
    parts.push(`<circle cx="${s.x}" cy="${s.y}" r="${r.toFixed(2)}" fill="${s.figure ? '#ffffff' : '#9fb0d8'}"/>`);
    if (labels && (s.name || (s.figure && s.bayer))) {
      parts.push(`<text x="${s.x + r + 3 * unit}" y="${s.y + 4 * unit}" font-size="${11 * unit}" fill="#c9d4f2" font-family="sans-serif">${s.name || s.bayer}</text>`);
    }
  }
  const pad = Math.max(xmax - xmin, ymax - ymin) * 0.06 + 10;
  return { k, svg: parts.join(''), box: [xmin - pad, ymin - pad, xmax - xmin + 2 * pad, ymax - ymin + 2 * pad] };
}

async function screenshot(html, out, width, height) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html);
    await mkdir(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
  } finally {
    await browser.close();
  }
}

async function preview(id) {
  const size = Number(arg('--size', 900));
  const out = path.resolve(arg('--out', `/tmp/stars-art/${id}.png`));
  const svg = await readSvg(id);
  let polylines = [];
  if (svg) {
    const { errors } = parseArtSvg(svg);
    if (errors.length) {
      console.error(`art/${id}.svg is not valid:\n- ${errors.join('\n- ')}`);
      process.exitCode = 1;
      return;
    }
    polylines = readArt(svg);
  } else {
    console.log(`(no art/${id}.svg yet; rendering the stars only)`);
  }
  // Unit scale so strokes are a fixed size in output pixels.
  const probe = scene(id, polylines);
  const [, , bw, bh] = probe.box;
  const scale = size / Math.max(bw, bh);
  const { k, svg: inner, box } = scene(id, polylines, { lines: !process.argv.includes('--no-lines'), unit: 1 / scale });
  const w = Math.round(box[2] * scale);
  const h = Math.round(box[3] * scale);
  const html = `<html><body style="margin:0;background:#060a17"><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${box.join(' ')}">${inner}</svg>
<div style="position:fixed;left:8px;top:6px;font:13px sans-serif;color:#9fb0d8">${k.latin} · ${k.swedish} · N up, E left · 10 units = 1°</div></body></html>`;
  await screenshot(html, out, w, h);
  const points = polylines.reduce((s, p) => s + p.pts.length / 2, 0);
  console.log(`wrote ${out} (${w}x${h}); ${polylines.length} polylines, ${points} points after flattening`);
}

async function sheet() {
  const out = path.resolve(arg('--out', '/tmp/stars-art/sheet.png'));
  const ids = [];
  const rest = process.argv.slice(3);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) i++; // skip the flag's value
    else ids.push(rest[i]);
  }
  const list = ids.length ? ids : catalog.constellations.map((c) => c.id).filter((id) => existsSync(path.join(root, 'art', `${id}.svg`)));
  const cell = Number(arg('--cell', 300));
  const cols = Math.min(6, list.length);
  const cells = [];
  for (const id of list) {
    const svg = await readSvg(id);
    const polylines = svg ? readArt(svg) : [];
    const probe = scene(id, polylines, { labels: false });
    const scale = cell / Math.max(probe.box[2], probe.box[3]);
    const { svg: inner, box } = scene(id, polylines, { labels: false, unit: 1 / scale });
    cells.push(`<div style="width:${cell}px;height:${cell + 20}px;display:inline-block;vertical-align:top;position:relative">
<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}" viewBox="${box.join(' ')}" preserveAspectRatio="xMidYMid meet">${inner}</svg>
<div style="font:12px sans-serif;color:#9fb0d8;text-align:center">${id} · ${constellation(id).la}</div></div>`);
  }
  const rows = Math.ceil(cells.length / cols);
  const html = `<html><body style="margin:0;background:#060a17;width:${cols * cell}px">${cells.join('')}</body></html>`;
  await screenshot(html, out, cols * cell, rows * (cell + 20));
  console.log(`wrote ${out} (${list.length} constellations)`);
}

const [cmd, id] = process.argv.slice(2);
if (cmd === 'kit') console.log(JSON.stringify(kit(id), null, 1));
else if (cmd === 'preview') await preview(id);
else if (cmd === 'sheet') await sheet();
else {
  console.error('usage: node scripts/art-tool.mjs kit <id> | preview <id> [--out f.png] [--no-lines] | sheet --out f.png [ids…]');
  process.exitCode = 1;
}
