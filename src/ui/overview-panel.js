// "Överblick": the sky with all its constellations, or only some of them (the winter sky,
// those seen from here), their pictures on or off, and a tap on one opens its card. Which
// ones are shown is the constellation list's own filter, so that the list and the sky agree.

const SCOPES = ['winter', 'year', 'all'];

export class OverviewPanel {
  /**
   * @param {object} app  see App: overviewing, setOverview, list (scope, setScope), scopeCount,
   *   place, layerPressed, setLayer, selected, catalog
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.root = $('panel-overview');
    this.button = $('btn-overview');
    this.count = $('overview-count');
    this.of = $('overview-of');
    this.hint = $('overview-hint');
    this.art = $('overview-art');
    this.place = $('overview-place');
    this.scopes = Object.fromEntries(SCOPES.map((s) => [s, $(`overview-${s}`)]));
    this.counts = Object.fromEntries(SCOPES.map((s) => [s, $(`overview-${s}-count`)]));
    this.button.addEventListener('click', () => app.setOverview(!app.overviewing));
    $('btn-overview-exit').addEventListener('click', () => {
      app.setOverview(false);
      this.button.focus();
    });
    for (const [scope, b] of Object.entries(this.scopes)) b.addEventListener('click', () => app.list.setScope(scope));
    this.art.addEventListener('click', () => app.setLayer('art', !app.layerPressed('art')));
  }

  render() {
    const { app } = this;
    const on = app.overviewing;
    this.button.setAttribute('aria-pressed', String(on));
    this.root.hidden = !on;
    if (!on) return;
    const scope = app.list.scope;
    const place = app.place.name;
    for (const s of SCOPES) {
      this.scopes[s].setAttribute('aria-pressed', String(s === scope));
      this.counts[s].textContent = String(app.scopeCount(s));
    }
    this.place.textContent = place;
    this.count.textContent = String(app.scopeCount(scope));
    this.of.textContent = { winter: 'i vinterhimlen', year: `som syns från ${place}`, all: 'på hela himlen' }[scope];
    this.art.setAttribute('aria-pressed', String(app.layerPressed('art')));
    const chosen = app.catalog.constellations[app.selected];
    // On a phone the panel folds up to its hint while a card is open, so that the sky shows.
    this.root.classList.toggle('has-card', Boolean(chosen));
    const hint = chosen ? `Det här är ${chosen.sv}. Tryck på en annan stjärnbild för att läsa om den, eller på ${chosen.sv} igen för att stänga kortet.`
      : 'Tryck på en stjärnbild för att läsa mer om den.';
    // The hint is a live region, so it is only written when it says something new.
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
  }
}
