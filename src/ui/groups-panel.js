// "Grupper": an overview of the groups "Träna" goes through, step by step, how far each has
// come, and how far to go. Choosing a group takes it up to learn now.
import { STAGES } from '../sky/curriculum.js';
import { groupDone } from '../sky/training.js';

const STAGE_TITLES = ['Vinterhimlen', 'Resten av Sverige', 'Resten av himlen'];

export class GroupsPanel {
  /**
   * @param {object} app  see App: catalog, chunks, training, trainingGroup, chooseTrainingGroup,
   *   closeList, closeTheme, closeWhen, layoutChanged
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.panel = $('panel-groups');
    this.button = $('btn-train-groups');
    this.list = $('group-list');
    this.rows = [];
    STAGES.forEach((stage, s) => {
      const chunks = app.chunks.filter((ch) => ch.stage === s + 1);
      const head = document.createElement('li');
      head.className = 'group-stage';
      head.textContent = `${s + 1}. ${STAGE_TITLES[s]} · ${chunks.length} grupper`;
      this.list.append(head);
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
    // Closed from within, focus goes back to the card, so that Space goes on with it.
    const within = !open && this.panel.contains(document.activeElement);
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.app.closeList();
      this.app.closeTheme();
      this.app.closeWhen();
      this.render();
      this.rows[this.app.training.group]?.li.scrollIntoView({ block: 'nearest' });
    }
    this.app.layoutChanged();
    if (within && this.app.training.on) this.app.trainPanel.focusCard();
  }

  /** Each group's state: being learnt now, learnt, how many of it are known, or not begun. */
  render() {
    if (!this.open) return;
    const { cards, group } = this.app.training;
    this.rows.forEach((row, k) => {
      const known = row.members.filter((i) => cards.get(i)?.level >= 1).length;
      const begun = row.members.some((i) => cards.get(i)?.n > 0);
      row.li.classList.toggle('is-selected', k === group);
      if (k === group) row.pick.setAttribute('aria-current', 'true');
      else row.pick.removeAttribute('aria-current');
      row.state.textContent = k === group ? 'tränas nu' : groupDone(cards, row.members) ? 'kan du'
        : begun ? `${known} av ${row.members.length}` : '';
    });
  }
}
