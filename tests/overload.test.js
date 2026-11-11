// Tests for the progressive overload engine. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS } from '../js/defaults.js';
import { nextTarget, evaluate, e1rm, roundTo, records, newRecords, historyFor } from '../js/engine/overload.js';

const cfg = DEFAULTS.lifting;
const bench = { type: 'weight', group: 'upper' };
const squat = { type: 'weight', group: 'lower' };
const scheme = { sets: 3, reps: 6 };
const perf = (weight, reps, target = weight, date = '2026-11-17') => ({
  date, target: { weight: target, reps: 6, sets: 3 }, sets: reps.map((r) => ({ weight, reps: r })),
});

test('first session has no target', () => {
  const t = nextTarget(bench, scheme, [], cfg);
  assert.equal(t.weight, null);
  assert.equal(t.kind, 'first');
  assert.equal(t.sets, 3);
  assert.equal(t.reps, 6);
});

test('hitting every rep adds 5 lb for upper body and 10 lb for lower body', () => {
  const up = nextTarget(bench, scheme, [perf(175, [6, 6, 6], null)], cfg);
  assert.equal(up.weight, 180);
  assert.equal(up.kind, 'increase');
  assert.equal(up.reason, 'You hit 3×6 at 175 lb last time → +5 lb');
  assert.equal(nextTarget(squat, scheme, [perf(225, [6, 6, 6])], cfg).weight, 235);
  // extra reps still count as a hit
  assert.equal(nextTarget(bench, scheme, [perf(175, [8, 7, 6])], cfg).weight, 180);
});

test('a per-exercise increment overrides the default', () => {
  assert.equal(nextTarget({ ...bench, increment: 2.5 }, scheme, [perf(40, [6, 6, 6])], cfg).weight, 45); // 42.5 rounds to 5 lb steps
  assert.equal(nextTarget({ ...squat, increment: 20 }, scheme, [perf(200, [6, 6, 6])], cfg).weight, 220);
});

test('missing reps repeats the same weight', () => {
  const t = nextTarget(bench, scheme, [perf(180, [6, 5, 4])], cfg);
  assert.equal(t.weight, 180);
  assert.equal(t.kind, 'repeat');
  assert.match(t.reason, /Missed reps at 180 lb/);
  // doing fewer sets than planned is also a miss
  assert.equal(nextTarget(bench, scheme, [perf(180, [6, 6])], cfg).kind, 'repeat');
});

test('missing the same weight twice in a row deloads about 10%, rounded to 5 lb', () => {
  const h = [perf(175, [6, 6, 6]), perf(180, [6, 5, 4]), perf(180, [6, 6, 5])];
  const t = nextTarget(bench, scheme, h, cfg);
  assert.equal(t.kind, 'deload');
  assert.equal(t.weight, 160); // 180 * 0.9 = 162, rounded to 160
  assert.match(t.reason, /twice in a row/);
  // misses at different weights are not "the same target"
  assert.equal(nextTarget(bench, scheme, [perf(185, [5, 5, 5]), perf(180, [6, 5, 5])], cfg).kind, 'repeat');
  // a deload always goes down, even for light weights
  assert.equal(nextTarget(bench, scheme, [perf(20, [5, 5, 5]), perf(20, [5, 5, 5])], cfg).weight, 15);
});

test('after a deload it builds back up', () => {
  const h = [perf(180, [6, 5, 4]), perf(180, [6, 6, 5]), perf(160, [6, 6, 6])];
  const t = nextTarget(bench, scheme, h, cfg);
  assert.equal(t.kind, 'increase');
  assert.equal(t.weight, 165);
});

test('progress follows the weight actually lifted, not just the target', () => {
  // went heavier than the target and hit it
  assert.equal(nextTarget(bench, scheme, [perf(185, [6, 6, 6], 180)], cfg).weight, 190);
  // went lighter than the target and hit it: build from the lighter weight
  assert.equal(nextTarget(bench, scheme, [perf(170, [6, 6, 6], 180)], cfg).weight, 175);
});

test('changing sets and reps in the routine carries into the next target', () => {
  const t = nextTarget(bench, { sets: 4, reps: 8 }, [perf(175, [6, 6, 6])], cfg);
  assert.equal(t.weight, 180);
  assert.equal(t.sets, 4);
  assert.equal(t.reps, 8);
});

test('bodyweight exercises progress by reps (or 5 seconds for holds)', () => {
  const pull = { type: 'bodyweight', group: 'upper' };
  const p = (reps, target) => ({ date: 'd', target: { weight: null, reps: target, sets: 3 }, sets: reps.map((r) => ({ weight: 0, reps: r })) });
  assert.equal(nextTarget(pull, scheme, [p([6, 6, 6], 6)], cfg).reps, 7);
  assert.equal(nextTarget(pull, scheme, [p([6, 5, 4], 6)], cfg).reps, 6);
  assert.equal(nextTarget(pull, scheme, [p([7, 7, 7], 7)], cfg).reps, 8);
  const plank = { type: 'bodyweight', group: 'core', repUnit: 'sec' };
  const t = nextTarget(plank, { sets: 3, reps: 45 }, [{ date: 'd', target: { weight: null, reps: 45, sets: 3 }, sets: [45, 45, 45].map((r) => ({ weight: 0, reps: r })) }], cfg);
  assert.equal(t.reps, 50);
  assert.equal(t.weight, null);
});

test('evaluate, rounding and estimated 1-rep max', () => {
  assert.deepEqual(evaluate(perf(100, [6, 6, 6])), { hit: true, weight: 100 });
  assert.equal(evaluate(perf(100, [6, 6, 5])).hit, false);
  assert.equal(roundTo(162, 5), 160);
  assert.equal(roundTo(163, 5), 165);
  assert.equal(e1rm(200, 1), 200);
  assert.equal(Math.round(e1rm(180, 6)), 216);
  assert.equal(e1rm(100, 0), 0);
});

test('records and new-record detection', () => {
  const h = [perf(175, [6, 6, 6], 175, '2026-11-17'), perf(180, [6, 6, 6], 180, '2026-11-24')];
  const r = records(h);
  assert.deepEqual(r.top, { value: 180, date: '2026-11-24' });
  assert.equal(r.e1rm.value, 216);
  assert.deepEqual(newRecords(h, perf(185, [6, 6, 6])).map((x) => x.type), ['top', 'e1rm']);
  assert.deepEqual(newRecords(h, perf(180, [8, 6, 6])).map((x) => x.type), ['e1rm']); // same weight, more reps
  assert.deepEqual(newRecords(h, perf(170, [6, 6, 6])), []);
  assert.deepEqual(newRecords([], perf(300, [6, 6, 6])), []); // first session is the baseline
});

test('history comes from logs, survives routine changes, and skips easy days', () => {
  const logs = [
    { date: '2026-11-24', createdAt: 2, exercises: [{ exId: 'bench', target: { weight: 180, reps: 6, sets: 3 }, sets: [{ weight: 180, reps: 6 }] }] },
    { date: '2026-11-17', createdAt: 1, exercises: [{ exId: 'bench', target: { weight: null, reps: 6, sets: 3 }, sets: [{ weight: 175, reps: 6 }] }, { exId: 'row', target: { weight: null, reps: 8, sets: 3 }, sets: [] }] },
    { date: '2026-11-26', createdAt: 3, exercises: [{ exId: 'bench', easy: true, target: { weight: 160, reps: 6, sets: 3 }, sets: [{ weight: 160, reps: 6 }] }] },
    { date: '2026-11-18', sport: 'run' },
  ];
  const h = historyFor('bench', logs);
  assert.deepEqual(h.map((p) => p.date), ['2026-11-17', '2026-11-24']);
  assert.equal(historyFor('bench', logs, { includeEasy: true }).length, 3);
  assert.equal(historyFor('row', logs).length, 0); // no sets done = nothing recorded
});
