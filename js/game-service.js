// Loads history and computes streaks, XP, level and badges; also works out
// when a level-up or new badge tier should be celebrated.

import { dayKey } from './lib/dates.js';
import { settings } from './state.js';
import { getDays, getLogs, kvGet, kvSet } from './db.js';
import { gameState, TIER_NAME } from './engine/game.js';
import { waterGoal } from './logic/day.js';
import { getPlanState, dayTypeOn } from './plan-service.js';

export async function getGame() {
  const s = settings();
  const today = dayKey();
  const [days, logs, plan] = await Promise.all([getDays('0000-00-00', '9999-99-99'), getLogs(), getPlanState()]);
  // today's water goal depends on whether it is a long training day
  const todayRec = days.find((d) => d.date === today);
  if (todayRec) todayRec.waterGoal = waterGoal(s, { dayType: dayTypeOn(plan, today) });
  return { ...gameState(days, logs, s, today), days, logs, today, plan };
}

/**
 * Compare the game state with what has already been celebrated.
 * Returns the new moments to show, e.g. [{ kind: 'level', title, sub }].
 * The first ever call records the starting point without celebrating.
 */
export async function newMoments(game) {
  const seen = await kvGet('gameSeen');
  const now = { level: game.level.number, badges: Object.fromEntries(game.badges.map((b) => [b.id, b.tier])) };
  const moments = [];
  if (seen) {
    if (now.level > seen.level) {
      moments.push({ kind: 'level', title: 'Level up', name: game.level.name, sub: `Level ${game.level.number}` });
    }
    for (const b of game.badges) {
      const before = (seen.badges || {})[b.id] || 0;
      if (b.tier > before) moments.push({ kind: 'badge', tier: b.tier, title: `${TIER_NAME[b.tier]} badge`, name: b.name, sub: `${fmtValue(b.tiers[b.tier - 1])}${b.unit ? ` ${b.unit}` : ''} reached` });
    }
  }
  // never lower what was seen, so undoing a log and redoing it does not re-celebrate
  const merged = { level: Math.max(now.level, seen ? seen.level : 0), badges: { ...now.badges } };
  for (const [id, t] of Object.entries((seen && seen.badges) || {})) merged.badges[id] = Math.max(t, merged.badges[id] || 0);
  if (!seen || JSON.stringify(merged) !== JSON.stringify(seen)) await kvSet('gameSeen', merged);
  return moments;
}

export const fmtValue = (v) => (v >= 100 ? Math.round(v).toLocaleString('en-CA') : String(Math.round(v * 10) / 10));
