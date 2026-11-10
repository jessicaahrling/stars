// "Sikt": how faint the faintest stars seen are. A gauge to drag down for a hazier sky or
// a brighter town, and up for a darker one. Beside it a graph counts the stars in each
// half magnitude, lit up as far as the limit chosen, and the places and skies along it
// can be chosen directly.
import { CATALOG_FAINTEST } from '../render/sky-layer.js';

/** The brightest limit: only the brightest stars of all are left. */
export const LIMIT_MIN = 1;
/** The darkest sky: every star in the catalogue. */
export const LIMIT_MAX = CATALOG_FAINTEST;
/** Tenths of a magnitude. */
const STEP = 0.1;
const BIN = 0.5;

/** Skies, and about how faint the faintest stars seen under them are. */
export const SKY_PRESETS = [
  { mag: 6, name: 'Mörk himmel på landet' },
  { mag: 5.3, name: 'Förort' },
  { mag: 4.5, name: 'Stad' },
  { mag: 3.6, name: 'Mitt i storstan' },
  { mag: 2.6, name: 'Disigt eller tunna moln' },
  { mag: 1, name: 'Bara de klaraste' },
];

/** A magnitude as written in Swedish, one decimal ("4,5"). */
export const formatMag = (m) => m.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A limit kept within the gauge and to its steps. */
export const clampLimit = (m) => Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.round(m * 10) / 10));

/** Height on the gauge, from its foot, as a percentage. */
const at = (m) => `${(((m - LIMIT_MIN) / (LIMIT_MAX - LIMIT_MIN)) * 100).toFixed(2)}%`;

export class SkyPanel {
  /**
   * @param {object} app  see App: catalog, limitMag, setLimitMag, closeList, closeWhen, closeTheme, closeGroups, layoutChanged
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.panel = $('panel-sky');
    this.button = $('btn-sky');
    this.meter = $('sky-meter');
    this.handle = $('sky-handle');
    this.readout = $('sky-readout');
    const mags = app.catalog.stars.mag;
    this.mags = mags;

    // The graph: one bar per half magnitude, as long as the square root of its count, so
    // that the few brightest still show beside the thousands of faint ones.
    this.bins = [];
    for (let lo = LIMIT_MIN; lo < LIMIT_MAX - 1e-6; lo += BIN) {
      let n = 0;
      for (const m of mags) if (m > lo && m <= lo + BIN) n++;
      this.bins.push({ lo, n });
    }
    const most = Math.max(...this.bins.map((b) => b.n));
    const bars = $('sky-bars');
    for (const b of this.bins) {
      const el = document.createElement('span');
      el.className = 'sky-bar';
      el.style.bottom = at(b.lo);
      el.style.height = `calc(${at(LIMIT_MIN + BIN)} - 2px)`;
      el.style.width = `${(10 + 90 * Math.sqrt(b.n / most)).toFixed(1)}%`;
      b.el = el;
      bars.append(el);
    }
    // The skies along the gauge, each a button that sets its limit.
    const scale = $('sky-scale');
    this.presets = SKY_PRESETS.map((p) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sky-preset';
      el.style.bottom = at(p.mag);
      el.textContent = p.name;
      el.addEventListener('click', () => app.setLimitMag(p.mag));
      scale.append(el);
      return { ...p, el };
    });

    // Dragging anywhere on the gauge moves the limit there.
    const fromPointer = (e) => {
      const r = this.meter.getBoundingClientRect();
      const frac = (r.bottom - e.clientY) / r.height;
      app.setLimitMag(LIMIT_MIN + Math.min(1, Math.max(0, frac)) * (LIMIT_MAX - LIMIT_MIN));
    };
    this.meter.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.meter.focus();
      this.meter.setPointerCapture?.(e.pointerId);
      this.dragging = e.pointerId;
      fromPointer(e);
    });
    this.meter.addEventListener('pointermove', (e) => {
      if (this.dragging === e.pointerId) fromPointer(e);
    });
    const stop = (e) => {
      if (this.dragging === e.pointerId) this.dragging = null;
    };
    this.meter.addEventListener('pointerup', stop);
    this.meter.addEventListener('pointercancel', stop);
    // The keys of a slider: up for more stars, down for fewer.
    this.meter.addEventListener('keydown', (e) => {
      const m = app.limitMag;
      const to = {
        ArrowUp: m + STEP, ArrowRight: m + STEP, ArrowDown: m - STEP, ArrowLeft: m - STEP,
        PageUp: m + BIN, PageDown: m - BIN, Home: LIMIT_MIN, End: LIMIT_MAX,
      }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      app.setLimitMag(to);
    });

    this.button.addEventListener('click', () => this.toggle());
    $('btn-sky-close').addEventListener('click', () => {
      this.toggle(false);
      this.button.focus();
    });
  }

  get open() {
    return !this.panel.hidden;
  }

  toggle(force) {
    const open = force ?? this.panel.hidden;
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.app.closeList();
      this.app.closeWhen();
      this.app.closeTheme();
      this.app.closeGroups();
      this.sync();
    }
    this.app.layoutChanged();
  }

  /** How many stars of the whole sky are at least as bright as a limit. */
  countTo(limit) {
    if (limit >= LIMIT_MAX) return this.mags.length;
    let n = 0;
    for (const m of this.mags) if (m <= limit) n++;
    return n;
  }

  /** The sky named along the gauge nearest a limit. */
  presetFor(limit) {
    return this.presets.reduce((best, p) => (Math.abs(p.mag - limit) < Math.abs(best.mag - limit) ? p : best));
  }

  sync() {
    const limit = this.app.limitMag;
    const all = limit >= LIMIT_MAX;
    this.button.classList.toggle('limited', !all);
    this.button.title = all ? 'Sikt: alla stjärnor syns, som på en mörk himmel' : `Sikt: stjärnor ner till magnitud ${formatMag(limit)}`;
    if (this.panel.hidden) return;
    const count = this.countTo(limit).toLocaleString('sv-SE');
    const sky = this.presetFor(limit);
    this.handle.style.bottom = at(limit);
    for (const b of this.bins) b.el.classList.toggle('lit', b.lo < limit - 1e-6);
    for (const p of this.presets) p.el.setAttribute('aria-pressed', String(p === sky && Math.abs(p.mag - limit) < 0.05));
    this.meter.setAttribute('aria-valuenow', limit.toFixed(1));
    this.meter.setAttribute('aria-valuemin', String(LIMIT_MIN));
    this.meter.setAttribute('aria-valuemax', String(LIMIT_MAX));
    this.meter.setAttribute('aria-valuetext', `Magnitud ${formatMag(limit)}, ${sky.name.toLowerCase()}, ${count} stjärnor`);
    this.readout.textContent = all ? `Alla ${count} stjärnor syns, ner till magnitud ${formatMag(limit)}.`
      : `${count} stjärnor syns, ner till magnitud ${formatMag(limit)}.`;
  }
}
