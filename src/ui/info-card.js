// Card about the selected constellation: where it is now and when to look for it.
import { compassName } from '../astro/frames.js';
import { MARK_COLORS, SELECT_COLOR } from '../render/palette.js';
import { STORIES } from '../data/stories-sv.js';
import { constellationFacts } from '../sky/facts.js';
import { formatClock, formatNumber, MONTHS } from './format.js';

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

/** Where a constellation comes from, who it is and what stands out, laid out like the facts. */
export function storyOf(c) {
  const s = STORIES[c.id];
  if (!s) return [];
  return [el('div', { class: 'facts story' },
    el('div', { class: 'story-origin' }, el('b', {}, s.origin)),
    el('div', {}, s.story),
    el('div', {}, el('b', {}, 'Speciellt: '), s.special))];
}

export class InfoCard {
  constructor(app, $) {
    this.app = app;
    this.root = $('card');
    this.index = -1;
    /** What the card shows now, to tell whether a new render changes anything. */
    this.html = '';
  }

  show(index) {
    this.index = index;
    this.render();
  }

  hide() {
    this.index = -1;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.html = '';
  }

  /**
   * Builds the card afresh (cheap; called when time, place or marks change, and every
   * second). It only replaces what is on the page when something has changed, so that a
   * click is never lost on a button swapped out between press and release.
   */
  render() {
    const { app } = this;
    if (this.index < 0) return this.hide();
    const c = app.catalog.constellations[this.index];
    const f = constellationFacts(c, app.view);
    const place = app.place.name;
    const mark = app.marks.get(c.index);
    const color = mark !== undefined ? MARK_COLORS[mark % MARK_COLORS.length].hex : SELECT_COLOR.hex;

    const facts = el('dl', { class: 'facts' });
    const line = (...parts) => facts.append(el('div', {}, ...parts));
    const deg = (x) => `${Math.round(x)}°`;

    if (f.alt >= 0) {
      line(el('b', {}, 'Uppe nu'), ` · ${deg(f.alt)} över horisonten i ${compassName(f.az)}`);
    } else {
      line(el('b', {}, 'Under horisonten'), ` · ${deg(-f.alt)} under, i ${compassName(f.az)}`);
    }
    const times = [];
    if (f.riseMs) times.push(`går upp kl. ${formatClock(f.riseMs)}`);
    if (f.visibility !== 'never' && f.transitMs - app.view.timeMs < 12 * 3600000) {
      times.push(`står högst kl. ${formatClock(f.transitMs)} (${deg(f.transitAlt)})`);
    }
    if (f.setMs) times.push(`går ner kl. ${formatClock(f.setMs)}`);
    if (times.length) line(times.join(', ').replace(/^./, (ch) => ch.toUpperCase()));

    const visText = {
      circumpolar: `Cirkumpolär från ${place}: går aldrig ner, syns alla klara nätter året runt.`,
      visible: `Syns från ${place}. Högst på kvällarna (kl. 22) i ${MONTHS[f.bestMonth - 1]}.`,
      partly: `Syns bara delvis från ${place}, lågt i söder. Bäst på kvällarna i ${MONTHS[f.bestMonth - 1]}.`,
      never: `Kommer aldrig över horisonten i ${place}. Den syns från platser längre söderut.`,
    }[f.visibility];
    line(visText);

    if (c.brightest >= 0) {
      const s = c.brightest;
      const mag = app.catalog.stars.mag[s];
      const bayer = app.catalog.bayer[s];
      const name = app.catalog.starNames[s];
      const label = name ? `${name}${bayer ? ` (${bayer} ${c.gen})` : ''}` : bayer ? `${bayer} ${c.gen}` : `HIP ${app.catalog.stars.hip[s]}`;
      line('Ljusstarkast: ', el('b', {}, label), ` · magnitud ${formatNumber(mag)}`);
    }

    const markBtn = el('button', {
      type: 'button',
      class: mark !== undefined ? 'chip' : 'chip primary',
      'aria-pressed': String(mark !== undefined),
      onclick: () => app.toggleMark(c.index),
    }, mark !== undefined ? 'Avmarkera' : 'Markera');
    const artShown = app.artShown(c.index);
    const buttons = el('div', { class: 'btn-row' }, markBtn,
      el('button', { type: 'button', class: 'chip', onclick: () => app.flyTo(c.index) }, 'Centrera'),
      el('button', {
        type: 'button',
        class: 'chip',
        'data-action': 'art',
        'aria-pressed': String(artShown),
        onclick: () => app.toggleArt(c.index),
      }, artShown ? 'Dölj illustration' : 'Visa illustration'));
    if (f.alt < 0 && !app.layers.seeThrough) {
      buttons.append(el('button', {
        type: 'button',
        class: 'chip',
        onclick: () => {
          app.setLayer('seeThrough', true);
          app.flyTo(c.index);
        },
      }, 'Se genom marken'));
    }

    const card = el('div', {},
      el('div', { class: 'card-head' },
        el('span', { class: 'swatch', style: `background:${color};box-shadow:0 0 10px ${color}` }),
        el('div', { class: 'titles' }, el('h3', {}, c.sv), el('div', { class: 'latin' }, c.la)),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Stäng', onclick: () => app.select(-1) }, '×')),
      facts,
      ...storyOf(c),
      buttons);
    if (card.innerHTML !== this.html) {
      this.html = card.innerHTML;
      this.root.replaceChildren(...card.childNodes);
    }
    this.root.hidden = false;
  }
}
