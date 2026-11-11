// The training plan generator. Pure: the whole plan is rebuilt from settings
// each time, so changing a goal event or any number regenerates it. Session
// ids are stable ("weekStart|kind|n"), so logs and skips stay attached.

import { addDays, daysBetween, parseKey } from '../lib/dates.js';
import { placeSessions } from './schedule.js';

const round5 = (n) => Math.max(0, Math.round(n / 5) * 5);

export const SPORT_OF = (kind) => (kind === 'race' ? 'race' : kind.split('-')[0]);
export const SPORT_LABEL = { swim: 'Swim', bike: 'Bike', run: 'Run', lift: 'Lift', race: 'Race', other: 'Other' };
export const PHASE_LABEL = { base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper' };
export const KIND_LABEL = { easy: 'Easy week', test: 'Test week', recovery: 'Recovery week', taper: 'Taper', race: 'Race week', normal: '' };

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

/** Split N weeks into Base / Build / Peak / Taper. */
export function phaseSizes(N, taperWeeks) {
  const taper = Math.min(taperWeeks, Math.max(1, Math.floor(N / 4)), N);
  const peak = N >= 12 ? Math.min(4, Math.round(N * 0.12)) : N >= 6 ? 1 : 0;
  const rest = Math.max(0, N - taper - peak);
  const build = Math.round(rest * 0.43);
  return { base: rest - build, build, peak: N - taper - rest, taper };
}

function phaseAt(i, p) {
  if (i < p.base) return 'base';
  if (i < p.base + p.build) return 'build';
  if (i < p.base + p.build + p.peak) return 'peak';
  return 'taper';
}

/** Which goal the plan is aimed at, and when that training block starts. */
export function planWindow(settings, today) {
  const goals = [...settings.goals].filter((g) => g.date).sort((a, b) => a.date.localeCompare(b.date));
  const goal = goals.find((g) => g.date >= today) || null;
  if (!goal) return { goal: null, start: null };
  let start = settings.plan.startDate;
  const prev = goals.filter((g) => g.date < today).at(-1);
  if (prev && prev.date >= start) {
    // next block starts the Monday after the previous event
    const dow = parseKey(prev.date).getDay();
    start = addDays(prev.date, ((8 - dow) % 7) || 7);
  }
  return { goal, start };
}

/** Week kinds: easy -> test -> normal, with recovery every Nth week, then taper and race. */
function weekKinds(N, phases, p) {
  const kinds = [];
  let lastTest = null;
  const firstTaper = N - phases.taper;
  for (let i = 0; i < N; i++) {
    let kind = 'normal';
    let test = false;
    if (i === N - 1) kind = 'race';
    else if (i >= firstTaper) kind = 'taper';
    else if (i < p.easyWeeks) kind = 'easy';
    else if (i === p.easyWeeks && N >= 6) { kind = 'test'; test = true; lastTest = i; }
    else if ((i + 1) % p.recoveryEvery === 0 && i > p.easyWeeks + 2) {
      kind = 'recovery';
      // retest on a recovery week, but not in the last weeks before the taper
      if (lastTest != null && i - lastTest >= p.retestMinWeeks && firstTaper - i > 3) { test = true; lastTest = i; }
    }
    kinds.push({ kind, test });
  }
  return kinds;
}

const TAPER_FACTORS = { 1: [0.5], 2: [0.7, 0.45], 3: [0.8, 0.6, 0.4] };

/**
 * Build the whole plan.
 * @returns {{goal, start, phases, weeks: Array}} weeks is empty when there is no upcoming goal.
 */
export function buildPlan(settings, { today, swimStage = 1 } = {}) {
  const { goal, start } = planWindow(settings, today);
  if (!goal || goal.date < start) return { goal, start, phases: null, weeks: [] };

  const p = settings.plan;
  const type = settings.eventTypes[goal.type] || settings.eventTypes.custom;
  const N = Math.floor(daysBetween(start, goal.date) / 7) + 1;
  const phases = phaseSizes(N, type.taperWeeks);
  const kinds = weekKinds(N, phases, p);

  // Weekly growth rate: just enough to reach peak hours by the target date,
  // never more than the cap.
  const startMin = p.startHours * 60;
  const peakMin = Math.max(startMin, p.peakHours * 60);
  const steps = kinds.filter((k, i) => k.kind === 'normal' && addDays(start, i * 7) <= p.peakBy).length;
  const rate = steps > 0 ? Math.min(p.maxWeeklyIncrease, (peakMin / startMin) ** (1 / steps) - 1) : p.maxWeeklyIncrease;

  let level = startMin;          // the current "normal week" volume
  let runLevel = p.run.startMin; // running has its own slower progression
  const weeks = [];

  for (let i = 0; i < N; i++) {
    const { kind, test } = kinds[i];
    const weekStart = addDays(start, i * 7);
    const phase = phaseAt(i, phases);

    const sh = type.shares;
    const normalLifts = weekStart < p.lifts.switchDate ? p.lifts.before : p.lifts.after;
    if (kind === 'normal') {
      level = Math.min(level * (1 + rate), peakMin);
      // running grows by its own small step, and only as far as its share allows
      const cap = Math.max(0, level - normalLifts * p.lifts.minutes) * sh.run;
      runLevel = Math.max(runLevel, Math.min(runLevel * (1 + p.run.maxWeeklyIncrease), cap));
    }
    let factor = 1;
    if (kind === 'recovery') factor = p.recoveryFactor;
    else if (kind === 'test') factor = 0.9;
    else if (kind === 'taper' || kind === 'race') {
      const list = TAPER_FACTORS[phases.taper] || TAPER_FACTORS[3];
      factor = list[Math.min(list.length - 1, i - (N - phases.taper))];
    }

    // ---- minutes per sport ----
    const lifts = kind === 'race' ? 0 : kind === 'taper' ? Math.min(1, normalLifts) : normalLifts;
    const liftMin = lifts * p.lifts.minutes;
    const enduranceLevel = Math.max(0, level - normalLifts * p.lifts.minutes);
    const run = sh.run > 0 ? round5(runLevel * factor) : 0;
    const swim = sh.swim > 0 ? round5(Math.min(enduranceLevel * sh.swim, p.swim.maxMinPerWeek) * factor) : 0;
    const bike = sh.bike > 0 ? Math.max(0, round5(level * factor - liftMin - run - swim)) : 0;

    // ---- which sessions ----
    const list = []; // { kind, min }
    ['lift-A', 'lift-B', 'lift-C'].slice(0, lifts).forEach((k) => list.push({ kind: k, min: p.lifts.minutes }));

    if (kind === 'race') {
      if (bike) list.push({ kind: 'bike-easy', min: Math.min(bike, 40) });
      if (run) list.push({ kind: 'run-easy', min: Math.min(run, 25) });
      if (swim) list.push({ kind: 'swim', min: Math.min(swim, 20) });
    } else {
      if (bike >= 200) list.push({ kind: 'bike-long', min: bike * 0.62 }, { kind: 'bike-quality', min: bike * 0.22 }, { kind: 'bike-easy', min: bike * 0.16 });
      else if (bike >= 50) list.push({ kind: 'bike-long', min: bike * 0.6 }, { kind: 'bike-quality', min: bike * 0.4 });
      else if (bike > 0) list.push({ kind: 'bike-easy', min: bike });

      if (run >= 150) list.push({ kind: 'run-long', min: run * 0.5 }, { kind: 'run-easy', min: run * 0.25 }, { kind: 'run-easy', min: run * 0.25 });
      else if (run >= 100) list.push({ kind: 'run-long', min: run * 0.65 }, { kind: 'run-easy', min: run * 0.35 });
      else if (run >= 40) list.push({ kind: 'run-long', min: run * 0.6 }, { kind: 'run-easy', min: run * 0.4 });
      else if (run > 0) list.push({ kind: 'run-easy', min: run });

      if (swim >= 40) list.push({ kind: 'swim', min: Math.min(60, swim / 2) }, { kind: 'swim', min: Math.min(60, swim / 2) });
      else if (swim > 0) list.push({ kind: 'swim', min: swim });
    }

    if (test) {
      const swap = (from, to, min) => {
        const s = list.find((x) => x.kind === from);
        if (s) { s.kind = to; s.min = min; }
      };
      swap('swim', 'swim-test', 30);
      swap('bike-quality', 'bike-test', 45);
      swap('run-easy', 'run-test', 40);
    }

    // ---- which days ----
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = addDays(weekStart, d);
      return { date, dow: parseKey(date).getDay() };
    });
    const blocked = new Set();
    const fixed = {};
    if (kind === 'race') {
      list.push({ kind: 'race', min: 0 });
      fixed.race = goal.date;
      for (const d of days) if (d.date >= goal.date) blocked.add(d.date);
    }
    const placed = placeSessions(list.map((x) => x.kind), days, p, blocked, fixed);

    // ---- turn into full session objects ----
    const seen = {};
    const remaining = [...list];
    const sessions = placed.map(({ kind: k, date }) => {
      const idx = remaining.findIndex((x) => x.kind === k);
      const spec = remaining.splice(idx, 1)[0];
      seen[k] = (seen[k] || 0) + 1;
      return makeSession({ settings, goal, weekStart, weekIndex: i, phase, weekKind: kind, kind: k, n: seen[k], date, min: round5(spec.min), swimStage });
    }).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

    // a week keeps only one swim as a "key" session
    if (sessions.some((s) => s.kind === 'swim-test')) {
      for (const s of sessions) if (s.kind === 'swim') s.key = false;
    }

    weeks.push({
      index: i, start: weekStart, end: addDays(weekStart, 6), phase, kind, test,
      targetMin: sessions.reduce((sum, s) => sum + s.durationMin, 0),
      sessions,
    });
  }
  return { goal, start, phases, weeks };
}

const DAY_ORDER = { race: 0, bike: 1, run: 1, lift: 2, swim: 3 };

function makeSession({ settings, goal, weekStart, weekIndex, phase, weekKind, kind, n, date, min, swimStage }) {
  const lib = settings.library;
  const sport = SPORT_OF(kind);
  let entry = lib[kind];
  let vars = { knee: settings.plan.knee.painThreshold };
  let distanceM = null;
  let title;

  if (kind === 'bike-quality' && weekKind === 'normal' && phase === 'build' && min >= 45) {
    entry = lib['bike-tempo'];
    vars.reps = Math.max(2, Math.floor((min - 20) / 11));
  } else if (kind === 'bike-quality' && weekKind === 'normal' && phase === 'peak' && min >= 50) {
    entry = lib['bike-race'];
    vars.reps = Math.max(1, Math.floor((min - 20) / 20));
  } else if (kind === 'swim') {
    const stages = settings.swimStages;
    const stageNo = Math.min(Math.max(1, swimStage), stages.length);
    const st = stages[stageNo - 1];
    const warmM = stageNo >= 3 ? 100 : 50;
    vars = { ...vars, warm: `${warmM} m`, main: st.main, rest: st.rest ? `, ${st.rest}` : '' };
    distanceM = warmM + st.m + 50;
    title = `${entry.title} · Stage ${stageNo}`;
  } else if (kind === 'race') {
    title = goal.name;
  }

  return {
    id: `${weekStart}|${kind}|${n}`,
    weekIndex,
    date,
    plannedDate: date,
    kind,
    sport,
    title: title || entry.title,
    durationMin: min,
    distanceM,
    zone: entry.zone,
    desc: fill(entry.desc, vars),
    // the three sessions a busy week keeps, plus race day
    key: kind === 'bike-long' || kind === 'run-long' || kind === 'race' || ((kind === 'swim' || kind === 'swim-test') && n === 1),
    legs: kind === 'lift-A' ? 'heavy' : kind === 'lift-B' ? 'moderate' : null,
    test: kind.endsWith('-test') ? sport : null,
    order: DAY_ORDER[sport] ?? 5,
  };
}

/** Index of the plan week containing `date`, or -1. */
export function weekIndexOf(plan, date) {
  if (!plan.weeks.length || date < plan.start) return -1;
  const i = Math.floor(daysBetween(plan.start, date) / 7);
  return i < plan.weeks.length ? i : -1;
}
