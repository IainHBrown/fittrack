// Tests for the training plan engine. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS } from '../js/defaults.js';
import { mergeSettings } from '../js/state.js';
import { buildPlan, phaseSizes, weekIndexOf } from '../js/engine/plan.js';
import { moveWarnings } from '../js/engine/schedule.js';
import { resolveWeek, dayType, weekTotals } from '../js/engine/adjust.js';
import { computeZones, latestTests, targetFor, paceText, stageFromSwimTest } from '../js/engine/zones.js';
import { addDays, parseKey } from '../js/lib/dates.js';

const TODAY = '2026-11-10';
const plan = buildPlan(DEFAULTS, { today: TODAY });
const dow = (d) => parseKey(d).getDay();
const LONG = ['bike-long', 'run-long', 'race'];
const all = plan.weeks.flatMap((w) => w.sessions);
const kindsOn = (date) => all.filter((s) => s.date === date).map((s) => s.kind);

test('34 weeks to the half Ironman, split 16 / 12 / 4 / 2', () => {
  assert.equal(plan.weeks.length, 34);
  assert.deepEqual(plan.phases, { base: 16, build: 12, peak: 4, taper: 2 });
  assert.equal(plan.weeks[0].start, '2026-11-16');
  assert.equal(plan.weeks.at(-1).end, '2027-07-11');
});

test('phase sizes always add up, even for very short plans', () => {
  for (let n = 1; n <= 80; n++) {
    for (const taper of [1, 2, 3]) {
      const p = phaseSizes(n, taper);
      assert.equal(p.base + p.build + p.peak + p.taper, n, `N=${n}`);
      assert.ok(Object.values(p).every((v) => v >= 0), `N=${n}`);
    }
  }
});

test('two easy weeks, then a test week, with retests on recovery weeks', () => {
  assert.deepEqual(plan.weeks.slice(0, 3).map((w) => w.kind), ['easy', 'easy', 'test']);
  const tests = plan.weeks.filter((w) => w.test).map((w) => w.index + 1);
  assert.deepEqual(tests, [3, 12, 20, 28]);
  for (const w of plan.weeks.filter((x) => x.test)) {
    const kinds = w.sessions.map((s) => s.kind);
    for (const k of ['swim-test', 'bike-test', 'run-test']) assert.ok(kinds.includes(k), `week ${w.index + 1} has ${k}`);
  }
});

test('every 4th week is a lighter recovery week', () => {
  const rec = plan.weeks.filter((w) => w.kind === 'recovery').map((w) => w.index + 1);
  assert.deepEqual(rec, [8, 12, 16, 20, 24, 28, 32]);
  for (const w of plan.weeks.filter((x) => x.kind === 'recovery')) {
    const prev = plan.weeks[w.index - 1];
    assert.ok(w.targetMin < prev.targetMin * 0.85, `week ${w.index + 1} is lighter`);
  }
});

test('volume starts near 5.5 h, reaches 8-10 h by late spring, never jumps more than 10%', () => {
  assert.ok(Math.abs(plan.weeks[0].targetMin - 330) <= 15);
  const may = plan.weeks.find((w) => w.start >= '2027-05-10' && w.kind === 'normal');
  assert.ok(may.targetMin >= 480 && may.targetMin <= 600, `${may.targetMin} min`);
  let prev = null;
  for (const w of plan.weeks.filter((x) => x.kind === 'normal')) {
    // compared with the previous normal week; 5-minute rounding allows a little slack
    if (prev) assert.ok(w.targetMin <= prev * 1.10 + 10, `week ${w.index + 1}: ${prev} -> ${w.targetMin}`);
    prev = w.targetMin;
  }
});

test('running builds slowly and the bike carries the most endurance time', () => {
  let prev = null;
  for (const w of plan.weeks.filter((x) => x.kind === 'normal')) {
    const run = w.sessions.filter((s) => s.sport === 'run').reduce((a, s) => a + s.durationMin, 0);
    const bike = w.sessions.filter((s) => s.sport === 'bike').reduce((a, s) => a + s.durationMin, 0);
    const swim = w.sessions.filter((s) => s.sport === 'swim').reduce((a, s) => a + s.durationMin, 0);
    assert.ok(bike > run && bike > swim, `week ${w.index + 1}: bike is the biggest`);
    if (prev) assert.ok(run <= prev * 1.07 + 10, `week ${w.index + 1}: run ${prev} -> ${run}`);
    prev = run;
  }
  assert.equal(plan.weeks[0].sessions.filter((s) => s.sport === 'run').reduce((a, s) => a + s.durationMin, 0), 60);
});

test('Saturday is always a rest day and no day has more than two sessions', () => {
  const perDay = {};
  for (const s of all) {
    assert.notEqual(dow(s.date), 6, `${s.id} on a Saturday`);
    perDay[s.date] = (perDay[s.date] || 0) + 1;
  }
  assert.ok(Math.max(...Object.values(perDay)) <= 2);
});

test('long ride on Sunday, long run on Friday', () => {
  for (const s of all) {
    if (s.kind === 'bike-long') assert.equal(dow(s.date), 0);
    if (s.kind === 'run-long') assert.equal(dow(s.date), 5);
  }
});

test('the heavy leg day is never on, before, or after a long day (including across weeks)', () => {
  const heavy = all.filter((s) => s.kind === 'lift-A');
  assert.ok(heavy.length > 25);
  for (const s of heavy) {
    for (const d of [addDays(s.date, -1), s.date, addDays(s.date, 1)]) {
      assert.ok(!kindsOn(d).some((k) => LONG.includes(k)), `${s.date} is next to a long session on ${d}`);
    }
  }
});

test('3 lifts a week until January, then 2', () => {
  for (const w of plan.weeks.filter((x) => x.kind !== 'taper' && x.kind !== 'race')) {
    const lifts = w.sessions.filter((s) => s.sport === 'lift').length;
    assert.equal(lifts, w.start < '2027-01-04' ? 3 : 2, `week ${w.index + 1}`);
  }
});

test('1-2 swims a week, never two swims or two runs on one day', () => {
  for (const w of plan.weeks.filter((x) => x.kind !== 'race')) {
    const swims = w.sessions.filter((s) => s.sport === 'swim');
    assert.ok(swims.length >= 1 && swims.length <= 2, `week ${w.index + 1}`);
  }
  for (const date of new Set(all.map((s) => s.date))) {
    const k = kindsOn(date);
    assert.ok(k.filter((x) => x.startsWith('swim')).length <= 1, date);
    assert.ok(k.filter((x) => x.startsWith('run')).length <= 1, date);
  }
});

test('race week: race on the event date, nothing after it, no lifting', () => {
  const last = plan.weeks.at(-1);
  const race = last.sessions.find((s) => s.kind === 'race');
  assert.equal(race.date, '2027-07-11');
  assert.equal(race.title, 'Half Ironman 70.3');
  assert.ok(last.sessions.every((s) => s.kind === 'race' || s.date < '2027-07-11'));
  assert.ok(!last.sessions.some((s) => s.sport === 'lift'));
});

test('every session has what the app shows: sport, duration, description, stable id', () => {
  const ids = new Set();
  for (const s of all) {
    assert.ok(s.title && s.desc && s.sport, s.id);
    assert.ok(!/\{\w+\}/.test(s.desc), `unfilled placeholder in ${s.id}: ${s.desc}`);
    if (s.kind !== 'race') assert.ok(s.durationMin >= 15, `${s.id} ${s.durationMin}`);
    if (s.sport !== 'lift' && s.sport !== 'race') assert.ok(s.zone, s.id);
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
  }
});

test('changing the event date or type regenerates the plan around it', () => {
  const later = mergeSettings(DEFAULTS, { goals: [{ id: 'g', type: 'half-ironman', name: 'X', date: '2027-08-22' }] });
  const p2 = buildPlan(later, { today: TODAY });
  assert.equal(p2.weeks.length, 40);
  assert.equal(p2.weeks.at(-1).sessions.find((s) => s.kind === 'race').date, '2027-08-22');
  // week 1 sessions keep their ids, so logs stay attached
  assert.deepEqual(p2.weeks[0].sessions.map((s) => s.id), plan.weeks[0].sessions.map((s) => s.id));

  const marathon = mergeSettings(DEFAULTS, { goals: [{ id: 'g', type: 'marathon', name: 'M', date: '2027-05-02' }] });
  const p3 = buildPlan(marathon, { today: TODAY });
  assert.ok(!p3.weeks.flatMap((w) => w.sessions).some((s) => s.sport === 'swim'));
  assert.equal(p3.phases.taper, 2);
});

test('after the 2027 race the plan aims at the 2028 event', () => {
  const p = buildPlan(DEFAULTS, { today: '2027-07-12' });
  assert.equal(p.goal.id, 'g2028');
  assert.equal(p.start, '2027-07-12'); // the Monday after the race
  assert.equal(p.phases.taper, 3);
  assert.equal(buildPlan(DEFAULTS, { today: '2029-01-01' }).weeks.length, 0);
});

test('rest day and long days are editable', () => {
  const s = mergeSettings(DEFAULTS, { plan: { restDow: 1, longRideDow: 6, longRunDow: 3 } });
  const p = buildPlan(s, { today: TODAY });
  for (const x of p.weeks.flatMap((w) => w.sessions)) {
    assert.notEqual(dow(x.date), 1);
    if (x.kind === 'bike-long') assert.equal(dow(x.date), 6);
    if (x.kind === 'run-long') assert.equal(dow(x.date), 3);
  }
});

test('swim sessions follow the current swim stage', () => {
  const p = buildPlan(DEFAULTS, { today: TODAY, swimStage: 3 });
  const swim = p.weeks[0].sessions.find((s) => s.kind === 'swim');
  assert.equal(swim.title, 'Swim · Stage 3');
  assert.match(swim.desc, /8 x 50 m/);
  assert.equal(swim.distanceM, 100 + 400 + 50);
  assert.equal(stageFromSwimTest(400), 7);
  assert.equal(stageFromSwimTest(60), 3);
});

// ---------- adjustments ----------

const week1 = plan.weeks[0];
const ctx = (over = {}) => ({ overrides: {}, logs: [], busyWeeks: [], settings: DEFAULTS, today: '2026-11-16', ...over });
const idOf = (kind) => week1.sessions.find((s) => s.kind === kind).id;

test('skip, log and missed statuses; a missed session stays on its own day', () => {
  const r = resolveWeek(week1, ctx({
    today: '2026-11-18',
    overrides: { [idOf('lift-A')]: { id: idOf('lift-A'), status: 'skipped' } },
    logs: [{ id: 'l1', date: '2026-11-16', sessionId: idOf('run-easy'), durationMin: 24, sport: 'run' }],
  }));
  const by = Object.fromEntries(r.map((s) => [s.kind + (s.kind === 'swim' ? s.date : ''), s]));
  assert.equal(by['run-easy'].status, 'done');
  assert.equal(by['lift-A'].status, 'skipped');
  assert.equal(by['lift-C'].status, 'missed');
  assert.equal(by['lift-C'].date, '2026-11-16'); // not pushed to the next day
  assert.equal(by['bike-quality'].status, 'planned');
  // the days after a miss are unchanged: still at most two sessions
  const perDay = {};
  for (const s of r) perDay[s.date] = (perDay[s.date] || 0) + 1;
  assert.ok(Math.max(...Object.values(perDay)) <= 2);
});

test('moving a session changes its day only', () => {
  const id = idOf('bike-quality');
  const r = resolveWeek(week1, ctx({ overrides: { [id]: { id, movedTo: '2026-11-19' } } }));
  const s = r.find((x) => x.id === id);
  assert.equal(s.date, '2026-11-19');
  assert.equal(s.plannedDate, '2026-11-18');
  assert.ok(s.moved);
});

test('busy week keeps only the long ride, long run and one swim', () => {
  const r = resolveWeek(week1, ctx({ busyWeeks: [week1.start] }));
  const kept = r.filter((s) => s.status !== 'dropped').map((s) => s.kind).sort();
  assert.deepEqual(kept, ['bike-long', 'run-long', 'swim']);
  const totals = weekTotals(r);
  assert.equal(totals.planned, 55 + 35 + 25);
});

test('knee pain of 4+ halves runs for the next 7 days and offers a bike swap', () => {
  const logs = [{ id: 'k', date: '2026-11-16', sessionId: idOf('run-easy'), sport: 'run', durationMin: 25, knee: 4 }];
  const r = resolveWeek(week1, ctx({ logs, today: '2026-11-17' }));
  const long = r.find((s) => s.kind === 'run-long');
  assert.ok(long.kneeAdjusted);
  assert.equal(long.durationMin, 20); // 35 min halved, rounded to 5
  assert.ok(!r.find((s) => s.kind === 'bike-long').kneeAdjusted);

  const swapped = resolveWeek(week1, ctx({ logs, today: '2026-11-17', overrides: { [long.id]: { id: long.id, swap: 'bike' } } }))
    .find((s) => s.id === long.id);
  assert.equal(swapped.sport, 'bike');
  assert.equal(swapped.durationMin, 35);

  // pain of 3 does nothing, and the effect ends after 7 days
  const mild = resolveWeek(week1, ctx({ logs: [{ ...logs[0], knee: 3 }] }));
  assert.ok(!mild.some((s) => s.kneeAdjusted));
  const week3 = resolveWeek(plan.weeks[2], ctx({ logs, today: '2026-11-30' }));
  assert.ok(!week3.some((s) => s.kneeAdjusted));
});

test('"make it easy" shortens the session and caps it at Zone 2', () => {
  const id = plan.weeks[20].sessions.find((s) => s.kind === 'bike-quality').id;
  const base = plan.weeks[20].sessions.find((s) => s.id === id);
  assert.equal(base.zone, 'z3');
  const s = resolveWeek(plan.weeks[20], ctx({ today: plan.weeks[20].start, overrides: { [id]: { id, easy: true } } })).find((x) => x.id === id);
  assert.equal(s.zone, 'z2');
  assert.ok(s.durationMin < base.durationMin);
});

test('day type: long days, training days, rest days', () => {
  const r = resolveWeek(week1, ctx());
  assert.equal(dayType(r, '2026-11-22'), 'long');
  assert.equal(dayType(r, '2026-11-20'), 'long');
  assert.equal(dayType(r, '2026-11-18'), 'training');
  assert.equal(dayType(r, '2026-11-21'), 'rest');
  assert.equal(weekIndexOf(plan, '2026-11-15'), -1);
  assert.equal(weekIndexOf(plan, '2026-11-23'), 1);
});

test('move warnings flag rule breaks', () => {
  const others = week1.sessions.filter((s) => s.kind !== 'lift-A').map((s) => ({ kind: s.kind, date: s.date }));
  const w = (date) => moveWarnings('lift-A', date, dow(date), others, DEFAULTS.plan, addDays);
  assert.ok(w('2026-11-19').some((t) => /Heavy leg/.test(t))); // Thursday: day before the long run
  assert.ok(w('2026-11-21').some((t) => /rest day/.test(t)));
  assert.deepEqual(w('2026-11-18'), []); // Wednesday is fine
});

// ---------- zones ----------

test('zones come from the latest tests; effort wording is used until then', () => {
  assert.deepEqual(computeZones({}), {});
  assert.equal(targetFor('bike', 'z2', {}, DEFAULTS.zoneEffort).detail, DEFAULTS.zoneEffort.z2);
  assert.equal(targetFor('lift', null, {}, DEFAULTS.zoneEffort), null);

  const logs = [
    { date: '2026-12-02', test: 'bike', hr: 170, durationMin: 20, distance: 11 },
    { date: '2026-12-01', test: 'swim', durationMin: 10, distance: 400 },
    { date: '2026-11-30', test: 'run', hr: 160, durationMin: 30, distance: 5 },
    { date: '2027-02-03', test: 'bike', hr: 174, durationMin: 20, distance: 12 },
  ];
  const tests = latestTests(logs);
  assert.equal(tests.bike.hr, 174); // the retest replaces the first test
  const z = computeZones(tests);
  assert.deepEqual(z.bike.hr.z2, [134, 147]);
  assert.equal(targetFor('bike', 'z2', z, DEFAULTS.zoneEffort).detail, '134-147 bpm');
  assert.equal(targetFor('run', 'z2', z, DEFAULTS.zoneEffort).detail, '6:18-6:54 /km · 155-162 bpm');
  assert.equal(targetFor('swim', 'z2', z, DEFAULTS.zoneEffort).detail, '2:38-2:45 /100 m');
});

test('pace is calculated from duration and distance', () => {
  assert.equal(paceText('run', 30, 5), '6:00 /km');
  assert.equal(paceText('bike', 60, 27.4), '27.4 km/h');
  assert.equal(paceText('swim', 10, 400), '2:30 /100 m');
  assert.equal(paceText('run', 30, 0), '');
  assert.equal(paceText('lift', 45, 0), '');
});
