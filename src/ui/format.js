// Swedish formatting and Europe/Stockholm wall-clock conversions.
import { TIME_ZONE } from '../data/places.js';

export const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti',
  'september', 'oktober', 'november', 'december'];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Wall-clock fields in Swedish time for a Unix time in ms. */
export function localParts(ms) {
  const p = {};
  for (const { type, value } of partsFormat.formatToParts(new Date(ms))) p[type] = value;
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  return {
    year,
    month,
    day,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Offset of Swedish time from UTC in ms at the given instant. */
function offsetAt(ms) {
  const p = localParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Unix time in ms for a Swedish wall-clock time (month 1-12). */
export function fromLocal(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms);
  return ms;
}

const pad = (n) => String(n).padStart(2, '0');

export function formatClock(ms) {
  const p = localParts(ms);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "sön 19 okt 22:47" */
export function formatShort(ms) {
  const p = localParts(ms);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS_SHORT[p.month - 1]} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "2026-10-19" for <input type="date">. */
export function formatDateInput(ms) {
  const p = localParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Decimal number with Swedish comma. */
export function formatNumber(x, digits = 1) {
  return x.toFixed(digits).replace('.', ',').replace('-', '−');
}
