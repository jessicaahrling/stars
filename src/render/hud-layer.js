// Top 2D canvas: constellation and star names, and the compass points on the ground.
import { vecFromAzAlt } from '../astro/frames.js';
import { mat3Apply } from '../astro/math.js';
import { MARK_COLORS, SELECT_COLOR, SKY } from './palette.js';

export const FONT_FAMILY = '"Jost", "Futura", "Century Gothic", "Avenir Next", system-ui, sans-serif';

/** Polstjärnan is named at every zoom level; it is the one star everyone should find. */
const POLARIS_HIP = 11767;

const CARDINALS = [
  [0, 'N', true], [45, 'NO', false], [90, 'Ö', true], [135, 'SO', false],
  [180, 'S', true], [225, 'SV', false], [270, 'V', true], [315, 'NV', false],
];

export class HudLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {ReturnType<import('../sky/catalog.js').buildCatalog>} catalog
   */
  constructor(canvas, catalog) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.catalog = catalog;
    this.pt = { x: 0, y: 0, z: 0 };
    this.namedStars = Object.keys(catalog.starNames).map(Number).sort((a, b) => a - b);
  }

  resize(cssW, cssH, dpr) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /**
   * @param {import('../sky/view.js').SkyView} view
   * @param {object} st render state (see SkyLayer.render)
   * @param {import('./sky-layer.js').SkyLayer} sky  for this frame's star positions
   */
  render(view, st, sky) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (st.layers.starNames) this.drawStarNames(view, sky);
    this.drawConstellationNames(view, st);
    this.drawCardinals(view);
  }

  drawConstellationNames(view, st) {
    const { ctx, pt } = this;
    const small = view.fov > 110 ? 10 : 11;
    for (const c of this.catalog.constellations) {
      const state = st.reveal ? st.reveal.con[c.index] : 1;
      if (!state) continue;
      const mark = st.marks.get(c.index);
      const selected = c.index === st.selected;
      const special = mark !== undefined || selected;
      const hover = c.index === st.hover;
      if (state === 1 && !special && !hover && !st.layers.names) continue;
      for (const v of c.labelVecs) {
        if (!view.projectEq(v, pt) || pt.z < view.cosCorner - 0.1) continue;
        if (st.groundOpaque && view.altOf(v) < -2) continue;
        if (state === 2) {
          // A neighbour that can be added next is always named, with a plus.
          const color = hover ? SKY.candidateHover : SKY.candidateLabel;
          this.label(`+ ${c.sv.toUpperCase()}`, pt.x, pt.y, `${hover ? 600 : 500} ${small + 1}px ${FONT_FAMILY}`, color, small * 0.18, true);
          continue;
        }
        const text = c.sv.toUpperCase();
        let color = SKY.label;
        let size = small;
        let weight = 500;
        if (special) {
          color = mark !== undefined ? MARK_COLORS[mark % MARK_COLORS.length].hex : SELECT_COLOR.hex;
          size = selected ? 15 : 13;
          weight = 600;
        } else if (hover) {
          color = SKY.labelHover;
        }
        this.label(text, pt.x, pt.y, `${weight} ${size}px ${FONT_FAMILY}`, color, size * 0.18, special);
      }
    }
  }

  drawStarNames(view, sky) {
    const { ctx } = this;
    const limit = view.fov > 100 ? 1.6 : view.fov > 60 ? 2.4 : view.fov > 30 ? 3.4 : 4.5;
    ctx.textAlign = 'left';
    for (const i of this.namedStars) {
      if (this.catalog.stars.mag[i] > limit && this.catalog.stars.hip[i] !== POLARIS_HIP) continue;
      const x = sky.px[i];
      if (Number.isNaN(x)) continue;
      const r = sky.pr[i];
      this.label(this.catalog.starNames[i], x + r + 5, sky.py[i] + r * 0.6 + 6, `400 11px ${FONT_FAMILY}`, SKY.starName, 0.4, false);
    }
    ctx.textAlign = 'center';
  }

  drawCardinals(view) {
    const { pt } = this;
    const below = { x: 0, y: 0, z: 0 };
    for (const [az, text, main] of CARDINALS) {
      // Place the letter a fixed distance below the horizon, measured on screen.
      const v0 = mat3Apply(view.horToCam, vecFromAzAlt(az, 0));
      const v1 = mat3Apply(view.horToCam, vecFromAzAlt(az, -1));
      if (!view.projectCam(v0[0], v0[1], v0[2], pt) || pt.z < view.cosCorner - 0.1) continue;
      if (!view.projectCam(v1[0], v1[1], v1[2], below)) continue;
      const len = Math.hypot(below.x - pt.x, below.y - pt.y) || 1;
      const off = main ? 20 : 17;
      const x = pt.x + ((below.x - pt.x) / len) * off;
      const y = pt.y + ((below.y - pt.y) / len) * off;
      const size = main ? 15 : 11;
      const color = az === 0 ? SKY.north : SKY.cardinal;
      this.label(text, x, y, `${main ? 600 : 500} ${size}px ${FONT_FAMILY}`, color, size * 0.12, true);
    }
  }

  label(text, x, y, font, color, spacingPx, halo) {
    const { ctx } = this;
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacingPx.toFixed(1)}px`;
    if (halo) {
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = SKY.halo;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}
