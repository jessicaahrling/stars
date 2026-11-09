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
    /** Font of the names on the sky; a design can change it (--sky-font). */
    this.fontFamily = FONT_FAMILY;
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
    // While training, names would give the answer away until the last step.
    const quiz = st.quiz;
    if (st.layers.starNames && (!quiz || quiz.step === 3)) this.drawStarNames(view, sky, quiz && quiz.stars);
    if (quiz) {
      this.drawContextNames(view, st);
      if (quiz.step === 3) this.drawQuizName(view, st);
    } else {
      this.drawConstellationNames(view, st);
    }
    this.drawCardinals(view);
  }

  drawConstellationNames(view, st) {
    const { pt } = this;
    const small = view.fov > 110 ? 10 : 11;
    // Names never run into each other or into the boxes in st.avoid. The more important
    // ones go first: marked and selected ones, the hovered one, those of the groups pointed
    // at and chosen while discovering, the names of those groups, then the names of the
    // other groups and the rest; with every name on, the rest go before the other groups.
    const taken = st.avoid ? [...st.avoid] : [];
    const focus = st.focusMembers;
    const rank = (c) => (st.marks.has(c.index) || c.index === st.selected ? 1
      : c.index === st.hover ? 2
        : focus && focus.has(c.index) ? 3 : 4);
    const order = this.catalog.constellations.filter((c) => !st.reveal || st.reveal.con[c.index] === 1).sort((a, b) => rank(a) - rank(b));
    const allNames = st.groups && !st.namesOnly;
    let grouped = !st.groups;
    for (const c of order) {
      if (!grouped && rank(c) > 3) {
        this.drawGroupNames(view, st, taken, small, allNames ? 'focus' : 'all');
        grouped = true;
      }
      const mark = st.marks.get(c.index);
      const selected = c.index === st.selected;
      const special = mark !== undefined || selected;
      const hover = c.index === st.hover;
      const focused = Boolean(focus && focus.has(c.index));
      if (!special && !hover && !st.layers.names) continue;
      if (!special && !hover && st.namesOnly && !st.namesOnly.has(c.index)) continue;
      const text = c.sv.toUpperCase();
      let color = SKY.label;
      let size = small;
      let weight = 500;
      if (special) {
        color = mark !== undefined ? MARK_COLORS[mark % MARK_COLORS.length].hex : SELECT_COLOR.hex;
        size = selected ? 15 : 13;
        weight = 600;
      } else if (hover || focused) {
        // Hovered, or in a group pointed at or chosen.
        color = SKY.labelHover;
      }
      const font = `${weight} ${size}px ${this.fontFamily}`;
      for (const v of c.labelVecs) {
        if (!this.onSky(view, st, v)) continue;
        if (this.covered(text, font, size * 0.18, size, taken)) continue;
        this.label(text, pt.x, pt.y, font, color, size * 0.18, special);
      }
    }
    if (!grouped) this.drawGroupNames(view, st, taken, small, allNames ? 'focus' : 'all');
    if (allNames) this.drawGroupNames(view, st, taken, small, 'rest');
  }

  /** Whether a point on the sky is drawn on the screen now, putting it in this.pt. */
  onSky(view, st, v) {
    if (!view.projectEq(v, this.pt) || this.pt.z < view.cosCorner - 0.1) return false;
    return !(st.groundOpaque && view.altOf(v) < -2);
  }

  /**
   * The name of each group shown while discovering, once, in its own colour, in the best
   * place free: at one of its spots, or a line above or below it when a constellation's
   * name is there. `which`: the groups pointed at and chosen ('focus', brighter), the
   * others ('rest'), or both, in that order ('all').
   */
  drawGroupNames(view, st, taken, small, which) {
    const { pt } = this;
    const size = small + 2;
    const inFocus = new Set((st.focus || []).map((o) => o.group));
    const groups = [
      ...(which === 'rest' ? [] : st.focus || []),
      ...(which === 'focus' ? [] : st.groups.filter((o) => !inFocus.has(o.group))),
    ];
    for (const o of groups) {
      const focused = inFocus.has(o.group);
      const font = `${focused ? 700 : 600} ${size}px ${this.fontFamily}`;
      placing: for (const v of o.spots) {
        for (const dy of [0, -(size + 5), size + 5]) {
          if (!this.onScreen(view, st, v, o.name, font, 0.3, size, dy) || this.covered(o.name, font, 0.3, size, taken)) continue;
          this.label(o.name, pt.x, pt.y, font, focused ? SKY.labelHover : o.color, 0.3, true);
          break placing;
        }
      }
    }
  }

  /**
   * Like onSky, but only for a point on the screen itself, with this.pt moved down by dy
   * and in from the side as far as it takes for the whole name to show, and not where the
   * name would be under the top or bottom of the screen or one of the buttons there
   * (st.chrome).
   */
  onScreen(view, st, v, text, font, spacingPx, size, dy = 0) {
    const { ctx, pt } = this;
    if (!this.onSky(view, st, v) || pt.x < 0 || pt.x > view.width || pt.y < 0 || pt.y > view.height) return false;
    pt.y += dy;
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacingPx.toFixed(1)}px`;
    const w = ctx.measureText(text).width / 2 + 6;
    const h = size / 2 + 2;
    pt.x = w * 2 > view.width ? view.width / 2 : Math.min(Math.max(pt.x, w), view.width - w);
    if (pt.y < h || pt.y > view.height - h) return false;
    return !(st.chrome || []).some((r) => pt.x + w > r.left && pt.x - w < r.right && pt.y + h > r.top && pt.y - h < r.bottom);
  }

  /**
   * Whether a name centred on this.pt would run into one of the screen boxes in `taken`;
   * if not, its own box is added there.
   */
  covered(text, font, spacingPx, size, taken) {
    const { ctx, pt } = this;
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacingPx.toFixed(1)}px`;
    const w = ctx.measureText(text).width / 2;
    const h = size / 2;
    const pad = 4;
    if (taken.some((r) => pt.x + w + pad > r.left && pt.x - w - pad < r.right && pt.y + h + pad > r.top && pt.y - h - pad < r.bottom)) return true;
    taken.push({ left: pt.x - w, right: pt.x + w, top: pt.y - h, bottom: pt.y + h });
    return false;
  }

  /** While a group is learnt, the names of the ones of it already known, around the card. */
  drawContextNames(view, st) {
    const { pt } = this;
    const font = `500 12px ${this.fontFamily}`;
    for (const i of st.quiz.context) {
      const c = this.catalog.constellations[i];
      for (const v of c.labelVecs) {
        if (!view.projectEq(v, pt) || pt.z < view.cosCorner - 0.1) continue;
        if (st.groundOpaque && view.altOf(v) < -2) continue;
        this.label(c.sv.toUpperCase(), pt.x, pt.y, font, SKY.labelHover, 12 * 0.18, true);
      }
    }
  }

  /**
   * The training card's name once it is revealed, or the names of a group shown together,
   * or of a whole step (quiz.crowd: smaller, and a name that finds no room is left out).
   */
  drawQuizName(view, st) {
    const { ctx, pt } = this;
    const crowd = Boolean(st.quiz.crowd);
    const size = crowd ? 13 : 16;
    const font = `600 ${size}px ${this.fontFamily}`;
    const spacing = size * 0.18;
    // A group's names keep clear of each other and inside the screen: one that would run
    // into another moves a line up or down, and none is left out.
    const taken = st.avoid ? [...st.avoid] : [];
    for (const i of st.quiz.targets) {
      const c = this.catalog.constellations[i];
      const text = c.sv.toUpperCase();
      for (const v of c.labelVecs) {
        if (!view.projectEq(v, pt) || pt.z < view.cosCorner - 0.1) continue;
        ctx.font = font;
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing.toFixed(1)}px`;
        const half = ctx.measureText(text).width / 2 + 4;
        // In a crowd a name off the screen's edge is left out rather than pulled in over
        // another figure, and one moves no further than a line.
        if (crowd && (pt.x < half || pt.x > view.width - half)) continue;
        pt.x = Math.min(Math.max(pt.x, half), view.width - half);
        const y0 = pt.y;
        const clear = (crowd ? [0, 18, -18] : [0, 22, -22, 44, -44]).some((dy) => {
          pt.y = y0 + dy;
          return !this.covered(text, font, spacing, size, taken);
        });
        if (!clear && crowd) continue;
        if (!clear) pt.y = y0;
        this.label(text, pt.x, pt.y, font, SELECT_COLOR.hex, spacing, true);
      }
    }
  }

  /** Names of the bright stars; `only` limits them to some stars (a Uint8Array, 1 to name). */
  drawStarNames(view, sky, only = null) {
    const { ctx } = this;
    const limit = view.fov > 100 ? 1.6 : view.fov > 60 ? 2.4 : view.fov > 30 ? 3.4 : 4.5;
    ctx.textAlign = 'left';
    for (const i of this.namedStars) {
      if (only && !only[i]) continue;
      if (this.catalog.stars.mag[i] > limit && this.catalog.stars.hip[i] !== POLARIS_HIP) continue;
      const x = sky.px[i];
      if (Number.isNaN(x)) continue;
      const r = sky.pr[i];
      this.label(this.catalog.starNames[i], x + r + 5, sky.py[i] + r * 0.6 + 6, `400 11px ${this.fontFamily}`, SKY.starName, 0.4, false);
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
      this.label(text, x, y, `${main ? 600 : 500} ${size}px ${this.fontFamily}`, color, size * 0.12, true);
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
