// Stjärnhimlen: wires the sky renderer, the observer's view and the controls.
import { azAltFromVec } from './astro/frames.js';
import { clamp, mat3Apply, RAD, wrap180 } from './astro/math.js';
import { DEFAULT_PLACE_ID, PLACES } from './data/places.js';
import { GlLayer } from './render/gl-layer.js';
import { FONT_FAMILY, HudLayer } from './render/hud-layer.js';
import { buildMask, MASK_H, MASK_W } from './render/mask.js';
import { MARK_COLORS, SELECT_COLOR } from './render/palette.js';
import { SkyLayer } from './render/sky-layer.js';
import { buildCatalog } from './sky/catalog.js';
import { figureState } from './sky/facts.js';
import { MAX_FOV, MIN_FOV, SkyView } from './sky/view.js';
import { InfoCard } from './ui/info-card.js';
import { attachSkyInput } from './ui/input.js';
import { ListPanel } from './ui/list-panel.js';
import { loadSettings, saveSettings } from './ui/storage.js';
import { WhenPanel } from './ui/when-panel.js';

const DEFAULT_LAYERS = {
  lines: true,
  figureStarsOnly: false,
  art: false,
  names: true,
  bounds: false,
  starNames: true,
  milkyWay: true,
  seeThrough: false,
};
const FLY_MS = 900;

export class App {
  constructor(doc = document) {
    const $ = (id) => doc.getElementById(id);
    this.doc = doc;
    this.catalog = buildCatalog();
    const saved = loadSettings();

    this.layers = { ...DEFAULT_LAYERS };
    for (const k of Object.keys(DEFAULT_LAYERS)) if (typeof saved.layers?.[k] === 'boolean') this.layers[k] = saved.layers[k];
    this.place = PLACES.find((p) => p.id === saved.placeId) || PLACES.find((p) => p.id === DEFAULT_PLACE_ID);
    this.marks = new Map();
    this.nextColor = 0;
    for (const [id, color] of Array.isArray(saved.marks) ? saved.marks : []) {
      const c = this.catalog.byId.get(id);
      if (c && Number.isInteger(color)) {
        this.marks.set(c.index, color % MARK_COLORS.length);
        this.nextColor = Math.max(this.nextColor, color + 1);
      }
    }
    this.selected = -1;
    this.hover = -1;
    this.clock = { baseMs: Date.now(), baseAt: performance.now(), speed: 1, live: true };

    const view = new SkyView();
    view.lat = this.place.lat;
    view.lon = this.place.lon;
    if (saved.view) {
      view.az = Number(saved.view.az) || view.az;
      view.alt = Number.isFinite(saved.view.alt) ? saved.view.alt : view.alt;
      view.fov = Number(saved.view.fov) || view.fov;
    }
    this.view = view;

    this.glSky = new GlLayer($('layer-sky'), 'sky');
    this.skyLayer = new SkyLayer($('layer-stars'), this.catalog);
    this.glGround = new GlLayer($('layer-ground'), 'ground');
    this.hud = new HudLayer($('layer-hud'), this.catalog);
    this.hudCanvas = $('layer-hud');

    const img = new Image();
    img.onload = () => {
      this.glSky.setMilkyWay(img);
      this.invalidate();
    };
    img.src = this.catalog.milkyWayPng;

    this.list = new ListPanel(this, $);
    this.card = new InfoCard(this, $);
    this.when = new WhenPanel(this, $);
    this.toast = $('toast');
    this.markCount = $('mark-count');
    if (saved.onlyVisible === false) this.list.setOnlyVisible(false);

    this.toggleButtons = [...$('toggles').querySelectorAll('[data-layer]')];
    for (const b of this.toggleButtons) b.addEventListener('click', () => this.setLayer(b.dataset.layer, !this.layers[b.dataset.layer]));
    $('zoom-in').addEventListener('click', () => this.zoomAt(1 / 1.35, view.width / 2, view.height / 2));
    $('zoom-out').addEventListener('click', () => this.zoomAt(1.35, view.width / 2, view.height / 2));

    this.velocity = null;
    this.anim = null;
    attachSkyInput(this.hudCanvas, {
      grab: () => {
        this.velocity = null;
        this.anim = null;
        this.hudCanvas.classList.add('dragging');
      },
      pan: (dx, dy) => this.pan(dx, dy),
      zoom: (f, x, y) => this.zoomAt(f, x, y),
      tap: (x, y) => {
        this.hudCanvas.classList.remove('dragging');
        this.select(this.pick(x, y));
      },
      hover: (x, y) => this.setHover(this.pick(x, y)),
      leave: () => this.setHover(-1),
      fling: (vx, vy) => {
        this.velocity = { vx, vy, t: performance.now() };
      },
    });
    this.hudCanvas.addEventListener('pointerup', () => this.hudCanvas.classList.remove('dragging'));
    doc.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    doc.fonts?.load?.(`500 12px ${FONT_FAMILY}`).then(() => this.invalidate(), () => {});
    doc.fonts?.ready?.then(() => this.invalidate());

    this.maskDirty = true;
    this.dirty = true;
    this.lastDrawMs = 0;
    this.lastUiSync = 0;
    this.syncControls();
    this.resize();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------------ time & place

  /** Current sky time in Unix ms. */
  now() {
    const c = this.clock;
    return c.baseMs + (performance.now() - c.baseAt) * c.speed;
  }

  setTime(ms) {
    this.clock = { baseMs: ms, baseAt: performance.now(), speed: this.clock.speed, live: false };
    this.timeChanged();
  }

  setLive() {
    this.clock = { baseMs: Date.now(), baseAt: performance.now(), speed: 1, live: true };
    this.timeChanged();
  }

  setSpeed(speed) {
    const now = this.now();
    this.clock = { baseMs: now, baseAt: performance.now(), speed, live: this.clock.live && speed === 1 };
    this.timeChanged();
  }

  timeChanged() {
    this.invalidate();
    this.syncTimeUi(true);
  }

  setPlace(id) {
    const p = PLACES.find((q) => q.id === id);
    if (!p) return;
    this.place = p;
    this.view.lat = p.lat;
    this.view.lon = p.lon;
    this.invalidate();
    this.list.applyFilter();
    this.syncTimeUi(true);
    this.saveSoon();
  }

  // ------------------------------------------------------------------ layers & marks

  setLayer(name, on) {
    if (!(name in this.layers)) return;
    this.layers[name] = on;
    this.syncControls();
    this.card.render();
    this.invalidate();
    this.saveSoon();
  }

  toggleMark(index) {
    if (this.marks.has(index)) this.marks.delete(index);
    else this.marks.set(index, this.nextColor++ % MARK_COLORS.length);
    this.marksChanged();
  }

  markAllUp() {
    let added = 0;
    for (const c of this.catalog.constellations) {
      if (!this.marks.has(c.index) && this.figureStateOf(c) === 'up') {
        this.marks.set(c.index, this.nextColor++ % MARK_COLORS.length);
        added++;
      }
    }
    this.marksChanged();
    this.showToast(added ? `Markerade ${added} stjärnbilder som är uppe just nu` : 'Alla som är uppe är redan markerade');
  }

  clearMarks() {
    const n = this.marks.size;
    this.marks.clear();
    this.nextColor = 0;
    this.marksChanged();
    if (n) this.showToast(`Tog bort ${n} markeringar`);
  }

  marksChanged() {
    this.maskDirty = true;
    this.invalidate();
    this.list.syncAll();
    this.card.render();
    this.syncControls();
    this.saveSoon();
  }

  figureStateOf(c) {
    return figureState(c, this.view, this.catalog.starVec);
  }

  // ------------------------------------------------------------------ selection

  select(index, { fly = false } = {}) {
    if (index !== this.selected) {
      this.selected = index;
      this.maskDirty = true;
      this.invalidate();
    }
    if (index >= 0) this.card.show(index);
    else this.card.hide();
    this.list.syncAll();
    if (fly && index >= 0) {
      if (window.innerWidth <= 640) this.closeList();
      this.flyTo(index);
    }
    this.layoutChanged();
  }

  setHover(index) {
    if (index === this.hover) return;
    this.hover = index;
    this.hudCanvas.classList.toggle('pointing', index >= 0);
    this.invalidate();
  }

  /** Constellation under a CSS pixel, or -1 (empty sky never happens; ground does). */
  pick(x, y) {
    const hor = this.view.unproject(x, y);
    if (hor[2] < 0 && !this.layers.seeThrough) return -1;
    return this.catalog.constellationAt(mat3Apply(this.view.horToEq, hor));
  }

  // ------------------------------------------------------------------ camera

  pan(dx, dy) {
    const v = this.view;
    const k = RAD / v.s;
    v.az -= (dx * k) / Math.max(0.35, Math.cos((v.alt * Math.PI) / 180));
    v.alt = clamp(v.alt + dy * k, -90, 90);
    this.anim = null;
    this.invalidate();
  }

  zoomAt(factor, x, y) {
    const v = this.view;
    v.timeMs = this.now();
    v.update();
    const before = azAltFromVec(v.unproject(x, y));
    v.fov = clamp(v.fov * factor, MIN_FOV, MAX_FOV);
    for (let k = 0; k < 2; k++) {
      v.update();
      const after = azAltFromVec(v.unproject(x, y));
      v.az += wrap180(before[0] - after[0]);
      v.alt = clamp(v.alt + before[1] - after[1], -90, 90);
    }
    this.anim = null;
    this.invalidate();
  }

  flyTo(index) {
    const c = this.catalog.constellations[index];
    const v = this.view;
    v.timeMs = this.now();
    v.update();
    const [az, alt] = v.azAltOf(c.centerVec);
    // fov spans the longer screen side; fit the figure across the shorter one.
    const aspect = Math.max(v.width, v.height) / Math.min(v.width, v.height);
    const fov = clamp(c.radius * 2.5 * Math.min(aspect, 2.2), 28, MAX_FOV - 10);
    let targetAlt = this.layers.seeThrough ? alt : Math.max(alt, Math.min(fov * 0.22, 20));
    // Lift the figure above the info card.
    const card = this.card.root;
    if (!card.hidden) {
      const scale = Math.max(v.width, v.height) / (4 * Math.tan((fov * Math.PI) / 720));
      targetAlt -= ((card.offsetHeight / 2) / scale) * RAD;
    }
    const to = { az, alt: clamp(targetAlt, -85, 85), fov };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(v, to);
      this.invalidate();
      return;
    }
    this.velocity = null;
    this.anim = { from: { az: v.az, alt: v.alt, fov: v.fov }, to, t0: performance.now() };
  }

  stepCamera(t) {
    const v = this.view;
    let moving = false;
    if (this.anim) {
      const { from, to, t0 } = this.anim;
      const u = Math.min(1, (t - t0) / FLY_MS);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      v.az = from.az + wrap180(to.az - from.az) * e;
      v.alt = from.alt + (to.alt - from.alt) * e;
      v.fov = Math.exp(Math.log(from.fov) + (Math.log(to.fov) - Math.log(from.fov)) * e);
      if (u >= 1) this.anim = null;
      moving = true;
    } else if (this.velocity) {
      const dt = Math.min(48, t - this.velocity.t);
      this.velocity.t = t;
      this.pan(this.velocity.vx * dt, this.velocity.vy * dt);
      const decay = Math.pow(0.0035, dt / 1000);
      this.velocity.vx *= decay;
      this.velocity.vy *= decay;
      if (Math.hypot(this.velocity.vx, this.velocity.vy) < 0.01) this.velocity = null;
      moving = true;
    }
    if (moving) {
      this.invalidate();
      this.saveSoon();
    }
  }

  onKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    const step = e.shiftKey ? 15 : 4;
    const v = this.view;
    const keys = {
      ArrowLeft: () => { v.az -= step; },
      ArrowRight: () => { v.az += step; },
      ArrowUp: () => { v.alt = clamp(v.alt + step, -90, 90); },
      ArrowDown: () => { v.alt = clamp(v.alt - step, -90, 90); },
      '+': () => this.zoomAt(1 / 1.2, v.width / 2, v.height / 2),
      '=': () => this.zoomAt(1 / 1.2, v.width / 2, v.height / 2),
      '-': () => this.zoomAt(1.2, v.width / 2, v.height / 2),
      Escape: () => {
        if (this.list.open) this.list.toggle(false);
        else if (this.when.open) this.when.toggle(false);
        else this.select(-1);
      },
    };
    const fn = keys[e.key];
    if (!fn) return;
    e.preventDefault();
    this.anim = null;
    fn();
    this.invalidate();
  }

  // ------------------------------------------------------------------ layout & UI

  closeList() {
    if (this.list.open) this.list.toggle(false);
  }

  closeWhen() {
    if (this.when.open) this.when.toggle(false);
  }

  /** Keeps the floating card and the bottom sheet from covering each other on phones. */
  layoutChanged() {
    const narrow = window.innerWidth <= 640;
    this.card.root.style.visibility = narrow && this.list.open ? 'hidden' : '';
  }

  syncControls() {
    for (const b of this.toggleButtons) b.setAttribute('aria-pressed', String(this.layers[b.dataset.layer]));
    this.markCount.hidden = this.marks.size === 0;
    this.markCount.textContent = String(this.marks.size);
  }

  syncTimeUi(force = false) {
    this.lastUiSync = performance.now();
    this.when.sync(force);
    this.list.syncAll();
    this.card.render();
  }

  showToast(text) {
    this.toast.textContent = text;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.hidden = true;
    }, 2600);
  }

  saveSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const v = this.view;
      saveSettings({
        placeId: this.place.id,
        layers: this.layers,
        marks: [...this.marks].map(([i, color]) => [this.catalog.constellations[i].id, color]),
        view: { az: Math.round(v.az * 10) / 10, alt: Math.round(v.alt * 10) / 10, fov: Math.round(v.fov * 10) / 10 },
        onlyVisible: this.list.onlyVisible,
      });
    }, 400);
  }

  // ------------------------------------------------------------------ rendering

  invalidate() {
    this.dirty = true;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.view.setSize(w, h);
    this.glSky.resize(w, h, this.dpr);
    this.skyLayer.resize(w, h, this.dpr);
    this.glGround.resize(w, h, this.dpr);
    this.hud.resize(w, h, this.dpr);
    this.layoutChanged();
    this.invalidate();
  }

  tick(t) {
    requestAnimationFrame(this.tick);
    this.stepCamera(t);
    const speed = this.clock.speed;
    if (speed > 1 || (speed === 1 && t - this.lastDrawMs > 2000)) this.dirty = true;
    if (t - this.lastUiSync > (speed > 1 ? 250 : 1000)) this.syncTimeUi();
    if (!this.dirty) return;
    this.dirty = false;
    this.lastDrawMs = t;
    this.draw();
  }

  draw() {
    const v = this.view;
    v.timeMs = this.now();
    v.update();
    if (this.maskDirty) {
      this.maskDirty = false;
      const tints = new Map();
      for (const [i, color] of this.marks) tints.set(i, MARK_COLORS[color].rgb);
      if (this.selected >= 0 && !this.marks.has(this.selected)) tints.set(this.selected, SELECT_COLOR.rgb.map((x) => x * 0.55));
      this.glSky.setMask(MASK_W, MASK_H, buildMask(this.catalog.constellations, tints));
    }
    const st = {
      layers: this.layers,
      marks: this.marks,
      selected: this.selected,
      hover: this.hover,
      groundOpaque: !this.layers.seeThrough,
    };
    const gl = {
      scale: v.s,
      dpr: this.dpr,
      camToHor: v.camToHor,
      horToEq: v.horToEq,
      milkyWay: this.layers.milkyWay,
      groundAlpha: this.layers.seeThrough ? 0.42 : 1,
    };
    this.glSky.render(gl);
    this.skyLayer.render(v, st);
    this.glGround.render(gl);
    this.hud.render(v, st, this.skyLayer);
  }
}
