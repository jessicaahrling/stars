// Top 2D canvas: constellation and star names, and the compass points on the ground.
import { vecFromAzAlt } from '../astro/frames.js';
import { mat3Apply } from '../astro/math.js';
import { MARK_COLORS, SELECT_COLOR, SKY } from './palette.js';

export const FONT_FAMILY = '"Jost", "Futura", "Century Gothic", "Avenir Next", system-ui, sans-serif';

/** Polstjärnan is named at every zoom level; it is the one star everyone should find. */
const POLARIS_HIP = 11767;

/**
 * Where a star's name goes beside it, in the order tried: right and below the star, right
 * and above, left and below, left and above ([side, up or down]).
 */
const STAR_NAME_SIDES = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const CARDINALS = [
  [0, 'N', true], [45, 'NO', false], [90, 'Ö', true], [135, 'SO', false],
  [180, 'S', true], [225, 'SV', false], [270, 'V', true], [315, 'NV', false],
];

/** Whether one of the lines [x1, y1, x2, y2, ...] runs through a box. */
function crossesBox(lines, left, top, right, bottom) {
  for (let k = 0; k < lines.length; k += 4) {
    const x1 = lines[k];
    const y1 = lines[k + 1];
    const x2 = lines[k + 2];
    const y2 = lines[k + 3];
    // Most lines lie wholly to one side of the box.
    if ((x1 < left && x2 < left) || (x1 > right && x2 > right) || (y1 < top && y2 < top) || (y1 > bottom && y2 > bottom)) continue;
    // The part of the line between the box's sides, then between its top and bottom.
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    if (dx !== 0) {
      const a = (left - x1) / dx;
      const b = (right - x1) / dx;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (dy !== 0) {
      const a = (top - y1) / dy;
      const b = (bottom - y1) / dy;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (t1 > t0) return true;
  }
  return false;
}

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
    /**
     * How the names on the sky are set; a design can change it (--sky-font and the like):
     * the font, how wide capitals are spaced (in ems), how large the names are, and a
     * style ('italic ' or none) for the names of stars and of groups.
     */
    this.fontFamily = FONT_FAMILY;
    this.tracking = 0.18;
    this.scale = 1;
    this.starStyle = '';
    this.groupStyle = '';
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
    // Names never run into each other or into the boxes in st.avoid: `taken` holds the
    // boxes of the ones placed so far. Constellations and groups first; a star's name goes
    // where they leave room. While training, names would give the answer away until the
    // last step.
    const quiz = st.quiz;
    const taken = st.avoid ? [...st.avoid] : [];
    if (quiz) {
      const around = this.drawContextNames(view, st);
      if (quiz.step === 3) this.drawQuizName(view, st, taken);
      taken.push(...around);
    } else {
      this.drawConstellationNames(view, st, taken, sky);
    }
    if (st.layers.starNames && (!quiz || quiz.step === 3)) this.drawStarNames(view, sky, quiz && quiz.stars, taken);
    this.drawCardinals(view);
  }

  /** A size in pixels as the design scales the names, to the half pixel. */
  px(size) {
    return Math.round(size * this.scale * 2) / 2;
  }

  drawConstellationNames(view, st, taken, sky) {
    const { pt } = this;
    const small = this.px(view.fov > 110 ? 10 : 11);
    // The more important names go first: marked and selected ones, the hovered one, those
    // of the groups pointed at and chosen while discovering, the names of those groups,
    // then the names of the other groups and the rest; with every name on, the rest go
    // before the other groups.
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
        size = this.px(selected ? 15 : 13);
        weight = 600;
      } else if (hover || focused) {
        // Hovered, or in a group pointed at or chosen.
        color = SKY.labelHover;
      }
      const font = `${weight} ${size}px ${this.fontFamily}`;
      for (const v of c.labelVecs) {
        if (!this.onSky(view, st, v)) continue;
        this.clearOfStars(sky, text, font, size * this.tracking, size);
        if (this.covered(text, font, size * this.tracking, size, taken)) continue;
        this.label(text, pt.x, pt.y, font, color, size * this.tracking, special);
      }
    }
    if (!grouped) this.drawGroupNames(view, st, taken, small, allNames ? 'focus' : 'all');
    if (allNames) this.drawGroupNames(view, st, taken, small, 'rest');
  }

  /**
   * Moves this.pt a line down or up when a name centred on it would lie on one of the
   * brightest stars (those that glint), if it is clear of them there.
   */
  clearOfStars(sky, text, font, spacingPx, size) {
    const { ctx, pt } = this;
    const { mag } = this.catalog.stars;
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacingPx.toFixed(1)}px`;
    const w = ctx.measureText(text).width / 2 + 3;
    const h = size / 2 + 3;
    const y0 = pt.y;
    for (const dy of [0, size + 8, -(size + 8)]) {
      pt.y = y0 + dy;
      let hit = false;
      // The stars are sorted, the brightest first.
      for (let i = 0; i < mag.length && mag[i] <= 2.9 && !hit; i++) {
        hit = sky.pm[i] <= 2.9 && Math.abs(sky.px[i] - pt.x) < w && Math.abs(sky.py[i] - pt.y) < h;
      }
      if (!hit) return;
    }
    pt.y = y0;
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
      const font = `${this.groupStyle}${focused ? 700 : 600} ${size}px ${this.fontFamily}`;
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
   * if not, its own box is added there. With `check` off the box is added whatever is there.
   */
  covered(text, font, spacingPx, size, taken, check = true) {
    const { ctx, pt } = this;
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacingPx.toFixed(1)}px`;
    const w = ctx.measureText(text).width / 2;
    const h = size / 2;
    const pad = 4;
    if (check && taken.some((r) => pt.x + w + pad > r.left && pt.x - w - pad < r.right && pt.y + h + pad > r.top && pt.y - h - pad < r.bottom)) return true;
    taken.push({ left: pt.x - w, right: pt.x + w, top: pt.y - h, bottom: pt.y + h });
    return false;
  }

  /**
   * While a group is learnt, the names of the ones of it already known, around the card.
   * @returns {object[]} the screen boxes of the names drawn
   */
  drawContextNames(view, st) {
    const { pt } = this;
    const size = this.px(12);
    const font = `500 ${size}px ${this.fontFamily}`;
    const boxes = [];
    for (const i of st.quiz.context) {
      const c = this.catalog.constellations[i];
      for (const v of c.labelVecs) {
        if (!view.projectEq(v, pt) || pt.z < view.cosCorner - 0.1) continue;
        if (st.groundOpaque && view.altOf(v) < -2) continue;
        this.covered(c.sv.toUpperCase(), font, size * this.tracking, size, boxes, false);
        this.label(c.sv.toUpperCase(), pt.x, pt.y, font, SKY.labelHover, size * this.tracking, true);
      }
    }
    return boxes;
  }

  /**
   * The training card's name once it is revealed, or the names of a group shown together,
   * or of a whole step (quiz.crowd: smaller, and a name that finds no room is left out).
   */
  drawQuizName(view, st, taken) {
    const { ctx, pt } = this;
    const crowd = Boolean(st.quiz.crowd);
    const size = this.px(crowd ? 13 : 16);
    const font = `600 ${size}px ${this.fontFamily}`;
    const spacing = size * this.tracking;
    // A group's names keep clear of each other and inside the screen: one that would run
    // into another moves a line up or down, and none is left out.
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
        const line = Math.round(size * 1.38);
        const clear = (crowd ? [0, line, -line] : [0, line, -line, 2 * line, -2 * line]).some((dy) => {
          pt.y = y0 + dy;
          return !this.covered(text, font, spacing, size, taken);
        });
        if (!clear && crowd) continue;
        if (!clear) {
          pt.y = y0;
          this.covered(text, font, spacing, size, taken, false);
        }
        this.label(text, pt.x, pt.y, font, SELECT_COLOR.hex, spacing, true);
      }
    }
  }

  /**
   * Names of the bright stars, the brightest first, each beside its star on the first side
   * where no other name is (STAR_NAME_SIDES); one with no room on any side is left out.
   * `only` limits them to some stars (a Uint8Array, 1 to name); `taken` holds the boxes of
   * the names already placed.
   */
  drawStarNames(view, sky, only, taken) {
    const { ctx } = this;
    const limit = view.fov > 100 ? 1.6 : view.fov > 60 ? 2.4 : view.fov > 30 ? 3.4 : 4.5;
    const size = this.px(11);
    const font = `${this.starStyle}400 ${size}px ${this.fontFamily}`;
    const h = size / 2;
    const pad = 2;
    ctx.textAlign = 'left';
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.4px';
    for (const i of this.namedStars) {
      if (only && !only[i]) continue;
      if (this.catalog.stars.mag[i] > limit && this.catalog.stars.hip[i] !== POLARIS_HIP) continue;
      const x = sky.px[i];
      if (Number.isNaN(x)) continue;
      const r = sky.pr[i];
      const text = this.catalog.starNames[i];
      const w = ctx.measureText(text).width;
      // First a side where no figure line runs through the name; failing that, any free side.
      placing: for (const clearOfLines of [true, false]) {
        for (const [side, down] of STAR_NAME_SIDES) {
          const left = side > 0 ? x + r + 5 : x - r - 5 - w;
          const y = sky.py[i] + down * (r * 0.6 + 6);
          if (taken.some((b) => left + w + pad > b.left && left - pad < b.right && y + h + pad > b.top && y - h - pad < b.bottom)) continue;
          if (clearOfLines && crossesBox(sky.traced, left - 1, y - h * 0.7, left + w + 1, y + h * 0.7)) continue;
          taken.push({ left, right: left + w, top: y - h, bottom: y + h });
          this.label(text, left, y, font, SKY.starName, 0.4, false);
          break placing;
        }
      }
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
      const size = this.px(main ? 15 : 11);
      const color = az === 0 ? SKY.north : SKY.cardinal;
      this.label(text, x, y, `${main ? 600 : 500} ${size}px ${this.fontFamily}`, color, size * 0.12, true);
    }
  }

  label(text, x, y, font, color, spacingPx, halo) {
    const { ctx } = this;
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacingPx.toFixed(1)}px`;
    ctx.lineWidth = halo ? 4 : 2.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = halo ? SKY.halo : 'rgba(8, 10, 28, 0.6)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}
