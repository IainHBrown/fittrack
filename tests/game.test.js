// Tests for streaks, XP, levels and badges. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS } from '../js/defaults.js';
import { streak, dayHits, allStreaks, metrics, badgeStates, logXp, totalXp, levelFor, gameState, weeklyHours, paceSeries } from '../js/engine/game.js';
import { addDays } from '../js/lib/dates.js';

/** Streak from a pattern string: 'x' = hit, '.' = miss. The last character is today. */
function run(pattern) {
  const first = '2026-11-01';
  const today = addDays(first, pattern.length - 1);
  return streak((d) => pattern[Math.round((new Date(d) - new Date(first)) / 86400000)] === 'x', first, today);
}

test('hitting the goal adds one each day', () => {
  assert.deepEqual(run('xxx'), { current: 3, best: 3, hitToday: true, atRisk: false });
});

test('one missed day keeps the streak and warns; hitting the next day continues it', () => {
  // hit, hit, today not done yet: nothing is at risk, missing today would not lose it
  assert.deepEqual(run('xx.'), { current: 2, best: 2, hitToday: false, atRisk: false });
  // hit, hit, missed yesterday, today not done yet: streak still 2, warning shown
  assert.deepEqual(run('xx..'), { current: 2, best: 2, hitToday: false, atRisk: true });
  // ...and hitting today continues from 2 to 3
  assert.deepEqual(run('xx.x'), { current: 3, best: 3, hitToday: true, atRisk: false });
});

test('two misses in a row reset the streak to 0', () => {
  assert.deepEqual(run('xxx..x'), { current: 1, best: 3, hitToday: true, atRisk: false });
  // 3 hits, then 2 misses, today not done yet: already reset, nothing left to warn about
  assert.deepEqual(run('xxx...'), { current: 0, best: 3, hitToday: false, atRisk: false });
});

test('single misses can repeat without losing the streak, and best-ever is kept', () => {
  assert.equal(run('x.x.x.x').current, 4);
  const r = run('xxxxx..xx');
  assert.equal(r.current, 2);
  assert.equal(r.best, 5);
});

test('an unfinished today is never counted as a miss', () => {
  const open = streak((d) => d < '2026-11-04', '2026-11-01', '2026-11-04'); // 3 hits, today open
  assert.deepEqual(open, { current: 3, best: 3, hitToday: false, atRisk: false });
  assert.deepEqual(streak(() => false, '2026-11-10', '2026-11-10'), { current: 0, best: 0, hitToday: false, atRisk: false });
});

test('daily goals: sleep logged, all supplements ticked, water goal reached', () => {
  const all = { creatine: true, b12: true, omega3: true, b2: true };
  const list = ['creatine', 'b12', 'omega3', 'b2'];
  const full = { date: 'd', sleep: 0, supps: all, suppList: list, water: [{ ml: 2000 }], waterGoal: 2000 };
  assert.deepEqual(dayHits(full, DEFAULTS, false), { sleep: true, supps: true, water: true }); // a score of 0 still counts as logged
  assert.equal(dayHits({ ...full, supps: { creatine: true } }, DEFAULTS, false).supps, false);
  assert.equal(dayHits({ ...full, water: [{ ml: 1999 }] }, DEFAULTS, false).water, false);
  // a long day's higher goal is the one that counts for that day
  assert.equal(dayHits({ ...full, waterGoal: 3000 }, DEFAULTS, false).water, false);
  // past days are judged by the list that applied then, today by the current list
  assert.equal(dayHits({ ...full, supps: { creatine: true }, suppList: ['creatine'] }, DEFAULTS, false).supps, true);
  assert.equal(dayHits({ ...full, supps: { creatine: true }, suppList: ['creatine'] }, DEFAULTS, true).supps, false);
  assert.deepEqual(dayHits(undefined, DEFAULTS, false), { sleep: false, supps: false, water: false });
});

test('streaks are built from the saved day records', () => {
  const day = (date, sleep) => ({ date, sleep, supps: {}, water: [] });
  const days = [day('2026-11-08', 88), day('2026-11-09', 90), day('2026-11-10', null)];
  const s = allStreaks(days, DEFAULTS, '2026-11-10');
  assert.deepEqual(s.sleep, { current: 2, best: 2, hitToday: false, atRisk: false });
  assert.equal(s.water.current, 0);
  assert.equal(allStreaks([], DEFAULTS, '2026-11-10').sleep.current, 0);
});

const logs = [
  { date: '2026-11-16', sessionId: 'a', sport: 'run', kind: 'run-easy', durationMin: 25, distance: 4 },
  { date: '2026-11-17', sessionId: 'b', sport: 'lift', kind: 'lift-A', durationMin: 45, prs: ['Bench 180 lb', 'Row 75 lb'] },
  { date: '2026-11-17', sessionId: 'c', sport: 'swim', kind: 'swim', durationMin: 25, distance: 300 },
  { date: '2026-11-20', sessionId: 'd', sport: 'run', kind: 'run-long', durationMin: 35, distance: 5.5 },
  { date: '2026-11-22', sessionId: 'e', sport: 'bike', kind: 'bike-long', durationMin: 60, distance: 28 },
  { date: '2026-11-21', sessionId: null, sport: 'other', kind: 'other', durationMin: 50 },
  { date: '2026-12-02', sessionId: 'f', sport: 'bike', kind: 'bike-test', test: 'bike', durationMin: 20, distance: 11 },
];

test('XP per log follows the editable values', () => {
  const xp = DEFAULTS.xp;
  assert.deepEqual(logs.map((l) => logXp(l, xp)), [100, 200, 100, 150, 150, 50, 200]);
  assert.equal(logXp({ kind: 'race', sessionId: 'r', sport: 'race' }, xp), 1000);
});

test('badge values, tiers and progress', () => {
  const zero = { current: 0, best: 0 };
  const m = metrics([{ date: 'x', sleep: 90 }, { date: 'y', sleep: 80 }], logs, { sleep: { best: 8 }, supps: zero, water: zero }, DEFAULTS);
  assert.equal(m.sessions, 6); // the "other activity" is not a session
  assert.equal(m.runKm, 9.5);
  assert.equal(m.longestRunKm, 5.5);
  assert.equal(m.longestSwimM, 300);
  assert.equal(m.swimKm, 0.3);
  assert.equal(m.bikeKm, 39);
  assert.equal(m.prs, 2);
  assert.equal(m.tests, 1);
  assert.equal(m.goodNights, 1);
  const b = Object.fromEntries(badgeStates(DEFAULTS.badges, m).map((x) => [x.id, x]));
  assert.equal(b['long-run'].tier, 1);          // 5.5 km: bronze (5 km)
  assert.equal(b['long-run'].next, 10);         // next: the first 10 km run
  assert.equal(b['long-run'].frac, 0.1);
  assert.equal(b['sleep-streak'].tier, 1);
  assert.equal(b['long-swim'].tier, 0);
  assert.equal(b['long-swim'].next, 400);
  const gold = badgeStates(DEFAULTS.badges, { ...m, longestSwimM: 2000 }).find((x) => x.id === 'long-swim');
  assert.equal(gold.tier, 3);
  assert.equal(gold.next, null);
  assert.equal(gold.frac, 1);
});

test('levels run from Rookie to Ironman with progress to the next', () => {
  const L = DEFAULTS.levels;
  assert.equal(L[0].name, 'Rookie');
  assert.equal(L.at(-1).name, 'Ironman');
  assert.deepEqual(levelFor(0, L), { number: 1, name: 'Rookie', floor: 0, next: 1500, nextName: 'Trainee', frac: 0, toGo: 1500 });
  assert.equal(levelFor(1499, L).name, 'Rookie');
  assert.equal(levelFor(1500, L).name, 'Trainee');
  assert.equal(levelFor(3250, L).frac, 0.5);
  const top = levelFor(999999, L);
  assert.equal(top.name, 'Ironman');
  assert.equal(top.next, null);
  assert.equal(top.frac, 1);
});

test('total XP adds training, daily goals and badge tiers', () => {
  const all = { creatine: true, b12: true, omega3: true, b2: true };
  const days = [
    { date: '2026-11-16', sleep: 88, supps: all, suppList: Object.keys(all), water: [{ ml: 2000 }] }, // 60
    { date: '2026-11-17', sleep: 70, supps: {}, water: [] },                                           // 20
  ];
  const g = gameState(days, logs, DEFAULTS, '2026-11-18');
  assert.equal(g.xp.training, 950);
  assert.equal(g.xp.daily, 80);
  assert.equal(g.xp.badges, 50); // long-run bronze
  assert.equal(g.xp.total, 1080);
  assert.equal(g.level.name, 'Rookie');
  assert.equal(totalXp([], [], [], DEFAULTS, 't').total, 0);
});

test('chart data: weekly hours by sport and pace trends', () => {
  const w = weeklyHours(logs, '2026-11-16', 2);
  assert.equal(w.length, 2);
  assert.equal(w[1].start, '2026-11-16');
  assert.ok(Math.abs(w[1].run - 1) < 1e-9);
  assert.ok(Math.abs(w[1].total - (25 + 45 + 25 + 35 + 60 + 50) / 60) < 1e-9);
  assert.equal(w[0].total, 0);
  const run = paceSeries(logs, 'run');
  assert.deepEqual(run.map((p) => p.date), ['2026-11-16', '2026-11-20']);
  assert.equal(run[0].value, 6.25); // min per km
  assert.equal(paceSeries(logs, 'bike')[0].value, 28); // km/h
  assert.ok(Math.abs(paceSeries(logs, 'swim')[0].value - 25 / 3) < 1e-9); // min per 100 m
});
