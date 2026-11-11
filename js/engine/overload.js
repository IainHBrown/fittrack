// Progressive overload. Pure: works only from your own logged sessions.
//
// A "performance" is one past session of one exercise:
//   { date, target: { weight|null, reps, sets }, sets: [{ weight, reps }] }
//
// Rules (all numbers come from Settings):
//   first session          -> no target, you choose the weight
//   hit every target rep   -> add weight (upper +5 lb, lower +10 lb by default)
//   missed reps            -> repeat the same weight
//   missed the same weight twice in a row -> deload about 10%, then build back
//   everything is rounded to 5 lb

export const roundTo = (w, step) => Math.round(w / step) * step;

/** Estimated 1-rep max (Epley). */
export const e1rm = (weight, reps) => (reps <= 0 ? 0 : reps === 1 ? weight : weight * (1 + reps / 30));

/** Did this performance hit its own target? Also returns the working weight used. */
export function evaluate(perf) {
  const need = perf.target.sets;
  const sets = perf.sets || [];
  const counted = sets.slice(0, need);
  const weight = sets.length ? Math.min(...sets.map((s) => s.weight)) : perf.target.weight;
  const hit = counted.length >= need && counted.every((s) => s.reps >= perf.target.reps);
  return { hit, weight };
}

/**
 * @param {object} ex       exercise: { type: 'weight'|'bodyweight', group, increment?, repUnit? }
 * @param {{sets:number,reps:number}} scheme  what the routine asks for today
 * @param {object[]} history  past performances, oldest first
 * @param {object} cfg      settings.lifting
 * @returns {{weight:number|null, reps:number, sets:number, kind:string, reason:string}}
 */
export function nextTarget(ex, scheme, history, cfg) {
  const { sets, reps } = scheme;
  const unit = ex.repUnit === 'sec' ? ' s' : '';
  if (!history.length) {
    return {
      weight: null, reps, sets, kind: 'first',
      reason: ex.type === 'bodyweight'
        ? 'First time: see how the target feels.'
        : 'First time: pick a weight you could do 2 more reps with.',
    };
  }

  const last = history.at(-1);
  const ev = evaluate(last);
  const did = `${last.target.sets}×${last.target.reps}${unit}`;

  if (ex.type === 'bodyweight') {
    const step = ex.repUnit === 'sec' ? 5 : 1;
    const base = Math.max(reps, last.target.reps);
    if (ev.hit) return { weight: null, reps: base + step, sets, kind: 'increase', reason: `You hit ${did} last time → ${base + step}${unit || ' reps'} per set` };
    return { weight: null, reps: base, sets, kind: 'repeat', reason: `Missed ${did} last time → repeat` };
  }

  const w = ev.weight;
  if (!(w > 0)) return { weight: null, reps, sets, kind: 'first', reason: 'No weight logged yet: pick a comfortable weight.' };

  if (ev.hit) {
    const inc = ex.increment || (ex.group === 'lower' ? cfg.incLower : cfg.incUpper);
    return { weight: roundTo(w + inc, cfg.round), reps, sets, kind: 'increase', reason: `You hit ${did} at ${w} lb last time → +${inc} lb` };
  }

  const prev = history.at(-2);
  if (prev) {
    const pe = evaluate(prev);
    if (!pe.hit && pe.weight === w) {
      let down = roundTo(w * (1 - cfg.deloadPct / 100), cfg.round);
      if (down >= w) down = w - cfg.round;
      return { weight: Math.max(0, down), reps, sets, kind: 'deload', reason: `Missed ${w} lb twice in a row → deload to ${Math.max(0, down)} lb and build back` };
    }
  }
  return { weight: w, reps, sets, kind: 'repeat', reason: `Missed reps at ${w} lb last time → repeat ${w} lb` };
}

/** Best weight and best estimated 1RM in one performance. */
export function bests(perf) {
  let top = 0;
  let est = 0;
  for (const s of perf.sets || []) {
    if (s.reps > 0 && s.weight > top) top = s.weight;
    est = Math.max(est, e1rm(s.weight, s.reps));
  }
  return { top, e1rm: Math.round(est) };
}

/** Personal records across a history: { top: {value,date}, e1rm: {value,date} } */
export function records(history) {
  const rec = { top: { value: 0, date: null }, e1rm: { value: 0, date: null } };
  for (const p of history) {
    const b = bests(p);
    if (b.top > rec.top.value) rec.top = { value: b.top, date: p.date };
    if (b.e1rm > rec.e1rm.value) rec.e1rm = { value: b.e1rm, date: p.date };
  }
  return rec;
}

/**
 * Which records a new performance breaks, compared with earlier history.
 * The very first session sets the baseline and is not counted as a PR.
 */
export function newRecords(history, perf) {
  if (!history.length) return [];
  const old = records(history);
  const b = bests(perf);
  const out = [];
  if (b.top > old.top.value) out.push({ type: 'top', value: b.top });
  if (b.e1rm > old.e1rm.value) out.push({ type: 'e1rm', value: b.e1rm });
  return out;
}

/** One exercise's history, oldest first, from all logs. Easy-day sessions are left out of progression. */
export function historyFor(exId, logs, { includeEasy = false } = {}) {
  const out = [];
  for (const log of logs) {
    for (const e of log.exercises || []) {
      if (e.exId !== exId || !e.sets || !e.sets.length) continue;
      if (e.easy && !includeEasy) continue;
      out.push({ date: log.date, createdAt: log.createdAt || 0, target: e.target, sets: e.sets });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}
