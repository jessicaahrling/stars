import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceToEarth, pointingOf, topAzimuthOf } from '../../src/sky/pointing.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const sameAz = (a, b, tol = 1e-6) => near(((a - b + 540) % 360) - 180, 0, tol);

test('the turn from the device to the earth is a rotation', () => {
  for (const [a, b, g] of [[0, 0, 0], [30, 60, -20], [200, 135, 80], [359, -170, 45]]) {
    const m = deviceToEarth(a, b, g);
    const col = (k) => [m[k], m[k + 3], m[k + 6]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const dot = col(i).reduce((s, x, k) => s + x * col(j)[k], 0);
        assert.ok(near(dot, i === j ? 1 : 0), `columns ${i}, ${j} of ${[a, b, g]}`);
      }
    }
  }
});

test('held upright, the phone looks at the horizon the way its back faces', () => {
  // alpha counts anticlockwise from north, so 90 is west and 270 east.
  for (const [alpha, az] of [[0, 0], [90, 270], [180, 180], [270, 90], [30, 330]]) {
    const p = pointingOf(alpha, 90, 0);
    assert.ok(sameAz(p.az, az) && near(p.alt, 0), `alpha ${alpha}: ${p.az}, ${p.alt}`);
  }
  // gamma turns an upright phone about its own long axis: to the left for a positive one.
  assert.ok(sameAz(pointingOf(0, 90, 20).az, 340));
});

test('tilted back it looks up, tilted forward down, and the azimuth holds steady overhead', () => {
  assert.ok(near(pointingOf(0, 135, 0).alt, 45));
  assert.ok(near(pointingOf(0, 60, 0).alt, -30));
  // Tilted from facing north all the way back to the zenith, and on past it a little:
  // still facing north, as the sky would be seen.
  for (const beta of [135, 170, 179.99, 180]) assert.ok(sameAz(pointingOf(0, beta, 0).az, 0, 1e-3), `beta ${beta}`);
  assert.ok(near(pointingOf(0, 180, 0).alt, 90));
  // Lying face up it looks straight down, facing the way its top points.
  const down = pointingOf(0, 0, 0);
  assert.ok(near(down.alt, -90) && sameAz(down.az, 0, 1e-3));
  assert.ok(sameAz(pointingOf(90, 0, 0).az, 270, 1e-3));
});

test('turning the screen does not change where the phone looks at the horizon', () => {
  for (const angle of [0, 90, 180, 270]) {
    const p = pointingOf(40, 90, 0, angle);
    assert.ok(sameAz(p.az, 320) && near(p.alt, 0), `screen ${angle}: ${p.az}`);
  }
  // On its side (landscape), looking east: the device's long axis lies level.
  const side = pointingOf(0, 0, -90, 90);
  assert.ok(sameAz(side.az, 90, 1e-6) && near(side.alt, 0), `${side.az} ${side.alt}`);
});

/** Device angles for a camera at azimuth az and altitude alt, turned by roll about where it looks (found by search). */
function anglesFor(az, alt, roll) {
  const look = [Math.cos(alt * Math.PI / 180) * Math.sin(az * Math.PI / 180), Math.cos(alt * Math.PI / 180) * Math.cos(az * Math.PI / 180), Math.sin(alt * Math.PI / 180)];
  let best = null;
  for (let a = 0; a < 360; a += 2) {
    for (let b = -180; b < 180; b += 2) {
      for (let g = -90; g <= 90; g += 2) {
        const m = deviceToEarth(a, b, g);
        const d = [-m[2], -m[5], -m[8]];
        const err = Math.hypot(d[0] - look[0], d[1] - look[1], d[2] - look[2]);
        if (err > 0.06) continue;
        // Roll: how far the screen's top leans off the vertical plane through the view.
        const up = [m[1], m[4], m[7]];
        const side = [look[1], -look[0], 0];
        const sn = Math.hypot(...side) || 1;
        const r = Math.asin(Math.max(-1, Math.min(1, (up[0] * side[0] + up[1] * side[1]) / sn))) * 180 / Math.PI;
        const score = err + Math.abs(r - roll) / 50;
        if (!best || score < best.score) best = { a, b, g, score };
      }
    }
  }
  return best;
}

test('a phone held a little crooked still looks where its camera looks', () => {
  for (const roll of [10, 20]) {
    const { a, b, g } = anglesFor(30, 45, roll);
    const m = deviceToEarth(a, b, g);
    const camAz = (Math.atan2(-m[2], -m[5]) * 180 / Math.PI + 360) % 360;
    const p = pointingOf(a, b, g);
    assert.ok(Math.abs(((p.az - camAz + 540) % 360) - 180) < 2.5, `roll ${roll}: ${p.az} against the camera's ${camAz}`);
  }
  // Tilted on past the zenith (lying on one's back), it looks the other way.
  const past = pointingOf(0, 195, 0);
  assert.ok(sameAz(past.az, 180, 1e-6) && near(past.alt, 75, 1e-6), `${past.az} ${past.alt}`);
});

test('the top of the phone, which an iPhone compass measures from', () => {
  // Upright, the top points straight up: no azimuth to compare with.
  assert.equal(topAzimuthOf(0, 90, 0), null);
  // Tilted back to look up, the top points behind; leaning forward or flat, ahead.
  assert.ok(sameAz(topAzimuthOf(0, 135, 0).az, 180));
  assert.ok(sameAz(topAzimuthOf(0, 30, 0).az, 0));
  assert.ok(sameAz(topAzimuthOf(90, 0, 0).az, 270));
});
