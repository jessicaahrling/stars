// Coloured test drawings in the style of the "En rymdresa" chapter: cartoon figures built
// straight on the stick-figure lines, flat colours with dark outlines. Writes
// art/farg-test/<ID>.svg; see art/farg-test/README.md.
//
//   node scripts/farg-test.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { smooth, poly, tube, ellipse, svg, lerp } from './lib/farg-kit.mjs';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../art/farg-test');
const NONE = 'none';
const eye = (x, y, r, look = [0, 0]) => [
  { d: ellipse(x, y, r, r * 1.15), fill: '#ffffff', w: r * 0.18 },
  { d: ellipse(x + look[0] * r * 0.35, y + look[1] * r * 0.35, r * 0.5, r * 0.6), fill: '#1b1b1b', w: 0.01, stroke: NONE },
  { d: ellipse(x + look[0] * r * 0.35 - r * 0.15, y + look[1] * r * 0.35 - r * 0.2, r * 0.15), fill: '#ffffff', stroke: NONE },
];
const rays = (x, y, r0, r1, n, color, w) => Array.from({ length: n }, (_, k) => {
  const a = (k / n) * Math.PI * 2 + 0.2;
  const r = k % 2 ? r1 : r1 * 0.7;
  return { d: poly([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r, y + Math.sin(a) * r]], false), stroke: color, w };
});

// ---- Lilla björnen: a little bear hanging upside down from its long tail, Polstjärnan at the tip.
{
  const sw = 0.9;
  const S = { ze: [-33.4, -2.5], eta: [-58.3, 10.2], gam: [-31.7, 59], bet: [-7.3, 38.3], eps: [-41.6, -51.9], del: [-23.5, -95.2], pol: [-0.3, -127.9] };
  const brown = '#a2481a', dark = '#7a3410', tan = '#e9b27c';
  const shapes = [
    // Polstjärnan glows
    { d: ellipse(...S.pol, 9), fill: '#fff6c8', stroke: NONE },
    ...rays(...S.pol, 5, 15, 16, '#ffffff', 0.6),
    // tail from the rump through ε and δ
    { d: tube([[-31, -4], S.eps, S.del, [-6, -121], S.pol], 6, 2.6), fill: brown },
    { d: ellipse(-1.5, -126.5, 4.2, 4.2), fill: dark },
    // hind feet up in the air
    { d: ellipse(-45, -8, 5, 7, -25), fill: dark },
    { d: ellipse(-21, -9, 5, 7, 25), fill: dark },
    // body: the bowl
    { d: smooth([[-30, -8], [-47, -4], [-63, 9], [-58, 30], [-45, 47], [-17, 49], [-3, 38], [-9, 18], [-18, 1]]), fill: brown },
    { d: smooth([[-34, 12], [-46, 22], [-40, 38], [-24, 38], [-20, 24]]), fill: '#c4642c', stroke: NONE },
    // arms out to η and Kochab, paws on the stars
    { d: ellipse(-60, 11, 5.5, 4.5, -20), fill: dark },
    { d: ellipse(-6, 39, 5.5, 4.5, 20), fill: dark },
    // head below, face up
    { d: ellipse(-43, 52, 5.2), fill: brown },
    { d: ellipse(-43, 52, 2.6), fill: tan, stroke: NONE },
    { d: ellipse(-16, 52, 5.2), fill: brown },
    { d: ellipse(-16, 52, 2.6), fill: tan, stroke: NONE },
    { d: ellipse(-29.5, 61, 14.5, 13), fill: brown },
    { d: ellipse(-29.5, 66, 7.5, 5.5), fill: tan, w: 0.6 },
    { d: ellipse(-29.5, 63, 2.6, 2), fill: '#1b1b1b', stroke: NONE },
    { d: smooth([[-32.5, 68.5], [-29.5, 70], [-26.5, 68.5]], false), w: 0.6 },
    ...eye(-35, 57.5, 2.6, [0.2, 0.4]),
    ...eye(-24, 57.5, 2.6, [-0.2, 0.4]),
  ];
  writeFileSync(`${OUT}/UMi.svg`, svg([-85, -150, 110, 240], 'Lilla björnen: a little bear hanging by its tail from Polstjärnan', shapes, sw));
}

// ---- Kusken: the horse wearing the coachman's party hat; a tiny singer sings a cappella by Capella.
{
  const sw = 1.3;
  const S = { menk: [7.9, -29.5], cap: [82.1, -45.9], haed: [107.9, -1.4], hass: [140.9, 75.8], eln: [83.9, 130.5], mah: [8.5, 47.9], del: [6.6, -123.4], alm: [111.6, -28.6], zet: [115.7, -1.1] };
  const grey = '#d6d6d6', dgrey = '#a8a8a8';
  const hat = [[1, -25], [5.5, -131], [88, -42]];
  const band = (t0, t1) => poly([lerp(hat[0], hat[1], t0), lerp(hat[2], hat[1], t0), lerp(hat[2], hat[1], t1), lerp(hat[0], hat[1], t1)]);
  const note = (x, y, s) => [
    { d: ellipse(x, y, 3 * s, 2.2 * s, -20), fill: '#ffd21f', w: 0.5 },
    { d: poly([[x + 2.6 * s, y - 0.5 * s], [x + 2.6 * s, y - 12 * s], [x + 7 * s, y - 9 * s]], false), w: 1.1 * s, stroke: '#ffd21f' },
  ];
  const shapes = [
    // mane down the back of the head
    { d: smooth([[6, -34], [-8, -24], [-2, -12], [-16, 2], [-6, 14], [-17, 28], [-4, 40], [-10, 54], [8, 56], [14, 20]]), fill: dgrey },
    // ear behind the hat
    { d: smooth([[12, -30], [-10, -64], [26, -40]]), fill: grey },
    // the head: the hexagon, muzzle down at Hassaleh and Elnath
    { d: smooth([[4, -31], [45, -50], [86, -48], [106, -6], [127, 38], [148, 77], [143, 110], [117, 133], [84, 135], [52, 112], [20, 74], [3, 49], [-1, 10]]), fill: grey },
    { d: smooth([[112, 62], [146, 86], [140, 112], [116, 129], [96, 118], [100, 86]]), fill: '#bdbdbd', stroke: NONE },
    { d: ellipse(133, 88, 4.5, 7, -30), fill: '#3a3a3a', stroke: NONE },
    { d: smooth([[98, 118], [110, 126], [124, 122]], false), w: 1 },
    { d: smooth([[26, 56], [48, 84], [80, 92]], false), w: 0.9, stroke: '#8a8a8a' },
    { d: smooth([[32, 20], [58, 30], [86, 22]], false), w: 0.8, stroke: '#9a9a9a' },
    ...eye(72, 8, 6.5, [0.6, 0.3]),
    { d: smooth([[62, 0], [72, -5], [84, -2]], false), w: 1.1 },
    // party hat with pink and yellow bands, pompom at δ
    { d: poly(hat), fill: '#ea9ff2' },
    { d: band(0.12, 0.26), fill: '#ffe46b', w: 0.01, stroke: NONE },
    { d: band(0.4, 0.54), fill: '#ffe46b', w: 0.01, stroke: NONE },
    { d: band(0.68, 0.8), fill: '#ffe46b', w: 0.01, stroke: NONE },
    { d: poly(hat), fill: NONE },
    { d: ellipse(5.8, -133, 6), fill: '#ffe46b' },
    // the singer on the hook ε–ζ, notes above
    { d: smooth([[111, -24], [104, -2], [124, -2], [116, -24]]), fill: '#2f6fe0' },
    { d: poly([[109, -18], [100, -30]], false), w: 2.2, stroke: '#f5c09a' },
    { d: poly([[116, -18], [125, -30]], false), w: 2.2, stroke: '#f5c09a' },
    { d: ellipse(112, -30, 5.5), fill: '#f5c09a' },
    { d: smooth([[106, -32], [110, -38], [117, -36], [118, -30]], false), w: 2.5, stroke: '#ffd21f' },
    { d: ellipse(112.5, -28, 1.6, 2.2), fill: '#d9262c', stroke: NONE },
    ...note(128, -46, 1), ...note(140, -36, 0.8),
  ];
  writeFileSync(`${OUT}/Aur.svg`, svg([-40, -160, 210, 315], 'Kusken: the coachman lets his horse wear his party hat; a tiny singer sings a cappella', shapes, sw));
}

// ---- Lejonet: a proud lion walking west, head in the sickle, Regulus the paw on the rule book.
{
  const sw = 1.4;
  const yellow = '#ffd21f', dyellow = '#f0a800', mane = '#7a3410';
  const shapes = [
    // the rule book under the front paw
    { d: poly([[60, 18], [104, 18], [108, 31], [64, 31]]), fill: '#f5a623' },
    { d: poly([[104, 18], [110, 22], [112, 34], [108, 31]]), fill: '#ffffff' },
    // far legs, darker, behind the body
    { d: tube([[-66, -40], [-62, -6], [-58, 18]], 20, 10), fill: dyellow },
    { d: ellipse(-56, 20, 8, 4.5), fill: dyellow },
    { d: tube([[40, -30], [46, -4], [48, 18]], 18, 10), fill: dyellow },
    { d: ellipse(50, 20, 8, 4.5), fill: dyellow },
    // tail to Denebola, tuft at the tip
    { d: tube([[-98, -66], [-122, -54], [-142, -48], [-160, -30]], 5, 3), fill: yellow },
    { d: smooth([[-157, -32], [-168, -36], [-178, -24], [-172, -12], [-160, -18]]), fill: mane },
    // body: the back over Zosma, the rump and a slim belly; Chertan on the haunch
    { d: smooth([[44, -72], [0, -80], [-50, -86], [-84, -86], [-102, -70], [-106, -44], [-96, -24], [-70, -20], [-30, -24], [10, -22], [44, -22], [74, -24], [94, -40], [96, -58]]), fill: yellow },
    // near hind leg: the thigh round Chertan, the hock, the paw
    { d: smooth([[-104, -56], [-98, -30], [-96, -6], [-92, 12], [-86, 20], [-70, 21], [-74, 12], [-78, 0], [-74, -18], [-62, -34], [-70, -52], [-88, -60]]), fill: yellow },
    { d: smooth([[-84, -50], [-74, -36], [-78, -20]], false), w: 0.9, stroke: dyellow },
    // near front leg down to the paw on the book (Regulus)
    { d: smooth([[60, -30], [62, -8], [66, 8], [68, 16], [92, 16], [92, 6], [88, -12], [92, -32], [80, -40]]), fill: yellow },
    { d: smooth([[70, 16], [72, 8], [80, 7], [88, 8], [92, 16]]), fill: yellow, w: 1.1 },
    { d: poly([[78, 12], [78, 16]], false), w: 0.8 },
    { d: poly([[85, 12], [85, 16]], false), w: 0.8 },
    // mane round the neck: Algieba and Adhafera in it
    { d: smooth([[40, -64], [30, -88], [40, -116], [62, -138], [86, -150], [104, -146], [100, -126], [104, -104], [100, -82], [98, -56], [88, -38], [70, -40], [52, -52]]), fill: mane },
    { d: smooth([[48, -100], [60, -96], [56, -84]], false), w: 0.9, stroke: '#4d1f06' },
    { d: smooth([[66, -128], [74, -118], [70, -106]], false), w: 0.9, stroke: '#4d1f06' },
    // ear and face in profile: Rasalas the brow, Algenubi the nose
    { d: smooth([[94, -140], [92, -154], [104, -150]]), fill: yellow },
    { d: smooth([[94, -132], [108, -140], [122, -128], [131, -115], [128, -104], [114, -98], [100, -102], [92, -118]]), fill: yellow },
    { d: smooth([[124, -118], [132, -116], [130, -110], [124, -112]]), fill: '#1b1b1b' },
    { d: smooth([[105, -124], [111, -121], [117, -124]], false), w: 1.1 },
    { d: smooth([[114, -104], [121, -102], [127, -105]], false), w: 0.9 },
  ];
  const doc = svg([-195, -175, 345, 225], 'Lejonet: a proud lion with its paw on the rule book (Regulus)', shapes, sw)
    .replace('</svg>', '  <text x="84" y="28.6" font-family="Nunito, Arial, sans-serif" font-weight="900" font-size="8.5" text-anchor="middle" fill="#1b1b1b">REGLER</text>\n</svg>');
  writeFileSync(`${OUT}/Leo.svg`, doc);
}

// ---- Tvillingarna: two twins in green suits, heads at Castor and Pollux; one a pastor, one sneezing at pollen.
{
  const sw = 1.2;
  const S = { eta: [114.3, -3.8], mu: [95.5, -2.4], eps: [46, -26.1], tau: [-15, -76.7], cas: [-64.9, -95.1], pol: [-91, -57.8], ups: [-70.8, -45], del: [-36.8, 5.7], zet: [0.3, 20.3], gam: [63.9, 60.8], xi: [46.5, 96.7], lam: [-33.3, 60.3] };
  const green = '#4cc417', dgreen = '#2f9410', skin = '#f6c4a2', shoe = '#6b3a1a';
  const shapes = [
    // Castor's twin: far leg, then torso τ, near leg ε–μ, shoe to η
    { d: tube([S.tau, [42, -18], [92, 4]], 11, 9), fill: dgreen },
    { d: smooth([[88, 0], [100, -6], [116, -8], [118, 0], [96, 8]]), fill: shoe },
    { d: tube([[-52, -92], [-34, -86], S.tau], 22, 18), fill: green },
    { d: tube([S.tau, S.eps, S.mu], 11, 9), fill: green },
    { d: smooth([[92, -6], [104, -12], [118, -8], [116, 0], [96, 2]]), fill: shoe },
    { d: tube([[-46, -96], [-40, -116], [-28, -130]], 7, 6), fill: green },
    { d: ellipse(-26, -133, 4.5), fill: skin },
    { d: poly([[-36, -90], [-36, -80]], false), w: 2.2, stroke: '#ffd21f' },
    { d: poly([[-40, -86], [-32, -86]], false), w: 2.2, stroke: '#ffd21f' },
    // Pollux's twin: legs from Wasat, one through Mekbuda and Alhena to Alzirr, one down to λ
    { d: tube([S.del, [-34, 34], S.lam], 11, 9), fill: dgreen },
    { d: smooth([[-44, 58], [-30, 54], [-20, 62], [-30, 68], [-44, 66]]), fill: shoe },
    { d: tube([[-78, -50], S.ups, S.del], 20, 18), fill: green },
    { d: tube([S.del, S.zet, S.gam, S.xi], 11, 9), fill: green },
    { d: smooth([[38, 92], [50, 88], [60, 96], [50, 104], [36, 102]]), fill: shoe },
    { d: tube([[-80, -42], [-100, -26], [-110, -8]], 7, 6), fill: green },
    { d: ellipse(-111, -5, 4.5), fill: skin },
    { d: smooth([[-120, 0], [-112, 4], [-116, 14], [-124, 8]]), fill: '#ffffff' },
    // heads: Castor with the pastor's white collar, Pollux sneezing
    { d: ellipse(-60, -86, 8, 3.2, 20), fill: '#ffffff' },
    { d: ellipse(-64.9, -96.5, 12.5, 13), fill: skin },
    ...eye(-69, -99, 2.4, [-0.3, 0]), ...eye(-60, -101, 2.4, [-0.3, 0]),
    { d: smooth([[-69, -90], [-64, -87], [-59, -90]], false), w: 0.9 },
    { d: ellipse(-91, -58.5, 12.5, 13), fill: skin },
    { d: smooth([[-98, -63], [-94, -61], [-90, -63]], false), w: 1 },
    { d: smooth([[-88, -63], [-84, -61], [-80, -63]], false), w: 1 },
    { d: ellipse(-90, -54, 3.4, 3), fill: '#e8504a', w: 0.6 },
    { d: ellipse(-90, -48, 3, 2.2), fill: '#3a1a10', stroke: NONE },
    ...[[-108, -66], [-112, -56], [-106, -46], [-114, -42], [-118, -60]].map(([x, y]) => ({ d: ellipse(x, y, 1.3), fill: '#ffd21f', w: 0.4 })),
  ];
  writeFileSync(`${OUT}/Gem.svg`, svg([-135, -150, 270, 270], 'Tvillingarna: a pastor (Castor) and a twin allergic to pollen (Pollux)', shapes, sw));
}

// ---- Björnvaktaren: the bear keeper with a big nose and moustache, an ice cream held up high, Arcturus a lucky coin.
{
  const sw = 1.5;
  const S = { tau: [127.8, 130], eta: [109, 122], arc: [58.1, 117.3], rho: [17.6, 6.1], gam: [15.6, -73.3], bet: [-42.1, -95.3], del: [-74.2, -26.2], eps: [-11.1, 39.2], zet: [-2.9, 174], lam: [41.7, -153.1], kap: [42.4, -211.9], the: [23.6, -211.4] };
  const red = '#e3261b', skin = '#f6ab8f', nose = '#ef8a76', white = '#f7f7f7', orange = '#ff7a1a';
  const shapes = [
    // legs from the lucky coin: to ζ, and over η to τ
    { d: tube([S.arc, [28, 146], [2, 170]], 13, 10), fill: white },
    { d: smooth([[-12, 166], [4, 164], [8, 176], [-6, 182], [-14, 176]]), fill: '#6b3a1a' },
    { d: tube([S.arc, [86, 124], [112, 122]], 13, 10), fill: white },
    { d: smooth([[106, 116], [122, 120], [132, 128], [126, 134], [108, 128]]), fill: '#6b3a1a' },
    { d: smooth([[44, 110], [58, 104], [72, 112], [66, 124], [50, 124]]), fill: orange },
    // the shirt: the kite's lower point
    { d: smooth([[-22, 30], [-2, 18], [24, 0], [42, 40], [62, 104], [56, 118], [44, 112], [16, 74]]), fill: red },
    // "I love bears" on the shirt: an I, a heart and a little bear face
    { d: poly([[6, 44], [6, 56]], false), w: 2.2, stroke: '#ffd21f' },
    { d: 'M 18 56 C 10 50 10 43 14.5 43 C 16.5 43 18 45 18 46.5 C 18 45 19.5 43 21.5 43 C 26 43 26 50 18 56 Z', fill: '#ffffff', w: 0.6 },
    { d: ellipse(15, 64, 2.4), fill: '#c47a3a', w: 0.6 },
    { d: ellipse(25, 64, 2.4), fill: '#c47a3a', w: 0.6 },
    { d: ellipse(20, 70, 6, 5.5), fill: '#c47a3a', w: 0.7 },
    { d: ellipse(20, 72, 2.6, 2), fill: '#f0c08a', stroke: 'none' },
    // the arm up from Seginus to the ice cream at λ
    { d: tube([[8, -60], [24, -100], S.lam], 11, 9), fill: red },
    { d: ellipse(41, -152, 7), fill: skin },
    // cone λ–κ–θ, scoops on top
    { d: poly([[41, -148], [46.5, -213], [19.5, -212.5]]), fill: '#f5cf8e' },
    { d: poly([[26, -196], [44, -178]], false), w: 0.8, stroke: '#c9954a' },
    { d: poly([[24, -206], [46, -188]], false), w: 0.8, stroke: '#c9954a' },
    { d: poly([[40, -200], [30, -176]], false), w: 0.8, stroke: '#c9954a' },
    { d: ellipse(28, -220, 11, 9.5), fill: '#f6a6d8' },
    { d: ellipse(42, -222, 9.5, 8.5), fill: '#9fe6a8' },
    { d: ellipse(36, -233, 4), fill: '#e3261b' },
    // the big head: the kite's upper part, with the red cap
    { d: smooth([[-46, -88], [14, -74], [26, -40], [20, 6], [-8, 36], [-40, 22], [-78, -22], [-70, -62]]), fill: skin },
    { d: smooth([[-78, -50], [-66, -92], [-44, -110], [-8, -104], [20, -80], [10, -66], [-30, -76], [-62, -60]]), fill: red },
    { d: smooth([[-24, -98], [-19, -88], [-29, -91], [-19, -91], [-29, -88]]), fill: '#ffd21f', w: 0.7 },
    { d: smooth([[-6, -54], [4, -50], [10, -54]], false), w: 1.4 },
    { d: smooth([[-72, 4], [-56, -6], [-36, 4], [-18, -2], [0, 8], [16, 0], [22, 12], [4, 18], [-18, 14], [-36, 16], [-58, 16], [-80, 12], [-84, -4]]), fill: white },
    { d: ellipse(-26, -22, 22, 18, -10), fill: nose },
    { d: ellipse(-36, -30, 6, 4, -20), fill: '#ffd0c0', stroke: NONE },
    // Arcturus: the lucky coin
    { d: ellipse(...S.arc, 6.5), fill: '#ffd21f', w: 1 },
  ];
  writeFileSync(`${OUT}/Boo.svg`, svg([-110, -260, 260, 460], 'Björnvaktaren: the bear keeper holds up an ice cream; Arcturus is the lucky coin', shapes, sw));
}
console.log('drawn');
