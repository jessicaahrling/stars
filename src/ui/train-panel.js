// "Träna": the card being practised, the buttons for each step and the progress. The
// panel uses the Upptäck panel's classes, so that every design styles both alike.
import { STORIES } from '../data/stories-sv.js';

export class TrainPanel {
  /**
   * @param {object} app  see App: catalog, place, training, trainingProgress, scopeCount, setTraining,
   *   setTrainingGoal, advanceTraining, revealTraining, answerTraining, restartTraining
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
    this.goals = { year: $('train-goal-year'), winter: $('train-goal-winter') };
    this.goalCounts = { year: $('train-goal-year-count'), winter: $('train-goal-winter-count') };
    for (const [goal, b] of Object.entries(this.goals)) {
      b.addEventListener('click', () => {
        app.setTrainingGoal(goal);
        // Space then goes on as a tap on the sky does, rather than pressing the chip again.
        if (app.training.step < 3) this.actions.querySelector('.primary')?.focus();
        else this.answer.focus();
      });
    }
    this.prompt = $('train-prompt');
    this.answer = $('train-answer');
    this.name = $('train-name');
    this.latin = $('train-latin');
    this.actions = $('train-actions');
    this.view = $('train-view');
    this.story = $('train-story');
    this.storyTitle = $('train-story-title');
    this.storyOrigin = $('train-story-origin');
    this.storyText = $('train-story-text');
    this.storySpecial = $('train-story-special');
    // Open or folded up, as the learner left it.
    this.story.open = app.training.showStory;
    this.story.addEventListener('toggle', () => app.setTrainingStory(this.story.open));
    this.linesButton = $('btn-train-lines');
    this.artButton = $('btn-train-art');
    this.linesButton.addEventListener('click', () => app.toggleTrainingView('lines'));
    this.artButton.addEventListener('click', () => app.toggleTrainingView('art'));
    this.restart = $('btn-train-restart');
    this.actionsKey = '';
    this.confirming = false;
    this.button.addEventListener('click', () => {
      app.setTraining(!app.training.on);
      // Space then shows the next step rather than pressing this toggle again.
      if (app.training.on) this.actions.querySelector('.primary')?.focus();
    });
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
    // The constellation list would give the answers away (and fly off the card).
    app.list.button.disabled = t.on;
    if (!t.on) return;
    const active = document.activeElement;
    const p = app.trainingProgress();
    const place = app.place.name;
    const where = t.goal === 'winter' ? `från ${place} på vinterkvällar` : `från ${place}`;
    for (const [goal, b] of Object.entries(this.goals)) {
      b.setAttribute('aria-pressed', String(goal === t.goal));
      this.goalCounts[goal].textContent = String(app.scopeCount(goal));
    }
    this.count.textContent = `${p.known} av ${p.goal}`;
    this.of.textContent = `kan du · ${p.permanent} permanent · ${p.inPlay} i spel`;
    this.bar.style.width = `${p.goal ? (100 * p.known) / p.goal : 0}%`;
    this.meter.setAttribute('aria-valuenow', String(p.known));
    this.meter.setAttribute('aria-valuemax', String(p.goal));
    this.meter.setAttribute('aria-valuetext', `Du kan ${p.known} av ${p.goal} som syns ${where}, ${p.permanent} av dem permanent`);
    this.restart.textContent = this.confirming ? 'Säker? Tryck igen' : 'Börja om';
    this.restart.disabled = t.cards.size === 0;

    const c = app.catalog.constellations[t.card];
    const card = t.cards.get(t.card);
    const isNew = !card || card.n === 0;
    let prompt;
    if (!c) prompt = `Det finns inga stjärnbilder att träna på ${where}.`;
    else if (t.step === 1) {
      prompt = isNew ? 'En ny stjärnbild! Titta på stjärnorna. Vet du vilken det är?' : 'Vilken stjärnbild är det här?';
      if (p.done) prompt = `Du kan alla ${p.goal} som syns ${where}! Fortsätt att repetera. ${prompt}`;
      if (t.below) prompt += ' Den är under horisonten just nu, så marken är genomskinlig.';
    } else if (t.step === 2) {
      prompt = 'Här är linjerna. Vilken stjärnbild är det?';
    } else {
      prompt = 'Kunde du den? Tryck på himlen igen om du kan den för tillfället.';
    }
    // The prompt is a live region, so it is only written when it says something new. The
    // name is spoken with it; on screen it stands in large type below.
    const said = c && t.step === 3 ? `Det var ${c.sv} (${c.la}). ` : '';
    if (this.prompt.textContent !== said + prompt) {
      const name = document.createElement('span');
      name.className = 'sr-only';
      name.textContent = said;
      this.prompt.replaceChildren(...(said ? [name] : []), prompt);
    }
    this.answer.hidden = !c || t.step < 3;
    this.view.hidden = !c || t.step < 3;
    const story = c && STORIES[c.id];
    this.story.hidden = !story || t.step < 3;
    if (story) {
      this.storyTitle.textContent = `Om ${c.sv}`;
      this.storyOrigin.textContent = story.origin;
      this.storyText.textContent = story.story;
      this.storySpecial.textContent = story.special;
    }
    this.linesButton.setAttribute('aria-pressed', String(t.showLines));
    this.artButton.setAttribute('aria-pressed', String(t.showArt));
    if (c) {
      this.name.textContent = c.sv;
      this.latin.textContent = c.la;
    }

    const key = c ? `${t.card}:${t.step}` : '';
    if (key === this.actionsKey) return;
    this.actionsKey = key;
    const focused = this.actions.contains(active) || active === this.answer;
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
            button('Fel', () => app.answerTraining('again'), { title: 'Tangent 1: kommer tillbaka efter två andra' }),
            button('Kan för tillfället', () => app.answerTraining('now'), {
              primary: true,
              title: 'Tangent 2, mellanslag eller tryck på himlen: räknas som kunnad och kommer tillbaka efter en stund, sedan allt mer sällan',
            }),
            button('Kan permanent', () => app.answerTraining('permanent'), { title: 'Tangent 3: kommer bara tillbaka då och då' }),
          ];
    this.actions.replaceChildren(...buttons);
    // Focus follows the steps. Once named it rests on the name, never on an answer button,
    // so that Space means "Kan för tillfället" as a tap on the sky does, never another answer.
    if (focused && buttons.length) {
      if (t.step === 3) this.answer.focus();
      else buttons.find((b) => b.classList.contains('primary'))?.focus();
    }
  }
}
