// Build script: bundles src/main.js into one classic IIFE script so index.html
// works both from a local server and by double-clicking (file://), where ES
// modules would be blocked by CORS.
//
//   node scripts/build.mjs           -> production build into dist/
//   node scripts/build.mjs --serve   -> dev server with live reload on http://localhost:8080
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serve = process.argv.includes('--serve');
const port = Number(process.env.PORT || 8080);

const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(root, 'dist/stjarnhimlen.js'),
  minify: !serve,
  sourcemap: serve ? 'inline' : 'external',
  legalComments: 'none',
  // The designs in src/themes/ are style sheets the app adds to the page as text.
  loader: { '.css': 'text' },
  logLevel: 'info',
};

if (serve) {
  // Live reload: the bundle listens on /esbuild for change events.
  options.banner = {
    js: "try{new EventSource('/esbuild').addEventListener('change',()=>location.reload())}catch(e){}",
  };
  const ctx = await esbuild.context(options);
  await ctx.watch();
  await ctx.serve({ servedir: root, port });
  console.log(`\n  Stjärnhimlen (dev)\n  -> http://localhost:${port}/\n`);
} else {
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await esbuild.build(options);
  // Also emit a fully self-contained single-file build (handy for sharing).
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const js = (await readFile(path.join(root, 'dist/stjarnhimlen.js'), 'utf8')).replace(/\n\/\/# sourceMappingURL=.*$/m, '');
  const marker = '<script src="dist/stjarnhimlen.js"></script>';
  if (!html.includes(marker)) throw new Error(`index.html must contain ${marker}`);
  const standalone = html.replace(marker, () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
  await writeFile(path.join(root, 'dist/stjarnhimlen-fristaende.html'), standalone);
  console.log('  wrote dist/stjarnhimlen.js and dist/stjarnhimlen-fristaende.html');
}
