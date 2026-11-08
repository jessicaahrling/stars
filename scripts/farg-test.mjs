// Coloured test drawings in the style of the star maps in the chapter "En rymdresa":
// cartoon figures built exactly on the stick-figure lines. The outlines are polygons with
// their corners at the stars, so that every line is an edge of the figure, and limbs and
// tails are straight strips along the lines with their joints at the stars; only details
// inside (faces, manes, stripes) are free. Writes art/farg-test/<ID>.svg; see
// art/farg-test/README.md.
//
//   node scripts/farg-test.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { smooth, poly, strip, ellipse, svg, lerp } from './lib/farg-kit.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../art/farg-test');
const NONE = 'none';
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const eye = (x, y, r, look = [0, 0]) => [
  { d: ellipse(x, y, r, r * 1.15), fill: '#ffffff', w: r * 0.2 },
  { d: ellipse(x + look[0] * r * 0.35, y + look[1] * r * 0.35, r * 0.5, r * 0.6), fill: '#1b1b1b', stroke: NONE },
];
const rays = (x, y, r0, r1, n, color, w) => Array.from({ length: n }, (_, k) => {
  const a = (k / n) * Math.PI * 2 + 0.2;
  const r = k % 2 ? r1 : r1 * 0.7;
  return { d: poly([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r, y + Math.sin(a) * r]], false), stroke: color, w };
});
/** Bands across a triangle, parallel to its base a–b, from t0 to t1 of the way to the apex c. */
const band = (a, b, c, t0, t1) => poly([lerp(a, c, t0), lerp(b, c, t0), lerp(b, c, t1), lerp(a, c, t1)]);

// ---- Lilla björnen: the bowl is the bear's body, the handle its tail out to Polstjärnan.
{
  const sw = 0.9;
  const S = { ze: [-33.4, -2.5], eta: [-58.3, 10.2], gam: [-31.7, 59], bet: [-7.3, 38.3], eps: [-41.6, -51.9], del: [-23.5, -95.2], pol: [-0.3, -127.9] };
  const brown = '#a2481a', dark = '#6e300e', tan = '#e9b27c';
  const centre = [0, 1].map((k) => (S.ze[k] + S.eta[k] + S.gam[k] + S.bet[k]) / 4);
  // The face sits at the bottom end, by Pherkad and Kochab: t along that edge, d units in
  // from it, towards the tail.
  const e = [S.bet[0] - S.gam[0], S.bet[1] - S.gam[1]];
  const el = Math.hypot(...e);
  let n = [-e[1] / el, e[0] / el];
  if ((centre[0] - S.gam[0]) * n[0] + (centre[1] - S.gam[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const at = (t, d) => add(lerp(S.gam, S.bet, t), [n[0] * d, n[1] * d]);
  const shapes = [
    { d: ellipse(...S.pol, 8), fill: '#fff6c8', stroke: NONE },
    ...rays(...S.pol, 5, 15, 16, '#ffffff', 0.6),
    { d: strip([S.ze, S.eps, S.del, S.pol], [6, 4.6, 3.4, 2.4]), fill: brown },
    { d: ellipse(...S.pol, 3.6), fill: dark },
    { d: poly([S.ze, S.eta, S.gam, S.bet]), fill: brown },
    { d: poly([lerp(S.ze, centre, 0.45), lerp(S.eta, centre, 0.45), lerp(S.gam, centre, 0.7), lerp(S.bet, centre, 0.7)]), fill: '#c4642c', stroke: NONE },
    { d: ellipse(...at(0.2, 17), 4.6), fill: dark, w: 0.6 },
    { d: ellipse(...at(0.2, 17), 2.2), fill: tan, stroke: NONE },
    { d: ellipse(...at(0.8, 17), 4.6), fill: dark, w: 0.6 },
    { d: ellipse(...at(0.8, 17), 2.2), fill: tan, stroke: NONE },
    { d: ellipse(...at(0.5, 4.8), 7.5, 4.6, -40), fill: tan, w: 0.6 },
    ...eye(...at(0.34, 10.5), 2.4, [0.2, 0.5]),
    ...eye(...at(0.66, 10.5), 2.4, [0.2, 0.5]),
    { d: ellipse(...at(0.5, 6), 2.4, 1.8, -40), fill: '#1b1b1b', stroke: NONE },
  ];
  writeFileSync(`${OUT}/UMi.svg`, svg([-85, -150, 110, 240], 'Lilla björnen: the bowl is the bear, the handle its tail out to Polstjärnan', shapes, sw));
}

// ---- Kusken: the horse wears the coachman's party hat; a tiny singer sings a cappella by Capella.
{
  const sw = 1.3;
  const S = { menk: [7.9, -29.5], cap: [82.1, -45.9], haed: [107.9, -1.4], hass: [140.9, 75.8], eln: [83.9, 130.5], mah: [8.5, 47.9], del: [6.6, -123.4], alm: [111.6, -28.6], zet: [115.7, -1.1] };
  const grey = '#d6d6d6', dgrey = '#8e8e8e';
  const note = (x, y, s) => [
    { d: ellipse(x, y, 3 * s, 2.2 * s, -20), fill: '#ffd21f', w: 0.5 },
    { d: poly([[x + 2.6 * s, y - 0.5 * s], [x + 2.6 * s, y - 12 * s], [x + 7 * s, y - 9 * s]], false), w: 1.1 * s, stroke: '#ffd21f' },
  ];
  const shapes = [
    // the far ear, by Menkalinan
    { d: poly([[10, -26], [-18, -44], [-2, -12]]), fill: grey },
    { d: poly([[6, -24], [-10, -38], [0, -17]]), fill: '#b9a4a4', stroke: NONE },
    // the head: the hexagon
    { d: poly([S.menk, S.cap, S.haed, S.hass, S.eln, S.mah]), fill: grey },
    // the near ear: Capella, ε and ζ, back to Haedus
    { d: poly([S.cap, S.alm, S.zet, S.haed]), fill: grey },
    { d: poly([lerp(S.cap, S.alm, 0.3), S.alm, lerp(S.alm, S.zet, 0.6), lerp(S.cap, S.haed, 0.6)]), fill: '#b9a4a4', stroke: NONE },
    // hair, eye, nostril and mouth inside
    ...[[[34, -26], [54, -14], [72, -16]], [[44, -32], [64, -22], [80, -28]], [[26, -18], [40, -4], [56, -2]]].map((pts) => ({ d: poly(pts, false), w: 1.1, stroke: '#3a3a3a' })),
    ...eye(42, 16, 6.5, [0.6, 0.5]),
    { d: poly([[33, 8], [43, 5], [52, 9]], false), w: 1.2 },
    { d: poly([[112, 92], [126, 86], [130, 100], [120, 98]]), fill: dgrey, w: 0.9 },
    { d: poly([[90, 116], [102, 120], [114, 114]], false), w: 1.1 },
    { d: poly([[24, 64], [48, 84], [72, 88]], false), w: 0.9, stroke: '#9a9a9a' },
    // the party hat: Menkalinan, δ and Capella, in pink and yellow bands, pompom at δ
    { d: poly([S.menk, S.del, S.cap]), fill: '#ea9ff2' },
    ...[[0.1, 0.24], [0.38, 0.52], [0.66, 0.78]].map(([a, b]) => ({ d: band(S.menk, S.cap, S.del, a, b), fill: '#ffe46b', stroke: NONE })),
    { d: poly([S.menk, S.del, S.cap]), fill: NONE },
    { d: ellipse(S.del[0], S.del[1] - 4, 5.5), fill: '#ffe46b' },
    // the singer standing by Capella, notes above
    { d: poly([[87, -48], [97, -48], [92, -62]]), fill: '#2f6fe0', w: 0.8 },
    { d: poly([[89, -58], [83, -68]], false), w: 1.8, stroke: '#f5c09a' },
    { d: poly([[95, -58], [101, -68]], false), w: 1.8, stroke: '#f5c09a' },
    { d: ellipse(92, -66.5, 4.2), fill: '#f5c09a', w: 0.8 },
    { d: poly([[87.5, -68], [89, -72], [95, -72], [96.5, -68]], false), w: 2, stroke: '#ffd21f' },
    { d: ellipse(92, -65, 1.3, 1.7), fill: '#d9262c', stroke: NONE },
    ...note(104, -80, 0.9), ...note(115, -72, 0.75),
  ];
  writeFileSync(`${OUT}/Aur.svg`, svg([-40, -160, 210, 315], 'Kusken: the hexagon is the horse, Menkalinan–δ–Capella its party hat, Capella–ε–ζ an ear', shapes, sw));
}

// ---- Lejonet: the body Regulus–η–Algieba–Zosma–Chertan, the tail to Denebola, the head in the Sickle.
{
  const sw = 1.4;
  const S = { reg: [77.5, 9.2], eta: [78.4, -39.1], alg: [47.3, -69.1], zos: [-80.3, -77.1], den: [-168.2, -21.8], che: [-82.7, -25.8], adh: [54, -105.3], ras: [107.8, -134.4], algn: [125.4, -112.8] };
  const yellow = '#ffd21f', dyellow = '#eea600', mane = '#7a3410';
  const shapes = [
    // the rule book under the front paw (Regulus)
    { d: poly([[58, 10.5], [100, 10.5], [104, 24], [62, 24]]), fill: '#f5a623' },
    { d: poly([[100, 10.5], [106, 14], [109, 27], [104, 24]]), fill: '#ffffff' },
    // far legs, darker
    { d: poly([[-72, -30], [-56, -30], [-58, -2], [-52, 12], [-68, 13], [-71, 0]]), fill: dyellow },
    { d: poly([[40, -6], [56, -2], [58, 6], [64, 13], [46, 14], [42, 4]]), fill: dyellow },
    // the tail: Zosma, Denebola and Chertan, a tuft at Denebola
    { d: poly([S.zos, S.den, S.che]), fill: dyellow },
    { d: poly([[-150, -30], [-164, -34], [-178, -26], [-176, -14], [-160, -12]]), fill: mane },
    // the body
    { d: poly([S.reg, S.eta, S.alg, S.zos, S.che]), fill: yellow },
    // the near hind leg over the rump, Chertan in the haunch
    { d: poly([[-80.3, -77.1], [-62, -60], [-62, -30], [-70, 0], [-62, 12], [-84, 13], [-88, -2], [-82.7, -25.8]]), fill: yellow },
    { d: poly([[-72, -56], [-66, -40], [-70, -24]], false), w: 0.9, stroke: dyellow },
    { d: poly([[62, -24], [64, 0], [66, 8]], false), w: 0.9, stroke: dyellow },
    { d: poly([[72, 6], [72, 10]], false), w: 0.8 },
    { d: poly([[80, 2], [80, 8]], false), w: 0.8 },
    // the mane: η, Algieba, Adhafera and Rasalas, down the throat
    { d: poly([S.eta, S.alg, S.adh, S.ras, [104, -104], [98, -70]]), fill: mane },
    ...[[[56, -92], [66, -84], [64, -72]], [[72, -116], [82, -104], [80, -92]], [[84, -76], [90, -62], [86, -50]]].map((pts) => ({ d: poly(pts, false), w: 0.9, stroke: '#4d1f06' })),
    // ear and face: the brow Rasalas to the nose Algenubi
    { d: poly([[97, -128], [99, -146], [111, -136]]), fill: yellow },
    { d: poly([S.ras, S.algn, [128, -104], [114, -97], [104, -104]]), fill: yellow },
    { d: poly([[120.5, -116.5], [126.5, -113], [123, -108.5]]), fill: '#1b1b1b', w: 0.6 },
    { d: poly([[106, -124], [111, -121.5], [116, -124]], false), w: 1.1 },
    { d: poly([[114, -104], [121, -103], [127, -106]], false), w: 0.9 },
  ];
  const doc = svg([-195, -175, 345, 225], 'Lejonet: the body Regulus–η–Algieba–Zosma–Chertan, the tail out to Denebola, the head in the Sickle', shapes, sw)
    .replace('</svg>', '  <text x="83" y="20.6" font-family="Nunito, Arial, sans-serif" font-weight="900" font-size="8.5" text-anchor="middle" fill="#1b1b1b">REGLER</text>\n</svg>');
  writeFileSync(`${OUT}/Leo.svg`, doc);
}

// ---- Tvillingarna: heads at Castor and Pollux, bodies and limbs along the lines.
{
  const sw = 1.2;
  const S = { eta: [114.3, -3.8], mu: [95.5, -2.4], eps: [46, -26.1], tau: [-15, -76.7], cas: [-64.9, -95.1], pol: [-91, -57.8], ups: [-70.8, -45], del: [-36.8, 5.7], zet: [0.3, 20.3], gam: [63.9, 60.8], xi: [46.5, 96.7], lam: [-33.3, 60.3] };
  const green = '#4cc417', skin = '#f6c4a2', shoe = '#6b3a1a';
  const shapes = [
    // Castor's twin: legs τ–ε–μ, the shoe μ–η, the body from the neck to τ
    { d: strip([S.tau, S.eps, S.mu], 11), fill: green },
    { d: strip([S.mu, S.eta], 9), fill: shoe },
    { d: strip([lerp(S.cas, S.tau, 0.24), S.tau], [22, 19]), fill: green },
    { d: poly([lerp(S.cas, S.tau, 0.24), add(lerp(S.cas, S.tau, 0.24), [-2, 8]), add(lerp(S.cas, S.tau, 0.34), [0, 6])]), fill: '#ffffff', w: 0.8 },
    { d: strip([[-48, -94], [-44, -114], [-32, -126]], 7), fill: green },
    { d: ellipse(-30, -128.5, 4.2), fill: skin },
    { d: poly([[-34, -92], [-34, -81]], false), w: 2.2, stroke: '#ffd21f' },
    { d: poly([[-38.5, -88], [-29.5, -88]], false), w: 2.2, stroke: '#ffd21f' },
    { d: ellipse(...S.cas, 12.5, 13), fill: skin },
    ...eye(-69, -97, 2.4, [-0.3, 0.2]), ...eye(-60, -99, 2.4, [-0.3, 0.2]),
    { d: poly([[-69, -89], [-64, -87], [-59, -90]], false), w: 0.9 },
    // Pollux's twin: the body from the neck over υ to Wasat, legs to Alzirr and λ
    { d: strip([S.del, S.lam], 11), fill: green },
    { d: strip([lerp(S.del, S.lam, 0.82), S.lam], 11), fill: shoe },
    { d: strip([S.del, S.zet, S.gam, S.xi], 11), fill: green },
    { d: strip([lerp(S.gam, S.xi, 0.78), S.xi], 11), fill: shoe },
    { d: strip([lerp(S.pol, S.ups, 0.55), S.ups, S.del], 20), fill: green },
    { d: strip([[-82, -42], [-100, -26], [-108, -10]], 7), fill: green },
    { d: ellipse(-109, -7, 4.2), fill: skin },
    { d: poly([[-118, -2], [-110, 2], [-114, 12], [-123, 7]]), fill: '#ffffff' },
    ...[[[-63, -27], [-45, -27]], [[-63, -12], [-45, -12]], [[-58, -27], [-58, -12]], [[-50, -27], [-50, -12]]].map((pts) => ({ d: poly(pts, false), w: 1.8, stroke: '#ffd21f' })),
    { d: ellipse(...S.pol, 12.5, 13), fill: skin },
    { d: poly([[-98, -63], [-94, -61], [-90, -63]], false), w: 1 },
    { d: poly([[-88, -63], [-84, -61], [-80, -63]], false), w: 1 },
    { d: ellipse(-89, -54, 3.4, 3), fill: '#e8504a', w: 0.6 },
    { d: ellipse(-89, -48, 3, 2.2), fill: '#3a1a10', stroke: NONE },
    ...[[-108, -66], [-112, -56], [-106, -46], [-114, -42], [-118, -60]].map(([x, y]) => ({ d: ellipse(x, y, 1.3), fill: '#ffd21f', w: 0.4 })),
  ];
  writeFileSync(`${OUT}/Gem.svg`, svg([-135, -150, 270, 270], 'Tvillingarna: a pastor (Castor) and a twin allergic to pollen (Pollux), along the lines', shapes, sw));
}

// ---- Björnvaktaren: the kite is his head and shirt, Arcturus the lucky coin, λ–κ–θ the ice cream.
{
  const sw = 1.5;
  const S = { tau: [127.8, 130], eta: [109, 122], arc: [58.1, 117.3], rho: [17.6, 6.1], gam: [15.6, -73.3], bet: [-42.1, -95.3], del: [-74.2, -26.2], eps: [-11.1, 39.2], zet: [-2.9, 174], lam: [41.7, -153.1], kap: [42.4, -211.9], the: [23.6, -211.4] };
  const red = '#e3261b', skin = '#f6ab8f', nose = '#ef8a76', white = '#f7f7f7', brown = '#6b3a1a';
  const neckR = lerp(S.gam, S.rho, 0.84), neckL = lerp(S.del, S.eps, 0.6);
  const shapes = [
    // legs from the coin: down to ζ, and to η with the foot η–τ
    { d: strip([S.arc, S.zet], 12), fill: white },
    { d: strip([lerp(S.arc, S.zet, 0.84), S.zet], 12), fill: brown },
    { d: strip([S.arc, S.eta], 12), fill: white },
    { d: strip([S.eta, S.tau], 10), fill: brown },
    { d: poly([[42, 104], [58, 98], [74, 108], [66, 124], [50, 124]]), fill: '#ff7a1a' },
    // the arm Seginus–λ, the hand, the cone λ–κ–θ and its scoops
    { d: strip([S.gam, S.lam], 9), fill: red },
    { d: poly([S.lam, S.kap, S.the]), fill: '#f5cf8e' },
    ...[[0.35, 0.35], [0.65, 0.65]].map(([a]) => ({ d: poly([lerp(S.lam, S.the, a), lerp(S.kap, S.the, a)], false), w: 0.8, stroke: '#c9954a' })),
    ...[[0.35], [0.65]].map(([a]) => ({ d: poly([lerp(S.lam, S.kap, a), lerp(S.the, S.kap, a)], false), w: 0.8, stroke: '#c9954a' })),
    { d: ellipse(28, -220.5, 10.5, 9), fill: '#f6a6d8' },
    { d: ellipse(41, -222, 9, 8.5), fill: '#9fe6a8' },
    { d: ellipse(35, -233, 4), fill: '#e3261b' },
    { d: ellipse(41, -151, 6.5), fill: skin },
    // the shirt: the kite below the neck, with "I love bears"
    { d: poly([neckR, S.rho, S.arc, S.eps, neckL]), fill: red },
    { d: poly([[4, 44], [4, 56]], false), w: 2.2, stroke: '#ffd21f' },
    { d: 'M 16 56 C 8 50 8 43 12.5 43 C 14.5 43 16 45 16 46.5 C 16 45 17.5 43 19.5 43 C 24 43 24 50 16 56 Z', fill: '#ffffff', w: 0.6 },
    { d: ellipse(13, 64, 2.4), fill: '#c47a3a', w: 0.6 },
    { d: ellipse(23, 64, 2.4), fill: '#c47a3a', w: 0.6 },
    { d: ellipse(18, 70, 6, 5.5), fill: '#c47a3a', w: 0.7 },
    // the head: the kite above the neck, the red cap at Nekkar and Seginus
    { d: poly([S.bet, S.gam, neckR, neckL, S.del]), fill: skin },
    { d: poly([S.bet, S.gam, lerp(S.gam, S.rho, 0.22), lerp(S.bet, S.del, 0.34)]), fill: red },
    { d: poly([[-22, -94], [-19, -86], [-27, -91], [-17, -91], [-25, -86]]), fill: '#ffd21f', w: 0.7 },
    { d: poly([[-6, -50], [3, -46], [10, -50]], false), w: 1.4 },
    { d: smooth([[-52, -12], [-40, -4], [-26, -1], [-12, -4], [4, -7], [13, -12], [12, -3], [2, 3], [-12, 6], [-26, 8], [-40, 6], [-52, 0]]), fill: white },
    { d: ellipse(-26, -22, 21, 17, -10), fill: nose },
    { d: ellipse(-35, -29, 6, 4, -20), fill: '#ffd0c0', stroke: NONE },
    // Arcturus: the lucky coin
    { d: ellipse(...S.arc, 6.5), fill: '#ffd21f', w: 1 },
  ];
  writeFileSync(`${OUT}/Boo.svg`, svg([-110, -260, 260, 460], 'Björnvaktaren: the kite is his head and shirt, Arcturus the lucky coin, λ–κ–θ the ice cream', shapes, sw));
}
console.log('drawn');
