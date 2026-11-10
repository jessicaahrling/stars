// Stjärnhimlen: wires the sky renderer, the observer's view and the controls.
import { azAltFromVec } from './astro/frames.js';
import { angleBetween, clamp, mat3Apply, RAD, wrap180 } from './astro/math.js';
import { visibilityClass } from './astro/visibility.js';
import { DEFAULT_PLACE_ID, PLACES } from './data/places.js';
import { GlLayer } from './render/gl-layer.js';
import { FONT_FAMILY, HudLayer } from './render/hud-layer.js';
import { buildMask, MASK_H, MASK_W } from './render/mask.js';
import { GROUP_COLORS, MARK_COLORS, SELECT_COLOR } from './render/palette.js';
import { SkyLayer } from './render/sky-layer.js';
import { buildCatalog } from './sky/catalog.js';
import { groupColors, groupNeighbours } from './sky/discovery.js';
import { figureState } from './sky/facts.js';
import { groupOutline } from './sky/group-outline.js';
import { findNeighbours } from './sky/neighbours.js';
import { winterOf } from './sky/winter.js';
import { chunksOf, STAGES, stagesOf } from './sky/curriculum.js';
import {
  afterPractice, grade, groupToLearn, isDue, nextCard, NOW_AFTER, PERMANENT, practiceRound, stageLearnt, takeUp, trainingProgress,
} from './sky/training.js';
import { DEFAULT_FOV, MAX_FOV, MIN_FOV, SkyView } from './sky/view.js';
import { DiscoverPanel } from './ui/discover-panel.js';
import { OverviewPanel } from './ui/overview-panel.js';
import { ThemePanel } from './ui/theme-panel.js';
import { TrainPanel } from './ui/train-panel.js';
import { GroupsPanel } from './ui/groups-panel.js';
import { applyTheme, DEFAULT_THEME, THEMES } from './ui/themes.js';
import { celebrate } from './ui/confetti.js';
import { clampLimit, LIMIT_MAX, SkyPanel } from './ui/sky-panel.js';
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
const TRAINING_LAYERS = new Set(['lines', 'names', 'art']);
/** Layers that Upptäck keeps its own: for every group, or else for the one pointed at or chosen. */
const DISCOVER_LAYERS = new Set(['lines', 'names']);
const DISCOVER_TITLES = {
  lines: 'Linjerna i alla grupper. Annars syns de i gruppen du pekar på eller har valt.',
  names: 'Namnen på alla stjärnbilder. Annars syns de i gruppen du pekar på eller har valt.',
};
/** How strongly a group in Upptäck is tinted with its colour (the mask adds a sixth of it), and the one chosen. */
const GROUP_TINT = 0.55;
const GROUP_TINT_CHOSEN = 1;

export class App {
  constructor(doc = document) {
    const $ = (id) => doc.getElementById(id);
    this.doc = doc;
    this.catalog = buildCatalog();
    const saved = loadSettings();

    // The chosen design goes on first, so that every panel is measured in it.
    // Saved before the playful design came (themes: 2), 'glas' was the default rather than a
    // choice, so the new default takes its place; any other design chosen stays.
    const savedTheme = saved.theme === 'glas' && saved.themes !== 2 ? null : saved.theme;
    this.theme = applyTheme(THEMES.some((t) => t.id === savedTheme) ? savedTheme : DEFAULT_THEME, doc).id;
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
     * "Upptäck himlen": the sky as its groups (as "Träna" has them), every group within the
     * list's filter drawn with a line round it, a colour and a name. The lines and names of
     * a group's constellations show for the group pointed at and the one chosen (`group`, an
     * index into chunks, or -1), or for every group when `lines` and `names` are on (the
     * bar's "Linjer" and "Namn" while discovering). The boundaries are Upptäck's own choice
     * too: round each group (`boundsBy` 'group'), round each constellation, or none
     * (`showBounds`), turned off and on by the bar's "Gränser".
     */
    /**
     * "Överblick": the sky with its constellations to look at, filtered as the list is,
     * their pictures on or off; a tap opens a constellation's card. On or off, never
     * together with Upptäck or Träna.
     */
    this.overview = { on: saved.overview?.on === true };
    /** "Sikt": the faintest magnitude seen, LIMIT_MAX (every star) unless brought down for a hazier or brighter sky. */
    this.limitMag = Number.isFinite(saved.limitMag) ? clampLimit(saved.limitMag) : LIMIT_MAX;
    const disc = saved.discover && typeof saved.discover === 'object' ? saved.discover : {};
    // Saved before Upptäck was about groups, the boundaries were the layer's, and round each
    // constellation unless chosen otherwise: now they are round the groups. (What was found
    // then, constellation by constellation, is not needed any more: every group shows.)
    const byGroups = disc.byGroups === true;
    this.discovery = {
      on: disc.on !== false,
      collapsed: disc.collapsed === true,
      boundsBy: byGroups && disc.boundsBy === 'constellation' ? 'constellation' : 'group',
      showBounds: !byGroups || disc.showBounds !== false,
      lines: disc.lines === true,
      names: disc.names === true,
      group: -1,
    };
    this.neighbours = findNeighbours(this.catalog.constellations);
    /** The boundary round each group, by group index, worked out when first drawn. */
    this.groupOutlines = new Map();
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
    /** Whether the boundary round the group being learnt is drawn, at every step: until turned off. */
    this.training.showBounds = tr.bounds !== false;
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
    /** By constellation index, the index of its group; the groups that border each other; their colours on the sky. */
    this.groupIndexOf = new Map(this.chunks.flatMap((ch, g) => ch.members.map((i) => [i, g])));
    this.groupNb = groupNeighbours(this.chunks, this.neighbours);
    this.groupHue = groupColors(this.groupNb, GROUP_COLORS.length);
    this.discovery.group = this.chunks.findIndex((ch) => ch.name === disc.group);
    /**
     * The group being learnt (an index into chunks, or -1 for the first not learnt yet),
     * its members answered since it was taken up, and, for the card after a group has been
     * learnt, a word about it.
     */
    const group = this.chunks.findIndex((ch) => ch.name === tr.group);
    this.training.group = group;
    const seen = group >= 0 && Array.isArray(tr.seen) ? tr.seen.map((id) => this.catalog.byId.get(id)?.index) : [];
    this.training.groupSeen = new Set(seen.filter((i) => group >= 0 && this.chunks[group].members.includes(i)));
    /** A whole group shown together ({group, kind: 'done' | 'intro'}), between cards, or null. */
    this.training.view = null;
    /** The group last shown whole as it was taken up, so that it is not shown again before its first card. */
    this.training.introduced = -1;
    /** The steps learnt in full ('winter', 'sweden', 'all'): each milestone is celebrated once. */
    this.training.milestones = new Set((Array.isArray(tr.milestones) ? tr.milestones : []).filter((id) => STAGES.some((st) => st.id === id)));
    /**
     * A practice round over a step learnt, or null: the step, the cards still to come (the
     * first is shown; a miss comes back a little later), how many it began with, and those
     * missed on the way.
     */
    this.training.practice = null;
    const pr = tr.practice && typeof tr.practice === 'object' ? tr.practice : null;
    if (pr && this.training.milestones.has(pr.stage) && Array.isArray(pr.queue)) {
      const indices = (list) => (Array.isArray(list) ? list : []).map((id) => this.catalog.byId.get(id)?.index).filter((i) => i !== undefined);
      const queue = indices(pr.queue);
      if (queue.length) {
        this.training.practice = {
          stage: pr.stage, queue, total: Number.isInteger(pr.total) && pr.total >= queue.length ? pr.total : queue.length,
          missed: new Set(indices(pr.missed)),
        };
      }
    }
    this.reveal = null;
    /** The groups shown while discovering, as drawn (see groupShape), or none. */
    this.shownGroups = [];
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
    this.overviewPanel = new OverviewPanel(this, $);
    this.themePanel = new ThemePanel(this, $);
    this.skyPanel = new SkyPanel(this, $);
    this.skyPanel.sync();
    this.trainPanel = new TrainPanel(this, $);
    this.groupsPanel = new GroupsPanel(this, $);
    // The card is fitted again whenever it or a game's panel changes size (see fitCard),
    // a frame later so that the fitting does not resize what is being observed.
    if (typeof ResizeObserver === 'function') {
      const fit = new ResizeObserver(() => requestAnimationFrame(() => {
        this.fitCard();
        this.placeToast();
      }));
      for (const el of [this.card.root, this.discoverPanel.root, this.trainPanel.root, this.overviewPanel.root]) fit.observe(el);
    }
    this.toast = $('toast');
    this.brand = doc.querySelector('.brand');
    this.markCount = $('mark-count');
    // Saved before "Vinterkvällar" was a choice, the list was either filtered or not.
    const listScope = saved.listScope ?? (saved.onlyVisible === false ? 'all' : 'year');
    if (listScope !== 'year') this.list.setScope(listScope);

    this.toggleButtons = [...$('toggles').querySelectorAll('[data-layer]')];
    for (const b of this.toggleButtons) {
      b.addEventListener('click', (e) => {
        // While training, "Gränser" is the boundary round the group. Clicked, focus goes
        // back to the card, so that Space goes on with it rather than pressing this again.
        if (this.training.on && b.dataset.layer === 'bounds') {
          this.toggleTrainingView('bounds');
          if (e.detail) this.trainPanel.focusCard();
        } else if (this.discovering && b.dataset.layer === 'bounds') {
          // While discovering, "Gränser" is Upptäck's choice of boundaries, off or as chosen.
          this.setDiscoverBounds(this.discovery.showBounds ? 'none' : this.discovery.boundsBy);
        } else if (this.discovering && DISCOVER_LAYERS.has(b.dataset.layer)) {
          // And "Linjer" and "Namn" are for every group, not only the one pointed at.
          this.setDiscoverAll(b.dataset.layer, !this.discovery[b.dataset.layer]);
        } else this.setLayer(b.dataset.layer, !this.layerPressed(b.dataset.layer));
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
        const index = this.pick(x, y);
        // In the overview a tap opens the constellation's card and turns the view so that the
        // figure stands in the sky left free above it; a second tap closes it, and so does a
        // tap on one left out.
        if (this.overviewing) {
          if (index >= 0 && index === this.selected) this.select(-1);
          else if (index >= 0 && this.isFound(index)) {
            this.select(index);
            this.flyTo(index, { fov: this.view.fov });
          } else {
            this.select(-1);
            if (index >= 0) this.explainLeftOut(index);
          }
          return;
        }
        // While discovering, a tap chooses the group, so that its constellations keep their
        // lines and names and the panel tells about it; a second tap lets it go again, and so
        // does a tap beside the groups shown.
        if (this.discovering) {
          // The second click of a double click does not let go what the first chose.
          if (again) return;
          if (index !== this.selected) this.select(-1);
          const g = index >= 0 && this.isFound(index) ? this.groupIndexOf.get(index) : -1;
          this.chooseGroup(g === this.discovery.group ? -1 : g);
          if (index >= 0 && g < 0) this.explainLeftOut(index);
          return;
        }
        // Elsewhere a tap only shows or hides the illustration. It never opens the info card
        // (that opens from the list) and closes it unless the tap is on the card's constellation.
        if (index !== this.selected) this.select(-1);
        if (index >= 0) this.toggleArt(index);
      },
      hover: (x, y) => this.setHover(this.pickShown(x, y)),
      leave: () => {
        this.pointer = null;
        this.setHover(-1);
      },
      fling: (vx, vy) => {
        this.velocity = { vx, vy, t: null };
      },
    });
    this.hudCanvas.addEventListener('pointerup', () => this.hudCanvas.classList.remove('dragging'));
    // Where the mouse is over the sky, so that what it points at is found again when the
    // sky moves under it (a flight, a fling, the keys, the clock): in Upptäck that is a
    // whole group lit up.
    this.pointer = null;
    const track = (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = this.hudCanvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top, held: e.type !== 'pointerup' && e.buttons !== 0 };
    };
    for (const type of ['pointermove', 'pointerdown', 'pointerup']) this.hudCanvas.addEventListener(type, track);
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

  /** Removes the marks. */
  clearMarks() {
    const n = this.marks.size;
    this.marks.clear();
    this.nextColor = 0;
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

  /** Whether a group is within a choice of the list's filter: when any of it is (see inScope). */
  groupInScope(g, scope) {
    return this.chunks[g].members.some((i) => this.inScope(i, scope));
  }

  /** How many groups a choice of the list's filter takes in. */
  groupScopeCount(scope) {
    return this.chunks.filter((ch, g) => this.groupInScope(g, scope)).length;
  }

  // ------------------------------------------------------------------ discovering the sky

  /**
   * Whether a constellation is drawn: always, unless the list's filter leaves it out of the
   * overview, or leaves its group out of Upptäck.
   */
  isFound(index) {
    if (this.discovering) return !this.reveal || this.reveal.con[index] === 1;
    if (this.overviewing) return this.inScope(index, this.list.scope);
    return true;
  }

  /** Whether the overview is on: the sky to look at, filtered as the list is. */
  get overviewing() {
    return this.overview.on && !this.training.on && !this.discovering;
  }

  /** Turns "Överblick" on or off; on, it ends discovering and training (each keeps its progress). */
  setOverview(on) {
    if (on && this.training.on) this.setTraining(false);
    if (on && this.discovery.on) this.setDiscover(false);
    if (this.overview.on === on) return;
    this.overview.on = on;
    this.discoveryChanged();
    this.saveSoon();
  }

  /** The list's filter has changed: in the overview and in Upptäck it is what the sky shows. */
  listScopeChanged() {
    // The filter saved is set while the app is still being put together: drawn later anyway.
    if (!this.toggleButtons) return;
    if (this.overviewing || this.discovering) this.discoveryChanged();
    else {
      this.overviewPanel.render();
      this.discoverPanel.render();
    }
  }

  /** Says why a tap on a constellation left out by the list's filter opens nothing. */
  explainLeftOut(index) {
    const c = this.catalog.constellations[index];
    const why = this.list.scope === 'winter' ? `${c.sv} hör inte till vinterhimlen.` : `${c.sv} syns aldrig från ${this.place.name}.`;
    this.showToast(`${why} Välj Alla för att se ${c.plural ? 'dem' : 'den'}.`);
  }

  /** Whether the sky is being discovered now ("Träna" puts discovering on hold). */
  get discovering() {
    return this.discovery.on && !this.training.on;
  }

  setDiscover(on) {
    if (on && this.training.on) this.setTraining(false);
    if (on) this.overview.on = false;
    if (this.discovery.on === on) return;
    this.discovery.on = on;
    this.discoveryChanged();
    this.saveSoon();
  }

  /**
   * Chooses a group (an index into chunks, or -1 for none): its constellations keep their
   * lines and names and the panel tells about it. `fly` turns the view to it unless all of
   * it is in sight, and says so if it is all below the horizon.
   */
  chooseGroup(g, { fly = false } = {}) {
    const d = this.discovery;
    if (!(g >= 0 && g < this.chunks.length && this.discovering && this.groupInScope(g, this.list.scope))) g = -1;
    if (d.group !== g) {
      d.group = g;
      this.maskDirty = true;
      this.invalidate();
      this.discoverPanel.render();
      this.saveSoon();
    }
    if (g < 0 || !fly) return;
    if (!this.groupInView(g)) this.flyTo(this.chunks[g].members);
    if (!this.seeThroughNow() && this.groupStateOf(g) === 'down') {
      this.showToast(`Gruppen ”${this.chunks[g].name}” är under horisonten just nu. Slå på Se genom marken för att se den.`);
    }
  }

  /**
   * The groups whose constellations show their lines and names now, while discovering:
   * the one chosen and the one pointed at.
   */
  focusGroups() {
    if (!this.discovering) return [];
    const out = this.discovery.group >= 0 ? [this.discovery.group] : [];
    const h = this.hover >= 0 && this.isFound(this.hover) ? this.groupIndexOf.get(this.hover) : -1;
    if (h >= 0 && !out.includes(h)) out.push(h);
    return out;
  }

  /** Whether Upptäck draws the lines ('lines') or names ('names') of every group, or only of the ones in focus. */
  setDiscoverAll(layer, on) {
    if (!DISCOVER_LAYERS.has(layer)) return;
    this.discovery[layer] = on;
    this.syncControls();
    this.invalidate();
    this.saveSoon();
  }

  /** Whether a group is up now: 'up' all of it, 'down' none of it, 'rising' some of it (see figureState). */
  groupStateOf(g) {
    const states = this.chunks[g].members.map((i) => this.figureStateOf(this.catalog.constellations[i]));
    if (states.every((st) => st === 'up')) return 'up';
    return states.every((st) => st === 'down') ? 'down' : 'rising';
  }

  /**
   * Which boundaries Upptäck draws: 'none', each constellation's ('constellation') or each
   * group's ('group'). "Gränser" in the bar turns them off and on again as chosen.
   */
  setDiscoverBounds(choice) {
    const d = this.discovery;
    if (choice === 'none') d.showBounds = false;
    else if (choice === 'constellation' || choice === 'group') {
      d.showBounds = true;
      d.boundsBy = choice;
    } else return;
    this.maskDirty = true;
    this.syncControls();
    this.invalidate();
    this.saveSoon();
  }

  /** What Upptäck draws as boundaries now: 'none', 'constellation' or 'group'. */
  discoverBounds() {
    return this.discovery.showBounds ? this.discovery.boundsBy : 'none';
  }

  /** The boundaries drawn now: Upptäck's choice while discovering, else the layer's. */
  boundsNow() {
    if (this.discovering) return this.discoverBounds();
    return this.layers.bounds ? 'constellation' : 'none';
  }

  /** The line round a whole group, as lines of unit vectors, worked out when first wanted. */
  groupLines(g) {
    const key = `group:${g}`;
    if (!this.groupOutlines.has(key)) this.groupOutlines.set(key, groupOutline(this.catalog.constellations, this.chunks[g].members));
    return this.groupOutlines.get(key);
  }

  /** While discovering with the groups' boundaries chosen: the lines round the groups shown; otherwise null. */
  discoverGroupOutlines() {
    if (!this.discovering || this.discoverBounds() !== 'group') return null;
    return this.shownGroups.flatMap((o) => o.outline);
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
    this.closeGroups();
    if (on) {
      // A group or step shown whole when training was left is shown again.
      if (t.view) this.showTrainingView(t.view);
      else this.nextTrainingCard({ again: t.card });
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
    if (t.on && t.view) {
      this.anim = null;
      this.trainingChanged();
      this.flyTo(this.viewCamera(t.view), { instant: true, atLeast: TRAIN_FOV });
      return;
    }
    if (!t.on || t.card < 0) return;
    if (!this.trainInGoal(t.card) && !this.chunks[t.group]?.members.includes(t.card)) {
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

  /** Chooses how far to learn ('winter', 'sweden' or 'all'). A group or card beyond it gives way to one within. */
  setTrainingGoal(goal) {
    const t = this.training;
    if (t.goal === goal || !STAGES.some((s) => s.id === goal)) return;
    t.goal = goal;
    const before = t.group;
    if (t.group >= 0 && !this.groupInGoal(t.group)) t.group = -1;
    // A wider goal can bring a group to learn, a narrower one take it away.
    const changed = this.trainingGroup() !== before;
    // A group shown whole stays, unless the group to learn has changed.
    if (t.on && (changed || (!t.view && (t.card < 0 || !this.trainInGoal(t.card))))) this.nextTrainingCard();
    else this.trainPanel.render();
    this.groupsPanel.render();
    this.saveSoon();
  }

  /**
   * While a group is learnt, its members already known this time round: they stay on the
   * sky, with their lines, drawings and names, around a card of the group.
   */
  trainingContext() {
    const t = this.training;
    const members = this.chunks[t.group]?.members;
    if (!t.on || t.view || !members || !members.includes(t.card)) return [];
    return members.filter((i) => i !== t.card && t.groupSeen.has(i) && t.cards.get(i)?.level >= 1);
  }

  /** Whether a group is within the goal: its step no further than the goal's. */
  groupInGoal(k) {
    return this.chunks[k].stage <= STAGES.find((s) => s.id === this.training.goal).upTo;
  }

  /**
   * The group being learnt: the one taken up, until each of its members has been answered
   * and is known; then the first within the goal not learnt yet, which is taken up in turn.
   * @returns {number} an index into chunks, or -1 when every group within the goal is learnt
   */
  trainingGroup() {
    const t = this.training;
    const next = groupToLearn(t.cards, this.chunks.map((ch) => ch.members), (k) => this.groupInGoal(k), t.group, t.groupSeen);
    if (next !== t.group) {
      t.group = next;
      t.groupSeen = new Set();
      t.introduced = -1;
    }
    return next;
  }

  /**
   * Takes up a group chosen in the overview, shown whole first; a group already learnt is
   * gone through once more, and the group being learnt goes on where it was.
   */
  chooseTrainingGroup(k) {
    const t = this.training;
    if (!this.chunks[k]) return;
    // Taking up a group ends a practice round.
    t.practice = null;
    if (k !== t.group) {
      t.group = k;
      t.groupSeen = new Set();
    }
    this.groupsPanel.toggle(false);
    this.showTrainingGroup(k, 'intro');
  }

  /**
   * Shows a whole group on the sky, each member with its lines, drawing and name: when it
   * has just been learnt ('done'), and when it is come to for the first time or chosen in
   * the overview ('intro'). A tap, Space or the button goes on.
   */
  showTrainingGroup(k, kind, options) {
    this.showTrainingView({ group: k, kind }, options);
  }

  /**
   * Shows constellations together on the sky between cards: a group ({group, kind: 'done' |
   * 'intro'}), or every one of a step learnt ({group: -1, stage, kind: 'milestone' when the
   * step has just been learnt in full, 'practiced' after a practice round over it}).
   */
  showTrainingView(view, { instant = false } = {}) {
    const t = this.training;
    t.view = view;
    if (view.kind === 'intro') t.introduced = view.group;
    t.step = 0;
    t.namedAt = performance.now();
    this.trainingChanged();
    this.flyTo(this.viewCamera(view), { instant, atLeast: TRAIN_FOV });
    this.saveSoon();
  }

  /** The constellations of the steps as far as a milestone ('winter', 'sweden' or 'all'). */
  stageMembers(stage) {
    return this.catalog.constellations.filter((c) => this.inScope(c.index, stage)).map((c) => c.index);
  }

  /** What a view shows together: a group's members, or every constellation of a step. */
  viewMembers(view) {
    return view.group >= 0 ? this.chunks[view.group].members : this.stageMembers(view.stage);
  }

  /** What the camera frames for a view: the whole sky is framed by the part of it that is up. */
  viewCamera(view) {
    const members = this.viewMembers(view);
    if (view.group >= 0 || view.stage !== 'all') return members;
    this.view.timeMs = this.now();
    this.view.update();
    const up = members.filter((i) => this.view.altOf(this.catalog.constellations[i].centerVec) > 0);
    return up.length ? up : members;
  }

  /** The first step learnt in full that has not been celebrated yet ('winter', 'sweden', 'all'), or null. */
  newMilestone() {
    const t = this.training;
    return STAGES.find((st) => !t.milestones.has(st.id) && stageLearnt(t.cards, this.chunks, st.upTo))?.id ?? null;
  }

  /** A step learnt in full: shown whole, celebrated, and remembered so that it is celebrated once. */
  showMilestone(stage, { instant = false } = {}) {
    this.training.milestones.add(stage);
    this.showTrainingView({ group: -1, stage, kind: 'milestone' }, { instant });
    celebrate(this.doc, { big: stage === 'all' });
  }

  /** Whether every group of a step, and of the steps before it, is learnt now. */
  stageIsLearnt(stage) {
    return stageLearnt(this.training.cards, this.chunks, STAGES.find((st) => st.id === stage).upTo);
  }

  /**
   * The step to go on to once every group within the goal is learnt and the goal stops short
   * of the whole sky, or null: offered for as long as the learner stays with repetitions.
   */
  nextGoal() {
    const t = this.training;
    const k = STAGES.findIndex((st) => st.id === t.goal);
    return t.group < 0 && STAGES[k + 1] && t.milestones.has(t.goal) ? STAGES[k + 1].id : null;
  }

  /** The step to go on to after a milestone, when the goal stopped there, or null. */
  milestoneNextGoal(stage) {
    const k = STAGES.findIndex((st) => st.id === stage);
    return this.training.goal === stage && STAGES[k + 1] ? STAGES[k + 1].id : null;
  }

  /**
   * A round through every constellation of a step learnt ('winter', 'sweden' or 'all'),
   * each once in a shuffled order, a miss coming back a little later, whatever group is
   * being learnt. The answers count as any others.
   */
  startPractice(stage) {
    const t = this.training;
    if (!t.milestones.has(stage)) return;
    const queue = practiceRound(this.stageMembers(stage));
    t.practice = { stage, queue, total: queue.length, missed: new Set() };
    t.view = null;
    this.groupsPanel.toggle(false);
    if (t.on) this.nextTrainingCard();
    else this.setTraining(true);
  }

  /** Ends a practice round before its end; the learning goes on where it was. */
  stopPractice() {
    if (!this.training.practice) return;
    this.training.practice = null;
    this.nextTrainingCard();
  }

  /** Goes on from a group shown whole: after an introduction with its first card not yet answered. */
  leaveTrainingGroup() {
    const t = this.training;
    if (!t.view || performance.now() - t.namedAt < SECOND_TAP_MS) return;
    const { group, kind, stage } = t.view;
    t.view = null;
    if (kind === 'milestone') {
      // On to the next step when the goal stopped at this one.
      const next = this.milestoneNextGoal(stage);
      if (next) {
        t.goal = next;
        this.groupsPanel.render();
      }
      this.nextTrainingCard();
      return;
    }
    if (kind === 'practiced') t.practice = null;
    if (kind === 'done' || kind === 'practiced') {
      this.nextTrainingCard();
      return;
    }
    const { members } = this.chunks[group];
    takeUp(t.cards, members, t.turn);
    const resting = (i) => t.cards.get(i).level === 0 && t.cards.get(i).n > 0 && !isDue(t.cards.get(i), t.turn, Date.now());
    const first = members.find((i) => !t.groupSeen.has(i) && !resting(i)) ?? -1;
    this.nextTrainingCard({ intro: false, again: first });
  }

  trainingProgress() {
    return trainingProgress(this.training.cards, (i) => this.trainInGoal(i), this.catalog.constellations.length);
  }

  /**
   * The step being learnt, as far as the goal: the first with a constellation not known
   * yet, or a later one that has come into play (a miss on an earlier step does not take
   * the learner back), and how it stands, counted with the steps before it.
   * @returns {{stage: object, known: number, size: number, permanent: number, inPlay: number}}
   */
  trainingStage() {
    const t = this.training;
    const goal = STAGES.find((s) => s.id === t.goal);
    const progress = (s) => trainingProgress(t.cards, (i) => this.inScope(i, s.id), this.stages.length);
    const first = STAGES.find((s) => s.upTo <= goal.upTo && progress(s).known < progress(s).goal) || goal;
    const reached = Math.max(first.upTo, ...[...t.cards.keys()].filter((i) => this.trainInGoal(i)).map((i) => this.stages[i]));
    const stage = STAGES.find((s) => s.upTo === Math.min(reached, goal.upTo));
    const p = progress(stage);
    return { stage, known: p.known, size: p.goal, permanent: p.permanent, inPlay: p.inPlay };
  }

  /**
   * Shows the next card, with its stars only, and turns the view to it. `again` shows that
   * card once more instead (when coming back to training), if it is still one to learn.
   */
  nextTrainingCard({ instant = false, again = -1, intro = true } = {}) {
    const t = this.training;
    t.view = null;
    // A practice round goes through its cards, and ends with the step shown whole.
    if (t.practice) {
      const p = t.practice;
      if (!p.queue.length) {
        this.showTrainingView({ group: -1, stage: p.stage, kind: 'practiced' }, { instant });
        return;
      }
      t.card = p.queue[0];
      t.step = 1;
      this.trainingChanged();
      this.flyTo(t.card, { instant, fov: TRAIN_FOV });
      this.saveSoon();
      return;
    }
    const before = t.group;
    const k = this.trainingGroup();
    // A group just learnt is shown whole, and so is one come to for the first time.
    if (before >= 0 && k !== before) {
      this.showTrainingGroup(before, 'done', { instant });
      return;
    }
    // A step learnt in full is a milestone: after its last group, the whole step together.
    const milestone = this.newMilestone();
    if (milestone) {
      this.showMilestone(milestone, { instant });
      return;
    }
    if (intro && k >= 0 && k !== t.introduced && !this.chunks[k].members.some((i) => t.cards.get(i)?.n > 0)) {
      this.showTrainingGroup(k, 'intro', { instant });
      return;
    }
    const group = k >= 0 ? this.chunks[k].members : [];
    t.card = again >= 0 && (this.trainInGoal(again) || group.includes(again))
      ? again
      : nextCard(t.cards, group, t.groupSeen, (i) => this.trainInGoal(i), t.turn, Date.now(), t.card);
    t.step = 1;
    this.trainingChanged();
    if (t.card >= 0) this.flyTo(t.card, { instant, fov: TRAIN_FOV });
    this.saveSoon();
  }

  /** Shows the lines, then the name. */
  advanceTraining() {
    const t = this.training;
    if (!t.on || t.view || t.card < 0 || t.step >= 3) return;
    t.step++;
    if (t.step === 3) t.namedAt = performance.now();
    this.trainingChanged();
  }

  /** Shows the name straight away. */
  revealTraining() {
    const t = this.training;
    if (!t.on || t.view || t.card < 0 || t.step === 3) return;
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
    if (!t.on) return;
    // A group shown whole goes on, though not on the heels of the answer that led to it.
    if (t.view) {
      if (!again) this.leaveTrainingGroup();
      return;
    }
    if (t.card < 0) return;
    if (t.step < 3) this.advanceTraining();
    else if (!again && performance.now() - t.namedAt >= SECOND_TAP_MS) this.answerTraining('now');
  }

  /** Records how the card went ('again', 'now' or 'permanent') and goes on to the next one. */
  answerTraining(answer) {
    const t = this.training;
    if (!t.on || t.view || t.card < 0) return;
    t.cards.set(t.card, grade(t.cards.get(t.card), answer, t.turn, Date.now()));
    t.turn++;
    // An answer counts for the group being learnt whether it came in a practice round or not.
    if (this.chunks[t.group]?.members.includes(t.card)) t.groupSeen.add(t.card);
    const p = t.practice;
    if (p && p.queue[0] === t.card) {
      if (answer === 'again') p.missed.add(t.card);
      p.queue = afterPractice(p.queue, answer);
      // A round gone through without a miss is celebrated as it ends, once.
      if (!p.queue.length && !p.missed.size) celebrate(this.doc);
    }
    this.nextTrainingCard();
  }

  /**
   * Turns the named card's lines ('lines') or drawing ('art') on or off, or the boundary
   * round the group ('bounds', at any step and while a group is shown whole); the choice
   * stays for later cards.
   */
  toggleTrainingView(part) {
    const t = this.training;
    if (part === 'bounds') {
      // With no card and no group there is nothing to draw round.
      if (this.trainingOutlineKey() === null) return;
      t.showBounds = !t.showBounds;
    } else if (t.view) return;
    else if (part === 'lines') t.showLines = !t.showLines;
    else if (part === 'art') t.showArt = !t.showArt;
    else return;
    this.invalidate();
    this.trainPanel.render();
    if (part === 'bounds') this.syncControls();
    this.saveSoon();
  }

  /**
   * The group the sky marks: the one shown whole, or else the card's own, so that a card
   * repeated from a group learnt before marks that group; with no card, the one being
   * learnt. An index into chunks, or -1.
   */
  trainingGroupShown() {
    const t = this.training;
    if (t.view) return t.view.group;
    const own = this.chunkOf.get(t.card);
    return own ? this.chunks.indexOf(own) : t.group;
  }

  /**
   * The boundary drawn round the group the sky marks (see trainingGroupShown): lines of
   * J2000 unit vectors, or null when turned off or there is no group. Worked out once for
   * each group.
   */
  trainingOutline() {
    const t = this.training;
    const key = this.trainingOutlineKey();
    if (!t.on || !t.showBounds || key === null) return null;
    if (!this.groupOutlines.has(key)) {
      const members = typeof key === 'number' ? this.chunks[key].members : this.stageMembers(key);
      this.groupOutlines.set(key, groupOutline(this.catalog.constellations, members));
    }
    return this.groupOutlines.get(key);
  }

  /**
   * What the boundary goes round: the index of the group the sky marks, a step's id while
   * the step is shown whole (the part of the sky learnt), or null when there is nothing.
   */
  trainingOutlineKey() {
    const t = this.training;
    // The whole sky has nothing round it.
    if (t.view && t.view.group < 0) return t.view.stage === 'all' ? null : t.view.stage;
    const k = this.trainingGroupShown();
    return this.chunks[k] ? k : null;
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
    this.training.group = -1;
    this.training.groupSeen = new Set();
    this.training.view = null;
    this.training.milestones.clear();
    this.training.practice = null;
    this.nextTrainingCard();
  }

  /** Recomputes what the card shows: its stars, and whether the ground must be see-through. */
  trainingChanged() {
    const t = this.training;
    t.stars = null;
    t.below = false;
    const shown = !t.on ? [] : t.view ? this.viewMembers(t.view) : t.card >= 0 ? [t.card] : [];
    if (shown.length) {
      const { catalog } = this;
      // The card's stars, and those of its group's members already known, stand out.
      const bright = [...shown, ...this.trainingContext()];
      const stars = new Uint8Array(catalog.stars.count);
      for (let s = 0; s < stars.length; s++) stars[s] = bright.includes(catalog.stars.con[s]) ? 1 : 0;
      for (const i of bright) for (const s of catalog.constellations[i].figureStars) stars[s] = 1;
      t.stars = stars;
      this.view.timeMs = this.now();
      this.view.update();
      // Low figures sink into the haze and behind the trees, so they are seen through the ground.
      t.below = shown.some((i) => catalog.constellations[i].figureStars.some((s) => this.view.altOf(catalog.starVec(s)) < 10));
    }
    this.maskDirty = true;
    this.invalidate();
    this.syncControls();
    this.trainPanel.render();
    this.groupsPanel.render();
    this.layoutChanged();
  }

  /**
   * A group as the sky draws it while discovering: its members, its middle, the colour of
   * its name, the line round it, and the places its name can go, best first (its middle, if that is in it, then its
   * members' name places nearest the middle).
   */
  groupShape(g) {
    if (!this.shapeCache) this.shapeCache = new Map();
    if (!this.shapeCache.has(g)) {
      const { members, name } = this.chunks[g];
      const cons = this.catalog.constellations;
      const sum = members.reduce((a, i) => a.map((x, k) => x + cons[i].centerVec[k]), [0, 0, 0]);
      const len = Math.hypot(...sum) || 1;
      const middle = sum.map((x) => x / len);
      const spots = members.flatMap((i) => cons[i].labelVecs).sort((u, v) => angleBetween(middle, u) - angleBetween(middle, v));
      if (members.includes(this.catalog.constellationAt(middle))) spots.unshift(middle);
      const color = GROUP_COLORS[this.groupHue[g]].label;
      this.shapeCache.set(g, { group: g, name, members, middle, color, outline: this.groupLines(g), spots });
    }
    return this.shapeCache.get(g);
  }

  /** Recomputes what is drawn while discovering or in the overview, after a new filter, a new place or the mode changing. */
  discoveryChanged() {
    const { catalog, discovery: d } = this;
    // Both draw every star, and the figures of those the list's filter takes in: in the
    // overview each constellation by itself, in Upptäck each group as a whole.
    if (this.discovering || this.overviewing) {
      const scope = this.list.scope;
      const con = new Uint8Array(catalog.constellations.length);
      if (this.discovering) {
        this.shownGroups = this.chunks.map((ch, g) => g).filter((g) => this.groupInScope(g, scope)).map((g) => this.groupShape(g));
        for (const o of this.shownGroups) for (const i of o.members) con[i] = 1;
        if (d.group >= 0 && !this.shownGroups.some((o) => o.group === d.group)) d.group = -1;
      } else {
        this.shownGroups = [];
        for (const c of catalog.constellations) con[c.index] = this.inScope(c.index, scope) ? 1 : 0;
      }
      this.reveal = { con, stars: null };
    } else {
      this.shownGroups = [];
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
    return this.vecInView(this.catalog.constellations[index].centerVec);
  }

  /**
   * Whether a group is in view: its middle away from the edges of the free part of the
   * screen, and the centre of each of its members somewhere in it.
   */
  groupInView(g) {
    const cons = this.catalog.constellations;
    return this.vecInView(this.groupShape(g).middle) && this.chunks[g].members.every((i) => this.vecInView(cons[i].centerVec, 0, 0));
  }

  /** Whether a direction is in the free part of the screen, the given parts of it away from its edges. */
  vecInView(vec, marginX = 0.15, marginY = 0.2) {
    const v = this.view;
    v.timeMs = this.now();
    v.update();
    const p = { x: 0, y: 0, z: 0 };
    if (!v.projectEq(vec, p) || p.z < 0) return false;
    if (!this.seeThroughNow() && v.altOf(vec) < 0) return false;
    const a = this.freeArea();
    const w = a.right - a.left;
    const h = a.bottom - a.top;
    return p.x > a.left + w * marginX && p.x < a.right - w * marginX && p.y > a.top + h * marginY && p.y < a.bottom - h * marginY;
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
      for (const p of [this.list.panel, this.when.panel, this.themePanel.panel, this.groupsPanel.panel]) {
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
    this.overviewPanel.render();
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

  /**
   * Turns the view to a constellation, or a group of them, framed to fit unless a field of
   * view is given; `atLeast` keeps it from zooming in further than that.
   */
  flyTo(index, { instant = false, fov: fixedFov = null, atLeast = 0 } = {}) {
    const v = this.view;
    v.timeMs = this.now();
    v.update();
    // A group is framed around the middle of its members, far enough out for all of them.
    const members = (Array.isArray(index) ? index : [index]).map((i) => this.catalog.constellations[i]);
    const sum = members.reduce((a, c) => a.map((x, k) => x + c.centerVec[k]), [0, 0, 0]);
    const len = Math.hypot(...sum) || 1;
    const centerVec = sum.map((x) => x / len);
    const [az, alt] = v.azAltOf(centerVec);
    // fov spans the longer screen side; fit the figure across the shorter one.
    const aspect = Math.max(v.width, v.height) / Math.min(v.width, v.height);
    // Frame the name as well as the figure (Cassiopeja's sits well outside its W).
    const reach = Math.max(...members.map((c) => angleBetween(centerVec, c.centerVec)
      + Math.max(c.radius, Math.min(...c.labelVecs.map((l) => angleBetween(c.centerVec, l))) + 2)));
    // A group may take the widest view there is; one constellation stays short of it.
    const widest = members.length > 1 ? MAX_FOV : MAX_FOV - 10;
    const fov = fixedFov ?? clamp(Math.max(atLeast, reach * 2.5 * Math.min(aspect, 2.2)), 28, widest);
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
      this.repoint();
    }
  }

  /** Finds again what the mouse points at, after the sky has moved under it. */
  repoint() {
    if (this.pointer && !this.pointer.held) this.setHover(this.pickShown(this.pointer.x, this.pointer.y));
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
    if (tr.on && (tr.card >= 0 || tr.view) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const answer = { 1: 'again', 2: 'now', 3: 'permanent' }[e.key];
      // Space held down does nothing more, not even on a button focus has just moved to.
      if (e.key === ' ' && e.repeat) {
        e.preventDefault();
        return;
      }
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
      // L and B turn the named card's lines and drawing (bild) on and off, G the boundary
      // round the group (gränser) at any step.
      const part = { l: 'lines', b: 'art', g: 'bounds' }[e.key.toLowerCase()];
      if (part && (tr.step === 3 || part === 'bounds')) {
        e.preventDefault();
        // Held down, the key turns it once, not on and off with every repeat.
        if (!e.repeat) this.toggleTrainingView(part);
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
        if (this.groupsPanel.open) this.groupsPanel.toggle(false);
        else if (this.themePanel.open) this.themePanel.toggle(false);
        else if (this.skyPanel.open) {
          this.skyPanel.toggle(false);
          this.skyPanel.button.focus();
        }
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
    this.repoint();
  }

  // ------------------------------------------------------------------ layout & UI

  closeList() {
    if (this.list.open) this.list.toggle(false);
  }

  closeTheme() {
    if (this.themePanel.open) this.themePanel.toggle(false);
  }

  closeSky() {
    if (this.skyPanel?.open) this.skyPanel.toggle(false);
  }

  /** How faint the faintest stars seen are ("Sikt"): LIMIT_MAX for every star, as on the darkest sky. */
  setLimitMag(mag) {
    const m = clampLimit(Number(mag));
    if (!Number.isFinite(m) || m === this.limitMag) return;
    this.limitMag = m;
    this.skyPanel.sync();
    this.invalidate();
    this.saveSoon();
  }

  closeGroups() {
    if (this.groupsPanel.open) this.groupsPanel.toggle(false);
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
    // The groups overview stands over the training panel where the two do not fit side by side.
    const overlaps = this.groupsPanel.open
      && this.groupsPanel.panel.getBoundingClientRect().left < this.trainPanel.root.getBoundingClientRect().right;
    const covered = crowded || overlaps || (narrow && (this.when.open || this.themePanel.open || this.groupsPanel.open));
    for (const p of [this.discoverPanel.root, this.trainPanel.root, this.overviewPanel.root]) p.style.visibility = covered ? 'hidden' : '';
    this.placeToast();
    this.fitCard();
    // Names keep clear of the panel, so they are drawn again when it comes or goes.
    this.invalidate();
  }

  syncControls() {
    // While training, the cards decide on lines, names and drawings, and "Gränser" turns
    // the boundary round the group on and off; with no group to mark, it rests too.
    const training = this.training.on;
    const hasGroup = training && this.trainingOutlineKey() !== null;
    for (const b of this.toggleButtons) {
      const isBounds = b.dataset.layer === 'bounds';
      const group = hasGroup && isBounds;
      const byCards = training && !group && (TRAINING_LAYERS.has(b.dataset.layer) || isBounds);
      b.disabled = byCards;
      // While discovering, "Gränser", "Linjer" and "Namn" are Upptäck's own.
      const discovering = this.discovering && (isBounds || DISCOVER_LAYERS.has(b.dataset.layer));
      const pressed = group ? this.training.showBounds
        : discovering ? (isBounds ? this.discovery.showBounds : this.discovery[b.dataset.layer])
          : !byCards && this.layerPressed(b.dataset.layer);
      b.setAttribute('aria-pressed', String(pressed));
      if (b.dataset.title === undefined) b.dataset.title = b.title;
      b.title = group ? 'Gränsen runt den markerade gruppen (tangent G)' : byCards ? 'Styrs av Träna just nu'
        : discovering && !isBounds ? DISCOVER_TITLES[b.dataset.layer] : b.dataset.title;
    }
    this.markCount.hidden = this.marks.size === 0;
    this.markCount.textContent = String(this.marks.size);
    this.discoverPanel.render();
    this.overviewPanel.render();
  }

  syncTimeUi(force = false) {
    this.lastUiSync = performance.now();
    // The sky turns with the clock.
    this.repoint();
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
        overview: { on: this.overview.on },
        discover: {
          on: this.discovery.on,
          collapsed: this.discovery.collapsed,
          byGroups: true,
          boundsBy: this.discovery.boundsBy,
          showBounds: this.discovery.showBounds,
          lines: this.discovery.lines,
          names: this.discovery.names,
          group: this.chunks[this.discovery.group]?.name ?? null,
        },
        view: { az: Math.round(v.az * 10) / 10, alt: Math.round(v.alt * 10) / 10, fov: Math.round(v.fov * 10) / 10 },
        listScope: this.list.scope,
        limitMag: this.limitMag,
        theme: this.theme,
        themes: 2,
        training: {
          v: 2,
          on: this.training.on,
          turn: this.training.turn,
          lines: this.training.showLines,
          art: this.training.showArt,
          bounds: this.training.showBounds,
          story: this.training.showStory,
          goal: this.training.goal,
          group: this.chunks[this.training.group]?.name ?? null,
          seen: [...this.training.groupSeen].map((i) => this.catalog.constellations[i].id),
          milestones: [...this.training.milestones],
          practice: this.training.practice && {
            stage: this.training.practice.stage,
            queue: this.training.practice.queue.map((i) => this.catalog.constellations[i].id),
            total: this.training.practice.total,
            missed: [...this.training.practice.missed].map((i) => this.catalog.constellations[i].id),
          },
          cards: [...this.training.cards].map(([i, c]) => [this.catalog.constellations[i].id, c.level, c.dueTurn, c.dueAt, c.n]),
        },
      });
    }, 400);
  }

  // ------------------------------------------------------------------ rendering

  /**
   * Tints for the sky's mask: while discovering with the groups' boundaries, each group
   * shown in a colour of its own, stronger for the one chosen; marked and selected
   * constellations.
   */
  fillTints(tints) {
    if (this.discovering && this.discoverBounds() === 'group') {
      for (const o of this.shownGroups) {
        const strength = o.group === this.discovery.group ? GROUP_TINT_CHOSEN : GROUP_TINT;
        const rgb = GROUP_COLORS[this.groupHue[o.group]].rgb.map((x) => Math.min(255, x * strength));
        for (const i of o.members) tints.set(i, rgb);
      }
    }
    for (const [i, color] of this.marks) if (this.isFound(i)) tints.set(i, MARK_COLORS[color].rgb);
    if (this.selected >= 0 && !this.marks.has(this.selected)) tints.set(this.selected, SELECT_COLOR.rgb.map((x) => x * 0.55));
  }

  /** Screen boxes constellation names keep clear of: the brand and the Upptäck panel. */
  labelObstacles() {
    const out = [this.brand.getBoundingClientRect()];
    const panel = this.modePanel();
    if (panel) out.push(panel.getBoundingClientRect());
    return out;
  }

  /** Screen boxes of the buttons along the top and bottom of the screen, which the names of groups keep clear of. */
  barBoxes() {
    return [...this.doc.querySelectorAll('.bar .chip')].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.right > 0 && r.left < this.view.width);
  }

  /**
   * On a phone held upright the card keeps below the panel of the game being played, which
   * a taller card or panel (a design with larger type, a long story) would otherwise slide
   * under; a card taller than the room between them scrolls. With too little room for its
   * title and a few lines, it comes in front of the panel instead. (On a phone on its side
   * the two stand side by side as on a desktop.)
   */
  fitCard() {
    const card = this.card.root;
    const panel = window.innerWidth <= 640 && !card.hidden ? this.modePanel() : null;
    let max = '';
    let front = '';
    if (panel) {
      const room = Math.floor(card.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom - 8);
      if (room >= 120) max = `${room}px`;
      else front = '6';
    }
    if (card.style.maxHeight !== max) card.style.maxHeight = max;
    if (card.style.zIndex !== front) card.style.zIndex = front;
    // Wider than a phone held upright but low, a card that would cover the game's panel
    // moves to its right, where there is room.
    let left = '';
    const side = window.innerWidth > 640 && !card.hidden ? this.modePanel() : null;
    if (side) {
      card.style.left = '';
      const p = side.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      const want = p.right + 12 + r.width / 2;
      if (r.left < p.right + 8 && r.top < p.bottom && want + r.width / 2 <= window.innerWidth - 8) left = `${Math.round(want)}px`;
    }
    if (card.style.left !== left) card.style.left = left;
  }

  /** The panel of the game being played (Upptäck or Träna) while it is on screen, or null. */
  modePanel() {
    for (const p of [this.trainPanel.root, this.discoverPanel.root, this.overviewPanel.root]) {
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
    // A whole group shown together: every member with its lines, drawing and name. A whole
    // step: lines and names, without the drawings, and the names that find no room left out.
    const together = t.on && t.view ? this.viewMembers(t.view) : null;
    const quiz = together ? {
      target: together[0],
      targets: together,
      context: [],
      step: 3,
      stars: t.stars,
      lines: true,
      art: t.view.group >= 0,
      crowd: t.view.group < 0,
      outline: this.trainingOutline(),
    } : t.on && t.card >= 0 ? {
      target: t.card,
      targets: [t.card],
      context: this.trainingContext(),
      step: t.step,
      stars: t.stars,
      // Lines from the second step; once named, lines and drawing as the learner has them.
      lines: t.step === 2 || (t.step === 3 && t.showLines),
      art: t.step === 3 && t.showArt,
      // The boundary round the group, at every step: it says no more than the panel does.
      outline: this.trainingOutline(),
    } : null;
    // The groups pointed at and chosen while discovering, and their constellations.
    const focus = quiz ? [] : this.focusGroups().map((g) => this.groupShape(g));
    const focusMembers = new Set(focus.flatMap((o) => o.members));
    const chosenArt = new Set(!quiz && this.discovering && this.discovery.group >= 0 ? this.chunks[this.discovery.group].members : []);
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
      artShown: (i) => (quiz.art && quiz.targets.includes(i)) || quiz.context.includes(i),
      anyArt: quiz.art || quiz.context.length > 0,
      reveal: null,
      bounds: 'none',
      groupBounds: null,
      groups: null,
      focus: [],
      focusMembers: null,
      linesOnly: null,
      namesOnly: null,
      avoid: this.labelObstacles(),
      limitMag: this.limitMag,
      quiz,
    } : {
      // In Upptäck the lines and names are Upptäck's: for the groups in focus, or for all.
      layers: this.discovering ? { ...this.layers, lines: true, names: true } : this.layers,
      marks: this.reveal ? new Map([...this.marks].filter(([i]) => this.isFound(i))) : this.marks,
      selected: this.selected,
      hover: this.hover,
      groundOpaque: !this.seeThroughNow(),
      // The group chosen in Upptäck shows the illustrations of all its constellations.
      artShown: (i) => this.isFound(i) && (this.artShown(i) || chosenArt.has(i)),
      anyArt: this.anyArtShown() || chosenArt.size > 0,
      artBright: chosenArt,
      reveal: this.reveal,
      bounds: this.boundsNow(),
      groupBounds: this.discoverGroupOutlines(),
      groups: this.discovering ? this.shownGroups : null,
      focus,
      focusMembers: this.discovering ? focusMembers : null,
      linesOnly: this.discovering && !this.discovery.lines ? focusMembers : null,
      namesOnly: this.discovering && !this.discovery.names ? focusMembers : null,
      chrome: this.discovering ? this.barBoxes() : null,
      avoid: this.labelObstacles(),
      limitMag: this.limitMag,
      quiz: null,
    };
    const gl = {
      scale: v.s,
      dpr: this.dpr,
      camToHor: v.camToHor,
      horToEq: v.horToEq,
      milkyWay: this.layers.milkyWay,
      // The Milky Way is the first thing a hazy or bright sky takes away.
      milkyWayFade: clamp((this.limitMag - 4.3) / 1.5, 0, 1),
      groundAlpha: this.seeThroughNow() ? 0.42 : 1,
    };
    this.glSky.render(gl);
    this.skyLayer.render(v, st);
    this.glGround.render(gl);
    this.hud.render(v, st, this.skyLayer);
  }
}
