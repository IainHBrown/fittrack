// Glue between storage and the pure plan engine: loads everything the plan
// screens need and exposes simple lookups.

import { dayKey } from './lib/dates.js';
import { settings } from './state.js';
import { getLogs, getOverrides, kvGet, kvSet } from './db.js';
import { buildPlan, weekIndexOf } from './engine/plan.js';
import { resolveWeek, dayType } from './engine/adjust.js';
import { computeZones, latestTests } from './engine/zones.js';

let cache = { key: null, plan: null };

/** Everything needed to show the plan right now. */
export async function getPlanState() {
  const s = settings();
  const today = dayKey();
  const [logs, overrides, busyWeeks, swimStage] = await Promise.all([
    getLogs(), getOverrides(), kvGet('busyWeeks'), kvGet('swimStage'),
  ]);
  const stage = swimStage || 1;

  // rebuild only when something the plan depends on has changed
  const key = JSON.stringify([s.plan, s.goals, s.eventTypes, s.library, s.swimStages, stage, today]);
  if (cache.key !== key) cache = { key, plan: buildPlan(s, { today, swimStage: stage }) };

  return {
    settings: s, today, plan: cache.plan, logs, overrides,
    busyWeeks: busyWeeks || [], swimStage: stage,
    zones: computeZones(latestTests(logs)),
  };
}

/** A week's sessions with moves, skips and adjustments applied. */
export function resolvedWeek(state, index) {
  const week = state.plan.weeks[index];
  return week ? resolveWeek(week, state) : [];
}

/** Index of the week to show for today (clamped to the plan). */
export function currentWeekIndex(state) {
  const { plan, today } = state;
  if (!plan.weeks.length) return -1;
  if (today < plan.start) return 0;
  const i = weekIndexOf(plan, today);
  return i < 0 ? plan.weeks.length - 1 : i;
}

/** Today's (or any date's) resolved sessions. */
export function sessionsOn(state, date) {
  const i = weekIndexOf(state.plan, date);
  return i < 0 ? [] : resolvedWeek(state, i).filter((s) => s.date === date);
}

/** 'long' | 'training' | 'rest' for a date. */
export function dayTypeOn(state, date) {
  const i = weekIndexOf(state.plan, date);
  // outside the plan (before it starts, or between events) assume an ordinary training day
  return i < 0 ? 'training' : dayType(resolvedWeek(state, i), date);
}

export async function setBusyWeek(weekStart, on) {
  const list = new Set((await kvGet('busyWeeks')) || []);
  if (on) list.add(weekStart); else list.delete(weekStart);
  await kvSet('busyWeeks', [...list]);
}

export const setSwimStage = (n) => kvSet('swimStage', n);
