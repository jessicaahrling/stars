// 2D canvas between the sky and the ground: stars, stick figures and boundaries.
import { bvToRgb, MARK_COLORS, SELECT_COLOR, SKY } from './palette.js';

const COLOR_STEPS = 8;
const ALPHA_STEPS = [0.22, 0.36, 0.52, 0.7, 0.86, 1];
/** Faintest magnitude drawn after extinction. */
const MAG_LIMIT = 6.3;
/** Magnitudes lost per extra airmass near the horizon. */
const EXTINCTION = 0.28;

function radiusForMag(mag) {
  return 0.5 + 0.42 * Math.pow(Math.max(0, 6.4 - mag), 1.22);
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
   *   selected, hover, groundOpaque, artShown(index), anyArt, and reveal while
   *   discovering the sky: {con: Uint8Array per constellation (1 found, 2 can be added
   *   next, 0 hidden), stars: Uint8Array per star (1 shown)}, otherwise null; recent (the
   *   constellation found last) and avoid (screen boxes names keep clear of) are for the HUD;
   *   quiz while training: {target, step (1 stars, 2 lines, 3 name), stars: Uint8Array per
   *   star (1 for the target's)}, otherwise null
   */
  render(view, st) {
    const { ctx, catalog } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    this.projectStars(view, st);

    const special = new Map();
    for (const [i, colorIdx] of st.marks) special.set(i, MARK_COLORS[colorIdx % MARK_COLORS.length].hex);
    if (st.selected >= 0 && !special.has(st.selected)) special.set(st.selected, SELECT_COLOR.hex);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    if (st.anyArt) this.drawArt(view, st, special);
    const rv = st.reveal;
    const found = (c) => !rv || rv.con[c.index] === 1;

    // Boundaries (never while training: their shape would give the answer away)
    if (st.layers.bounds && !st.quiz) {
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = SKY.bound;
      ctx.beginPath();
      for (const c of catalog.constellations) {
        if (found(c) && !special.has(c.index) && c.index !== st.hover) this.tracePolyline(view, c.outlines);
      }
      ctx.stroke();
    }
    if (rv) {
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = SKY.candidate;
      ctx.beginPath();
      for (const c of catalog.constellations) {
        if (rv.con[c.index] === 2 && c.index !== st.hover) this.tracePolyline(view, c.outlines);
      }
      ctx.stroke();
    }
    if (st.hover >= 0 && !special.has(st.hover)) {
      const candidate = rv && rv.con[st.hover] === 2;
      ctx.setLineDash(candidate ? [5, 4] : [3, 4]);
      ctx.lineWidth = candidate ? 1.6 : 1.2;
      ctx.strokeStyle = candidate ? SKY.candidateHover : SKY.boundHover;
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
    ctx.setLineDash([]);

    // Stick figures (while training, only the target's, from the second step)
    ctx.lineCap = 'round';
    if (st.quiz && st.quiz.step >= 2) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = SELECT_COLOR.hex;
      ctx.shadowColor = SELECT_COLOR.hex;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      this.traceSegments(catalog.constellations[st.quiz.target].segments);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (st.layers.lines && !st.quiz) {
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = SKY.line;
      ctx.beginPath();
      for (const c of catalog.constellations) {
        if (found(c) && !special.has(c.index) && c.index !== st.hover) this.traceSegments(c.segments);
      }
      ctx.stroke();
    }
    if (st.hover >= 0 && !special.has(st.hover) && found(catalog.constellations[st.hover])) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = SKY.lineHover;
      ctx.beginPath();
      this.traceSegments(catalog.constellations[st.hover].segments);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    for (const [i, color] of special) {
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      this.traceSegments(catalog.constellations[i].segments);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    this.drawStars();
  }

  /** Illustrations: plain ones batched in two paths, hovered and marked ones on top. */
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
    const plain = visible.filter((c) => !special.has(c.index) && c.index !== st.hover);
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
    const hover = visible.find((c) => c.index === st.hover && !special.has(c.index));
    if (hover) {
      stroke([hover], false, SKY.artHover, 1.4);
      stroke([hover], true, SKY.artHoverFine, 1);
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

  /** Projects all stars, buckets them by colour and brightness. */
  projectStars(view, st) {
    const { stars } = this.catalog;
    const m = view.eqToCam;
    const h = view.eqToHor;
    const pt = this.pt;
    const zoom = Math.min(2.1, Math.max(0.85, Math.pow(90 / view.fov, 0.38)));
    const minZ = view.cosCorner - 0.02;
    const figureOnly = st.layers.figureStarsOnly;
    const shown = st.reveal?.stars;
    // While training, the stars around the target stay as faint context.
    const target = st.quiz?.stars;
    for (const b of this.buckets) b.length = 0;
    for (let i = 0; i < stars.count; i++) {
      this.px[i] = NaN;
      if (figureOnly && !stars.inFigure[i]) continue;
      if (shown && !shown[i]) continue;
      const x = stars.x[i];
      const y = stars.y[i];
      const z = stars.z[i];
      const cz = m[6] * x + m[7] * y + m[8] * z;
      if (cz < minZ) continue;
      const sinAlt = h[6] * x + h[7] * y + h[8] * z;
      let mag = stars.mag[i];
      if (sinAlt > 0) {
        const airmass = 1 / (sinAlt + 0.025 * Math.exp(-11 * sinAlt));
        mag += Math.min(4, EXTINCTION * (airmass - 1));
      } else if (st.groundOpaque) {
        continue;
      }
      if (mag > MAG_LIMIT) continue;
      if (!view.projectCam(m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, cz, pt)) continue;
      const context = target && !target[i];
      const r = radiusForMag(mag) * zoom * (context ? 0.8 : 1);
      this.px[i] = pt.x;
      this.py[i] = pt.y;
      this.pr[i] = r;
      const a = alphaForMag(mag) * (context ? 0.3 : 1);
      let ai = 0;
      while (ai < ALPHA_STEPS.length - 1 && ALPHA_STEPS[ai] < a) ai++;
      this.buckets[this.colorStep[i] * ALPHA_STEPS.length + ai].push(i);
    }
  }

  drawStars() {
    const { ctx } = this;
    // Soft halos behind the brightest stars.
    for (let i = 0; i < this.catalog.stars.count; i++) {
      if (this.catalog.stars.mag[i] > 2.2) break; // sorted bright first
      if (Number.isNaN(this.px[i])) continue;
      const r = this.pr[i] * 4.2;
      ctx.globalAlpha = Math.min(0.55, (2.4 - this.catalog.stars.mag[i]) / 5);
      ctx.drawImage(this.glows[this.colorStep[i]], this.px[i] - r, this.py[i] - r, 2 * r, 2 * r);
    }
    for (let c = 0; c < COLOR_STEPS; c++) {
      ctx.fillStyle = this.colors[c];
      for (let a = 0; a < ALPHA_STEPS.length; a++) {
        const list = this.buckets[c * ALPHA_STEPS.length + a];
        if (!list.length) continue;
        ctx.globalAlpha = ALPHA_STEPS[a];
        ctx.beginPath();
        for (const i of list) {
          const x = this.px[i];
          const y = this.py[i];
          const r = this.pr[i];
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Adds stick-figure segments to the current path, leaving a gap around each star. */
  traceSegments(segments) {
    const { ctx, px, py, pr } = this;
    for (let k = 0; k < segments.length; k += 2) {
      const a = segments[k];
      const b = segments[k + 1];
      const x1 = px[a];
      const x2 = px[b];
      if (Number.isNaN(x1) || Number.isNaN(x2)) continue;
      const y1 = py[a];
      const y2 = py[b];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ga = Math.min(len * 0.3, pr[a] + 3);
      const gb = Math.min(len * 0.3, pr[b] + 3);
      if (len - ga - gb < 1) continue;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      ctx.moveTo(x1 + ux * ga, y1 + uy * ga);
      ctx.lineTo(x2 - ux * gb, y2 - uy * gb);
    }
  }

  /** Adds closed outlines (arrays of J2000 vectors) to the current path. */
  tracePolyline(view, rings) {
    const { ctx, pt } = this;
    for (const ring of rings) {
      let pen = false;
      for (let k = 0; k <= ring.length; k++) {
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

function makeGlow(rgb) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${rgb.join(',')},0.9)`);
  grad.addColorStop(0.25, `rgba(${rgb.join(',')},0.28)`);
  grad.addColorStop(1, `rgba(${rgb.join(',')},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}
