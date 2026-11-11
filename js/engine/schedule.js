// Places a week's sessions onto days. Each session kind scores every
// available day (lower is better); hard rules use a very large penalty.
//
// Hard rules:   never on the rest day; long ride and long run on their set
//               days; the heavy leg lift (lift-A) is never on, the day before,
//               or the day after a long day; at most two sessions a day.
// Soft rules:   spread lifts out, keep runs away from the long run, pair
//               swims with lift days, avoid back-to-back bike days.

const NO = 1000;
const LONG = new Set(['bike-long', 'run-long', 'race']);
const isLift = (k) => k.startsWith('lift-');
const isSwim = (k) => k.startsWith('swim');
const isBike = (k) => k.startsWith('bike');

// Earlier kinds are placed first, so later ones fit around them.
const ORDER = ['race', 'bike-long', 'run-long', 'lift-A', 'lift-B', 'lift-C', 'bike-test', 'bike-quality',
  'run-test', 'run-easy', 'swim-test', 'swim', 'bike-easy'];

/**
 * @param {string[]} kinds            session kinds to place (repeats allowed)
 * @param {{date:string,dow:number}[]} days   the 7 days of the week, in order
 * @param {{restDow:number,longRideDow:number,longRunDow:number}} cfg
 * @param {Set<string>} [blocked]     dates that cannot take sessions
 * @param {Object<string,string>} [fixed]  kind -> date that must be used
 * @returns {{kind:string,date:string}[]}
 */
export function placeSessions(kinds, days, cfg, blocked = new Set(), fixed = {}) {
  const load = days.map(() => []);
  const n = days.length;
  const has = (i, pred) => load[i].some(pred);
  // neighbours wrap around, because next week has the same shape
  const adj = (i, pred) => has((i + n - 1) % n, pred) || has((i + 1) % n, pred);
  const longRunIdx = () => load.findIndex((l) => l.includes('run-long'));
  const ringDist = (a, b) => Math.min(Math.abs(a - b), n - Math.abs(a - b));

  function score(kind, i) {
    const d = days[i];
    const count = load[i].length;
    if (kind === 'race') return 0;
    if (kind === 'bike-long') return (d.dow === cfg.longRideDow ? 0 : 20) + count * 5 + (d.dow === cfg.restDow ? NO * 10 : 0);
    if (kind === 'run-long') return (d.dow === cfg.longRunDow ? 0 : 20) + count * 5 + (d.dow === cfg.restDow ? NO * 10 : 0);

    let s = count * 8;
    // the rest day outranks every other rule, so nothing lands there even
    // when a custom week layout leaves no perfect day
    if (d.dow === cfg.restDow) s += NO * 10;
    if (count >= 2) s += NO;
    const onLong = has(i, (k) => LONG.has(k));

    if (kind === 'lift-A') {
      if (onLong || adj(i, (k) => LONG.has(k))) s += NO;
    } else if (kind === 'lift-B') {
      if (onLong || has(i, isLift)) s += NO;
      if (adj(i, (k) => k === 'lift-A')) s += 20;
      if (adj(i, (k) => LONG.has(k))) s += 10;
    } else if (kind === 'lift-C') {
      if (onLong || has(i, isLift)) s += NO;
      if (has((i + n - 1) % n, isLift)) s += 3;
      if (has((i + 1) % n, isLift)) s += 3;
    } else if (kind === 'bike-quality' || kind === 'bike-test') {
      if (onLong) s += NO;
      if (has(i, (k) => k === 'lift-A')) s += 30;
      if (adj(i, (k) => k === 'bike-long')) s += 6;
      if (adj(i, (k) => k === 'run-long')) s += 3;
    } else if (kind === 'run-easy' || kind === 'run-test') {
      if (onLong) s += NO;
      if (has(i, (k) => k === 'lift-A')) s += 30;
      if (has(i, (k) => k.startsWith('run'))) s += NO;
      const lr = longRunIdx();
      if (lr >= 0) s += (3 - Math.min(3, ringDist(i, lr))) * 6;
    } else if (isSwim(kind)) {
      if (has(i, isSwim)) s += NO;
      if (onLong) s += 12;
      if (has(i, isLift)) s -= 4;
      if (adj(i, isSwim)) s += 4;
    } else if (kind === 'bike-easy') {
      if (onLong) s += NO;
      if (has(i, isBike)) s += 10;
      if (adj(i, (k) => k === 'bike-long')) s += 6;
    }
    return s;
  }

  const sorted = [...kinds].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const out = [];
  for (const kind of sorted) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      if (fixed[kind] ? days[i].date !== fixed[kind] : blocked.has(days[i].date)) continue;
      const sc = score(kind, i);
      if (sc < bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) continue; // nowhere to put it (e.g. every day blocked)
    load[best].push(kind);
    out.push({ kind, date: days[best].date });
  }
  return out;
}

/**
 * Reasons a session should not sit on a given day (used when you move one).
 * `others` are the other sessions that week as {kind, date}.
 */
export function moveWarnings(kind, date, dow, others, cfg, addDays) {
  const warnings = [];
  const on = (d) => others.filter((o) => o.date === d).map((o) => o.kind);
  const near = [...on(addDays(date, -1)), ...on(addDays(date, 1))];
  if (dow === cfg.restDow) warnings.push('This is your rest day.');
  if (on(date).length >= 2) warnings.push('That day already has two sessions.');
  if (kind === 'lift-A' && [...on(date), ...near].some((k) => LONG.has(k))) {
    warnings.push('Heavy leg day next to a long run or ride.');
  }
  if (LONG.has(kind) && [...on(date), ...near].includes('lift-A')) {
    warnings.push('Long session next to the heavy leg day.');
  }
  if (kind.startsWith('run') && on(date).some((k) => k.startsWith('run'))) warnings.push('Two runs on one day.');
  return warnings;
}
