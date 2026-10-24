// Place and time controls.
import { PLACES } from '../data/places.js';
import { formatClock, formatDateInput, formatShort, fromLocal, localParts } from './format.js';

export class WhenPanel {
  constructor(app, $) {
    this.app = app;
    this.panel = $('panel-when');
    this.button = $('btn-when');
    this.placeSelect = $('place');
    this.date = $('date');
    this.clock = $('clock');
    this.clockOut = $('clock-out');
    this.chipPlace = $('when-place');
    this.chipTime = $('when-time');
    this.chipLive = $('when-live');
    this.speedButtons = [...$('speed').querySelectorAll('button')];

    for (const p of PLACES) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.name} (${p.lat.toFixed(1).replace('.', ',')}° N)`;
      this.placeSelect.append(o);
    }
    this.placeSelect.addEventListener('change', () => app.setPlace(this.placeSelect.value));
    this.button.addEventListener('click', () => this.toggle());
    this.date.addEventListener('change', () => this.applyDateTime());
    this.clock.addEventListener('input', () => {
      this.clockOut.textContent = this.sliderText();
      this.applyDateTime();
    });
    $('btn-now').addEventListener('click', () => app.setLive());
    $('btn-tonight').addEventListener('click', () => {
      const p = localParts(Date.now());
      app.setTime(fromLocal(p.year, p.month, p.day, 22, 0));
    });
    for (const b of this.speedButtons) b.addEventListener('click', () => app.setSpeed(Number(b.dataset.speed)));
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
      this.app.closeTheme();
      this.sync(true);
    }
    this.app.layoutChanged();
  }

  sliderText() {
    const m = Number(this.clock.value);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  applyDateTime() {
    const [y, mo, d] = (this.date.value || formatDateInput(this.app.now())).split('-').map(Number);
    const m = Number(this.clock.value);
    this.app.setTime(fromLocal(y, mo, d, Math.floor(m / 60), m % 60));
  }

  /** Updates the chip, and the panel fields unless the user is editing them. */
  sync(force = false) {
    const { app } = this;
    const now = app.now();
    this.chipPlace.textContent = app.place.name;
    this.chipTime.textContent = formatShort(now);
    this.chipLive.hidden = !app.clock.live;
    this.placeSelect.value = app.place.id;
    for (const b of this.speedButtons) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === app.clock.speed));
    }
    if (!this.open) return;
    const active = document.activeElement;
    if (force || active !== this.date) this.date.value = formatDateInput(now);
    if (force || active !== this.clock) {
      const p = localParts(now);
      this.clock.value = String(p.hour * 60 + p.minute - (p.minute % 5));
      this.clockOut.textContent = formatClock(now);
    }
  }
}
