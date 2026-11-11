// Tests for the backup file format. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeBackup, checkBackup, backupFileName } from '../js/logic/backup.js';
import { mergeSettings, pathGet, pathSet, pathDelete } from '../js/state.js';
import { DEFAULTS } from '../js/defaults.js';

const stores = {
  kv: [{ key: 'settings', value: { sleep: { goal: 88 } } }, { key: 'swimStage', value: 3 }],
  days: [{ date: '2026-11-10', sleep: 88, water: [{ t: 1, ml: 500 }], supps: {}, meals: [] }],
  logs: [{ id: 'l1', date: '2026-11-10', sport: 'run', durationMin: 30 }],
  overrides: [{ id: '2026-11-16|run-easy|1', status: 'skipped' }],
  exercises: [{ id: 'bench', name: 'Bench press' }],
  stretches: [{ id: 'st1', name: 'Couch stretch', photo: 'data:image/jpeg;base64,AAAA' }],
  foods: [{ id: 'f1', name: 'Banana', cal: 105 }],
};

test('a backup survives being saved as JSON and read back', () => {
  const file = JSON.stringify(makeBackup(stores, new Date('2026-11-11T12:00:00Z'), '0.6.0'));
  const res = checkBackup(JSON.parse(file));
  assert.equal(res.ok, true);
  assert.deepEqual(res.stores, stores);
  assert.deepEqual(res.summary, { exportedAt: '2026-11-11T12:00:00.000Z', days: 1, logs: 1, exercises: 1, stretches: 1, foods: 1 });
});

test('missing stores are treated as empty (older backups still load)', () => {
  const res = checkBackup({ app: 'fittrack', format: 1, stores: { kv: [], days: stores.days } });
  assert.equal(res.ok, true);
  assert.deepEqual(res.stores.logs, []);
  assert.deepEqual(res.stores.foods, []);
});

test('wrong, newer or damaged files are refused with a plain reason', () => {
  assert.match(checkBackup(null).error, /not a Fitness Tracker backup/);
  assert.match(checkBackup({ hello: 1 }).error, /not a Fitness Tracker backup/);
  assert.match(checkBackup([1, 2]).error, /not a Fitness Tracker backup/);
  assert.match(checkBackup({ app: 'fittrack', format: 99, stores }).error, /newer version/);
  assert.match(checkBackup({ app: 'fittrack', format: 1 }).error, /no data/);
  assert.match(checkBackup({ app: 'fittrack', format: 1, stores: { ...stores, days: 'x' } }).error, /damaged \(days\)/);
  assert.match(checkBackup({ app: 'fittrack', format: 1, stores: { ...stores, days: [{ sleep: 80 }] } }).error, /damaged \(days\)/);
  assert.match(checkBackup({ app: 'fittrack', format: 1, stores: { ...stores, logs: [null] } }).error, /damaged \(logs\)/);
  assert.match(checkBackup({ app: 'fittrack', format: 1, stores: { ...stores, kv: [{ value: 1 }] } }).error, /damaged \(kv\)/);
});

test('backup file name carries the date', () => {
  assert.equal(backupFileName('2026-11-11'), 'fittrack-backup-2026-11-11.json');
});

test('settings paths: read, write and reset to default', () => {
  const saved = {};
  pathSet(saved, 'plan.knee.painThreshold', 5);
  pathSet(saved, 'library.bike-long.title', 'Big ride');
  assert.deepEqual(saved, { plan: { knee: { painThreshold: 5 } }, library: { 'bike-long': { title: 'Big ride' } } });
  const merged = mergeSettings(DEFAULTS, saved);
  assert.equal(pathGet(merged, 'plan.knee.painThreshold'), 5);
  assert.equal(pathGet(merged, 'library.bike-long.title'), 'Big ride');
  assert.equal(pathGet(merged, 'library.bike-long.zone'), 'z2'); // untouched default
  assert.equal(pathGet(merged, 'no.such.path'), undefined);

  pathDelete(saved, 'plan.knee.painThreshold');
  assert.deepEqual(saved, { library: { 'bike-long': { title: 'Big ride' } } }); // empty parents are tidied away
  assert.equal(pathGet(mergeSettings(DEFAULTS, saved), 'plan.knee.painThreshold'), 4);
  pathDelete(saved, 'not.there'); // no error
});
