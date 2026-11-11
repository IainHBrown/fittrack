// Pure calculations on day records. No storage or DOM in here, so these
// are covered by the automated tests in /tests.

/** Total water logged for a day, in ml. */
export function waterTotal(day) {
  return (day.water || []).reduce((sum, e) => sum + e.ml, 0);
}

/** Water goal for a day (long days get the higher goal from Stage 2 on). */
export function waterGoal(settings, day) {
  return day && day.dayType === 'long' ? settings.water.longDayGoalMl : settings.water.goalMl;
}

/** "1.25", "0.5", "2" - litres without trailing zeros. */
export function fmtLitres(ml) {
  return String(Math.round(ml / 10) / 100);
}

/** How many of the listed supplements are ticked. */
export function suppsTicked(day, list) {
  return list.filter((s) => day.supps && day.supps[s.id]).length;
}

export function suppsAllDone(day, list) {
  return list.length > 0 && suppsTicked(day, list) === list.length;
}

/** 'good' | 'ok' | 'low' | null (not logged) */
export function sleepLevel(score, settings) {
  if (score == null) return null;
  if (score >= settings.sleep.goal) return 'good';
  if (score < settings.sleep.lowBelow) return 'low';
  return 'ok';
}

/**
 * Stats for a list of day records (usually one month).
 * hitRate is good nights out of nights that have a score.
 */
export function sleepStats(days, settings) {
  const scores = days.map((d) => d.sleep).filter((s) => s != null);
  const good = scores.filter((s) => s >= settings.sleep.goal).length;
  return {
    logged: scores.length,
    good,
    hitRate: scores.length ? Math.round((good / scores.length) * 100) : null,
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  };
}

/** The next goal event on or after `today`, or null. */
export function nextGoal(goals, today) {
  return [...goals].filter((g) => g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}
