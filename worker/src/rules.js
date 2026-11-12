// Which notifications are due right now. Pure, so it is covered by tests.
//
// The phone uploads a small "state" whenever something changes:
//   {
//     tz: 'America/Toronto',
//     date: '2026-11-12',                 // the local day this state describes
//     today: { sleep, supps, water },     // true once each daily goal is done
//     workouts: { '2026-11-12': ['Long run'], ... },  // sessions still to do, by date
//     streaks: { sleep: { current, hit, atRisk }, supps: {...}, water: {...} },
//     notifications: [{ id, enabled, time: 'HH:MM', title, body }]
//   }
// A notification is only sent when its thing is still not done at its time.

const WINDOW_MIN = 30; // the Worker checks every 15 minutes; this tolerates a late check

/** Local date and minutes-since-midnight in a time zone. */
export function localNow(now, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    return localNow(now, 'UTC');
  }
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function nextDay(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** What is still not done on `date`, as far as the last uploaded state can tell. */
export function behind(state, date) {
  const fresh = state.date === date;
  const today = fresh ? state.today || {} : {}; // app not opened today: nothing is done yet
  const out = {
    sleep: !today.sleep,
    supps: !today.supps,
    water: !today.water,
    workouts: (state.workouts && state.workouts[date]) || [],
    streaks: [],
  };
  for (const [name, s] of Object.entries(state.streaks || {})) {
    if (!s || !(s.current > 0)) continue;
    // at risk today: yesterday was the one allowed miss and today is not done yet
    if (fresh && s.atRisk && !s.hit) out.streaks.push(name);
    // the day after the last upload: at risk if that last day ended without a hit
    // (and was not itself already the second miss, which resets the streak)
    else if (!fresh && date === nextDay(state.date) && !s.hit && !s.atRisk) out.streaks.push(name);
  }
  return out;
}

const STREAK_WORD = { sleep: 'sleep', supps: 'supplements', water: 'water' };

/**
 * @param {object} state  as above
 * @param {Object<string,string>} sent  notification id -> the local date it was last sent
 * @param {Date} now
 * @returns {{id:string,title:string,body:string}[]}
 */
export function dueNotifications(state, sent, now) {
  if (!state || !Array.isArray(state.notifications)) return [];
  const { date, minutes } = localNow(now, state.tz || 'UTC');
  const b = behind(state, date);
  const needed = {
    sleep: b.sleep,
    workout: b.workouts.length > 0,
    water: b.water,
    supps: b.supps,
    streak: b.streaks.length > 0,
  };
  const fill = (text) => String(text || '')
    .replace(/\{workout\}/g, b.workouts.join(' and '))
    .replace(/\{streaks\}/g, b.streaks.map((s) => STREAK_WORD[s] || s).join(' and '));

  const out = [];
  for (const n of state.notifications) {
    if (!n.enabled || !needed[n.id] || (sent || {})[n.id] === date) continue;
    const m = /^(\d{1,2}):(\d{2})$/.exec(n.time || '');
    if (!m) continue;
    const at = Number(m[1]) * 60 + Number(m[2]);
    if (minutes >= at && minutes < at + WINDOW_MIN) out.push({ id: n.id, title: fill(n.title), body: fill(n.body) });
  }
  return out;
}

export const localDate = (now, tz) => localNow(now, tz).date;
