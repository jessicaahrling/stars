import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = process.argv[2];
const themes = process.argv.slice(3);
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const errs = [];
for (const theme of themes) {
  for (const [kind, vp] of [['desk', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp, hasTouch: kind === 'phone', isMobile: kind === 'phone' });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.clock.setFixedTime(new Date(Date.UTC(2026, 0, 15, 21, 0)));
    await p.goto(pathToFileURL(path.resolve('index.html')).href);
    await p.waitForFunction(() => window.stjarnhimlen);
    await p.evaluate((t) => { const a = window.stjarnhimlen; a.setSpeed(0); a.setTheme(t); }, theme);
    await p.click('#btn-train');
    const settle = async () => { await p.waitForFunction(() => !window.stjarnhimlen.dirty && !window.stjarnhimlen.anim); await p.waitForTimeout(250); };
    await settle();
    await p.screenshot({ path: `${out}/${theme}-${kind}-1.png` });
    await p.click('#train-actions .chip.primary');
    await settle();
    await p.screenshot({ path: `${out}/${theme}-${kind}-2.png` });
    await p.click('#train-actions .chip.primary');
    await settle();
    await p.screenshot({ path: `${out}/${theme}-${kind}-3.png` });
    await p.close();
  }
}
console.log(errs);
await b.close();
