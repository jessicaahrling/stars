// "Upptäck himlen": progress, and the neighbours that can be added next.

const STATE_TEXT = { rising: 'delvis uppe', down: 'nere' };

export class DiscoverPanel {
  /**
   * @param {object} app  see App: catalog, place, layers, discovery, discoveryInfo, lastFound,
   *   setDiscover, discover, discoverRest, restartDiscovery, figureStateOf, saveSoon
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
    this.button.addEventListener('click', () => app.setDiscover(!app.discovery.on));
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
    this.button.setAttribute('aria-pressed', String(d.on));
    this.root.hidden = !d.on;
    if (!d.on || !info) return;
    const cons = app.catalog.constellations;
    const place = app.place.name;
    this.root.classList.toggle('collapsed', d.collapsed);
    this.body.hidden = d.collapsed;
    this.collapse.setAttribute('aria-expanded', String(!d.collapsed));
    this.collapse.setAttribute('aria-label', d.collapsed ? 'Visa grannarna' : 'Fäll ihop');
    this.count.textContent = `${info.foundInGoal} av ${info.goal}`;
    this.of.textContent = d.all ? 'stjärnbilder' : `som syns från ${place}`;
    this.bar.style.width = `${(100 * info.foundInGoal) / info.goal}%`;
    this.meter.setAttribute('aria-valuenow', String(info.foundInGoal));
    this.meter.setAttribute('aria-valuemax', String(info.goal));
    this.meter.setAttribute('aria-valuetext', `${info.foundInGoal} av ${info.goal} ${d.all ? 'stjärnbilder' : `som syns från ${place}`}`);

    const left = cons.length - d.found.size;
    const last = cons[app.lastFound];
    const recent = last ? `${last.sv} är ${last.plural ? 'upptäckta' : 'upptäckt'}! ` : '';
    let hint;
    if (info.done && (d.all || !left)) hint = `Hela himlen! Du har hittat alla ${cons.length} stjärnbilder.`;
    else if (info.done) hint = `${recent}Klart! Du har hittat alla ${info.goal} som syns från ${place}.`;
    else if (d.found.size === 1) hint = 'Här är Stora björnen. Lägg till en granne genom att trycka på den på himlen eller här:';
    else if (d.all) hint = `${recent}De här syns aldrig från ${place}${app.layers.seeThrough ? ', så marken är genomskinlig' : '. Slå på Se genom marken för att se dem'}. Lägg till en granne:`;
    else hint = `${recent}Lägg till en granne:`;
    // The hint is a live region, so it is only written when it says something new.
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    this.rest.hidden = !(info.done && !d.all && left);
    this.rest.textContent = `Fortsätt med resten av himlen (${left} till)`;
    this.restart.textContent = this.confirming ? 'Säker? Tryck igen' : 'Börja om';
    this.restart.disabled = d.found.size === 1 && !d.all;

    const key = info.next.join(',');
    if (key !== this.nextKey) {
      this.nextKey = key;
      // Keep keyboard focus in the row when the pressed button goes away.
      const focusAt = [...this.next.children].indexOf(document.activeElement);
      const sorted = info.next.map((i) => cons[i]).sort((a, b) => a.sv.localeCompare(b.sv, 'sv'));
      this.next.replaceChildren(...sorted.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.id = c.id;
        const name = document.createElement('span');
        name.textContent = `+ ${c.sv}`;
        const state = document.createElement('span');
        state.className = 'state';
        b.append(name, state);
        b.addEventListener('click', () => app.discover(c.index, { fly: true }));
        return b;
      }));
      this.next.hidden = !sorted.length;
      this.next.scrollLeft = 0;
      if (focusAt >= 0) {
        const target = this.next.children[Math.min(focusAt, this.next.children.length - 1)] || (this.rest.hidden ? this.restart : this.rest);
        target.focus();
      }
    }
    this.syncStates();
  }

  /** Marks the neighbours on offer that are below the horizon now (the sky turns, so this runs every second). */
  syncStates() {
    const { app } = this;
    if (!app.discovery.on || this.root.hidden) return;
    for (const b of this.next.children) {
      const c = app.catalog.byId.get(b.dataset.id);
      const st = app.layers.seeThrough ? 'up' : app.figureStateOf(c);
      const text = STATE_TEXT[st] || '';
      const state = b.lastElementChild;
      if (state.textContent !== text) state.textContent = text;
      b.classList.toggle('below', st === 'down');
      b.setAttribute('aria-label', `Lägg till ${c.sv}${st === 'down' ? ', under horisonten just nu' : st === 'rising' ? ', delvis under horisonten just nu' : ''}`);
    }
  }
}
