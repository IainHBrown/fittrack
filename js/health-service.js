// Apple Watch data. An iPhone Shortcut uploads raw Health samples to the
// Worker; this fetches the latest upload, digests it (logic/health.js), and
// keeps the results on the phone:
//   kv "health" = { receivedAt, checkedAt, counts, sleep: { date: {...} }, workouts: [...] }
// Sleep time is also written onto each day record so it stays in history.

import { dayKey, addDays } from './lib/dates.js';
import { kvGet, kvSet, updateDay } from './db.js';
import { cloudCall, cloudConfig } from './cloud.js';
import { digest } from './logic/health.js';

const EMPTY = { receivedAt: null, checkedAt: null, counts: {}, sleep: {}, workouts: [] };
const KEEP_DAYS = 28;

export async function getHealth() {
  return { ...EMPTY, ...((await kvGet('health')) || {}) };
}

let lastTry = 0;

/**
 * Fetch and digest the newest upload, if there is one.
 * @returns {Promise<object|null>} the health record with `changed: true` when new data arrived;
 *   null when it was not checked (too soon, offline, or cloud not set up)
 */
export async function syncHealth(force = false) {
  if (!force && Date.now() - lastTry < 60000) return null;
  lastTry = Date.now();
  if (!(await cloudConfig()).ready || navigator.onLine === false) return null;

  const inbox = await cloudCall('/health');
  const cur = await getHealth();
  const checkedAt = new Date().toISOString();
  if (!inbox.receivedAt || inbox.receivedAt === cur.receivedAt) {
    await kvSet('health', { ...cur, checkedAt });
    return { ...cur, checkedAt, changed: false };
  }

  const today = dayKey();
  const d = digest(inbox.data || {}, [today, addDays(today, -1), addDays(today, -2)]);
  const cutoff = addDays(today, -KEEP_DAYS);
  const byId = new Map(cur.workouts.map((w) => [w.id, w]));
  for (const w of d.workouts) byId.set(w.id, w);
  const sleep = Object.fromEntries(Object.entries({ ...cur.sleep, ...d.sleep }).filter(([date]) => date >= cutoff));
  const next = {
    receivedAt: inbox.receivedAt, checkedAt, counts: d.counts, sleep,
    workouts: [...byId.values()].filter((w) => w.date >= cutoff).sort((a, b) => a.start - b.start),
  };
  await kvSet('health', next);
  for (const [date, s] of Object.entries(d.sleep)) {
    await updateDay(date, (day) => { day.sleepMin = s.asleepMin; day.sleepAwakeMin = s.awakeMin; });
  }
  return { ...next, changed: true };
}

/** Watch workouts on a date that have not been used for a log yet. */
export function unusedWorkouts(health, date, logs) {
  const used = new Set(logs.map((l) => l.watchId).filter(Boolean));
  return health.workouts.filter((w) => w.date === date && !used.has(w.id));
}
