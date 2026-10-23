// "Upptäck himlen": progress, and the neighbours that can be added next.

export class DiscoverPanel {
  /**
   * @param {object} app  see App: catalog, place, discovery, discoveryInfo, setDiscover,
   *   discover, discoverRest, restartDiscovery
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.root = $('panel-discover');
    this.button = $('btn-discover');
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
    $('btn-discover-exit').addEventListener('click', () => app.setDiscover(false));
    this.rest.addEventListener('click', () => app.discoverRest());
    this.restart.addEventListener('click', () => this.onRestart());
  }

  /** Restarting throws the progress away, so it takes a second press to confirm. */
  onRestart() {
    clearTimeout(this.confirmTimer);
    if (this.confirming) {
      this.confirming = false;
      this.app.restartDiscovery();
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
    this.button.setAttribute('aria-pressed', String(d.on));
    this.root.hidden = !d.on;
    if (!d.on) return;
    const info = app.discoveryInfo;
    const cons = app.catalog.constellations;
    this.count.textContent = `${info.foundInGoal} av ${info.goal}`;
    this.of.textContent = d.all ? 'stjärnbilder' : `som syns från ${app.place.name}`;
    this.bar.style.width = `${(100 * info.foundInGoal) / info.goal}%`;
    this.meter.setAttribute('aria-valuenow', String(info.foundInGoal));
    this.meter.setAttribute('aria-valuemax', String(info.goal));

    const left = cons.length - d.found.size;
    if (info.done && (d.all || !left)) this.hint.textContent = `Hela himlen! Du har hittat alla ${cons.length} stjärnbilder.`;
    else if (info.done) this.hint.textContent = `Klart! Du har hittat alla ${info.goal} som syns från ${app.place.name}.`;
    else if (d.found.size === 1) this.hint.textContent = 'Här är Stora björnen. Lägg till en granne genom att trycka på den på himlen eller här:';
    else this.hint.textContent = 'Lägg till en granne:';
    this.rest.hidden = !(info.done && !d.all && left);
    this.rest.textContent = `Fortsätt med resten av himlen (${left} till)`;
    this.restart.textContent = this.confirming ? 'Säker? Tryck igen' : 'Börja om';
    this.restart.disabled = d.found.size === 1 && !d.all;

    const key = info.next.join(',');
    if (key === this.nextKey) return;
    this.nextKey = key;
    const sorted = info.next.map((i) => cons[i]).sort((a, b) => a.sv.localeCompare(b.sv, 'sv'));
    this.next.replaceChildren(...sorted.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.id = c.id;
      b.textContent = `+ ${c.sv}`;
      b.setAttribute('aria-label', `Lägg till ${c.sv}`);
      b.addEventListener('click', () => app.discover(c.index, { fly: true }));
      return b;
    }));
    this.next.hidden = !sorted.length;
  }
}
