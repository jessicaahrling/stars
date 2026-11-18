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

export const SKY = {
  // Figure lines: a warm white over a wider, fainter glow.
  line: 'rgba(240, 230, 218, 0.58)',
  lineGlow: 'rgba(255, 222, 200, 0.06)',
  lineHover: 'rgba(255, 247, 234, 0.95)',
  lineHoverGlow: 'rgba(255, 214, 188, 0.16)',
  lineCard: 'rgb(255, 246, 230)',
  lineCardGlow: 'rgba(255, 206, 176, 0.22)',
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
  cardinal: 'rgba(206, 214, 242, 0.85)',
  north: '#f3d9a4',
};

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
