import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SKY_LOOK, SKY_LOOKS, skyLookOf } from '../../src/render/palette.js';

/** A colour as the looks write them; a canvas passes over one it cannot read, in silence. */
const COLOR = /^(#[0-9a-f]{6}|rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0\.\d+)\))$/;
/** The colours only one of the looks has; null in the other. */
const OPTIONAL = ['grid', 'glint', 'nameRim'];

test('the looks of the sky give the same things, so that none is drawn with nothing', () => {
  const { chart, classic } = SKY_LOOKS;
  assert.deepEqual(Object.keys(SKY_LOOKS), ['chart', 'classic']);
  assert.equal(SKY_LOOKS[DEFAULT_SKY_LOOK], chart);
  assert.deepEqual(Object.keys(classic).sort(), Object.keys(chart).sort());
  for (const part of ['colors', 'lines', 'stars', 'sky', 'ground']) {
    assert.deepEqual(Object.keys(classic[part]).sort(), Object.keys(chart[part]).sort(), part);
  }
  for (const [id, look] of Object.entries(SKY_LOOKS)) {
    assert.equal(look.id, id);
    for (const [name, color] of Object.entries(look.colors)) {
      if (color === null) assert.ok(OPTIONAL.includes(name), `${id}: ${name} must be a colour`);
      else assert.match(color, COLOR, `${id}: ${name}`);
    }
    for (const [name, [under, glow, width, color]] of Object.entries(look.lines)) {
      assert.ok(width > 0 && width <= 3, `${id}: the width of ${name}`);
      assert.match(color, COLOR, `${id}: ${name}`);
      if (under > 0) {
        assert.ok(under > width, `${id}: the line under ${name} is wider than it`);
        assert.match(glow, COLOR, `${id}: under ${name}`);
      }
    }
    const rgbs = [look.sky.zenith, look.sky.horizon, look.sky.haze, look.sky.milkyWay, look.ground.near, look.ground.far, look.ground.trees];
    for (const rgb of rgbs) assert.ok(rgb.length === 3 && rgb.every((x) => x >= 0 && x <= 1), `${id}: ${rgb}`);
    for (const k of ['curve', 'hazeFall']) assert.ok(look.sky[k] > 0, `${id}: ${k}`);
    for (const k of ['clouds', 'vignette']) assert.ok(look.sky[k] >= 0 && look.sky[k] < 1, `${id}: ${k}`);
    assert.ok(look.gap >= 0 && look.groupLine > 0 && typeof look.fills === 'boolean', id);
    // The stars: a disc that grows with brightness, and a glow that fades outward to nothing.
    const [base, scale, power] = look.stars.disc;
    assert.ok(look.stars.disc.length === 3 && base > 0 && scale > 0 && power > 0, `${id}: the disc`);
    const stops = look.stars.glow;
    assert.ok(stops.length >= 2 && stops[0][0] === 0 && stops[stops.length - 1][0] === 1 && stops[stops.length - 1][1] === 0, `${id}: the glow's ends`);
    for (let k = 1; k < stops.length; k++) {
      assert.ok(stops[k][0] > stops[k - 1][0] && stops[k][1] < stops[k - 1][1], `${id}: the glow fades outward`);
    }
  }
});

test('a saved look that is not one of the looks gives the default', () => {
  for (const bad of [undefined, null, '', 'Classic', 'constructor', '__proto__', 'toString', 5, {}, ['classic']]) {
    assert.equal(skyLookOf(bad), DEFAULT_SKY_LOOK, JSON.stringify(bad));
  }
  for (const id of Object.keys(SKY_LOOKS)) assert.equal(skyLookOf(id), id);
});

test('the Design panel has a button for each look, and no other', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(/data-look="(\w+)"/g)].map((m) => m[1]), Object.keys(SKY_LOOKS));
});

test('the plainer look is the sky as it was: no fills, grid, rays, rims, clouds or vignette', () => {
  const { chart, classic } = SKY_LOOKS;
  assert.deepEqual(
    [classic.fills, classic.colors.grid, classic.colors.glint, classic.colors.nameRim, classic.sky.clouds, classic.sky.vignette],
    [false, null, null, null, 0, 0],
  );
  assert.ok(chart.fills && OPTIONAL.every((name) => chart.colors[name]) && chart.sky.clouds > 0 && chart.sky.vignette > 0);
  // Its lines are plain: blue, with nothing under them, and stop short of the stars.
  assert.deepEqual(classic.lines.plain, [0, '', 1.1, 'rgba(132, 160, 214, 0.5)']);
  assert.ok(classic.gap > chart.gap);
});
