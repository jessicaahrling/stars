// "Träna": the card being practised, the buttons for each step and the progress. The
// panel uses the Upptäck panel's classes, so that every design styles both alike.
import { visibilityClass } from '../astro/visibility.js';
import { STORIES } from '../data/stories-sv.js';

/** How the progress names each step. */
const AMONG = { winter: 'i vinterhimlen', sweden: 'av dem som syns från Sverige', all: 'på hela himlen' };

export class TrainPanel {
  /**
   * @param {object} app  see App: catalog, training, trainingProgress, trainingStage, chunks, chunkOf, stages, scopeCount,
   *   setTraining, setTrainingGoal, advanceTraining, revealTraining, answerTraining, restartTraining
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
    this.goals = { winter: $('train-goal-winter'), sweden: $('train-goal-sweden'), all: $('train-goal-all') };
    this.goalCounts = { winter: $('train-goal-winter-count'), sweden: $('train-goal-sweden-count'), all: $('train-goal-all-count') };
    this.groupName = $('train-group-name');
    this.groupCount = $('train-group-count');
    this.storyGroup = $('train-story-group');
    this.groupText = $('train-group-text');
    for (const [goal, b] of Object.entries(this.goals)) b.addEventListener('click', () => app.setTrainingGoal(goal));
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
    this.root.dataset.step = String(t.step);
    // The constellation list would give the answers away (and fly off the card).
    app.list.button.disabled = t.on;
    if (!t.on) return;
    const active = document.activeElement;
    const p = app.trainingProgress();
    // The progress is that of the step being learnt, with the steps before it.
    const { stage, known, size, permanent, inPlay } = app.trainingStage();
    for (const [goal, b] of Object.entries(this.goals)) {
      b.setAttribute('aria-pressed', String(goal === t.goal));
      this.goalCounts[goal].textContent = String(app.scopeCount(goal));
    }
    this.count.textContent = `${known} av ${size}`;
    this.of.textContent = `kan du ${AMONG[stage.id]} · ${permanent} permanent · ${inPlay} i spel`;
    this.bar.style.width = `${size ? (100 * known) / size : 0}%`;
    this.meter.setAttribute('aria-valuenow', String(known));
    this.meter.setAttribute('aria-valuemax', String(size));
    this.meter.setAttribute('aria-valuetext', `Du kan ${known} av ${size} ${AMONG[stage.id]}, ${permanent} permanent`);
    this.restart.textContent = this.confirming ? 'Säker? Tryck igen' : 'Börja om';
    this.restart.disabled = t.cards.size === 0;

    // The group being learnt, and how many of it are known this time round.
    const learning = app.chunks[t.group];
    if (learning) {
      const done = learning.members.filter((i) => t.groupSeen.has(i) && t.cards.get(i)?.level >= 1).length;
      this.groupName.textContent = `Grupp ${t.group + 1} av ${app.chunks.length}: ${learning.name}`;
      this.groupCount.textContent = `· ${done} av ${learning.members.length} kan du`;
    } else {
      this.groupName.textContent = 'Alla grupper är klara';
      this.groupCount.textContent = '· nu repeterar du';
    }

    const c = app.catalog.constellations[t.card];
    const card = t.cards.get(t.card);
    const isNew = !card || card.n === 0;
    let prompt;
    const group = c && app.chunkOf.get(t.card);
    if (!c) prompt = 'Det finns inga stjärnbilder att träna på.';
    else if (t.step === 1) {
      prompt = learning && !learning.members.includes(t.card) ? 'Repetition: vilken stjärnbild är det här?'
        : isNew ? 'En ny stjärnbild! Titta på stjärnorna. Vet du vilken det är?' : 'Vilken stjärnbild är det här?';
      if (t.notice) {
        prompt = `Du kan gruppen ”${t.notice.done}”. ${t.notice.next ? `Nu kommer ”${t.notice.next}”.` : 'Nu repeterar du.'} ${prompt}`;
      }
      if (p.done) prompt = `Du kan alla ${p.goal} ${AMONG[t.goal]}! Fortsätt att repetera. ${prompt}`;
      if (t.below) {
        const never = visibilityClass(c.figureDecs, app.view.lat) === 'never';
        prompt += app.stages[t.card] === 3 ? ' Den går aldrig upp över horisonten i Sverige, så marken är genomskinlig.'
          : never ? ` Den går aldrig upp från ${app.place.name}, bara längre söderut i Sverige, så marken är genomskinlig.`
            : ' Den är under horisonten just nu, så marken är genomskinlig.';
      }
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
    // Named, the card's story says why its group belongs together.
    if (group) {
      this.storyGroup.textContent = `Grupp ${app.chunks.indexOf(group) + 1}, ${group.name}:`;
      this.groupText.textContent = group.reason;
    }
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
