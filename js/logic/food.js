// Pure food calculations: day totals, targets by day type, range checks.

const MACROS = ['cal', 'protein', 'carbs', 'fat'];
const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

/** Totals for a day's logged meals. */
export function foodTotals(day) {
  const t = { cal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const m of (day && day.meals) || []) for (const k of MACROS) t[k] += n(m[k]);
  for (const k of MACROS) t[k] = Math.round(t[k]);
  return t;
}

/** Targets for a day type ('rest' | 'training' | 'long'). */
export function foodTargets(settings, dayType) {
  const f = settings.food;
  const base = f.targets[dayType] || f.targets.training;
  return { cal: base.cal, carbs: base.carbs, protein: { ...f.protein }, fat: { ...f.fat } };
}

/** Where a value sits against a min-max range: 'under' | 'hit' | 'over'. */
export function rangeStatus(value, range) {
  if (value < range.min) return 'under';
  return value > range.max ? 'over' : 'hit';
}

/** Short status text for a range macro, e.g. "34 g to go", "In range", "12 g over". */
export function rangeText(value, range) {
  const s = rangeStatus(value, range);
  if (s === 'under') return `${Math.round(range.min - value)} g to go`;
  return s === 'hit' ? 'In range' : `${Math.round(value - range.max)} g over`;
}

/** Clean up numbers typed into a meal or food form. */
export function cleanMacros(src) {
  return Object.fromEntries(MACROS.map((k) => [k, Math.round(n(src[k]))]));
}

export const DAY_TYPE_LABEL = { rest: 'Rest day', training: 'Training day', long: 'Long day' };
