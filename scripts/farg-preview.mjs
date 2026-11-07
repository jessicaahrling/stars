// Renders a coloured test drawing (art/farg-test/<ID>.svg, or - for none) over its
// constellation's stars and stick figure on a black sky, in the app's art frame.
//   node scripts/farg-preview.mjs <ID> <svg|-> <out.png> [--no-lines] [--size 900]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [id, svgPath, out] = process.argv.slice(2);
const noLines = process.argv.includes('--no-lines');
const size = Number(process.argv[process.argv.indexOf('--size') + 1]) || 900;
const kit = JSON.parse(execFileSync('node', [new URL('./art-tool.mjs', import.meta.url).pathname, 'kit', id]).toString());
let inner = '';
let vb = null;
if (svgPath !== '-') {
  const src = readFileSync(svgPath, 'utf8');
  vb = src.match(/viewBox="([^"]+)"/)[1].split(/[ ,]+/).map(Number);
  inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
const [x0, y0, x1, y1] = kit.figureBox;
const pad = 0.25 * Math.max(x1 - x0, y1 - y0);
const box = vb || [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
const unit = Math.max(box[2], box[3]) / 300;
const stars = kit.stars.filter((s) => s.figure);
const lines = noLines ? '' : kit.lines.map(([a, b]) => `<line x1="${kit.stars[a].x}" y1="${kit.stars[a].y}" x2="${kit.stars[b].x}" y2="${kit.stars[b].y}"/>`).join('');
const dots = stars.map((s) => `<circle cx="${s.x}" cy="${s.y}" r="${(Math.max(0.6, 2.6 - s.mag * 0.45) * unit).toFixed(2)}"/>`).join('');
const html = `<!doctype html><html><body style="margin:0;background:#000">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${box.join(' ')}" style="display:block">
  <rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#000"/>
  ${inner}
  <g stroke="#ff6a1a" stroke-width="${(0.55 * unit).toFixed(2)}" stroke-linecap="round" opacity="0.9">${lines}</g>
  <g fill="#ffd21f" stroke="#ff6a1a" stroke-width="${(0.25 * unit).toFixed(2)}">${dots}</g>
</svg></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: size, height: size } });
await page.setContent(html);
await page.screenshot({ path: out });
await browser.close();
console.log(out, JSON.stringify(box.map((v) => Math.round(v))));
