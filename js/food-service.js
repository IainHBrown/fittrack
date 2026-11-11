// Food data: the quick-add library and the meals logged on each day.

import { settings } from './state.js';
import { getAll, putItem, deleteItem, kvGet, kvSet, updateDay, newId } from './db.js';
import { cleanMacros } from './logic/food.js';

/** Copy the starting quick-add list into storage the first time. */
export async function seedFoods() {
  if (await kvGet('foodSeeded')) return;
  let order = 0;
  for (const f of settings().seedFoods) await putItem('foods', { ...f, order: order++, estimate: true });
  await kvSet('foodSeeded', true);
}

/** Quick-add list, in its saved order. */
export async function getFoods() {
  return (await getAll('foods')).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name));
}

export async function saveFood(food) {
  const item = { ...food, ...cleanMacros(food), name: food.name.trim() };
  if (!item.id) { item.id = newId('f'); item.order = Date.now(); }
  await putItem('foods', item);
  return item;
}

export const removeFood = (id) => deleteItem('foods', id);

/** Add a meal to a day. */
export function logMeal(date, meal) {
  const rec = { id: newId('m'), t: Date.now(), name: meal.name.trim(), ...cleanMacros(meal) };
  if (meal.foodId) rec.foodId = meal.foodId;
  return updateDay(date, (d) => { (d.meals ||= []).push(rec); }).then(() => rec);
}

export function updateMeal(date, id, change) {
  return updateDay(date, (d) => {
    const m = (d.meals || []).find((x) => x.id === id);
    if (m) Object.assign(m, { name: change.name.trim(), ...cleanMacros(change) });
  });
}

export function removeMeal(date, id) {
  return updateDay(date, (d) => { d.meals = (d.meals || []).filter((x) => x.id !== id); });
}
