// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayKey, parseKey, addDays, daysBetween, monthRange, addMonths, fmtDayLong, fmtDate } from '../js/lib/dates.js';
import { waterTotal, waterGoal, fmtLitres, suppsTicked, suppsAllDone, sleepLevel, sleepStats, nextGoal } from '../js/logic/day.js';
import { mergeSettings } from '../js/state.js';
import { DEFAULTS } from '../js/defaults.js';

test('day keys use local time and survive month and year ends', () => {
  assert.equal(dayKey(new Date(2026, 10, 10, 23, 59, 59)), '2026-11-10');
  assert.equal(dayKey(new Date(2026, 10, 11, 0, 0, 0)), '2026-11-11'); // midnight starts a new day
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29'); // leap year
  assert.equal(dayKey(parseKey('2026-11-01')), '2026-11-01');
});

test('daysBetween ignores daylight-saving shifts', () => {
  assert.equal(daysBetween('2026-11-17', '2027-07-11'), 236);
  assert.equal(daysBetween('2027-03-13', '2027-03-15'), 2); // spans the spring clock change
  assert.equal(daysBetween('2026-11-10', '2026-11-10'), 0);
  assert.equal(daysBetween('2026-11-10', '2026-11-09'), -1);
});

test('month helpers', () => {
  const r = monthRange('2026-11-10');
  assert.deepEqual(r, { first: '2026-11-01', last: '2026-11-30', days: 30, startDow: 0 });
  assert.equal(monthRange('2028-02-10').days, 29);
  assert.equal(addMonths('2026-12-15', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-31', -1), '2025-12-01');
});

test('date formatting', () => {
  assert.equal(fmtDayLong('2026-11-17'), 'Tuesday 17 Nov');
  assert.equal(fmtDate('2027-07-11'), 'Sun 11 Jul 2027');
});

test('water totals, goals and litre formatting', () => {
  const day = { water: [{ t: 1, ml: 250 }, { t: 2, ml: 500 }, { t: 3, ml: 500 }] };
  assert.equal(waterTotal(day), 1250);
  assert.equal(waterTotal({}), 0);
  assert.equal(fmtLitres(1250), '1.25');
  assert.equal(fmtLitres(500), '0.5');
  assert.equal(fmtLitres(2000), '2');
  assert.equal(fmtLitres(0), '0');
  assert.equal(waterGoal(DEFAULTS, {}), 2000);
  assert.equal(waterGoal(DEFAULTS, { dayType: 'long' }), 3000);
});

test('supplements: done only when every listed one is ticked', () => {
  const list = DEFAULTS.supplements;
  const day = { supps: { creatine: true, b12: true, omega3: true } };
  assert.equal(suppsTicked(day, list), 3);
  assert.equal(suppsAllDone(day, list), false);
  day.supps.b2 = true;
  assert.equal(suppsAllDone(day, list), true);
  // a tick for a supplement that was later removed does not count
  assert.equal(suppsTicked({ supps: { old: true } }, list), 0);
  assert.equal(suppsAllDone({ supps: {} }, []), false);
});

test('sleep levels follow the editable thresholds', () => {
  assert.equal(sleepLevel(null, DEFAULTS), null);
  assert.equal(sleepLevel(85, DEFAULTS), 'good');
  assert.equal(sleepLevel(84, DEFAULTS), 'ok');
  assert.equal(sleepLevel(70, DEFAULTS), 'ok');
  assert.equal(sleepLevel(69, DEFAULTS), 'low');
  assert.equal(sleepLevel(0, DEFAULTS), 'low');
  const custom = mergeSettings(DEFAULTS, { sleep: { goal: 90 } });
  assert.equal(sleepLevel(88, custom), 'ok');
});

test('sleep stats', () => {
  const days = [{ sleep: 90 }, { sleep: 85 }, { sleep: 70 }, { sleep: null }, { sleep: 60 }];
  assert.deepEqual(sleepStats(days, DEFAULTS), { logged: 4, good: 2, hitRate: 50, average: 76 });
  assert.deepEqual(sleepStats([], DEFAULTS), { logged: 0, good: 0, hitRate: null, average: null });
  assert.equal(sleepStats([{ sleep: 0 }], DEFAULTS).logged, 1); // a score of 0 still counts as logged
});

test('next goal is the earliest event not yet passed', () => {
  assert.equal(nextGoal(DEFAULTS.goals, '2026-11-10').id, 'g2027');
  assert.equal(nextGoal(DEFAULTS.goals, '2027-07-11').id, 'g2027'); // race day itself
  assert.equal(nextGoal(DEFAULTS.goals, '2027-07-12').id, 'g2028');
  assert.equal(nextGoal(DEFAULTS.goals, '2029-01-01'), null);
});

test('saved settings layer over defaults; lists are replaced whole', () => {
  const m = mergeSettings(DEFAULTS, { sleep: { goal: 88 }, supplements: [{ id: 'x', name: 'Zinc', dose: '' }] });
  assert.equal(m.sleep.goal, 88);
  assert.equal(m.sleep.lowBelow, 70); // untouched default still present
  assert.equal(m.supplements.length, 1);
  assert.equal(DEFAULTS.sleep.goal, 85); // defaults are never mutated
});
