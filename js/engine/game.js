// Streaks, XP, levels and badges. Pure: everything is recalculated from your
// history each time, so editing an old day or log always stays consistent.

import { addDays } from '../lib/dates.js';
import { waterTotal } from '../logic/day.js';

// ---------- streaks ----------

/**
 * Streak rules:
 *   hit the goal            -> streak +1
 *   miss one day            -> streak kept (not increased), warning shown
 *   hit the next day        -> streak continues
 *   miss two days in a row  -> streak resets to 0
 * Today only counts once it is hit; an unfinished today is never a miss.
 *
 * @param {(date:string)=>boolean} hit
 * @param {string} firstDay  first day the app has data for
 * @param {string} today
 * @returns {{current:number, best:number, hitToday:boolean, atRisk:boolean}}
 */
export function streak(hit, firstDay, today) {
  let current = 0;
  let best = 0;
  let misses = 0;
  for (let d = firstDay; d < today; d = addDays(d, 1)) {
    if (hit(d)) {
      current += 1;
      misses = 0;
      best = Math.max(best, current);
    } else {
      misses += 1;
      if (misses >= 2) current = 0;
    }
  }
  const hitToday = firstDay <= today && hit(today);
  if (hitToday) {
    current += 1;
    best = Math.max(best, current);
  }
  // about to lose it: yesterday was the one allowed miss and today is not done yet
  return { current, best, hitToday, atRisk: !hitToday && misses === 1 && current > 0 };
}

/** The three daily goals, as tests on a day record. */
export function dayHits(day, settings, isToday) {
  if (!day) return { sleep: false, supps: false, water: false };
  // past days use the supplement list and water goal that applied on that day
  const list = isToday ? settings.supplements.map((s) => s.id) : day.suppList || [];
  const goal = day.waterGoal || settings.water.goalMl;
  return {
    sleep: day.sleep != null,
    supps: list.length > 0 && list.every((id) => day.supps && day.supps[id]),
    water: waterTotal(day) >= goal,
  };
}

/** All three streaks from the full list of day records. */
export function allStreaks(days, settings, today) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = days.length ? days.map((d) => d.date).sort()[0] : today;
  const make = (key) => streak((date) => dayHits(byDate.get(date), settings, date === today)[key], first, today);
  return { sleep: make('sleep'), supps: make('supps'), water: make('water') };
}

// ---------- measured values for badges ----------

export function metrics(days, logs, streaks, settings) {
  const m = { sessions: 0, swimKm: 0, bikeKm: 0, runKm: 0, longestSwimM: 0, longestRideKm: 0, longestRunKm: 0, prs: 0, tests: 0, goodNights: 0 };
  for (const l of logs) {
    if (l.sessionId || l.sport === 'lift') m.sessions += 1;
    if (l.test) m.tests += 1;
    m.prs += (l.prs || []).length;
    const d = l.distance > 0 ? l.distance : 0;
    if (l.sport === 'swim') { m.swimKm += d / 1000; m.longestSwimM = Math.max(m.longestSwimM, d); }
    if (l.sport === 'bike') { m.bikeKm += d; m.longestRideKm = Math.max(m.longestRideKm, d); }
    if (l.sport === 'run') { m.runKm += d; m.longestRunKm = Math.max(m.longestRunKm, d); }
  }
  m.goodNights = days.filter((d) => d.sleep != null && d.sleep >= settings.sleep.goal).length;
  m.sleepStreak = streaks.sleep.best;
  m.suppsStreak = streaks.supps.best;
  m.waterStreak = streaks.water.best;
  return m;
}

/**
 * Badge states: tier 0 (locked) to 3 (gold), and progress to the next tier.
 */
export function badgeStates(defs, m) {
  return defs.map((b) => {
    const value = m[b.metric] || 0;
    const tier = b.tiers.filter((t) => value >= t).length;
    const next = tier < b.tiers.length ? b.tiers[tier] : null;
    const prev = tier > 0 ? b.tiers[tier - 1] : 0;
    return {
      id: b.id, name: b.name, unit: b.unit, value, tier, next, tiers: b.tiers,
      frac: next == null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev))),
    };
  });
}

export const TIER_NAME = ['Locked', 'Bronze', 'Silver', 'Gold'];

// ---------- XP and levels ----------

/** XP earned by one log. */
export function logXp(log, xp) {
  let base;
  if (log.kind === 'race') base = xp.race;
  else if (log.test) base = xp.test;
  else if (log.kind === 'bike-long' || log.kind === 'run-long') base = xp.keySession;
  else if (!log.sessionId && log.sport !== 'lift') base = xp.other;
  else base = xp.session;
  return base + (log.prs || []).length * xp.pr;
}

/** Total XP with a breakdown by source. */
export function totalXp(days, logs, badges, settings, today) {
  const xp = settings.xp;
  const out = { training: 0, daily: 0, badges: 0 };
  for (const l of logs) out.training += logXp(l, xp);
  for (const d of days) {
    const h = dayHits(d, settings, d.date === today);
    out.daily += (h.sleep ? xp.sleep : 0) + (h.supps ? xp.supps : 0) + (h.water ? xp.water : 0);
  }
  for (const b of badges) for (let t = 0; t < b.tier; t++) out.badges += xp.badge[t] || 0;
  out.total = out.training + out.daily + out.badges;
  return out;
}

/** Which level a total XP is, and progress to the next. */
export function levelFor(total, levels) {
  const sorted = [...levels].sort((a, b) => a.xp - b.xp);
  let i = 0;
  while (i + 1 < sorted.length && total >= sorted[i + 1].xp) i += 1;
  const cur = sorted[i];
  const next = sorted[i + 1] || null;
  return {
    number: i + 1, name: cur.name, floor: cur.xp,
    next: next ? next.xp : null, nextName: next ? next.name : null,
    frac: next ? Math.max(0, Math.min(1, (total - cur.xp) / (next.xp - cur.xp))) : 1,
    toGo: next ? next.xp - total : 0,
  };
}

/** Everything at once. */
export function gameState(days, logs, settings, today) {
  const streaks = allStreaks(days, settings, today);
  const m = metrics(days, logs, streaks, settings);
  const badges = badgeStates(settings.badges, m);
  const xp = totalXp(days, logs, badges, settings, today);
  return { streaks, metrics: m, badges, xp, level: levelFor(xp.total, settings.levels) };
}

// ---------- chart data ----------

/** Hours per sport for each of the last `count` weeks (weeks start on `weekStart`'s weekday). */
export function weeklyHours(logs, thisWeekStart, count = 8) {
  const weeks = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = addDays(thisWeekStart, -7 * i);
    const end = addDays(start, 6);
    const w = { start, swim: 0, bike: 0, run: 0, lift: 0, other: 0 };
    for (const l of logs) {
      if (l.date < start || l.date > end) continue;
      const key = ['swim', 'bike', 'run', 'lift'].includes(l.sport) ? l.sport : 'other';
      w[key] += (l.durationMin || 0) / 60;
    }
    w.total = w.swim + w.bike + w.run + w.lift + w.other;
    weeks.push(w);
  }
  return weeks;
}

/** Pace or speed for each logged session of a sport that has a distance, oldest first. */
export function paceSeries(logs, sport) {
  return logs
    .filter((l) => l.sport === sport && l.distance > 0 && l.durationMin > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({
      date: l.date,
      // run: min/km, swim: min/100 m, bike: km/h
      value: sport === 'bike' ? l.distance / (l.durationMin / 60)
        : sport === 'swim' ? l.durationMin / (l.distance / 100)
        : l.durationMin / l.distance,
    }));
}
