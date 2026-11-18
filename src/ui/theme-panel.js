// The "Design" panel: a list of interface designs to switch between, and below it the
// look of the sky, which is a choice of its own.
import { THEMES } from './themes.js';

export class ThemePanel {
  /**
   * @param {object} app  see App: theme, setTheme, skyLook, setSkyLook, closeList, closeWhen, closeGroups, closeSky, layoutChanged
   * @param {(id: string) => HTMLElement} $
   */
  constructor(app, $) {
    this.app = app;
    this.panel = $('panel-theme');
    this.button = $('btn-theme');
    this.list = $('theme-list');
    for (const t of THEMES) {
      const label = document.createElement('label');
      label.className = 'theme-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'theme';
      input.value = t.id;
      input.addEventListener('change', () => app.setTheme(t.id));
      const name = document.createElement('span');
      name.className = 'theme-name';
      name.textContent = t.name;
      const note = document.createElement('span');
      note.className = 'theme-note';
      note.textContent = t.note;
      label.append(input, name, note);
      this.list.append(label);
    }
    this.looks = [...$('sky-look').querySelectorAll('[data-look]')];
    for (const b of this.looks) b.addEventListener('click', () => app.setSkyLook(b.dataset.look));
    this.button.addEventListener('click', () => this.toggle());
    // Closed with its own button, the panel gives the focus back to the one that opens it.
    $('btn-theme-close').addEventListener('click', () => {
      this.toggle(false);
      this.button.focus();
    });
  }

  get open() {
    return !this.panel.hidden;
  }

  toggle(force) {
    const open = force ?? this.panel.hidden;
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.app.closeList();
      this.app.closeWhen();
      this.app.closeGroups();
      this.app.closeSky();
      this.sync();
      // The design chosen is in sight, also where the list is longer than its room.
      this.list.querySelector('input:checked')?.closest('label').scrollIntoView?.({ block: 'nearest' });
    }
    this.app.layoutChanged();
  }

  sync() {
    for (const input of this.list.querySelectorAll('input')) input.checked = input.value === this.app.theme;
    for (const b of this.looks) b.setAttribute('aria-pressed', String(b.dataset.look === this.app.skyLook));
  }
}
