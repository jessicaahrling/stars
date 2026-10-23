// The constellation list: search, "visible from here" filter, mark boxes.
import { MARK_COLORS } from '../render/palette.js';
import { visibilityClass } from '../astro/visibility.js';

const STATE_TEXT = { up: 'uppe', rising: 'delvis uppe', down: 'nere' };

export class ListPanel {
  /**
   * @param {object} app  see App: catalog, marks, selected, view, discovery, isFound, toggleMark, select, figureStateOf
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.panel = $('panel-list');
    this.button = $('btn-list');
    this.list = $('con-list');
    this.search = $('search');
    this.filterVisible = $('filter-visible');
    this.filterAll = $('filter-all');
    this.filterPlace = $('filter-place');
    this.filterCount = $('filter-count');
    this.note = $('list-note');
    this.onlyVisible = true;
    this.rows = new Map();

    const sorted = [...app.catalog.constellations].sort((a, b) => a.sv.localeCompare(b.sv, 'sv'));
    for (const c of sorted) {
      const li = document.createElement('li');
      li.dataset.index = String(c.index);
      const box = document.createElement('button');
      box.type = 'button';
      box.className = 'mark-box';
      box.setAttribute('aria-label', `Markera ${c.sv}`);
      box.append(document.createElement('span'));
      box.addEventListener('click', () => app.toggleMark(c.index));
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'con-name';
      const strong = document.createElement('strong');
      strong.textContent = c.sv;
      const em = document.createElement('em');
      em.textContent = c.la;
      name.append(strong, em);
      name.addEventListener('click', () => app.select(c.index, { fly: true }));
      const state = document.createElement('span');
      state.className = 'state';
      li.append(box, name, state);
      this.list.append(li);
      this.rows.set(c.index, { li, box, state, search: `${c.sv} ${c.la} ${c.id}`.toLowerCase() });
    }
    this.empty = document.createElement('li');
    this.empty.className = 'empty';
    this.empty.textContent = 'Ingen stjärnbild matchar sökningen.';
    this.list.append(this.empty);

    this.search.addEventListener('input', () => this.applyFilter());
    this.filterVisible.addEventListener('click', () => this.setOnlyVisible(true));
    this.filterAll.addEventListener('click', () => this.setOnlyVisible(false));
    this.button.addEventListener('click', () => this.toggle());
    $('btn-list-close').addEventListener('click', () => this.toggle(false));
    $('btn-mark-up').addEventListener('click', () => app.markAllUp());
    $('btn-clear').addEventListener('click', () => app.clearMarks());
  }

  get open() {
    return !this.panel.hidden;
  }

  toggle(force) {
    const open = force ?? this.panel.hidden;
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.app.closeWhen();
      this.syncAll();
    }
    this.app.layoutChanged();
  }

  setOnlyVisible(on) {
    this.onlyVisible = on;
    this.filterVisible.setAttribute('aria-pressed', String(on));
    this.filterAll.setAttribute('aria-pressed', String(!on));
    this.applyFilter();
    this.app.saveSoon();
  }

  /** Re-evaluates which rows show for the search text and the visibility filter. */
  applyFilter() {
    const q = this.search.value.trim().toLowerCase();
    const lat = this.app.view.lat;
    let shown = 0;
    let visibleCount = 0;
    let undiscovered = null;
    for (const c of this.app.catalog.constellations) {
      const row = this.rows.get(c.index);
      const visible = visibilityClass(c.figureDecs, lat) !== 'never';
      if (visible) visibleCount++;
      // While discovering the sky, the list holds only the constellations found so far.
      const match = (!this.onlyVisible || visible) && (!q || row.search.includes(q));
      const show = match && this.app.isFound(c.index);
      if (match && !show && q) undiscovered = undiscovered ? 'many' : c;
      row.li.hidden = !show;
      if (show) shown++;
    }
    this.empty.hidden = shown > 0;
    this.empty.textContent = !undiscovered ? 'Ingen stjärnbild matchar sökningen.'
      : undiscovered === 'many' ? 'Du har inte upptäckt någon av dem än.' : `${undiscovered.sv} har du inte upptäckt än.`;
    this.note.hidden = !this.app.discovery.on;
    this.filterPlace.textContent = this.app.place.name;
    this.filterCount.textContent = String(visibleCount);
  }

  /** Mark boxes, selection and up/down labels. */
  syncAll() {
    if (!this.open) return;
    for (const c of this.app.catalog.constellations) {
      const row = this.rows.get(c.index);
      const mark = this.app.marks.get(c.index);
      row.box.setAttribute('aria-pressed', String(mark !== undefined));
      row.box.setAttribute('aria-label', `${mark !== undefined ? 'Avmarkera' : 'Markera'} ${c.sv}`);
      if (mark !== undefined) row.box.style.setProperty('--mark', MARK_COLORS[mark % MARK_COLORS.length].hex);
      row.li.classList.toggle('is-selected', c.index === this.app.selected);
      const st = this.app.figureStateOf(c);
      row.state.textContent = STATE_TEXT[st];
      row.state.classList.toggle('up', st === 'up');
    }
    this.applyFilter();
  }
}
