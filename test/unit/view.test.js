import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkyView } from '../../src/sky/view.js';
import { azAltFromVec, vecFromAzAlt } from '../../src/astro/frames.js';
import { mat3Apply } from '../../src/astro/math.js';
import { fromLocal, localParts, formatClock } from '../../src/ui/format.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

function view(az, alt, fov) {
  const v = new SkyView();
  v.setSize(1200, 800);
  Object.assign(v, { az, alt, fov, timeMs: Date.UTC(2026, 0, 15, 21) });
  v.update();
  return v;
}

test('the viewing direction lands in the middle of the screen', () => {
  const v = view(135, 20, 90);
  const c = mat3Apply(v.horToCam, vecFromAzAlt(135, 20));
  const p = {};
  assert.ok(v.projectCam(c[0], c[1], c[2], p));
  near(p.x, 600, 1e-6);
  near(p.y, 400, 1e-6);
});

test('fov spans the longer side of the screen', () => {
  const v = view(180, 0, 100);
  const edge = mat3Apply(v.horToCam, vecFromAzAlt(230, 0));
  const p = {};
  v.projectCam(edge[0], edge[1], edge[2], p);
  near(p.x, 1200, 1e-6);
});

test('east is to the left when facing south, and up is up', () => {
  const v = view(180, 30, 90);
  const p = {};
  const east = mat3Apply(v.horToCam, vecFromAzAlt(150, 30));
  v.projectCam(east[0], east[1], east[2], p);
  assert.ok(p.x < 600);
  const high = mat3Apply(v.horToCam, vecFromAzAlt(180, 50));
  v.projectCam(high[0], high[1], high[2], p);
  assert.ok(p.y < 400);
});

test('unproject inverts the projection', () => {
  const v = view(300, 65, 120);
  for (const [az, alt] of [[300, 65], [250, 40], [10, 80], [320, 10]]) {
    const c = mat3Apply(v.horToCam, vecFromAzAlt(az, alt));
    const p = {};
    v.projectCam(c[0], c[1], c[2], p);
    const [az2, alt2] = azAltFromVec(v.unproject(p.x, p.y));
    near(az2, az, 1e-6, 'az');
    near(alt2, alt, 1e-6, 'alt');
  }
});

test('Swedish wall-clock time, winter and summer', () => {
  assert.equal(fromLocal(2026, 1, 15, 22, 0), Date.UTC(2026, 0, 15, 21, 0));
  assert.equal(fromLocal(2026, 7, 1, 22, 0), Date.UTC(2026, 6, 1, 20, 0));
  const p = localParts(Date.UTC(2026, 9, 19, 20, 47));
  assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute], [2026, 10, 19, 22, 47]);
  assert.equal(formatClock(Date.UTC(2026, 2, 29, 1, 30)), '03:30');
});
