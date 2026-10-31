// The constellation list: search, filters (seen from here, the winter sky, all), mark boxes.
import { MARK_COLORS } from '../render/palette.js';

const STATE_TEXT = { up: 'uppe', rising: 'delvis uppe', down: 'nere' };

export class ListPanel {
  /**
   * @param {object} app  see App: catalog, marks, selected, view, discovery, isFound, inScope, toggleMark, select, figureStateOf
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.panel = $('panel-list');
    this.button = $('btn-list');
    this.list = $('con-list');
    this.search = $('search');
    this.filters = { year: $('filter-visible'), winter: $('filter-winter'), all: $('filter-all') };
    this.filterPlace = $('filter-place');
    this.filterCount = $('filter-count');
    this.filterWinterCount = $('filter-winter-count');
    this.note = $('list-note');
    /** Which constellations the list holds: 'year' those seen from here, 'winter' the winter sky, or 'all'. */
    this.scope = 'year';
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
    for (const [scope, b] of Object.entries(this.filters)) b.addEventListener('click', () => this.setScope(scope));
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
      this.app.closeTheme();
      this.syncAll();
    }
    this.app.layoutChanged();
  }

  setScope(scope) {
    if (!(scope in this.filters)) return;
    this.scope = scope;
    for (const [s, b] of Object.entries(this.filters)) b.setAttribute('aria-pressed', String(s === scope));
    this.applyFilter();
    this.app.saveSoon();
  }

  /** Re-evaluates which rows show for the search text and the filter. */
  applyFilter() {
    const q = this.search.value.trim().toLowerCase();
    let shown = 0;
    let undiscovered = null;
    for (const c of this.app.catalog.constellations) {
      const row = this.rows.get(c.index);
      // While discovering the sky, the list holds only the constellations found so far.
      const match = this.app.inScope(c.index, this.scope) && (!q || row.search.includes(q));
      const show = match && this.app.isFound(c.index);
      if (match && !show && q) undiscovered = undiscovered ? 'many' : c;
      row.li.hidden = !show;
      if (show) shown++;
    }
    this.empty.hidden = shown > 0;
    this.empty.textContent = !undiscovered ? 'Ingen stjärnbild matchar sökningen.'
      : undiscovered === 'many' ? 'Du har inte upptäckt någon av dem än.' : `${undiscovered.sv} har du inte upptäckt än.`;
    this.note.hidden = !this.app.discovering;
    this.filterPlace.textContent = this.app.place.name;
    this.filterCount.textContent = String(this.app.scopeCount('year'));
    this.filterWinterCount.textContent = String(this.app.scopeCount('winter'));
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
