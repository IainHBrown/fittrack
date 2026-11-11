// Date helpers. Every day is identified by a local-time key "YYYY-MM-DD",
// so "midnight reset" simply means the key changes.

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a key as local midnight (never via Date("YYYY-MM-DD"), which is UTC). */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days from key a to key b (positive when b is later). */
export function daysBetween(a, b) {
  const ms = Date.UTC(...ymd(b)) - Date.UTC(...ymd(a));
  return Math.round(ms / 86400000);
}
function ymd(key) {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m - 1, d];
}

export function monthKey(key) { return key.slice(0, 7); }

/** First and last day keys of the month containing `key`. */
export function monthRange(key) {
  const d = parseKey(key);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { first: dayKey(first), last: dayKey(last), days: last.getDate(), startDow: first.getDay() };
}

export function addMonths(key, n) {
  const d = parseKey(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const weekdayName = (key) => WEEKDAYS[parseKey(key).getDay()];
export const monthName = (key) => MONTHS[parseKey(key).getMonth()];

/** "Tuesday 17 Nov" */
export function fmtDayLong(key) {
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
/** "Sun 11 Jul 2027" */
export function fmtDate(key) {
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}
/** "7:42 am" from a timestamp */
export function fmtTime(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}
