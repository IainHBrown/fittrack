// Tests for food totals and targets. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS } from '../js/defaults.js';
import { mergeSettings } from '../js/state.js';
import { foodTotals, foodTargets, rangeStatus, rangeText, cleanMacros } from '../js/logic/food.js';

test('day totals add up every meal and cope with blanks', () => {
  const day = { meals: [
    { cal: 1220, protein: 38, carbs: 92, fat: 76 },
    { cal: 450, protein: 14, carbs: 85, fat: 7 },
    { cal: '260', protein: '', carbs: null, fat: 17 },
  ] };
  assert.deepEqual(foodTotals(day), { cal: 1930, protein: 52, carbs: 177, fat: 100 });
  assert.deepEqual(foodTotals({}), { cal: 0, protein: 0, carbs: 0, fat: 0 });
  assert.deepEqual(foodTotals(null), { cal: 0, protein: 0, carbs: 0, fat: 0 });
});

test('default targets by day type match the brief', () => {
  assert.deepEqual(foodTargets(DEFAULTS, 'rest'), { cal: 2800, carbs: 350, protein: { min: 130, max: 160 }, fat: { min: 90, max: 100 } });
  assert.equal(foodTargets(DEFAULTS, 'training').cal, 3100);
  assert.equal(foodTargets(DEFAULTS, 'training').carbs, 425);
  assert.equal(foodTargets(DEFAULTS, 'long').cal, 3500);
  assert.equal(foodTargets(DEFAULTS, 'long').carbs, 500);
  assert.equal(foodTargets(DEFAULTS, 'unknown').cal, 3100); // falls back to a training day
});

test('targets are editable', () => {
  const s = mergeSettings(DEFAULTS, { food: { targets: { rest: { cal: 2600 } }, protein: { min: 140 } } });
  const t = foodTargets(s, 'rest');
  assert.equal(t.cal, 2600);
  assert.equal(t.carbs, 350);
  assert.deepEqual(t.protein, { min: 140, max: 160 });
});

test('protein is "hit" once inside the range', () => {
  const p = DEFAULTS.food.protein;
  assert.equal(rangeStatus(129, p), 'under');
  assert.equal(rangeStatus(130, p), 'hit');
  assert.equal(rangeStatus(160, p), 'hit');
  assert.equal(rangeStatus(161, p), 'over');
  assert.equal(rangeText(96, p), '34 g to go');
  assert.equal(rangeText(145, p), 'In range');
  assert.equal(rangeText(172, p), '12 g over');
});

test('typed numbers are cleaned: rounded, never negative, blanks become 0', () => {
  assert.deepEqual(cleanMacros({ cal: '650.4', protein: -5, carbs: 'abc', fat: undefined }), { cal: 650, protein: 0, carbs: 0, fat: 0 });
});

test('the preloaded list is complete, flagged as estimates, and includes the requested items', () => {
  const foods = DEFAULTS.seedFoods;
  const ids = new Set();
  for (const f of foods) {
    assert.ok(f.name && DEFAULTS.food.groups.includes(f.group), f.id);
    for (const k of ['cal', 'protein', 'carbs', 'fat']) assert.ok(Number.isFinite(f[k]) && f[k] >= 0, `${f.id} ${k}`);
    // calories should roughly agree with the macros (4/4/9 rule), within 15%
    const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9;
    assert.ok(Math.abs(fromMacros - f.cal) / f.cal < 0.15, `${f.id}: ${f.cal} cal vs ${fromMacros} from macros`);
    assert.ok(!ids.has(f.id));
    ids.add(f.id);
  }
  const names = foods.map((f) => f.name.toLowerCase()).join(' | ');
  for (const must of ['cold cut combo', 'smash burger', 'burrito', 'chicken teriyaki bowl', 'cereal with a banana', 'peanut butter on rice cakes']) {
    assert.ok(names.includes(must), must);
  }
});

test('the Cold Cut Combo footlong is built from Subway Canada component values', () => {
  // per 6-inch: Italian Herbs & Cheese bread 250, cold cut meats 190, vegetables about 12, mayo 100, chipotle 60
  const sixInch = 250 + 190 + 12 + 100 + 60;
  const f = DEFAULTS.seedFoods.find((x) => x.id === 'sub-ccc');
  assert.ok(Math.abs(f.cal - sixInch * 2) <= 10);
  assert.equal(f.protein, (10 + 9) * 2);
  assert.equal(f.fat, (5 + 16 + 11 + 6) * 2);
});
