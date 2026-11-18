// 2D canvas between the sky and the ground: stars, stick figures and boundaries, drawn
// like a star chart at night. Bright stars glow and glint, the lines are a warm white, and
// the closed parts of a figure are filled with a thin, cloudy colour, like a nebula.
import { bvToRgb, EMBER, EMBER_DEEP, MARK_COLORS, SELECT_COLOR, SKY } from './palette.js';

const COLOR_STEPS = 8;
const ALPHA_STEPS = [0.22, 0.36, 0.52, 0.7, 0.86, 1];
/** Faintest magnitude drawn after extinction, on the darkest sky. */
const MAG_LIMIT = 6.3;
/** The faintest the star catalogue goes: a limit there or beyond is the darkest sky. */
export const CATALOG_FAINTEST = 6;
/** Magnitudes every star is dimmed by per magnitude the limit is brought down ("Sikt"). */
const HAZE_DIMMING = 0.25;
/** Over how many magnitudes below the limit the faintest stars left fade out. */
const FADE = 0.5;
/** Magnitudes lost per extra airmass near the horizon, and the most a star loses there. */
const EXTINCTION = 0.28;
const EXTINCTION_MOST = 4;
/** Stars at least this bright (as seen) have a soft glow round them, unless it would be fainter than this. */
const GLOW_MAG = 4.6;
const GLOW_FAINTEST = 0.2;
/** Stars at least this bright (as seen) glint: thin rays up, down and to the sides. */
const GLINT_MAG = 2.9;
/** The coordinate grid: a meridian every so many degrees of right ascension, a parallel every so many of declination. */
const GRID_RA = 30;
const GRID_DEC = 20;
/**
 * The grid is finer the closer the view, so that a handful of its lines always cross the
 * screen: each level halves the one before, used from the field of view given (degrees) down.
 */
const GRID_LEVELS = [360, 75, 36, 17];
/** Side of the cloud tile the figures are filled with, in pixels, and how much sky it covers, in radians. */
const CLOUD = 256;
const CLOUD_SPAN = 0.35;
/**
 * The cloud is drawn no smaller and no larger than this, in tiles: finer it would only
 * flicker, and coarser a figure seen close up would be one even blur.
 */
const CLOUD_SMALLEST = 0.5;
const CLOUD_LARGEST = 3.2;
/** How far from the middle of a figure's closed parts, in radians, the second point lies that the cloud is laid out by. */
const NORTH_STEP = 0.02;
/** How far the colour of a figure that stands out spills over its edge, in CSS pixels. */
const FACE_GLOW = 18;
/** How strongly a figure's closed parts are filled: any figure, one that stands out, a training card's. */
const FILL = { plain: 0.42, lit: 0.54, card: 0.58, context: 0.28, marked: 0.4 };

/** The disc of a star. Bright stars keep a small core: their light is in the glow and the rays. */
function radiusForMag(mag) {
  return 0.45 + 0.36 * Math.pow(Math.max(0, 6.4 - mag), 1.12);
}

function alphaForMag(mag) {
  return Math.min(1, Math.max(0.15, 0.24 + (6.2 - mag) * 0.24));
}

export class SkyLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {ReturnType<import('../sky/catalog.js').buildCatalog>} catalog
   */
  constructor(canvas, catalog) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.catalog = catalog;
    const n = catalog.stars.count;
    /** Screen positions of every star for the current frame (CSS px); NaN when not drawn. */
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pr = new Float32Array(n);
    /** The star's magnitude as seen this frame: dimmed near the horizon and by haze. */
    this.pm = new Float32Array(n);
    /** 1 for a star kept as faint context while training. */
    this.dim = new Uint8Array(n);
    /**
     * Where the lines and closed parts of a figure end at each of its stars this frame
     * (CSS px), and whether the star has such a corner: it has when it shows at all, also
     * off the screen or under the ground, where the star itself is not drawn.
     */
    this.qx = new Float32Array(n);
    this.qy = new Float32Array(n);
    this.corner = new Uint8Array(n);
    this.colorStep = new Uint8Array(n);
    const bvMin = -0.3;
    const bvMax = 1.8;
    for (let i = 0; i < n; i++) {
      const t = (catalog.stars.bv[i] - bvMin) / (bvMax - bvMin);
      this.colorStep[i] = Math.max(0, Math.min(COLOR_STEPS - 1, Math.round(t * (COLOR_STEPS - 1))));
    }
    this.colors = [];
    this.glows = [];
    for (let k = 0; k < COLOR_STEPS; k++) {
      const rgb = bvToRgb(bvMin + ((bvMax - bvMin) * k) / (COLOR_STEPS - 1));
      this.colors.push(`rgb(${rgb.join(',')})`);
      this.glows.push(makeGlow(rgb));
    }
    this.buckets = Array.from({ length: COLOR_STEPS * ALPHA_STEPS.length }, () => []);
    this.pt = { x: 0, y: 0, z: 0 };
    /** The cloud the figures are filled with, and the fill made of it for each colour used. */
    this.cloud = makeCloud(CLOUD);
    this.fills = new Map();
    /**
     * Where each constellation's cloud is fixed to the sky: the middle of its closed
     * parts, and a point a little north of it.
     */
    this.anchors = catalog.constellations.map((c) => {
      const sum = [0, 0, 0];
      for (const face of c.faces) for (const i of face) [catalog.stars.x[i], catalog.stars.y[i], catalog.stars.z[i]].forEach((v, k) => { sum[k] += v; });
      const len = Math.hypot(sum[0], sum[1], sum[2]);
      const mid = len > 1e-6 ? sum.map((v) => v / len) : c.centerVec;
      return { mid, north: northOf(mid) };
    });
    /** The figure lines drawn this frame, as flat [x1, y1, x2, y2, ...] (CSS px): the names of stars keep clear of them. */
    this.traced = [];
    /** The grids' meridians and parallels, as lines of J2000 unit vectors: each grid is made when first drawn. */
    this.grids = [];
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
   * @param {object} st  render state: layers, marks (Map index -> colour index),
   *   selected, hover, groundOpaque, artShown(index), anyArt, bounds (the boundaries drawn:
   *   'none', 'constellation' or 'group'), groupBounds (lines round the groups shown, while
   *   discovering with the groups' boundaries chosen, else null), groups (the groups shown
   *   while discovering, else null) and focus (those of them pointed at and chosen:
   *   {group, name, members, middle, outline, spots}), focusMembers (their constellations,
   *   or null), linesOnly and namesOnly (the constellations whose lines and names are drawn,
   *   or null for all), reveal in the overview and while discovering: {con: Uint8Array per
   *   constellation (1 shown, 0 left out), stars: null}, otherwise null; chrome (screen
   *   boxes of the buttons along the edges) and avoid (screen boxes names keep clear of) are
   *   for the HUD; limitMag (the faintest magnitude seen, "Sikt": CATALOG_FAINTEST or more
   *   for the darkest sky); artBright (constellations whose illustrations stand out);
   *   quiz while training: {target, targets (the card, or a whole group shown together),
   *   context (the card's group's members already known, drawn around it), step (1 stars,
   *   2 lines, 3 name), stars: Uint8Array per star (1 for the targets' and context's),
   *   lines and art: whether to draw the targets', outline: the boundary round the group
   *   as open lines of unit vectors, or null}, otherwise null
   */
  render(view, st) {
    const { ctx, catalog } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    this.width = view.width;
    this.height = view.height;
    this.traced.length = 0;
    this.projectStars(view, st);

    const special = new Map();
    for (const [i, colorIdx] of st.marks) special.set(i, MARK_COLORS[colorIdx % MARK_COLORS.length].hex);
    if (st.selected >= 0 && !special.has(st.selected)) special.set(st.selected, SELECT_COLOR.hex);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    this.drawGrid(view);
    if (st.anyArt) this.drawArt(view, st, special);
    const rv = st.reveal;
    const found = (c) => !rv || rv.con[c.index] === 1;

    // Boundaries (while training only the one round the group: a constellation's own
    // would give the answer away). While discovering they can go round each group instead:
    // one solid line, drawn as one path so that where two groups meet it is not doubled.
    if (st.bounds === 'group' && st.groupBounds) {
      ctx.setLineDash([]);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = SKY.groupFound;
      ctx.beginPath();
      this.tracePolyline(view, st.groupBounds, false);
      ctx.stroke();
    } else if (st.bounds === 'constellation') {
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = SKY.bound;
      ctx.beginPath();
      for (const c of catalog.constellations) {
        if (found(c) && !special.has(c.index) && c.index !== st.hover) this.tracePolyline(view, c.outlines);
      }
      ctx.stroke();
    }
    // The groups pointed at and chosen stand out, whichever boundaries are drawn.
    const focus = st.focusMembers;
    if (st.focus && st.focus.length) {
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = SKY.groupFocus;
      ctx.beginPath();
      for (const o of st.focus) this.tracePolyline(view, o.outline, false);
      ctx.stroke();
    }
    if (st.hover >= 0 && !special.has(st.hover) && !(focus && focus.has(st.hover))) {
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = SKY.boundHover;
      ctx.beginPath();
      this.tracePolyline(view, catalog.constellations[st.hover].outlines);
      ctx.stroke();
    }
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 1.4;
    for (const [i, color] of special) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      this.tracePolyline(view, catalog.constellations[i].outlines);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (st.quiz && st.quiz.outline) {
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = SKY.groupBound;
      ctx.beginPath();
      this.tracePolyline(view, st.quiz.outline, false);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Which figures are drawn, and how: plain, standing out (pointed at, or in a group in
    // focus while discovering), marked or selected (their lines in that colour), and while
    // training the card's own and the ones of its group already known. A plain figure's
    // closed parts are filled thinly, in a deeper colour; one that stands out more strongly
    // and with a glow; a marked one in its mark's colour.
    const hoverLit = st.hover >= 0 && !special.has(st.hover) && found(catalog.constellations[st.hover]) && !(focus && focus.has(st.hover));
    const plain = [];
    const lit = [];
    const fills = [];
    if (st.quiz) {
      for (const i of st.quiz.context) fills.push({ c: catalog.constellations[i], rgb: EMBER_DEEP.rgb, strength: FILL.context, glow: false });
      if (st.quiz.lines) for (const i of st.quiz.targets) fills.push({ c: catalog.constellations[i], rgb: EMBER.rgb, strength: FILL.card, glow: true });
    } else {
      for (const c of catalog.constellations) {
        if (!found(c)) continue;
        if (st.marks.has(c.index)) {
          // A marked figure in its mark's colour, as its lines are.
          fills.push({ c, rgb: MARK_COLORS[st.marks.get(c.index) % MARK_COLORS.length].rgb, strength: FILL.marked, glow: c.index === st.selected });
        } else if (c.index === st.selected) {
          // The one whose card is open: as a training card's.
          fills.push({ c, rgb: EMBER.rgb, strength: FILL.card, glow: true });
        } else if (focus && focus.has(c.index)) {
          lit.push(c);
          fills.push({ c, rgb: EMBER.rgb, strength: FILL.lit, glow: true });
        } else if (c.index === st.hover) {
          fills.push({ c, rgb: EMBER.rgb, strength: FILL.lit, glow: true });
        } else if (st.layers.lines && (!st.linesOnly || st.linesOnly.has(c.index))) {
          plain.push(c);
          fills.push({ c, rgb: EMBER_DEEP.rgb, strength: FILL.plain, glow: false });
        }
      }
      if (hoverLit) lit.push(catalog.constellations[st.hover]);
    }
    this.drawFaces(view, fills);

    // Stick figures (while training, only the target's, when the card shows them): a
    // crisp warm line over a wider, fainter one, so that the lines seem to shine a little.
    ctx.lineCap = 'round';
    const strokeFigures = (list, glowWidth, glowStyle, width, style) => {
      if (!list.length) return;
      ctx.beginPath();
      for (const c of list) this.traceSegments(c.segments);
      ctx.lineWidth = glowWidth;
      ctx.strokeStyle = glowStyle;
      ctx.stroke();
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      ctx.stroke();
    };
    if (st.quiz) {
      // While a group is learnt, the ones of it already known stay with their lines.
      strokeFigures(st.quiz.context.map((i) => catalog.constellations[i]), 5, SKY.lineGlow, 1.3, SKY.lineHover);
      if (st.quiz.lines) strokeFigures(st.quiz.targets.map((i) => catalog.constellations[i]), 8, SKY.lineCardGlow, 2, SKY.lineCard);
    } else {
      strokeFigures(plain, 5, SKY.lineGlow, 1.25, SKY.line);
      // The constellations of the groups pointed at and chosen, and the one pointed at.
      strokeFigures(lit, 7, SKY.lineHoverGlow, 1.5, SKY.lineHover);
    }
    // Marked and selected figures in their colour, over a wider, fainter line of it (a
    // blurred shadow would cost many times as much with many marked).
    for (const [i, color] of special) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      this.traceSegments(catalog.constellations[i].segments);
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2 + 5 / this.dpr;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    this.drawStars();
  }

  /** A faint grid of right ascension and declination, as on a star chart. */
  drawGrid(view) {
    const { ctx } = this;
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = SKY.grid;
    ctx.beginPath();
    this.traceGrid(view);
    ctx.stroke();
  }

  /** Adds the grid's lines to the current path, as far as they are in sight. */
  traceGrid(view) {
    const { ctx, pt } = this;
    const m = view.eqToCam;
    const minZ = view.cosCorner - 0.15;
    let level = 0;
    while (level + 1 < GRID_LEVELS.length && view.fov <= GRID_LEVELS[level + 1]) level++;
    if (!this.grids[level]) this.grids[level] = makeGrid(GRID_RA / 2 ** level, GRID_DEC / 2 ** level);
    // How far from the middle of the view anything on the screen can be, in radians.
    const reach = Math.acos(Math.max(-1, Math.min(1, view.cosCorner))) + 0.05;
    for (const { points: line, pole, lat } of this.grids[level]) {
      // Each line is part of a circle on the sky; a circle further from the middle of the
      // view than the screen reaches is left out whole.
      const side = m[6] * pole[0] + m[7] * pole[1] + m[8] * pole[2];
      if (Math.abs(Math.asin(Math.max(-1, Math.min(1, side))) - lat) > reach) continue;
      let pen = false;
      for (let k = 0; k < line.length; k += 3) {
        const x = line[k];
        const y = line[k + 1];
        const z = line[k + 2];
        const cz = m[6] * x + m[7] * y + m[8] * z;
        if (cz < minZ || !view.projectCam(m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, cz, pt)) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(pt.x, pt.y);
        else ctx.moveTo(pt.x, pt.y);
        pen = true;
      }
    }
  }

  /**
   * The closed parts of figures, filled with a thin cloudy colour, like a nebula behind
   * the lines. The cloud is fixed to the sky at its figure: it moves, turns and grows with
   * the figure, however the sky is turned and looked at.
   * @param {{c: object, rgb: number[], strength: number, glow: boolean}[]} fills  `glow`
   *   lets the colour spill softly over the lines, for the few figures that stand out
   */
  drawFaces(view, fills) {
    const { ctx, pt } = this;
    for (const { c, rgb, strength, glow } of fills) {
      if (!c.faces.length) continue;
      const faces = c.faces.filter((face) => this.faceInSight(view, face));
      if (!faces.length) continue;
      if (glow) {
        // The glow by itself, as the shadow of the shape drawn far off the canvas: a
        // shadow under the cloud itself would cost a blurred layer the size of the screen.
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.translate(-GLOW_AWAY, 0);
        ctx.beginPath();
        for (const face of faces) this.traceFace(face);
        ctx.shadowOffsetX = GLOW_AWAY * this.dpr;
        ctx.shadowColor = `rgba(${rgb.join(',')},${(0.41 * strength).toFixed(3)})`;
        ctx.shadowBlur = FACE_GLOW * this.dpr;
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      for (const face of faces) this.traceFace(face);
      const fill = this.fillFor(rgb);
      const { mid, north } = this.anchors[c.index];
      if (fill.setTransform && view.projectEq(mid, pt)) {
        const x = pt.x;
        const y = pt.y;
        if (view.projectEq(north, pt)) {
          // North on the screen at the middle, and how many pixels a radian is there.
          const len = Math.hypot(pt.x - x, pt.y - y) || 1;
          const scale = Math.min(CLOUD_LARGEST, Math.max(CLOUD_SMALLEST, (len / NORTH_STEP) * (CLOUD_SPAN / CLOUD)));
          const ux = ((pt.x - x) / len) * scale;
          const uy = ((pt.y - y) / len) * scale;
          fill.setTransform(new DOMMatrix([-uy, ux, -ux, -uy, x, y]));
        }
      }
      ctx.fillStyle = fill;
      ctx.globalAlpha = strength;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Whether a face of a figure is filled: all of its stars show (one too faint to show,
   * or left out, takes the face with it, as it takes its lines) and some of it, or of its
   * glow, can be on the screen.
   */
  faceInSight(view, face) {
    const { qx, qy, corner } = this;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const i of face) {
      if (!corner[i]) return false;
      left = Math.min(left, qx[i]);
      right = Math.max(right, qx[i]);
      top = Math.min(top, qy[i]);
      bottom = Math.max(bottom, qy[i]);
    }
    const margin = FACE_GLOW + 6;
    return right >= -margin && left <= view.width + margin && bottom >= -margin && top <= view.height + margin;
  }

  /** Adds a face of a figure to the current path. */
  traceFace(face) {
    const { ctx, qx, qy } = this;
    ctx.moveTo(qx[face[0]], qy[face[0]]);
    for (let k = 1; k < face.length; k++) ctx.lineTo(qx[face[k]], qy[face[k]]);
    ctx.closePath();
  }

  /** The cloud in a colour, to fill with: made the first time the colour is used. */
  fillFor(rgb) {
    const key = rgb.join(',');
    let fill = this.fills.get(key);
    if (!fill) {
      const tile = document.createElement('canvas');
      tile.width = CLOUD;
      tile.height = CLOUD;
      const g = tile.getContext('2d');
      const image = g.createImageData(CLOUD, CLOUD);
      for (let k = 0; k < this.cloud.length; k++) {
        const n = this.cloud[k];
        // Thin and deep where the cloud is thin, dense and lighter where it is dense.
        for (let ch = 0; ch < 3; ch++) image.data[k * 4 + ch] = Math.round(rgb[ch] * (0.72 + 0.28 * n) + (255 - rgb[ch]) * 0.12 * n * n);
        image.data[k * 4 + 3] = Math.round(255 * (0.4 + 0.6 * n));
      }
      g.putImageData(image, 0, 0);
      fill = this.ctx.createPattern(tile, 'repeat') || `rgb(${key})`;
      this.fills.set(key, fill);
    }
    return fill;
  }

  /** Illustrations: plain ones batched in two paths, hovered, chosen (st.artBright) and marked ones on top. */
  drawArt(view, st, special) {
    const { ctx } = this;
    const corner = (Math.acos(Math.max(-1, Math.min(1, view.cosCorner))) * 180) / Math.PI;
    const m = view.eqToCam;
    const visible = this.catalog.constellations.filter((c) => {
      if (!c.art.length || !st.artShown(c.index)) return false;
      const v = c.centerVec;
      const cz = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
      return (Math.acos(Math.max(-1, Math.min(1, cz))) * 180) / Math.PI - c.artRadius < corner + 2;
    });
    const bright = st.artBright || new Set();
    const plain = visible.filter((c) => !special.has(c.index) && c.index !== st.hover && !bright.has(c.index));
    ctx.save();
    ctx.lineCap = 'round';
    const stroke = (list, fine, style, width) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const c of list) this.traceArt(view, c.art, fine);
      ctx.stroke();
    };
    stroke(plain, false, SKY.art, 1.25);
    stroke(plain, true, SKY.artFine, 0.9);
    const lit = visible.filter((c) => (c.index === st.hover || bright.has(c.index)) && !special.has(c.index));
    if (lit.length) {
      stroke(lit, false, SKY.artHover, 1.4);
      stroke(lit, true, SKY.artHoverFine, 1);
    }
    for (const c of visible) {
      const color = special.get(c.index);
      if (!color) continue;
      ctx.globalAlpha = 0.75;
      stroke([c], false, color, 1.5);
      ctx.globalAlpha = 0.45;
      stroke([c], true, color, 1);
    }
    ctx.restore();
  }

  /** Adds an illustration's main (or fine) polylines to the current path. */
  traceArt(view, lines, fine) {
    const { ctx, pt } = this;
    const m = view.eqToCam;
    for (const line of lines) {
      if (line.fine !== fine) continue;
      const v = line.vecs;
      let pen = false;
      for (let k = 0; k < v.length; k += 3) {
        const x = v[k];
        const y = v[k + 1];
        const z = v[k + 2];
        const cz = m[6] * x + m[7] * y + m[8] * z;
        if (cz < -0.3 || !view.projectCam(m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, cz, pt)) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(pt.x, pt.y);
        else ctx.moveTo(pt.x, pt.y);
        pen = true;
      }
    }
  }

  /**
   * Projects all stars and buckets the ones drawn by colour and brightness. A figure's
   * star also gets a corner, where its lines and closed parts end, whenever it shows at
   * all: off the screen too, and under the ground, which hides it.
   */
  projectStars(view, st) {
    const { stars } = this.catalog;
    const m = view.eqToCam;
    const h = view.eqToHor;
    const pt = this.pt;
    const zoom = Math.min(2.1, Math.max(0.85, Math.pow(90 / view.fov, 0.38)));
    this.zoom = zoom;
    const minZ = view.cosCorner - 0.02;
    const figureOnly = st.layers.figureStarsOnly;
    const shown = st.reveal?.stars;
    // A hazier sky or a brighter town ("Sikt"): fainter stars are lost, those near the
    // limit fade out, and every star is a little dimmer.
    // From the darkest sky down, the cut-off, the fade and the haze all grow smoothly.
    const chosen = Math.min(st.limitMag ?? CATALOG_FAINTEST, CATALOG_FAINTEST);
    const below = CATALOG_FAINTEST - chosen;
    const limit = chosen + (MAG_LIMIT - CATALOG_FAINTEST) * Math.max(0, 1 - below);
    const haze = below * HAZE_DIMMING;
    const fadeOver = Math.min(FADE, below);
    // While training, the stars around the target stay as faint context.
    const target = st.quiz?.stars;
    for (const b of this.buckets) b.length = 0;
    for (let i = 0; i < stars.count; i++) {
      this.px[i] = NaN;
      this.corner[i] = 0;
      const inFigure = stars.inFigure[i];
      if (figureOnly && !inFigure) continue;
      if (shown && !shown[i]) continue;
      const x = stars.x[i];
      const y = stars.y[i];
      const z = stars.z[i];
      const cz = m[6] * x + m[7] * y + m[8] * z;
      // Off the screen only a figure's star matters, as the far end of a line.
      const inSight = cz >= minZ;
      if (!inSight && !inFigure) continue;
      const sinAlt = h[6] * x + h[7] * y + h[8] * z;
      const under = sinAlt <= 0 && st.groundOpaque;
      let mag = stars.mag[i];
      const context = target && !target[i];
      // A training card's own stars always show, so that there is something to answer,
      // and keep their light down to the horizon.
      const card = target && target[i];
      if (!card) {
        if (sinAlt > 0) {
          const airmass = 1 / (sinAlt + 0.025 * Math.exp(-11 * sinAlt));
          mag += Math.min(EXTINCTION_MOST, EXTINCTION * (airmass - 1));
        } else if (under) {
          // Under the ground a star stays as dim as it set: its lines do not come back.
          mag += EXTINCTION_MOST;
        }
      }
      if (mag > (card ? MAG_LIMIT : limit)) continue;
      if (!view.projectCam(m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, cz, pt)) continue;
      if (inFigure) {
        this.corner[i] = 1;
        this.qx[i] = pt.x;
        this.qy[i] = pt.y;
      }
      if (!inSight || under) continue;
      const fade = fadeOver > 0 && !card ? Math.min(1, (limit - mag) / fadeOver + 0.3) : 1;
      mag += haze;
      const r = radiusForMag(mag) * zoom * (context ? 0.8 : 1);
      this.px[i] = pt.x;
      this.py[i] = pt.y;
      this.pr[i] = r;
      this.pm[i] = mag;
      this.dim[i] = context ? 1 : 0;
      const a = alphaForMag(mag) * fade * (context ? 0.3 : 1);
      let ai = 0;
      while (ai < ALPHA_STEPS.length - 1 && ALPHA_STEPS[ai] < a) ai++;
      this.buckets[this.colorStep[i] * ALPHA_STEPS.length + ai].push(i);
    }
  }

  /**
   * The stars: a soft glow round the brighter ones, the discs, a white heart in the
   * brightest, and glints on them, thin rays up, down and to the sides that are longer the
   * brighter the star, as a lens draws them.
   */
  drawStars() {
    const { ctx, px, py, pr, pm } = this;
    const { mag } = this.catalog.stars;
    const zoom = this.zoom || 1;
    // Soft glows (the stars are sorted bright first, and none is seen brighter than it is).
    let bright = 0;
    for (let i = 0; i < mag.length && mag[i] <= GLOW_MAG; i++) {
      bright = i + 1;
      if (Number.isNaN(px[i]) || pm[i] > GLOW_MAG) continue;
      // The faintest glows change next to nothing, and are a third of them all.
      const alpha = Math.min(0.8, (GLOW_MAG - pm[i]) / 3.4 + 0.08);
      if (alpha < GLOW_FAINTEST) continue;
      const r = pr[i] * 3.2 + (GLOW_MAG - pm[i]) * 1.6 * zoom;
      ctx.globalAlpha = alpha * (this.dim[i] ? 0.3 : 1);
      ctx.drawImage(this.glows[this.colorStep[i]], px[i] - r, py[i] - r, 2 * r, 2 * r);
    }
    for (let c = 0; c < COLOR_STEPS; c++) {
      ctx.fillStyle = this.colors[c];
      for (let a = 0; a < ALPHA_STEPS.length; a++) {
        const list = this.buckets[c * ALPHA_STEPS.length + a];
        if (!list.length) continue;
        ctx.globalAlpha = ALPHA_STEPS[a];
        ctx.beginPath();
        for (const i of list) {
          const x = px[i];
          const y = py[i];
          const r = pr[i];
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    // Glints and white hearts, for the stars in full light and for those kept as context.
    ctx.fillStyle = SKY.glint;
    for (const dim of [0, 1]) {
      const stars = [];
      for (let i = 0; i < bright && mag[i] <= GLINT_MAG; i++) {
        if (!Number.isNaN(px[i]) && pm[i] <= GLINT_MAG && this.dim[i] === dim) stars.push(i);
      }
      if (!stars.length) continue;
      const fade = dim ? 0.3 : 1;
      // Three rays of falling length on top of each other fade toward their tips.
      for (const [part, alpha] of [[1, 0.2], [0.55, 0.26], [0.28, 0.4]]) {
        ctx.globalAlpha = alpha * fade;
        ctx.beginPath();
        for (const i of stars) {
          const len = (4 + (GLINT_MAG - pm[i]) * 8.5) * zoom * part;
          const w = (0.45 + 0.16 * pr[i]) * (0.6 + 0.4 * part);
          const x = px[i];
          const y = py[i];
          ctx.moveTo(x - len, y);
          ctx.lineTo(x, y - w);
          ctx.lineTo(x + len, y);
          ctx.lineTo(x, y + w);
          ctx.closePath();
          ctx.moveTo(x, y - len);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x, y + len);
          ctx.lineTo(x - w, y);
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.globalAlpha = 0.9 * fade;
      ctx.beginPath();
      for (const i of stars) {
        const r = pr[i] * 0.55;
        ctx.moveTo(px[i] + r, py[i]);
        ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Adds stick-figure segments to the current path, leaving a gap around each star drawn.
   * A line runs on to a star off the screen or under the ground; one to a star that does
   * not show at all is left out.
   */
  traceSegments(segments) {
    const { ctx, px, pr, qx, qy, corner } = this;
    // Room for the glow round a line.
    const edge = 12;
    for (let k = 0; k < segments.length; k += 2) {
      const a = segments[k];
      const b = segments[k + 1];
      if (!corner[a] || !corner[b]) continue;
      const x1 = qx[a];
      const x2 = qx[b];
      const y1 = qy[a];
      const y2 = qy[b];
      // Not one that lies wholly to one side of the screen.
      if (Math.max(x1, x2) < -edge || Math.min(x1, x2) > this.width + edge || Math.max(y1, y2) < -edge || Math.min(y1, y2) > this.height + edge) continue;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ga = Number.isNaN(px[a]) ? 0 : Math.min(len * 0.3, pr[a] + 0.5);
      const gb = Number.isNaN(px[b]) ? 0 : Math.min(len * 0.3, pr[b] + 0.5);
      if (len - ga - gb < 1) continue;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      ctx.moveTo(x1 + ux * ga, y1 + uy * ga);
      ctx.lineTo(x2 - ux * gb, y2 - uy * gb);
      this.traced.push(x1, y1, x2, y2);
    }
  }

  /** Adds outlines (arrays of J2000 vectors) to the current path, closed unless told otherwise. */
  tracePolyline(view, rings, closed = true) {
    const { ctx, pt } = this;
    for (const ring of rings) {
      let pen = false;
      for (let k = 0; k < ring.length + (closed ? 1 : 0); k++) {
        if (!view.projectEq(ring[k % ring.length], pt) || pt.z < -0.3) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(pt.x, pt.y);
        else ctx.moveTo(pt.x, pt.y);
        pen = true;
      }
    }
  }
}

/** How far off the canvas a shape is drawn of which only the shadow is wanted, in CSS pixels. */
const GLOW_AWAY = 20000;

/** A point NORTH_STEP north of a point on the sky (toward any side at a pole), as a unit vector. */
function northOf(v) {
  // The pole, less its part along v: what is left points north along the sky at v.
  let n = [-v[2] * v[0], -v[2] * v[1], 1 - v[2] * v[2]];
  let len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-6) {
    n = [1, 0, 0];
    len = 1;
  }
  const out = v.map((x, k) => x + (n[k] / len) * NORTH_STEP);
  const norm = Math.hypot(out[0], out[1], out[2]);
  return out.map((x) => x / norm);
}

function makeGlow(rgb) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${rgb.join(',')},0.85)`);
  grad.addColorStop(0.16, `rgba(${rgb.join(',')},0.34)`);
  grad.addColorStop(0.45, `rgba(${rgb.join(',')},0.09)`);
  grad.addColorStop(1, `rgba(${rgb.join(',')},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * A cloud to fill figures with: smooth noise in 0 to 1, in a square that repeats without
 * a seam. Always the same cloud, so that the sky looks the same each time.
 * @returns {Float32Array} size × size values, row by row
 */
export function makeCloud(size) {
  let seed = 20261118;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out = new Float32Array(size * size);
  let total = 0;
  // Four layers, each twice as fine and half as strong as the one before.
  for (let layer = 0, cells = 4, weight = 1; layer < 4; layer++, cells *= 2, weight /= 2) {
    const lattice = Float32Array.from({ length: cells * cells }, random);
    const step = cells / size;
    for (let y = 0; y < size; y++) {
      const fy = y * step;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x * step;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const x1 = (x0 + 1) % cells;
        const y1 = (y0 + 1) % cells;
        const top = lattice[y0 * cells + x0] * (1 - sx) + lattice[y0 * cells + x1] * sx;
        const bottom = lattice[y1 * cells + x0] * (1 - sx) + lattice[y1 * cells + x1] * sx;
        out[y * size + x] += (top * (1 - sy) + bottom * sy) * weight;
      }
    }
    total += weight;
  }
  // Stretched to the whole range, so that the cloud has thin and dense parts.
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of out) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  for (let k = 0; k < out.length; k++) out[k] = (out[k] - lo) / (hi - lo || total);
  return out;
}

/** A grid's lines: for each, flat [x, y, z, ...] J2000 unit vectors, a point every few degrees or less. */
function makeGrid(raStep, decStep) {
  const rad = Math.PI / 180;
  // A point often enough for the finer grids, seen close, to stay round.
  const step = Math.min(4, raStep / 6);
  /** A line of `count` points from (ra, dec), each `dRa` and `dDec` degrees on from the one before. */
  const line = (ra, dec, dRa, dDec, count) => {
    const out = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const a = (ra + k * dRa) * rad;
      const d = (dec + k * dDec) * rad;
      out[k * 3] = Math.cos(d) * Math.cos(a);
      out[k * 3 + 1] = Math.cos(d) * Math.sin(a);
      out[k * 3 + 2] = Math.sin(d);
    }
    return out;
  };
  // With each line, the circle it is part of: the points `lat` radians from the plane
  // across `pole` (a meridian lies in such a plane, a parallel that far north of the equator).
  const lines = [];
  // Meridians stop short of the poles, where they would crowd together.
  for (let ra = 0; ra < 360; ra += raStep) {
    lines.push({ points: line(ra, -80, 0, step, Math.round(160 / step) + 1), pole: [-Math.sin(ra * rad), Math.cos(ra * rad), 0], lat: 0 });
  }
  for (let dec = -80; dec <= 80; dec += decStep) {
    lines.push({ points: line(0, dec, step, 0, Math.round(360 / step) + 1), pole: [0, 0, 1], lat: dec * rad });
  }
  return lines;
}
