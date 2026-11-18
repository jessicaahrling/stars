// Colours of the sky drawing. Marked constellations take turns through MARK_COLORS
// so neighbours can be told apart.

export const MARK_COLORS = [
  { name: 'guld', hex: '#f5c46b', rgb: [245, 196, 107] },
  { name: 'havtorn', hex: '#ff9466', rgb: [255, 148, 102] },
  { name: 'lav', hex: '#8fe3b8', rgb: [143, 227, 184] },
  { name: 'is', hex: '#86c8ff', rgb: [134, 200, 255] },
  { name: 'ljung', hex: '#d1a6ff', rgb: [209, 166, 255] },
  { name: 'lingon', hex: '#ff8aa8', rgb: [255, 138, 168] },
];

export const SELECT_COLOR = { hex: '#eef3ff', rgb: [238, 243, 255] };

/**
 * The groups while discovering the sky ("Upptäck"), each tinted in one of these, and never
 * in the same one as a group it borders when that can be helped; its name is written in a
 * lighter shade of it. The same colours as the buttons of the playful design.
 */
export const GROUP_COLORS = [
  { name: 'gul', rgb: [255, 209, 102] },
  { name: 'havsgrön', rgb: [6, 214, 160] },
  { name: 'röd', rgb: [239, 118, 116] },
  { name: 'blå', rgb: [116, 185, 255] },
  { name: 'orange', rgb: [244, 162, 97] },
  { name: 'lila', rgb: [179, 157, 219] },
].map((c) => ({ ...c, label: `rgb(${c.rgb.map((x) => Math.round(x + (255 - x) * 0.45)).join(', ')})` }));

/** The colour figures are filled with, like a warm nebula. */
export const EMBER = { hex: '#dc705a', rgb: [220, 112, 90] };
/** The same for a figure that does not stand out: thin, it lets the navy through, so it is deeper and has less blue. */
export const EMBER_DEEP = { hex: '#d0541e', rgb: [208, 84, 30] };

/**
 * The looks of the sky to choose between ("Himlen" in the Design panel): as a star chart
 * at night, and plainer, as the sky was drawn before that ("Klassisk"). A look gives
 *  - colors: of boundaries, illustrations and names, and of what only one look has (null
 *    in the other): the grid, the rays of the brightest stars (glint), and the thin dark
 *    rim round a name without a halo (nameRim: needed where lines are as bright as names);
 *  - lines: how the lines of a figure are stroked, as [width of a fainter line under it
 *    (0 for none), that line's colour, the line's own width, its colour]: a plain figure,
 *    one that stands out (pointed at, or in a group in focus), a training card's, and the
 *    ones of the card's group already known;
 *  - gap: how far short of a star's disc a line stops, and groupLine: the width of the
 *    line round the groups, in CSS pixels;
 *  - stars: the disc's radius, a + b * (6.4 - magnitude) ^ c pixels (disc: [a, b, c]), and
 *    the stops the glow round a star fades through ([how far out, how opaque]);
 *  - fills: whether the closed parts of figures are filled;
 *  - sky and ground: the colours of the two WebGL passes (see gl-layer.js).
 * What is not a matter of look is the same in both: lines run on to stars off the screen,
 * and names keep clear of each other, of the lines and of the brightest stars.
 */
export const SKY_LOOKS = {
  chart: {
    id: 'chart',
    colors: {
      grid: 'rgba(190, 202, 255, 0.05)',
      glint: 'rgb(255, 251, 242)',
      bound: 'rgba(150, 166, 220, 0.3)',
      art: 'rgba(152, 172, 228, 0.46)',
      artFine: 'rgba(152, 172, 228, 0.26)',
      artHover: 'rgba(188, 204, 246, 0.74)',
      artHoverFine: 'rgba(188, 204, 246, 0.44)',
      boundHover: 'rgba(224, 230, 255, 0.5)',
      groupBound: 'rgba(214, 222, 252, 0.52)',
      groupFound: 'rgba(222, 230, 255, 0.46)',
      groupFocus: 'rgba(244, 246, 255, 0.95)',
      label: 'rgba(206, 212, 236, 0.72)',
      labelHover: 'rgba(240, 242, 252, 0.97)',
      starName: 'rgba(214, 220, 240, 0.74)',
      halo: 'rgba(8, 10, 28, 0.82)',
      nameRim: 'rgba(8, 10, 28, 0.6)',
      cardinal: 'rgba(206, 214, 242, 0.85)',
      north: '#f3d9a4',
    },
    // A warm white over a wider, fainter glow.
    lines: {
      plain: [5, 'rgba(255, 222, 200, 0.06)', 1.25, 'rgba(240, 230, 218, 0.58)'],
      lit: [7, 'rgba(255, 214, 188, 0.16)', 1.5, 'rgba(255, 247, 234, 0.95)'],
      card: [8, 'rgba(255, 206, 176, 0.22)', 2, 'rgb(255, 246, 230)'],
      context: [5, 'rgba(255, 222, 200, 0.06)', 1.3, 'rgba(255, 247, 234, 0.95)'],
    },
    gap: 0.5,
    groupLine: 1.25,
    // Bright stars keep a small core: their light is in the glow and the rays.
    stars: { disc: [0.45, 0.36, 1.12], glow: [[0, 0.85], [0.16, 0.34], [0.45, 0.09], [1, 0]] },
    fills: true,
    sky: {
      // A deep navy night: nearly black overhead, bluer toward the horizon.
      zenith: [0.022, 0.030, 0.078],
      horizon: [0.082, 0.102, 0.216],
      curve: 0.5,
      haze: [0.070, 0.048, 0.066],
      hazeFall: 14,
      clouds: 0.12,
      milkyWay: [0.58, 0.62, 0.84],
      vignette: 0.42,
    },
    ground: { near: [0.014, 0.020, 0.040], far: [0.006, 0.008, 0.018], trees: [0.005, 0.007, 0.016] },
  },
  classic: {
    id: 'classic',
    colors: {
      grid: null,
      glint: null,
      bound: 'rgba(112, 134, 186, 0.28)',
      art: 'rgba(228, 208, 168, 0.42)',
      artFine: 'rgba(228, 208, 168, 0.24)',
      artHover: 'rgba(240, 226, 196, 0.7)',
      artHoverFine: 'rgba(240, 226, 196, 0.42)',
      boundHover: 'rgba(214, 226, 255, 0.45)',
      groupBound: 'rgba(200, 214, 250, 0.5)',
      groupFound: 'rgba(214, 226, 255, 0.62)',
      groupFocus: 'rgba(240, 245, 255, 0.95)',
      label: 'rgba(168, 188, 232, 0.62)',
      labelHover: 'rgba(222, 232, 255, 0.95)',
      starName: 'rgba(206, 214, 236, 0.72)',
      halo: 'rgba(3, 6, 16, 0.85)',
      nameRim: null,
      cardinal: 'rgba(196, 210, 240, 0.85)',
      north: '#f5c46b',
    },
    // Plain blue lines.
    lines: {
      plain: [0, '', 1.1, 'rgba(132, 160, 214, 0.5)'],
      lit: [0, '', 1.5, 'rgba(176, 198, 240, 0.85)'],
      // The card's lines shone a little: a faint wider line of the same white under them.
      card: [7, 'rgba(238, 243, 255, 0.25)', 2, SELECT_COLOR.hex],
      context: [0, '', 1.3, 'rgba(176, 198, 240, 0.85)'],
    },
    gap: 3,
    groupLine: 1.5,
    stars: { disc: [0.5, 0.42, 1.22], glow: [[0, 0.9], [0.25, 0.28], [1, 0]] },
    fills: false,
    sky: {
      zenith: [0.010, 0.016, 0.042],
      horizon: [0.045, 0.068, 0.130],
      curve: 0.42,
      haze: [0.060, 0.050, 0.060],
      hazeFall: 16,
      clouds: 0,
      milkyWay: [0.55, 0.62, 0.80],
      vignette: 0,
    },
    ground: { near: [0.020, 0.034, 0.040], far: [0.008, 0.012, 0.016], trees: [0.006, 0.010, 0.014] },
  },
};

/** The look the sky has unless another is chosen. */
export const DEFAULT_SKY_LOOK = 'chart';

/** The look for a saved or asked-for id: itself if it is one of the looks, otherwise the default. */
export function skyLookOf(id) {
  return typeof id === 'string' && Object.keys(SKY_LOOKS).includes(id) ? id : DEFAULT_SKY_LOOK;
}

/** Approximate star colour for a B-V colour index, softened toward white. */
export function bvToRgb(bv) {
  const stops = [
    [-0.4, [150, 178, 255]],
    [0.0, [196, 212, 255]],
    [0.35, [240, 242, 255]],
    [0.6, [255, 244, 228]],
    [0.9, [255, 228, 192]],
    [1.3, [255, 204, 150]],
    [1.8, [255, 176, 112]],
  ];
  if (bv <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (bv <= stops[i][0]) {
      const [b0, c0] = stops[i - 1];
      const [b1, c1] = stops[i];
      const t = (bv - b0) / (b1 - b0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
    }
  }
  return stops[stops.length - 1][1];
}
