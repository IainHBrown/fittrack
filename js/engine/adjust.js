// Turns a generated week into what you actually see: applies moves, skips,
// "make it easy", busy-week mode and knee protection, and works out each
// session's status. Pure, so it is covered by tests.

import { addDays } from '../lib/dates.js';

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

/** The most recent log with knee pain at or above the threshold, or null. */
export function latestKneeFlag(logs, threshold) {
  return logs
    .filter((l) => l.knee != null && l.knee >= threshold)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1) || null;
}

/**
 * @param {object} week        a week from buildPlan
 * @param {object} ctx
 * @param {Object<string,object>} ctx.overrides  by session id: { status, movedTo, easy, swap }
 * @param {object[]} ctx.logs
 * @param {string[]} ctx.busyWeeks   week start dates in busy mode
 * @param {object} ctx.settings
 * @param {string} ctx.today
 * @returns {object[]} sessions with date, status and adjustments applied, in day order
 *   status: 'done' | 'skipped' | 'dropped' | 'missed' | 'planned'
 */
export function resolveWeek(week, { overrides, logs, busyWeeks, settings, today }) {
  const p = settings.plan;
  const busy = busyWeeks.includes(week.start);
  const flag = latestKneeFlag(logs, p.knee.painThreshold);
  const flagUntil = flag ? addDays(flag.date, p.knee.reduceDays) : null;
  const logBySession = new Map(logs.filter((l) => l.sessionId).map((l) => [l.sessionId, l]));

  return week.sessions.map((base) => {
    const o = overrides[base.id] || {};
    const s = { ...base, busy: false, kneeAdjusted: false, easy: false, swapped: false, moved: false, log: null };

    if (o.movedTo && o.movedTo !== base.date) { s.date = o.movedTo; s.moved = true; }

    // knee protection: after a flagged log, upcoming runs are shortened
    const kneeHit = flag && s.sport === 'run' && s.kind !== 'run-test' && s.date > flag.date && s.date <= flagUntil;

    if (o.swap === 'bike' && s.sport === 'run') {
      const lib = settings.library['bike-easy'];
      Object.assign(s, { sport: 'bike', kind: 'bike-easy', title: lib.title, zone: lib.zone, swapped: true,
        desc: `Swapped from a run to protect your knee. ${lib.desc}` });
    } else if (kneeHit) {
      s.durationMin = round5(s.durationMin * p.knee.runFactor);
      s.kneeAdjusted = true;
    }

    if (o.easy && s.sport !== 'lift' && s.sport !== 'race') {
      s.easy = true;
      s.durationMin = round5(s.durationMin * p.easyDayFactor);
      if (s.zone && s.zone !== 'z1') s.zone = 'z2';
      s.desc = `Made easy after a low sleep score: keep the whole session relaxed. ${base.kind.endsWith('-test') ? 'Save the test for a better day.' : ''}`.trim();
    } else if (o.easy && s.sport === 'lift') {
      s.easy = true;
      s.desc = `Made easy after a low sleep score: drop the weights about 10% and leave 3 reps in reserve. ${base.desc}`;
    }

    s.log = logBySession.get(s.id) || null;
    if (s.log) s.status = 'done';
    else if (o.status === 'skipped') s.status = 'skipped';
    else if (busy && !s.key) { s.status = 'dropped'; s.busy = true; }
    else if (s.date < today) s.status = 'missed';
    else s.status = 'planned';
    return s;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
}

/** 'long' | 'training' | 'rest' for a date, from that week's resolved sessions. */
export function dayType(resolved, date) {
  const live = resolved.filter((s) => s.date === date && s.status !== 'skipped' && s.status !== 'dropped');
  if (live.some((s) => s.kind === 'bike-long' || s.kind === 'run-long' || s.kind === 'race')) return 'long';
  return live.length ? 'training' : 'rest';
}

/** Minutes planned and done in a resolved week, in total and by sport. */
export function weekTotals(resolved, otherLogs = []) {
  const t = { planned: 0, done: 0, bySport: {}, doneBySport: {} };
  for (const s of resolved) {
    if (s.status === 'skipped' || s.status === 'dropped') continue;
    t.planned += s.durationMin;
    t.bySport[s.sport] = (t.bySport[s.sport] || 0) + s.durationMin;
    if (s.log) {
      t.done += s.log.durationMin || 0;
      t.doneBySport[s.sport] = (t.doneBySport[s.sport] || 0) + (s.log.durationMin || 0);
    }
  }
  for (const l of otherLogs) {
    t.done += l.durationMin || 0;
    t.doneBySport.other = (t.doneBySport.other || 0) + (l.durationMin || 0);
  }
  return t;
}
