// Lifting data: exercise library, routines (Day A / B / C), and the workout
// in progress. The overload maths lives in engine/overload.js.

import { settings } from './state.js';
import { getAll, putItem, kvGet, kvSet, getLogs, newId } from './db.js';
import { nextTarget, historyFor, roundTo } from './engine/overload.js';
import { dayKey } from './lib/dates.js';

/** Copy the starting library and routines into storage the first time. */
export async function seedLifting() {
  if (await kvGet('liftSeeded')) return;
  const s = settings();
  for (const ex of s.seedExercises) await putItem('exercises', { ...ex });
  await kvSet('routines', structuredClone(s.seedRoutines));
  await kvSet('liftSeeded', true);
}

/** All exercises as a Map by id (archived ones included, so history still has names). */
export async function getExercises() {
  return new Map((await getAll('exercises')).map((e) => [e.id, e]));
}

export const saveExercise = (ex) => putItem('exercises', ex);
export const getRoutines = async () => (await kvGet('routines')) || {};
export const saveRoutines = (r) => kvSet('routines', r);

export async function addExercise({ name, group, type, repUnit }) {
  const ex = { id: newId('x'), name: name.trim(), group, type, custom: true };
  if (repUnit) ex.repUnit = repUnit;
  await saveExercise(ex);
  return ex;
}

/** "175 lb × 6 × 3", "7 reps × 3" or "45 s × 3" */
export function targetText(ex, t) {
  const unit = ex.repUnit === 'sec' ? ' s' : '';
  if (ex.type === 'bodyweight') return `${t.reps}${unit || ' reps'} × ${t.sets}`;
  return t.weight == null ? `${t.reps} reps × ${t.sets}` : `${t.weight} lb × ${t.reps} × ${t.sets}`;
}

/** "175 × 6, 6, 5" for one past performance. */
export function perfText(ex, perf) {
  const reps = perf.sets.map((s) => s.reps).join(', ');
  if (ex.type === 'bodyweight') return `${reps}${ex.repUnit === 'sec' ? ' s' : ''}`;
  const weights = [...new Set(perf.sets.map((s) => s.weight))];
  return weights.length === 1 ? `${weights[0]} × ${reps}` : perf.sets.map((s) => `${s.weight}×${s.reps}`).join(', ');
}

/** Build one workout line: today's target (with the reason) and blank sets. */
export function makeItem(ex, scheme, logs, easy = false) {
  const cfg = settings().lifting;
  const history = historyFor(ex.id, logs);
  const target = nextTarget(ex, scheme, history, cfg);
  if (!history.length && ex.startWeight > 0 && ex.type !== 'bodyweight') {
    target.weight = ex.startWeight;
    target.kind = 'start';
    target.reason = 'Your starting weight. Hit every rep and it goes up next time.';
  }
  if (easy && target.weight != null) {
    target.weight = roundTo(target.weight * 0.9, cfg.round);
    target.reason = `Easy day: about 10% lighter. ${target.reason}`;
  }
  const last = history.at(-1) || null;
  const startWeight = target.weight ?? (last ? Math.min(...last.sets.map((s) => s.weight)) : '');
  return {
    exId: ex.id, sets: scheme.sets, reps: scheme.reps, target, easy,
    last: last ? { date: last.date, text: perfText(ex, last) } : null,
    rows: Array.from({ length: scheme.sets }, () => ({ weight: ex.type === 'bodyweight' ? 0 : startWeight, reps: target.reps, done: false })),
  };
}

// ---------- the workout in progress (saved so closing the app loses nothing) ----------

export const getActiveWorkout = () => kvGet('activeWorkout');
export const saveActiveWorkout = (w) => kvSet('activeWorkout', w);
export const clearActiveWorkout = () => kvSet('activeWorkout', null);

/**
 * Start (or resume) a workout for a routine.
 * @param {string} routineKey  'A' | 'B' | 'C'
 * @param {object|null} session  the planned session, if started from the plan
 */
export async function startWorkout(routineKey, session = null) {
  const active = await getActiveWorkout();
  if (active) return active;
  const [exercises, routines, logs] = await Promise.all([getExercises(), getRoutines(), getLogs()]);
  const routine = routines[routineKey];
  const easy = !!(session && session.easy);
  const workout = {
    routineKey,
    name: routine ? routine.name : 'Workout',
    sessionId: session ? session.id : null,
    sessionKind: session ? session.kind : `lift-${routineKey}`,
    plannedMin: session ? session.durationMin : null,
    date: dayKey(),
    startedAt: Date.now(),
    easy,
    items: (routine ? routine.items : [])
      .filter((it) => exercises.has(it.exId))
      .map((it) => makeItem(exercises.get(it.exId), it, logs, easy)),
  };
  await saveActiveWorkout(workout);
  return workout;
}
