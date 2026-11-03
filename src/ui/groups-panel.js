// "Grupper": an overview of the groups "Träna" goes through, step by step, how far each has
// come, and how far to go. Choosing a group takes it up to learn now. A step learnt in full
// is a milestone, marked at its heading, and can be practised as a whole from there.
import { STAGES } from '../sky/curriculum.js';
import { groupDone } from '../sky/training.js';
import { MILESTONE } from './train-panel.js';

const STAGE_TITLES = ['Vinterhimlen', 'Resten av Sverige', 'Resten av himlen'];

export class GroupsPanel {
  /**
   * @param {object} app  see App: catalog, chunks, training, trainingGroup, trainingGroupShown,
   *   chooseTrainingGroup, closeList, closeTheme, closeWhen, layoutChanged
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.panel = $('panel-groups');
    this.button = $('btn-train-groups');
    this.list = $('group-list');
    this.rows = [];
    this.heads = [];
    STAGES.forEach((stage, s) => {
      const chunks = app.chunks.filter((ch) => ch.stage === s + 1);
      const head = document.createElement('li');
      head.className = 'group-stage';
      const title = document.createElement('span');
      title.className = 'group-stage-name';
      title.textContent = `${s + 1}. ${STAGE_TITLES[s]} · ${chunks.length} grupper`;
      const state = document.createElement('span');
      state.className = 'group-stage-state';
      // Practising a milestone takes in the steps before it: the winter sky, all of
      // Sweden's, the whole sky.
      const practise = document.createElement('button');
      practise.type = 'button';
      practise.className = 'chip group-practice';
      practise.textContent = MILESTONE[stage.id].practice;
      practise.addEventListener('click', () => app.startPractice(stage.id));
      head.append(title, state, practise);
      this.list.append(head);
      this.heads.push({ stage: stage.id, state, practise, groups: chunks.map((ch) => ch.members) });
      for (const ch of chunks) {
        const k = app.chunks.indexOf(ch);
        const li = document.createElement('li');
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'con-name';
        const name = document.createElement('strong');
        name.textContent = `${k + 1}. ${ch.name}`;
        const members = document.createElement('span');
        members.className = 'group-members';
        members.textContent = ch.members.map((i) => app.catalog.constellations[i].sv).join(', ');
        pick.append(name, members);
        pick.addEventListener('click', () => app.chooseTrainingGroup(k));
        const state = document.createElement('span');
        state.className = 'state';
        li.append(pick, state);
        this.list.append(li);
        this.rows.push({ li, pick, state, members: ch.members });
      }
    });
    this.button.addEventListener('click', () => this.toggle());
    $('btn-groups-close').addEventListener('click', () => this.toggle(false));
  }

  get open() {
    return !this.panel.hidden;
  }

  toggle(force) {
    const open = force ?? this.panel.hidden;
    // Closed from within or with its own button, focus goes back to the card, so that
    // Space goes on with it.
    const within = !open && (this.panel.contains(document.activeElement) || document.activeElement === this.button);
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.app.closeList();
      this.app.closeTheme();
      this.app.closeWhen();
      this.render();
      this.rows[this.app.trainingGroupShown()]?.li.scrollIntoView({ block: 'nearest' });
    }
    this.app.layoutChanged();
    if (within && this.app.training.on) this.app.trainPanel.focusCard();
  }

  /**
   * Each group's state: being learnt now, a card of it being repeated now, learnt, how many
   * of it are known, or not begun. The group marked on the sky is the one picked out: the
   * one being learnt, or the one a card is repeated from, or the one shown whole.
   */
  render() {
    if (!this.open) return;
    const { cards, group, view, milestones, practice } = this.app.training;
    const marked = this.app.trainingGroupShown();
    const repeated = !view && marked !== group ? marked : -1;
    for (const head of this.heads) {
      const reached = milestones.has(head.stage);
      const done = head.groups.filter((members) => groupDone(cards, members)).length;
      // Practised only while the round is under way; the milestone stays in sight.
      const practising = practice?.stage === head.stage && !(view && view.group < 0);
      head.state.textContent = reached ? (practising ? '★ klar · övas nu' : '★ klar')
        : done ? `${done} av ${head.groups.length} klara` : '';
      head.practise.hidden = !reached;
    }
    this.rows.forEach((row, k) => {
      const known = row.members.filter((i) => cards.get(i)?.level >= 1).length;
      const begun = row.members.some((i) => cards.get(i)?.n > 0);
      row.li.classList.toggle('is-selected', k === marked);
      if (k === marked) row.pick.setAttribute('aria-current', 'true');
      else row.pick.removeAttribute('aria-current');
      row.state.textContent = k === group ? 'tränas nu' : k === repeated ? (practice ? 'övas nu' : 'repeteras nu') : groupDone(cards, row.members) ? 'kan du'
        : begun ? `${known} av ${row.members.length}` : '';
    });
  }
}
