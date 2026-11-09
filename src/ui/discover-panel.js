// "Upptäck himlen": progress, counted in groups, and the neighbouring groups that can be
// added next.

const STATE_TEXT = { rising: 'delvis uppe', down: 'nere' };

/** "a, b och c". */
function listOf(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`;
}

export class DiscoverPanel {
  /**
   * @param {object} app  see App: catalog, chunks, place, layers, discovery, discoveryInfo,
   *   lastGroup, setDiscover, discoverGroup, discoverRest, restartDiscovery, groupStateOf,
   *   setDiscoverBounds, discoverBounds, saveSoon
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
    this.meter = $('discover-meter');
    this.bar = $('discover-bar');
    this.hint = $('discover-hint');
    this.next = $('discover-next');
    this.rest = $('btn-discover-rest');
    this.restart = $('btn-discover-restart');
    this.nextKey = '';
    this.confirming = false;
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
    this.rest.addEventListener('click', () => {
      app.discoverRest();
      this.next.querySelector('button')?.focus();
    });
    this.restart.addEventListener('click', () => this.onRestart());
    // Which boundaries to draw: none, each constellation's or each group's.
    this.bounds = Object.fromEntries(['none', 'constellation', 'group'].map((k) => [k, $(`discover-bounds-${k}`)]));
    for (const [k, b] of Object.entries(this.bounds)) b.addEventListener('click', () => app.setDiscoverBounds(k));
  }

  /** Restarting throws the progress away, so it takes a second press to confirm. */
  onRestart() {
    clearTimeout(this.confirmTimer);
    if (this.confirming) {
      this.confirming = false;
      this.app.restartDiscovery();
      this.next.querySelector('button')?.focus();
      return;
    }
    this.confirming = true;
    this.render();
    this.confirmTimer = setTimeout(() => {
      this.confirming = false;
      this.render();
    }, 4000);
  }

  render() {
    const { app } = this;
    const d = app.discovery;
    const info = app.discoveryInfo;
    this.button.setAttribute('aria-pressed', String(app.discovering));
    this.root.hidden = !app.discovering;
    if (!app.discovering || !info) return;
    const cons = app.catalog.constellations;
    const place = app.place.name;
    this.root.classList.toggle('collapsed', d.collapsed);
    this.body.hidden = d.collapsed;
    this.collapse.setAttribute('aria-expanded', String(!d.collapsed));
    this.collapse.setAttribute('aria-label', d.collapsed ? 'Visa grannarna' : 'Fäll ihop');
    const of = d.all ? 'grupper' : `grupper som syns från ${place}`;
    this.count.textContent = `${info.foundInGoal} av ${info.goal}`;
    this.of.textContent = of;
    this.bar.style.width = `${(100 * info.foundInGoal) / info.goal}%`;
    this.meter.setAttribute('aria-valuenow', String(info.foundInGoal));
    this.meter.setAttribute('aria-valuemax', String(info.goal));
    this.meter.setAttribute('aria-valuetext', `${info.foundInGoal} av ${info.goal} ${of}`);

    const chunks = app.chunks;
    const left = chunks.length - d.groups.size;
    const last = chunks[app.lastGroup];
    const recent = last ? `${last.name} är upptäckt: ${listOf(last.members.map((i) => cons[i].sv))}. ` : '';
    let hint;
    if (info.done && (d.all || !left)) hint = `${recent}Hela himlen! Du har hittat alla ${chunks.length} grupper, alla ${cons.length} stjärnbilder.`;
    else if (info.done) hint = `${recent}Klart! Du har hittat alla ${info.goal} grupper som syns från ${place}.`;
    else if (d.groups.size === 1) {
      const start = chunks[[...d.groups][0]];
      hint = `Här är ${start.name}: ${listOf(start.members.map((i) => cons[i].sv))}. Lägg till en grannegrupp genom att trycka på den på himlen eller här:`;
    } else if (d.all) hint = `${recent}De här syns aldrig från ${place}${app.layers.seeThrough ? ', så marken är genomskinlig' : '. Slå på Se genom marken för att se dem'}. Lägg till en grannegrupp:`;
    else hint = `${recent}Lägg till en grannegrupp:`;
    // The hint is a live region, so it is only written when it says something new.
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    this.rest.hidden = !(info.done && !d.all && left);
    this.rest.textContent = `Fortsätt med resten av himlen (${left} ${left === 1 ? 'grupp' : 'grupper'} till)`;
    this.restart.textContent = this.confirming ? 'Säker? Tryck igen' : 'Börja om';
    const bounds = app.discoverBounds();
    for (const [k, b] of Object.entries(this.bounds)) b.setAttribute('aria-pressed', String(k === bounds));
    this.restart.disabled = d.groups.size === 1 && !d.all;

    const key = info.next.join(',');
    if (key !== this.nextKey) {
      this.nextKey = key;
      // Keep keyboard focus in the row when the pressed button goes away.
      const focusAt = [...this.next.children].indexOf(document.activeElement);
      // In the order "Träna" takes them, which is roughly from the pole outwards.
      this.next.replaceChildren(...info.next.map((g) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.group = String(g);
        // A colour of its own for designs that colour the neighbours, the same every time,
        // and seldom the same as the one beside it.
        b.dataset.hue = String(g % 7);
        const name = document.createElement('span');
        name.textContent = `+ ${chunks[g].name}`;
        const state = document.createElement('span');
        state.className = 'state';
        b.append(name, state);
        b.addEventListener('click', () => app.discoverGroup(g, { fly: true }));
        return b;
      }));
      this.next.hidden = !info.next.length;
      this.next.scrollLeft = 0;
      if (focusAt >= 0) {
        const target = this.next.children[Math.min(focusAt, this.next.children.length - 1)] || (this.rest.hidden ? this.restart : this.rest);
        target.focus();
      }
    }
    this.syncStates();
  }

  /** Marks the groups on offer that are below the horizon now (the sky turns, so this runs every second). */
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
      b.setAttribute('aria-label', `Lägg till ${app.chunks[g].name}${st === 'down' ? ', under horisonten just nu' : st === 'rising' ? ', delvis under horisonten just nu' : ''}`);
    }
  }
}
