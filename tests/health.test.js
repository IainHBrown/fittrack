// Tests for turning Apple Health samples into sleep time and workouts.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDate, parseLines, sleepSummary, detectWorkouts, digest, fmtHours, localKey } from '../js/logic/health.js';

// Build local-time ISO-like strings without a zone, so tests pass in any time zone.
const at = (day, h, m = 0, s = 0) => new Date(2026, 10, day, h, m, s);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

test('dates are read in every form Shortcuts produces', () => {
  assert.equal(parseDate('2026-11-12T07:42:10-05:00').toISOString(), '2026-11-12T12:42:10.000Z');
  assert.equal(parseDate('2026-11-12T07:42:10').getHours(), 7); // no zone: the phone's own time
  assert.equal(parseDate('Nov 12, 2026 at 7:42 AM').getMinutes(), 42);
  assert.equal(parseDate('Nov 12, 2026 at 7:42 AM').getDate(), 12);
  assert.equal(parseDate('72'), null);
  assert.equal(parseDate('Core'), null);
});

test('lines are parsed with or without an end date, units, and junk lines', () => {
  const lines = parseLines([
    `${iso(at(12, 7, 0))}|${iso(at(12, 7, 30))}|Core`,
    `${iso(at(12, 6, 0))} | 61 count/min`,
    `${iso(at(12, 8, 0))}|${iso(at(12, 8, 5))}|1,25 km`,
    '', 'garbage', '|||',
  ].join('\n'));
  assert.equal(lines.length, 3);
  assert.equal(lines[0].value, 61);            // sorted by start
  assert.equal(lines[0].unit, 'count/min');
  assert.equal(lines[0].end.getTime(), lines[0].start.getTime());
  assert.equal(lines[1].text, 'Core');
  assert.equal(lines[1].value, null);
  assert.equal(lines[2].value, 1.25);          // decimal comma
  assert.equal(lines[2].unit, 'km');
  assert.deepEqual(parseLines(''), []);
  assert.deepEqual(parseLines(undefined), []);
});

test('sleep: time asleep for the night that ended on a date', () => {
  const L = (d1, h1, m1, d2, h2, m2, stage) => `${iso(at(d1, h1, m1))}|${iso(at(d2, h2, m2))}|${stage}`;
  const samples = parseLines([
    L(11, 23, 0, 12, 7, 30, 'In Bed'),        // phone's in-bed record overlaps the watch stages
    L(11, 23, 20, 12, 1, 0, 'Core'),
    L(12, 1, 0, 12, 2, 0, 'Deep'),
    L(12, 2, 0, 12, 2, 15, 'Awake'),
    L(12, 2, 15, 12, 4, 0, 'REM'),
    L(12, 4, 0, 12, 7, 10, 'Core'),
    L(12, 14, 0, 12, 14, 30, 'Core'),         // an afternoon nap still counts toward that day
    L(10, 23, 0, 11, 7, 0, 'Core'),           // the previous night must not be counted
  ].join('\n'));
  const s = sleepSummary(samples, '2026-11-12');
  // 23:20-02:00 (160) + 02:15-07:10 (295) + nap 30 = 485
  assert.equal(s.asleepMin, 485);
  assert.equal(s.awakeMin, 15);
  assert.equal(s.deepMin, 60);
  assert.equal(s.remMin, 105);
  assert.equal(new Date(s.bedtime).getHours(), 23);
  assert.equal(fmtHours(s.asleepMin), '8 h 05');
  assert.equal(sleepSummary(samples, '2026-11-11').asleepMin, 480);
  assert.equal(sleepSummary(samples, '2026-11-13'), null);
  assert.equal(sleepSummary(parseLines(L(11, 23, 0, 12, 7, 0, 'In Bed')), '2026-11-12'), null); // in bed is not asleep
});

test('overlapping sleep records are not counted twice', () => {
  const L = (h1, h2, stage) => `${iso(at(12, h1))}|${iso(at(12, h2))}|${stage}`;
  const s = sleepSummary(parseLines([L(0, 4, 'Asleep'), L(2, 6, 'Core'), L(3, 5, 'Deep')].join('\n')), '2026-11-12');
  assert.equal(s.asleepMin, 360);
});

/** Heart-rate lines: one every `step` seconds from a start time for `minutes`. */
function hrRun(day, h, m, minutes, step, bpm) {
  const out = [];
  for (let s = 0; s <= minutes * 60; s += step) out.push(`${iso(new Date(at(day, h, m).getTime() + s * 1000))}|${iso(new Date(at(day, h, m).getTime() + s * 1000))}|${bpm(s)}`);
  return out;
}

test('workouts are found where heart rate is recorded densely', () => {
  const lines = [
    ...hrRun(12, 0, 0, 6 * 60, 420, () => 55),               // overnight: every 7 minutes
    ...hrRun(12, 7, 5, 42, 5, (s) => 140 + (s % 60 < 30 ? 6 : 10)), // a 42-minute workout
    ...hrRun(12, 9, 0, 8 * 60, 300, () => 72),               // the rest of the day
    ...hrRun(12, 12, 0, 4, 5, () => 95),                      // 4 dense minutes (a breathing session): too short
  ];
  const w = detectWorkouts(parseLines(lines.join('\n')));
  assert.equal(w.length, 1);
  assert.equal(w[0].durationMin, 42);
  assert.equal(w[0].date, '2026-11-12');
  assert.equal(new Date(w[0].start).getHours(), 7);
  assert.ok(w[0].avgHr >= 146 && w[0].avgHr <= 150, String(w[0].avgHr));
  assert.equal(w[0].maxHr, 150);
  assert.equal(w[0].sport, null); // no distance: could be a lift or the gym bike
});

test('distance during the workout identifies the sport', () => {
  const hr = parseLines(hrRun(12, 7, 0, 30, 5, () => 150).join('\n'));
  const seg = (h, m, v) => `${iso(at(12, h, m))}|${iso(at(12, h, m + 1))}|${v}`;
  const run = detectWorkouts(hr, { running: parseLines([seg(7, 1, '1.6 km'), seg(7, 10, '1.7 km'), seg(7, 20, '1.9 km'), seg(13, 0, '0.4 km')].join('\n')) })[0];
  assert.deepEqual([run.sport, run.distance, run.unit], ['run', 5.2, 'km']); // the lunchtime walk is not included
  const walk = detectWorkouts(hr, { running: parseLines(seg(7, 5, '1.5 km')) })[0];
  assert.equal(walk.sport, null); // 3 km/h is a walk, not a run
  const bike = detectWorkouts(hr, { cycling: parseLines([seg(7, 2, '6.0'), seg(7, 15, '6.5')].join('\n')) })[0];
  assert.deepEqual([bike.sport, bike.distance, bike.unit], ['bike', 12.5, 'km']); // no unit: kilometres
  const swim = detectWorkouts(hr, { swimming: parseLines([seg(7, 3, '200'), seg(7, 12, '250 m'), seg(7, 20, '100 yd')].join('\n')) })[0];
  assert.deepEqual([swim.sport, swim.distance, swim.unit], ['swim', 541, 'm']);
  const miles = detectWorkouts(hr, { cycling: parseLines(seg(7, 2, '10 mi')) })[0];
  assert.equal(miles.distance, 16.09);
});

test('two workouts on one day stay separate; a short pause does not split one', () => {
  const lines = [
    ...hrRun(12, 7, 0, 20, 5, () => 130),
    ...hrRun(12, 7, 21, 20, 5, () => 135),   // resumes after a 60-second pause
    ...hrRun(12, 17, 0, 45, 5, () => 120),
  ];
  const w = detectWorkouts(parseLines(lines.join('\n')));
  assert.deepEqual(w.map((x) => x.durationMin), [41, 45]);
  assert.notEqual(w[0].id, w[1].id);
});

test('digest summarises one upload, and copes with missing parts', () => {
  const d = digest({
    sleep: `${iso(at(11, 23, 0))}|${iso(at(12, 7, 0))}|Core`,
    heartRate: hrRun(12, 7, 30, 15, 5, () => 125).join('\n'),
  }, ['2026-11-11', '2026-11-12']);
  assert.deepEqual(Object.keys(d.sleep), ['2026-11-12']);
  assert.equal(d.sleep['2026-11-12'].asleepMin, 480);
  assert.equal(d.workouts.length, 1);
  assert.deepEqual(d.counts, { sleep: 1, heartRate: 181, cycling: 0, running: 0, swimming: 0 });
  const empty = digest({}, ['2026-11-12']);
  assert.deepEqual(empty.sleep, {});
  assert.deepEqual(empty.workouts, []);
  assert.equal(localKey(at(12, 23, 59)), '2026-11-12');
});
