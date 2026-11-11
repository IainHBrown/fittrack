// Prints the generated plan as a table, for checking the engine by eye.
// Usage: node tools/print-plan.mjs [today=YYYY-MM-DD] [weeks to show in detail, e.g. 1,3,8]

import { DEFAULTS } from '../js/defaults.js';
import { buildPlan } from '../js/engine/plan.js';
import { parseKey } from '../js/lib/dates.js';

const today = process.argv[2] || '2026-11-10';
const detail = (process.argv[3] || '1,3').split(',').map(Number);
const plan = buildPlan(DEFAULTS, { today });
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

console.log(`Goal: ${plan.goal?.name} on ${plan.goal?.date}. Start ${plan.start}. Phases:`, plan.phases);
let prevNormal = null;
for (const w of plan.weeks) {
  const by = {};
  for (const s of w.sessions) by[s.sport] = (by[s.sport] || 0) + s.durationMin;
  const up = prevNormal && w.kind === 'normal' ? ` (+${(((w.targetMin / prevNormal) - 1) * 100).toFixed(1)}%)` : '';
  if (w.kind === 'normal') prevNormal = w.targetMin;
  console.log(
    `W${String(w.index + 1).padStart(2)} ${w.start} ${w.phase.padEnd(5)} ${(w.kind + (w.test ? '+test' : '')).padEnd(13)} ` +
    `${(w.targetMin / 60).toFixed(1).padStart(4)}h  swim ${String(by.swim || 0).padStart(3)} bike ${String(by.bike || 0).padStart(3)} ` +
    `run ${String(by.run || 0).padStart(3)} lift ${String(by.lift || 0).padStart(3)}${up}`
  );
  if (detail.includes(w.index + 1)) {
    for (const s of w.sessions) console.log(`      ${DOW[parseKey(s.date).getDay()]} ${s.date}  ${s.kind.padEnd(13)} ${String(s.durationMin).padStart(3)} min  ${s.title}`);
  }
}
