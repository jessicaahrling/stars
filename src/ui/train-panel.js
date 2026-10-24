// "Träna": the card being practised, the buttons for each step and the progress. The
// panel uses the Upptäck panel's classes, so that every design styles both alike.

export class TrainPanel {
  /**
   * @param {object} app  see App: catalog, place, training, trainingProgress, setTraining,
   *   advanceTraining, revealTraining, answerTraining, restartTraining
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.root = $('panel-train');
    this.button = $('btn-train');
    this.count = $('train-count');
    this.of = $('train-of');
    this.meter = $('train-meter');
    this.bar = $('train-bar');
    this.prompt = $('train-prompt');
    this.answer = $('train-answer');
    this.name = $('train-name');
    this.latin = $('train-latin');
    this.actions = $('train-actions');
    this.restart = $('btn-train-restart');
    this.actionsKey = '';
    this.confirming = false;
    this.button.addEventListener('click', () => app.setTraining(!app.training.on));
    $('btn-train-exit').addEventListener('click', () => {
      app.setTraining(false);
      this.button.focus();
    });
    this.restart.addEventListener('click', () => this.onRestart());
  }

  /** Starting over forgets what has been learnt, so it takes a second press to confirm. */
  onRestart() {
    clearTimeout(this.confirmTimer);
    if (this.confirming) {
      this.confirming = false;
      this.app.restartTraining();
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
    const t = app.training;
    this.button.setAttribute('aria-pressed', String(t.on));
    this.root.hidden = !t.on;
    if (!t.on) return;
    const p = app.trainingProgress();
    const place = app.place.name;
    this.count.textContent = `${p.known} av ${p.goal}`;
    this.of.textContent = `kan du · ${p.inPlay} i spel`;
    this.bar.style.width = `${p.goal ? (100 * p.known) / p.goal : 0}%`;
    this.meter.setAttribute('aria-valuenow', String(p.known));
    this.meter.setAttribute('aria-valuemax', String(p.goal));
    this.meter.setAttribute('aria-valuetext', `Du kan ${p.known} av ${p.goal} som syns från ${place}`);
    this.restart.textContent = this.confirming ? 'Säker? Tryck igen' : 'Börja om';
    this.restart.disabled = t.cards.size === 0;

    const c = app.catalog.constellations[t.card];
    const card = t.cards.get(t.card);
    const isNew = !card || card.n === 0;
    let prompt;
    if (!c) prompt = `Det finns inga stjärnbilder att träna på från ${place}.`;
    else if (t.step === 1) {
      prompt = isNew ? 'En ny stjärnbild! Titta på stjärnorna. Vet du vilken det är?' : 'Vilken stjärnbild är det här?';
      if (p.done) prompt = `Du kan alla ${p.goal} som syns från ${place}! Fortsätt att repetera. ${prompt}`;
      if (t.below) prompt += ' Den är under horisonten just nu, så marken är genomskinlig.';
    } else if (t.step === 2) {
      prompt = 'Här är linjerna. Vilken stjärnbild är det?';
    } else {
      prompt = isNew ? 'Kunde du den redan?' : 'Visste du?';
    }
    // The prompt is a live region, so it is only written when it says something new.
    if (this.prompt.textContent !== prompt) this.prompt.textContent = prompt;
    this.answer.hidden = !c || t.step < 3;
    if (c) {
      this.name.textContent = c.sv;
      this.latin.textContent = c.la;
    }

    const key = c ? `${t.card}:${t.step}` : '';
    if (key === this.actionsKey) return;
    this.actionsKey = key;
    const focused = this.actions.contains(document.activeElement);
    const button = (text, onClick, { primary = false, title = '' } = {}) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'chip primary' : 'chip';
      b.textContent = text;
      if (title) b.title = title;
      b.addEventListener('click', onClick);
      return b;
    };
    const buttons = !c ? []
      : t.step === 1 ? [
        button('Visa linjerna', () => app.advanceTraining(), { primary: true, title: 'Mellanslag, eller tryck på himlen' }),
        button('Visa svaret', () => app.revealTraining()),
      ]
        : t.step === 2 ? [button('Visa svaret', () => app.advanceTraining(), { primary: true, title: 'Mellanslag, eller tryck på himlen' })]
          : [
            button('Fel', () => app.answerTraining('again'), { title: 'Tangent 1: visas snart igen' }),
            button('Rätt', () => app.answerTraining('good'), { primary: true, title: 'Tangent 2' }),
            button('Lätt', () => app.answerTraining('easy'), { title: 'Tangent 3: dröjer längre till nästa gång' }),
          ];
    this.actions.replaceChildren(...buttons);
    if (focused && buttons.length) buttons.find((b) => b.classList.contains('primary'))?.focus();
  }
}
