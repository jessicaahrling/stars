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

export const SKY = {
  line: 'rgba(132, 160, 214, 0.5)',
  lineHover: 'rgba(176, 198, 240, 0.85)',
  bound: 'rgba(112, 134, 186, 0.28)',
  boundHover: 'rgba(214, 226, 255, 0.45)',
  label: 'rgba(168, 188, 232, 0.62)',
  labelHover: 'rgba(222, 232, 255, 0.95)',
  starName: 'rgba(206, 214, 236, 0.72)',
  halo: 'rgba(3, 6, 16, 0.85)',
  cardinal: 'rgba(196, 210, 240, 0.85)',
  north: '#f5c46b',
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
