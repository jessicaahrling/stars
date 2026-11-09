// "Upptäck himlen": the sky as its groups. The panel says how many the list's filter takes
// in (and lets it be changed: the winter sky, those seen from here, all), tells about the
// group chosen, lists the groups to choose from, and chooses the boundaries drawn.

const STATE_TEXT = { rising: 'delvis uppe', down: 'nere' };
const SCOPES = ['winter', 'year', 'all'];

/** "a, b och c". */
function listOf(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`;
}

export class DiscoverPanel {
  /**
   * @param {object} app  see App: catalog, chunks, groupHue, place, layers, discovery,
   *   discovering, shownGroups, list (scope, setScope), groupScopeCount, setDiscover,
   *   chooseGroup, groupStateOf, setDiscoverBounds, discoverBounds, layoutChanged, saveSoon
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.root = $('panel-discover');
    this.button = $('btn-discover');
    this.collapse = $('btn-discover-collapse');
    this.body = $('discover-body');
    this.count = $('discover-count');
    this.of = $('discover-of');
    this.hint = $('discover-hint');
    this.why = $('discover-why');
    this.next = $('discover-next');
    this.place = $('discover-place');
    this.nextKey = '';
    this.button.addEventListener('click', () => app.setDiscover(!app.discovering));
    this.collapse.addEventListener('click', () => {
      app.discovery.collapsed = !app.discovery.collapsed;
      this.render();
      app.layoutChanged();
      app.saveSoon();
    });
    $('btn-discover-exit').addEventListener('click', () => {
      app.setDiscover(false);
      this.button.focus();
    });
    // Which groups are shown: the list's filter, as in the overview.
    this.scopes = Object.fromEntries(SCOPES.map((s) => [s, $(`discover-${s}`)]));
    this.counts = Object.fromEntries(SCOPES.map((s) => [s, $(`discover-${s}-count`)]));
    for (const [scope, b] of Object.entries(this.scopes)) b.addEventListener('click', () => app.list.setScope(scope));
    // Which boundaries to draw: none, each constellation's or each group's.
    this.bounds = Object.fromEntries(['none', 'constellation', 'group'].map((k) => [k, $(`discover-bounds-${k}`)]));
    for (const [k, b] of Object.entries(this.bounds)) b.addEventListener('click', () => app.setDiscoverBounds(k));
    // A pointer that can hover is asked to point; a finger, to tap.
    this.canHover = window.matchMedia?.('(hover: hover)').matches ?? true;
  }

  render() {
    const { app } = this;
    const d = app.discovery;
    this.button.setAttribute('aria-pressed', String(app.discovering));
    this.root.hidden = !app.discovering;
    if (!app.discovering) return;
    const cons = app.catalog.constellations;
    const place = app.place.name;
    const scope = app.list.scope;
    this.root.classList.toggle('collapsed', d.collapsed);
    this.body.hidden = d.collapsed;
    this.collapse.setAttribute('aria-expanded', String(!d.collapsed));
    this.collapse.setAttribute('aria-label', d.collapsed ? 'Visa grupperna' : 'Fäll ihop');
    const n = app.shownGroups.length;
    this.count.textContent = `${n} ${n === 1 ? 'grupp' : 'grupper'}`;
    this.of.textContent = { winter: 'i vinterhimlen', year: `som syns från ${place}`, all: 'på hela himlen' }[scope];
    for (const s of SCOPES) {
      this.scopes[s].setAttribute('aria-pressed', String(s === scope));
      this.counts[s].textContent = String(app.groupScopeCount(s));
    }
    this.place.textContent = place;

    const chosen = app.chunks[d.group];
    const hint = chosen ? `${chosen.name}: ${listOf(chosen.members.map((i) => cons[i].sv))}.`
      : this.canHover ? 'Peka på en grupp för att se dess stjärnbilder, eller tryck på den för att välja den.'
        : 'Tryck på en grupp för att se dess stjärnbilder.';
    // The hint is a live region, so it is only written when it says something new.
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    this.why.hidden = !chosen;
    this.why.textContent = chosen ? chosen.reason : '';
    const bounds = app.discoverBounds();
    for (const [k, b] of Object.entries(this.bounds)) b.setAttribute('aria-pressed', String(k === bounds));

    const shown = app.shownGroups.map((o) => o.group);
    const key = shown.join(',');
    if (key !== this.nextKey) {
      this.nextKey = key;
      // Keep keyboard focus in the row when the pressed button goes away.
      const focusAt = [...this.next.children].indexOf(document.activeElement);
      // In the order "Träna" takes them, which is roughly from the pole outwards.
      this.next.replaceChildren(...shown.map((g) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.group = String(g);
        // The group's colour on the sky, for designs that colour the buttons.
        b.dataset.hue = String(app.groupHue[g]);
        const name = document.createElement('span');
        name.textContent = app.chunks[g].name;
        const state = document.createElement('span');
        state.className = 'state';
        b.append(name, state);
        b.addEventListener('click', () => app.chooseGroup(app.discovery.group === g ? -1 : g, { fly: true }));
        return b;
      }));
      this.next.hidden = !shown.length;
      this.next.scrollLeft = 0;
      if (focusAt >= 0) this.next.children[Math.min(focusAt, this.next.children.length - 1)]?.focus();
    }
    for (const b of this.next.children) b.setAttribute('aria-pressed', String(Number(b.dataset.group) === d.group));
    this.syncStates();
  }

  /** Marks the groups below the horizon now (the sky turns, so this runs every second). */
  syncStates() {
    const { app } = this;
    if (!app.discovering || this.root.hidden) return;
    for (const b of this.next.children) {
      const g = Number(b.dataset.group);
      const st = app.layers.seeThrough ? 'up' : app.groupStateOf(g);
      const text = STATE_TEXT[st] || '';
      const state = b.lastElementChild;
      if (state.textContent !== text) state.textContent = text;
      b.classList.toggle('below', st === 'down');
      b.setAttribute('aria-label', `${app.chunks[g].name}${st === 'down' ? ', under horisonten just nu' : st === 'rising' ? ', delvis under horisonten just nu' : ''}`);
    }
  }
}
