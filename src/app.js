// Stjärnhimlen: wires the sky renderer, the observer's view and the controls.
import { azAltFromVec } from './astro/frames.js';
import { angleBetween, clamp, mat3Apply, RAD, wrap180 } from './astro/math.js';
import { visibilityClass } from './astro/visibility.js';
import { DEFAULT_PLACE_ID, PLACES } from './data/places.js';
import { GlLayer } from './render/gl-layer.js';
import { FONT_FAMILY, HudLayer } from './render/hud-layer.js';
import { buildMask, MASK_H, MASK_W } from './render/mask.js';
import { CANDIDATE_COLOR, MARK_COLORS, SELECT_COLOR } from './render/palette.js';
import { SkyLayer } from './render/sky-layer.js';
import { buildCatalog } from './sky/catalog.js';
import { discoveryState, START_ID } from './sky/discovery.js';
import { figureState } from './sky/facts.js';
import { findNeighbours } from './sky/neighbours.js';
import { winterOf } from './sky/winter.js';
import { chunksOf, STAGES, stagesOf } from './sky/curriculum.js';
import { grade, nextCard, NOW_AFTER, PERMANENT, trainingProgress } from './sky/training.js';
import { DEFAULT_FOV, MAX_FOV, MIN_FOV, SkyView } from './sky/view.js';
import { DiscoverPanel } from './ui/discover-panel.js';
import { ThemePanel } from './ui/theme-panel.js';
import { TrainPanel } from './ui/train-panel.js';
import { applyTheme, DEFAULT_THEME, THEMES } from './ui/themes.js';
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
/**
 * Once a card is named, a tap on the sky or Space means "Kan för tillfället", but not this
 * soon (ms) after the tap that named it, nor as the second click of a double click, so
 * that a double click cannot skip past the name.
 */
const SECOND_TAP_MS = 400;
/**
 * Field of view for every training card: the one the sky opens with, the same each time,
 * so that no card is zoomed in on and each is seen at its true size among its neighbours.
 */
const TRAIN_FOV = DEFAULT_FOV;
/** Layers that "Träna" sets itself, step by step. */
const TRAINING_LAYERS = new Set(['lines', 'names', 'bounds', 'art']);

export class App {
  constructor(doc = document) {
    const $ = (id) => doc.getElementById(id);
    this.doc = doc;
    this.catalog = buildCatalog();
    const saved = loadSettings();

    // The chosen design goes on first, so that every panel is measured in it.
    this.theme = applyTheme(THEMES.some((t) => t.id === saved.theme) ? saved.theme : DEFAULT_THEME, doc).id;
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
    /** Per-constellation illustration choices that differ from the "Illustrationer" button. */
    this.artOverrides = new Map();
    for (const [id, shown] of Array.isArray(saved.artOverrides) ? saved.artOverrides : []) {
      const c = this.catalog.byId.get(id);
      if (c && typeof shown === 'boolean' && shown !== this.layers.art) this.artOverrides.set(c.index, shown);
    }
    /**
     * "Upptäck himlen": the sky starts with Ursa Major alone and the viewer adds
     * neighbours one at a time. `all` widens the goal from the constellations seen from
     * the chosen place to the whole sky.
     */
    const disc = saved.discover && typeof saved.discover === 'object' ? saved.discover : {};
    this.discovery = {
      on: disc.on !== false,
      all: disc.all === true,
      collapsed: disc.collapsed === true,
      // Whether "Fortsätt med resten av himlen" turned on see-through ground (a restart turns it off again).
      autoSeeThrough: disc.autoSeeThrough === true,
      found: new Set(),
    };
    for (const id of Array.isArray(disc.found) ? disc.found : []) {
      const c = this.catalog.byId.get(id);
      if (c) this.discovery.found.add(c.index);
    }
    this.discovery.found.add(this.catalog.byId.get(START_ID).index);
    this.neighbours = findNeighbours(this.catalog.constellations);
    /**
     * "Träna": flashcards with spaced repetition (see sky/training.js). cards maps the
     * constellations in play to their level, when they are due and how often they have been
     * answered; turn counts the answers; card is the one shown and step how far it is
     * revealed (1 stars, 2 lines, 3 name), and namedAt when it was named (performance.now()).
     */
    const tr = saved.training && typeof saved.training === 'object' ? saved.training : {};
    this.training = { on: tr.on === true, cards: new Map(), turn: 0, card: -1, step: 1, namedAt: 0, stars: null, below: false };
    /** Once a card is named, its lines and drawing can be turned on and off to learn the shape. */
    this.training.showLines = tr.lines !== false;
    this.training.showArt = tr.art !== false;
    /** Whether the story under a named card is open: at first only where it leaves room for the sky. */
    this.training.showStory = typeof tr.story === 'boolean' ? tr.story : window.innerWidth > 640;
    /** How far to learn: 'winter' the winter sky, 'sweden' all seen from Sweden, 'all' every one (see sky/curriculum.js). */
    this.training.goal = STAGES.some((s) => s.id === tr.goal) ? tr.goal : 'all';
    if (tr.v === 2 && Number.isInteger(tr.turn) && tr.turn >= 0) this.training.turn = tr.turn;
    for (const entry of Array.isArray(tr.cards) ? tr.cards : []) {
      const [cid, ...rest] = Array.isArray(entry) ? entry : [];
      const c = this.catalog.byId.get(cid);
      if (!c) continue;
      if (tr.v === 2) {
        const [level, dueTurn, dueAt, n] = rest;
        const levelOk = level === PERMANENT || (Number.isInteger(level) && level >= 0 && level <= NOW_AFTER.length);
        if (levelOk && Number.isInteger(dueTurn) && (dueAt === null || Number.isFinite(dueAt))) {
          this.training.cards.set(c.index, { level, dueTurn, dueAt, n: Number.isInteger(n) ? n : 1 });
        }
      } else {
        // Saved by the first version (Leitner boxes: 0 missed, then one box up for each
        // right answer): one level known for now per box, as far as the last. A card that
        // was still resting keeps its time and rests a level's worth of cards too, so that
        // old cards do not all come back at once.
        const [box, due, n] = rest;
        if (Number.isInteger(box) && box >= 0) {
          const level = Math.min(box, NOW_AFTER.length);
          const resting = level > 0 && Number.isFinite(due) && due > Date.now();
          this.training.cards.set(c.index, {
            level, dueTurn: resting ? NOW_AFTER[level - 1] : 0, dueAt: resting ? due : null, n: Number.isInteger(n) ? n : 1,
          });
        }
      }
    }
    /**
     * What "Träna" teaches: the step of each constellation (1 the winter sky, 2 the rest of
     * Sweden's, 3 the rest), worked out for the winter under way or coming in real time, and
     * the groups it comes in.
     */
    this.stages = stagesOf(this.catalog, winterOf(Date.now()));
    this.chunks = chunksOf(this.catalog);
    this.chunkOf = new Map(this.chunks.flatMap((ch) => ch.members.map((i) => [i, ch])));
    this.reveal = null;
    this.discoveryInfo = null;
    /** The constellation found last, named in the panel and on the sky until the next find. */
    this.lastFound = -1;
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
    this.discoverPanel = new DiscoverPanel(this, $);
    this.themePanel = new ThemePanel(this, $);
    this.trainPanel = new TrainPanel(this, $);
    this.toast = $('toast');
    this.brand = doc.querySelector('.brand');
    this.markCount = $('mark-count');
    // Saved before "Vinterkvällar" was a choice, the list was either filtered or not.
    const listScope = saved.listScope ?? (saved.onlyVisible === false ? 'all' : 'year');
    if (listScope !== 'year') this.list.setScope(listScope);

    this.toggleButtons = [...$('toggles').querySelectorAll('[data-layer]')];
    for (const b of this.toggleButtons) {
      b.addEventListener('click', () => {
        // Once the learner sets the ground themselves, a restart leaves it as they chose.
        if (b.dataset.layer === 'seeThrough') this.discovery.autoSeeThrough = false;
        this.setLayer(b.dataset.layer, !this.layerPressed(b.dataset.layer));
      });
    }
    $('zoom-in').addEventListener('click', () => this.zoomAt(1 / 1.35, view.width / 2, view.height / 2));
    $('zoom-out').addEventListener('click', () => this.zoomAt(1.35, view.width / 2, view.height / 2));

    this.velocity = null;
    this.anim = null;
    attachSkyInput(this.hudCanvas, {
      grab: () => {
        // A touch that stops a coasting or flying sky only stops it; it is not a tap.
        this.stoppedMotion = Boolean(this.velocity || this.anim);
        // While training, the flight to the next card lands at once rather than halfway.
        if (this.training.on && this.anim) Object.assign(this.view, this.anim.to);
        this.velocity = null;
        this.anim = null;
        this.hudCanvas.classList.add('dragging');
      },
      pan: (dx, dy) => this.pan(dx, dy),
      zoom: (f, x, y) => this.zoomAt(f, x, y),
      tap: (x, y, again) => {
        this.hudCanvas.classList.remove('dragging');
        if (this.stoppedMotion) return;
        // While training, a tap shows the next step: the lines, then the name, and then
        // says the card is known for now.
        if (this.training.on) {
          this.continueTraining(again);
          return;
        }
        // A tap only shows or hides the illustration. It never opens the info card (that
        // opens from the list) and closes it unless the tap is on the card's constellation.
        const index = this.pick(x, y);
        if (index !== this.selected) this.select(-1);
        if (index < 0) return;
        // While discovering, a tap on a neighbour with a plus adds it.
        if (this.isFound(index)) this.toggleArt(index);
        else if (this.reveal.con[index] === 2) this.discover(index);
        else this.explainHidden(index);
      },
      hover: (x, y) => this.setHover(this.pickShown(x, y)),
      leave: () => this.setHover(-1),
      fling: (vx, vy) => {
        this.velocity = { vx, vy, t: null };
      },
    });
    this.hudCanvas.addEventListener('pointerup', () => this.hudCanvas.classList.remove('dragging'));
    doc.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    this.syncSkyFont();
    doc.fonts?.ready?.then(() => this.invalidate());

    this.maskDirty = true;
    this.dirty = true;
    this.lastDrawMs = 0;
    this.lastUiSync = 0;
    this.syncControls();
    this.discoveryChanged();
    this.resize();
    // A new discovery starts by looking at Ursa Major.
    if (this.discovering && this.discovery.found.size === 1) this.flyTo(this.discovery.found.values().next().value, { instant: true });
    if (this.training.on) this.nextTrainingCard({ instant: true });
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
    this.trainingResync();
  }

  setPlace(id) {
    const p = PLACES.find((q) => q.id === id);
    if (!p) return;
    this.place = p;
    this.view.lat = p.lat;
    this.view.lon = p.lon;
    this.invalidate();
    this.list.applyFilter();
    this.discoveryChanged();
    this.trainingResync();
    if (this.training.on) this.trainPanel.render();
    this.syncTimeUi(true);
    this.saveSoon();
  }

  // ------------------------------------------------------------------ layers & marks

  setLayer(name, on) {
    if (!(name in this.layers)) return;
    this.layers[name] = on;
    // The button shows or hides every illustration, replacing choices made one by one.
    if (name === 'art') this.artOverrides.clear();
    this.syncControls();
    this.card.render();
    this.invalidate();
    this.saveSoon();
  }

  /** Whether any illustration is drawn: the whole layer, or some shown one by one. */
  anyArtShown() {
    return this.layers.art || [...this.artOverrides].some(([i, shown]) => shown && this.isFound(i));
  }

  /**
   * Pressed state of a layer button. "Illustrationer" counts as pressed while any
   * illustration is drawn, so pressing it then hides them all.
   */
  layerPressed(name) {
    return name === 'art' ? this.anyArtShown() : this.layers[name];
  }

  /** Whether a constellation's illustration is drawn. */
  artShown(index) {
    return this.artOverrides.has(index) ? this.artOverrides.get(index) : this.layers.art;
  }

  /** Shows or hides one constellation's illustration (a tap on it in the sky does this). */
  toggleArt(index) {
    const shown = !this.artShown(index);
    if (shown === this.layers.art) this.artOverrides.delete(index);
    else this.artOverrides.set(index, shown);
    this.invalidate();
    this.card.render();
    this.syncControls();
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
      if (!this.marks.has(c.index) && this.isFound(c.index) && this.figureStateOf(c) === 'up') {
        this.marks.set(c.index, this.nextColor++ % MARK_COLORS.length);
        added++;
      }
    }
    this.marksChanged();
    this.showToast(added ? `Markerade ${added} ${added === 1 ? 'stjärnbild som är uppe' : 'stjärnbilder som är uppe'} just nu` : 'Alla som är uppe är redan markerade');
  }

  /** Removes the marks that can be seen; marks on constellations still to be discovered stay. */
  clearMarks() {
    let n = 0;
    for (const i of [...this.marks.keys()]) {
      if (!this.isFound(i)) continue;
      this.marks.delete(i);
      n++;
    }
    if (!this.marks.size) this.nextColor = 0;
    this.marksChanged();
    if (n) this.showToast(`Tog bort ${n} ${n === 1 ? 'markering' : 'markeringar'}`);
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

  /**
   * Whether a constellation is one of a choice: 'year' those whose figures rise from the
   * chosen place, 'winter' the winter sky (see sky/winter.js), 'sweden' those seen from
   * somewhere in Sweden, 'all'.
   */
  inScope(index, scope) {
    if (scope === 'year') return visibilityClass(this.catalog.constellations[index].figureDecs, this.view.lat) !== 'never';
    const stage = STAGES.find((s) => s.id === scope);
    return !stage || this.stages[index] <= stage.upTo;
  }

  scopeCount(scope) {
    return this.catalog.constellations.filter((c) => this.inScope(c.index, scope)).length;
  }

  // ------------------------------------------------------------------ discovering the sky

  /** Whether a constellation is drawn: always, unless it is still to be discovered. */
  isFound(index) {
    return !this.discovering || this.discovery.found.has(index);
  }

  /** Whether the sky is being discovered now ("Träna" puts discovering on hold). */
  get discovering() {
    return this.discovery.on && !this.training.on;
  }

  setDiscover(on) {
    if (on && this.training.on) this.setTraining(false);
    if (this.discovery.on === on) return;
    this.discovery.on = on;
    this.lastFound = -1;
    this.discoveryChanged();
    if (on && this.discovery.found.size === 1) this.flyTo(this.discovery.found.values().next().value);
    this.saveSoon();
  }

  /** Adds a neighbour to the constellations found; `fly` turns the view to it if it is out of sight. */
  discover(index, { fly = false } = {}) {
    const d = this.discovery;
    if (!d.on || d.found.has(index)) return;
    d.found.add(index);
    this.lastFound = index;
    this.discoveryChanged();
    if (fly && !this.inView(index)) this.flyTo(index);
    const c = this.catalog.constellations[index];
    const state = this.layers.seeThrough ? 'up' : this.figureStateOf(c);
    if (fly && state !== 'up') {
      this.showToast(`${c.sv} är ${state === 'down' ? 'under' : 'delvis under'} horisonten just nu. Slå på Se genom marken för att se ${c.plural ? 'dem' : 'den'}.`);
    }
    this.saveSoon();
  }

  /** Goes on from the constellations seen from here to the rest of the sky, which never rise here. */
  discoverRest() {
    this.discovery.all = true;
    this.lastFound = -1;
    if (!this.layers.seeThrough) {
      this.discovery.autoSeeThrough = true;
      this.setLayer('seeThrough', true);
    }
    this.discoveryChanged();
    const next = this.discoveryInfo.next;
    if (next.length && !next.some((i) => this.inView(i))) this.flyTo(next[0]);
    this.saveSoon();
  }

  /** Says why a tap on a hidden constellation adds nothing. */
  explainHidden(index) {
    const c = this.catalog.constellations[index];
    const place = this.place.name;
    if (this.discoveryInfo.done) {
      this.showToast(`Du har hittat alla som syns från ${place}. Tryck på Fortsätt med resten av himlen för att ta med resten.`);
    } else if (!this.discovery.all && visibilityClass(c.figureDecs, this.view.lat) === 'never') {
      this.showToast(`Här finns en stjärnbild som aldrig syns från ${place}. Den kommer efter dem som syns härifrån.`);
    } else {
      this.showToast('Här finns en stjärnbild du inte har hittat än. Lägg till en granne först, de har ett plus framför namnet.');
    }
  }

  restartDiscovery() {
    const start = this.catalog.byId.get(START_ID).index;
    this.discovery.found = new Set([start]);
    this.discovery.all = false;
    this.lastFound = -1;
    if (this.discovery.autoSeeThrough && this.layers.seeThrough) this.setLayer('seeThrough', false);
    this.discovery.autoSeeThrough = false;
    this.discoveryChanged();
    this.flyTo(start);
    this.saveSoon();
  }

  // ------------------------------------------------------------------ training

  /** Turns "Träna" on or off. While training, discovering waits and the sky shows the cards. */
  setTraining(on) {
    const t = this.training;
    if (t.on === on) return;
    t.on = on;
    this.select(-1);
    this.setHover(-1);
    this.closeList();
    if (on) {
      this.nextTrainingCard({ again: t.card });
    } else {
      const wasBelow = t.below;
      this.trainingChanged();
      // Back on opaque ground, a view left looking below the horizon is lifted above it.
      if (wasBelow && !this.layers.seeThrough) {
        const v = this.view;
        const to = this.anim ? { ...this.anim.to } : { az: v.az, alt: v.alt, fov: v.fov };
        to.alt = Math.max(to.alt, Math.min(to.fov * 0.22, 20));
        this.velocity = null;
        this.anim = { from: { az: v.az, alt: v.alt, fov: v.fov }, to, t0: null };
      }
    }
    this.discoveryChanged();
    this.saveSoon();
  }

  /** Keeps the training card in view, and its ground right, after the time or the place changes. */
  trainingResync() {
    const t = this.training;
    if (!t.on || t.card < 0) return;
    if (!this.trainInGoal(t.card)) {
      this.nextTrainingCard({ instant: true });
      return;
    }
    this.anim = null;
    this.trainingChanged();
    this.flyTo(t.card, { instant: true, fov: TRAIN_FOV });
  }

  /** Constellations to learn: the steps of the curriculum as far as the goal. */
  trainInGoal(index) {
    return this.inScope(index, this.training.goal);
  }

  /** Chooses how far to learn ('winter', 'sweden' or 'all'). A card beyond it gives way to one within. */
  setTrainingGoal(goal) {
    const t = this.training;
    if (t.goal === goal || !STAGES.some((s) => s.id === goal)) return;
    t.goal = goal;
    if (t.on && (t.card < 0 || !this.trainInGoal(t.card))) this.nextTrainingCard();
    else this.trainPanel.render();
    this.saveSoon();
  }

  trainingProgress() {
    return trainingProgress(this.training.cards, (i) => this.trainInGoal(i), this.catalog.constellations.length);
  }

  /**
   * The step being learnt: the first one, as far as the goal, with a constellation not
   * known yet (or the goal's own when all are known), and how much of it, with the steps
   * before, is known.
   * @returns {{stage: object, known: number, size: number}}
   */
  trainingStage() {
    const goal = STAGES.find((s) => s.id === this.training.goal);
    const stage = STAGES.find((s) => s.upTo <= goal.upTo && trainingProgress(this.training.cards, (i) => this.inScope(i, s.id), this.stages.length).known < this.scopeCount(s.id)) || goal;
    const p = trainingProgress(this.training.cards, (i) => this.inScope(i, stage.id), this.stages.length);
    return { stage, known: p.known, size: p.goal };
  }

  /**
   * Shows the next card, with its stars only, and turns the view to it. `again` shows that
   * card once more instead (when coming back to training), if it is still one to learn.
   */
  nextTrainingCard({ instant = false, again = -1 } = {}) {
    const t = this.training;
    t.card = again >= 0 && this.trainInGoal(again)
      ? again
      : nextCard(t.cards, this.chunks.map((ch) => ch.members), (i) => this.trainInGoal(i), t.turn, Date.now(), t.card);
    t.step = 1;
    this.trainingChanged();
    if (t.card >= 0) this.flyTo(t.card, { instant, fov: TRAIN_FOV });
    this.saveSoon();
  }

  /** Shows the lines, then the name. */
  advanceTraining() {
    const t = this.training;
    if (!t.on || t.card < 0 || t.step >= 3) return;
    t.step++;
    if (t.step === 3) t.namedAt = performance.now();
    this.trainingChanged();
  }

  /** Shows the name straight away. */
  revealTraining() {
    const t = this.training;
    if (!t.on || t.card < 0 || t.step === 3) return;
    t.step = 3;
    t.namedAt = performance.now();
    this.trainingChanged();
  }

  /**
   * A tap on the sky, or Space: the next step, and once the card is named, "Kan för
   * tillfället". `again` is true for the second click of a double click.
   */
  continueTraining(again = false) {
    const t = this.training;
    if (!t.on || t.card < 0) return;
    if (t.step < 3) this.advanceTraining();
    else if (!again && performance.now() - t.namedAt >= SECOND_TAP_MS) this.answerTraining('now');
  }

  /** Records how the card went ('again', 'now' or 'permanent') and goes on to the next one. */
  answerTraining(answer) {
    const t = this.training;
    if (!t.on || t.card < 0) return;
    t.cards.set(t.card, grade(t.cards.get(t.card), answer, t.turn, Date.now()));
    t.turn++;
    this.nextTrainingCard();
  }

  /** Turns the named card's lines ('lines') or drawing ('art') on or off; the choice stays for later cards. */
  toggleTrainingView(part) {
    const t = this.training;
    if (part === 'lines') t.showLines = !t.showLines;
    else if (part === 'art') t.showArt = !t.showArt;
    else return;
    this.invalidate();
    this.trainPanel.render();
    this.saveSoon();
  }

  setTrainingStory(open) {
    if (this.training.showStory === open) return;
    this.training.showStory = open;
    this.layoutChanged();
    this.saveSoon();
  }

  restartTraining() {
    this.training.cards.clear();
    this.training.turn = 0;
    this.training.card = -1;
    this.nextTrainingCard();
  }

  /** Recomputes what the card shows: its stars, and whether the ground must be see-through. */
  trainingChanged() {
    const t = this.training;
    t.stars = null;
    t.below = false;
    if (t.on && t.card >= 0) {
      const { catalog } = this;
      const c = catalog.constellations[t.card];
      const stars = new Uint8Array(catalog.stars.count);
      for (let s = 0; s < stars.length; s++) stars[s] = catalog.stars.con[s] === t.card ? 1 : 0;
      for (const s of c.figureStars) stars[s] = 1;
      t.stars = stars;
      this.view.timeMs = this.now();
      this.view.update();
      // Low figures sink into the haze and behind the trees, so they are seen through the ground.
      t.below = c.figureStars.some((s) => this.view.altOf(catalog.starVec(s)) < 10);
    }
    this.maskDirty = true;
    this.invalidate();
    this.syncControls();
    this.trainPanel.render();
    this.layoutChanged();
  }

  /** Recomputes what is drawn while discovering, after a find, a restart, a new place or the mode changing. */
  discoveryChanged() {
    const { catalog, discovery: d } = this;
    if (this.discovering) {
      const lat = this.view.lat;
      const inGoal = (i) => d.all || visibilityClass(catalog.constellations[i].figureDecs, lat) !== 'never';
      this.discoveryInfo = discoveryState(d.found, this.neighbours, inGoal);
      const con = new Uint8Array(catalog.constellations.length);
      for (const i of this.discoveryInfo.next) con[i] = 2;
      for (const i of d.found) con[i] = 1;
      // The stars inside the constellations found, and the stars of their figures (a few
      // figures borrow a star from a neighbour).
      const stars = new Uint8Array(catalog.stars.count);
      for (let s = 0; s < stars.length; s++) stars[s] = con[catalog.stars.con[s]] === 1 ? 1 : 0;
      for (const i of d.found) for (const s of catalog.constellations[i].figureStars) stars[s] = 1;
      this.reveal = { con, stars };
    } else {
      this.discoveryInfo = null;
      this.reveal = null;
    }
    if (this.selected >= 0 && !this.isFound(this.selected)) this.select(-1);
    if (this.hover >= 0 && this.reveal && !this.reveal.con[this.hover]) this.setHover(-1);
    this.maskDirty = true;
    this.invalidate();
    this.list.syncAll();
    this.list.applyFilter();
    this.syncControls();
  }

  /** Whether a constellation's centre is in the free part of the screen, away from its edges. */
  inView(index) {
    const v = this.view;
    v.timeMs = this.now();
    v.update();
    const p = { x: 0, y: 0, z: 0 };
    const c = this.catalog.constellations[index];
    if (!v.projectEq(c.centerVec, p) || p.z < 0) return false;
    if (!this.seeThroughNow() && v.altOf(c.centerVec) < 0) return false;
    const a = this.freeArea();
    const w = a.right - a.left;
    const h = a.bottom - a.top;
    return p.x > a.left + w * 0.15 && p.x < a.right - w * 0.15 && p.y > a.top + h * 0.2 && p.y < a.bottom - h * 0.2;
  }

  /**
   * The part of the screen where the sky is not covered: the Upptäck panel takes the left
   * edge on wide screens and the top on phones, and the info card the bottom. CSS px.
   */
  freeArea() {
    const v = this.view;
    const a = { left: 0, top: 0, right: v.width, bottom: v.height };
    const narrow = window.innerWidth <= 640;
    const panel = this.modePanel();
    if (panel) {
      const r = panel.getBoundingClientRect();
      // Folded up, the Upptäck panel is a small box in the corner on wide screens.
      if (narrow) a.top = Math.min(r.bottom, v.height * 0.5);
      else if (!(panel === this.discoverPanel.root && this.discovery.collapsed)) a.left = Math.min(r.right, v.width * 0.5);
    }
    if (!narrow) {
      // The list and the time panel stand along the right edge while open.
      for (const p of [this.list.panel, this.when.panel, this.themePanel.panel]) {
        if (!p.hidden) a.right = Math.max(a.left + 200, Math.min(a.right, p.getBoundingClientRect().left));
      }
    }
    const card = this.card.root;
    if (!card.hidden && card.style.visibility !== 'hidden') a.bottom = Math.max(a.top + 100, card.getBoundingClientRect().top);
    return a;
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

  /** Whether the ground is see-through now: by choice, or for a training card below the horizon. */
  seeThroughNow() {
    return this.layers.seeThrough || (this.training.on && this.training.below);
  }

  /** Like pick, but -1 for a constellation that is hidden while discovering, and while training. */
  pickShown(x, y) {
    if (this.training.on) return -1;
    const index = this.pick(x, y);
    return index >= 0 && this.reveal && !this.reveal.con[index] ? -1 : index;
  }

  /** Constellation under a CSS pixel, or -1 (empty sky never happens; ground does). */
  pick(x, y) {
    const hor = this.view.unproject(x, y);
    if (hor[2] < 0 && !this.seeThroughNow()) return -1;
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

  /** Turns the view to a constellation, framed to fit it unless a field of view is given. */
  flyTo(index, { instant = false, fov: fixedFov = null } = {}) {
    const c = this.catalog.constellations[index];
    const v = this.view;
    v.timeMs = this.now();
    v.update();
    const [az, alt] = v.azAltOf(c.centerVec);
    // fov spans the longer screen side; fit the figure across the shorter one.
    const aspect = Math.max(v.width, v.height) / Math.min(v.width, v.height);
    // Frame the name as well as the figure (Cassiopeja's sits well outside its W).
    const reach = Math.max(c.radius, Math.min(...c.labelVecs.map((l) => angleBetween(c.centerVec, l))) + 2);
    const fov = fixedFov ?? clamp(reach * 2.5 * Math.min(aspect, 2.2), 28, MAX_FOV - 10);
    let targetAlt = this.seeThroughNow() ? alt : Math.max(alt, Math.min(fov * 0.22, 20));
    // Centre the figure in the sky left free by the panel and the info card.
    const free = this.freeArea();
    const scale = Math.max(v.width, v.height) / (4 * Math.tan((fov * Math.PI) / 720));
    targetAlt += (((free.top + free.bottom - v.height) / 2) / scale) * RAD;
    const shift = (((free.left + free.right - v.width) / 2) / scale) * RAD;
    const targetAz = az - shift / Math.max(0.35, Math.cos((clamp(targetAlt, -85, 85) * Math.PI) / 180));
    const to = { az: targetAz, alt: clamp(targetAlt, -85, 85), fov };
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(v, to);
      this.invalidate();
      return;
    }
    this.velocity = null;
    // t0 comes from the first frame, so that a flight is timed by frame timestamps alone.
    this.anim = { from: { az: v.az, alt: v.alt, fov: v.fov }, to, t0: null };
  }

  stepCamera(t) {
    const v = this.view;
    let moving = false;
    if (this.anim) {
      if (this.anim.t0 === null) this.anim.t0 = t;
      const { from, to, t0 } = this.anim;
      const u = clamp((t - t0) / FLY_MS, 0, 1);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      v.az = from.az + wrap180(to.az - from.az) * e;
      v.alt = from.alt + (to.alt - from.alt) * e;
      v.fov = Math.exp(Math.log(from.fov) + (Math.log(to.fov) - Math.log(from.fov)) * e);
      if (u >= 1) this.anim = null;
      moving = true;
    } else if (this.velocity) {
      if (this.velocity.t === null) this.velocity.t = t;
      const dt = clamp(t - this.velocity.t, 0, 48);
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
      // Keys belong to the field, but Escape leaves it. In the design list (radio buttons)
      // Escape goes on to close the list, as it does from anywhere else.
      if (e.key !== 'Escape') return;
      t.blur();
      if (t.type !== 'radio') return;
    }
    // Training: Space does what a tap on the sky does (the next step, and once the card is
    // named, Kan för tillfället), once per press: held down it goes no further. 1, 2 and 3
    // answer Fel, Kan för tillfället and Kan permanent. Space on a button or the story's
    // heading is theirs.
    const tr = this.training;
    if (tr.on && tr.card >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const answer = { 1: 'again', 2: 'now', 3: 'permanent' }[e.key];
      if (e.key === ' ' && !(t && t.closest && t.closest('button, summary'))) {
        e.preventDefault();
        if (!e.repeat) this.continueTraining();
        return;
      }
      if (answer && tr.step === 3) {
        e.preventDefault();
        this.answerTraining(answer);
        return;
      }
      // L and B turn the named card's lines and drawing (bild) on and off.
      const part = { l: 'lines', b: 'art' }[e.key.toLowerCase()];
      if (part && tr.step === 3) {
        e.preventDefault();
        this.toggleTrainingView(part);
        return;
      }
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
        if (this.themePanel.open) this.themePanel.toggle(false);
        else if (this.list.open) this.list.toggle(false);
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

  closeTheme() {
    if (this.themePanel.open) this.themePanel.toggle(false);
  }

  /** Switches the interface design (the sky itself stays the same). */
  setTheme(id) {
    this.theme = applyTheme(id, this.doc).id;
    this.themePanel.sync();
    this.syncSkyFont();
    this.discoverPanel.render();
    this.layoutChanged();
    this.saveSoon();
  }

  /** The names on the sky use the design's --sky-font, redrawn once it has loaded. */
  syncSkyFont() {
    const font = getComputedStyle(this.doc.documentElement).getPropertyValue('--sky-font').trim() || FONT_FAMILY;
    this.hud.fontFamily = font;
    this.doc.fonts?.load?.(`500 12px ${font}`).then(() => this.invalidate(), () => {});
    this.invalidate();
  }

  closeWhen() {
    if (this.when.open) this.when.toggle(false);
  }

  /** Keeps the floating card and the bottom sheet from covering each other on phones. */
  layoutChanged() {
    const narrow = window.innerWidth <= 640;
    this.card.root.style.visibility = narrow && this.list.open ? 'hidden' : '';
    // Below laptop widths the list and the Upptäck panel would leave little sky between them.
    const crowded = this.list.open && window.innerWidth <= 1100;
    const covered = crowded || (narrow && (this.when.open || this.themePanel.open));
    for (const p of [this.discoverPanel.root, this.trainPanel.root]) p.style.visibility = covered ? 'hidden' : '';
    this.placeToast();
    // Names keep clear of the panel, so they are drawn again when it comes or goes.
    this.invalidate();
  }

  syncControls() {
    // While training, the cards decide on lines, names, boundaries and drawings.
    for (const b of this.toggleButtons) {
      const byCards = this.training.on && TRAINING_LAYERS.has(b.dataset.layer);
      b.disabled = byCards;
      b.setAttribute('aria-pressed', String(!byCards && this.layerPressed(b.dataset.layer)));
      if (b.dataset.title === undefined) b.dataset.title = b.title;
      b.title = byCards ? 'Styrs av Träna just nu' : b.dataset.title;
    }
    // Marks on constellations still to be discovered are kept but not counted.
    let marks = 0;
    for (const i of this.marks.keys()) if (this.isFound(i)) marks++;
    this.markCount.hidden = marks === 0;
    this.markCount.textContent = String(marks);
    this.discoverPanel.render();
  }

  syncTimeUi(force = false) {
    this.lastUiSync = performance.now();
    // Up/down states below are read off the view, so bring it to the current time first.
    this.view.timeMs = this.now();
    this.view.update();
    this.when.sync(force);
    this.list.syncAll();
    this.card.render();
    this.discoverPanel.syncStates();
  }

  showToast(text) {
    this.toast.textContent = text;
    this.toast.hidden = false;
    this.placeToast();
    clearTimeout(this.toastTimer);
    // Long enough to read: about 18 characters a second.
    this.toastTimer = setTimeout(() => {
      this.toast.hidden = true;
    }, Math.min(8000, Math.max(2600, 1500 + 55 * text.length)));
  }

  /** Keeps a note clear of the Upptäck panel: below it on phones, beside it on wider screens. */
  placeToast() {
    if (!this.toast || this.toast.hidden) return;
    const st = this.toast.style;
    st.top = '';
    st.left = '';
    st.maxWidth = '';
    const panel = this.modePanel();
    if (!panel) return;
    const p = panel.getBoundingClientRect();
    const t = this.toast.getBoundingClientRect();
    if (!(t.left < p.right && p.left < t.right && t.top < p.bottom)) return;
    if (window.innerWidth <= 640) {
      st.top = `${Math.round(p.bottom + 8)}px`;
    } else {
      st.left = `${Math.round((p.right + window.innerWidth) / 2)}px`;
      st.maxWidth = `${Math.round(window.innerWidth - p.right - 32)}px`;
    }
  }

  saveSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const v = this.view;
      saveSettings({
        placeId: this.place.id,
        layers: this.layers,
        marks: [...this.marks].map(([i, color]) => [this.catalog.constellations[i].id, color]),
        artOverrides: [...this.artOverrides].map(([i, shown]) => [this.catalog.constellations[i].id, shown]),
        discover: {
          on: this.discovery.on,
          all: this.discovery.all,
          collapsed: this.discovery.collapsed,
          autoSeeThrough: this.discovery.autoSeeThrough,
          found: [...this.discovery.found].map((i) => this.catalog.constellations[i].id),
        },
        view: { az: Math.round(v.az * 10) / 10, alt: Math.round(v.alt * 10) / 10, fov: Math.round(v.fov * 10) / 10 },
        listScope: this.list.scope,
        theme: this.theme,
        training: {
          v: 2,
          on: this.training.on,
          turn: this.training.turn,
          lines: this.training.showLines,
          art: this.training.showArt,
          story: this.training.showStory,
          goal: this.training.goal,
          cards: [...this.training.cards].map(([i, c]) => [this.catalog.constellations[i].id, c.level, c.dueTurn, c.dueAt, c.n]),
        },
      });
    }, 400);
  }

  // ------------------------------------------------------------------ rendering

  /** Tints of marked, selected and offered constellations, for the sky's mask. */
  fillTints(tints) {
    for (const [i, color] of this.marks) if (this.isFound(i)) tints.set(i, MARK_COLORS[color].rgb);
    if (this.selected >= 0 && !this.marks.has(this.selected)) tints.set(this.selected, SELECT_COLOR.rgb.map((x) => x * 0.55));
    if (this.discoveryInfo) for (const i of this.discoveryInfo.next) tints.set(i, CANDIDATE_COLOR.rgb.map((x) => x * 0.2));
  }

  /** Screen boxes constellation names keep clear of: the brand and the Upptäck panel. */
  labelObstacles() {
    const out = [this.brand.getBoundingClientRect()];
    const panel = this.modePanel();
    if (panel) out.push(panel.getBoundingClientRect());
    return out;
  }

  /** The panel of the game being played (Upptäck or Träna) while it is on screen, or null. */
  modePanel() {
    for (const p of [this.trainPanel.root, this.discoverPanel.root]) {
      if (!p.hidden && p.style.visibility !== 'hidden') return p;
    }
    return null;
  }

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
    // While training, the sky shows the card and nothing else: no marks, tints or hover.
    const t = this.training;
    const quiz = t.on && t.card >= 0 ? {
      target: t.card,
      step: t.step,
      stars: t.stars,
      // Lines from the second step; once named, lines and drawing as the learner has them.
      lines: t.step === 2 || (t.step === 3 && t.showLines),
      art: t.step === 3 && t.showArt,
    } : null;
    if (this.maskDirty) {
      this.maskDirty = false;
      const tints = new Map();
      if (!quiz) this.fillTints(tints);
      this.glSky.setMask(MASK_W, MASK_H, buildMask(this.catalog.constellations, tints));
    }
    const st = quiz ? {
      layers: this.layers,
      marks: new Map(),
      selected: -1,
      hover: -1,
      groundOpaque: !this.seeThroughNow(),
      artShown: (i) => quiz.art && i === quiz.target,
      anyArt: quiz.art,
      reveal: null,
      recent: -1,
      avoid: this.labelObstacles(),
      quiz,
    } : {
      layers: this.layers,
      marks: this.reveal ? new Map([...this.marks].filter(([i]) => this.isFound(i))) : this.marks,
      selected: this.selected,
      hover: this.hover,
      groundOpaque: !this.seeThroughNow(),
      artShown: (i) => this.isFound(i) && this.artShown(i),
      anyArt: this.anyArtShown(),
      reveal: this.reveal,
      recent: this.reveal ? this.lastFound : -1,
      avoid: this.labelObstacles(),
      quiz: null,
    };
    const gl = {
      scale: v.s,
      dpr: this.dpr,
      camToHor: v.camToHor,
      horToEq: v.horToEq,
      milkyWay: this.layers.milkyWay,
      groundAlpha: this.seeThroughNow() ? 0.42 : 1,
    };
    this.glSky.render(gl);
    this.skyLayer.render(v, st);
    this.glGround.render(gl);
    this.hud.render(v, st, this.skyLayer);
  }
}
