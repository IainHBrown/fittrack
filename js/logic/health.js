// Turns raw Apple Health samples (sent by the iPhone Shortcut) into things
// the app can use. Pure, so it is covered by tests.
//
// The Shortcut sends each data type as lines of text:
//     start | end | value
// Dates are ISO 8601 with a time zone when the Shortcut is set up as
// described; plainer formats are accepted too. Parsing happens on the phone,
// so dates without a zone are read in the phone's own time zone.
//
// Shortcuts cannot read the sleep score or workout records, so:
//   - sleep becomes time asleep (from the sleep stages), and
//   - workouts are detected from heart rate: the watch records it every few
//     seconds during a workout and only every few minutes otherwise.

const pad = (n) => String(n).padStart(2, '0');
export const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Read a date in any of the forms Shortcuts produces; null if it is not a date. */
export function parseDate(text) {
  const t = String(text).trim();
  if (!/\d{1,2}:\d{2}/.test(t) && !/^\d{4}-\d{2}-\d{2}/.test(t)) return null; // must look like a date or time
  let ms = Date.parse(t);
  if (Number.isNaN(ms)) ms = Date.parse(t.replace(/\s+at\s+/i, ' ').replace(/ | /g, ' '));
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Lines of "start | end | value" (end optional) -> [{ start, end, value, unit, text }] sorted by start. */
export function parseLines(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const parts = line.split('|').map((p) => p.trim()).filter((p) => p !== '');
    if (parts.length < 2) continue;
    const start = parseDate(parts[0]);
    if (!start) continue;
    const second = parts.length >= 3 ? parseDate(parts[1]) : null;
    const raw = parts[second ? 2 : 1] ?? '';
    const m = /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z/%]*)/.exec(raw);
    out.push({
      start, end: second || start,
      value: m ? Number(m[1].replace(',', '.')) : null,
      unit: m ? m[2].toLowerCase() : '',
      text: raw,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------- sleep ----------

function stageOf(text) {
  const t = String(text).toLowerCase();
  if (t.includes('awake')) return 'awake';
  if (t.includes('bed')) return 'inbed';
  if (t.includes('rem')) return 'rem';
  if (t.includes('deep')) return 'deep';
  if (t.includes('core')) return 'core';
  if (t.includes('asleep') || t.includes('sleep')) return 'asleep';
  return null;
}

/** Total minutes covered by a set of [start, end] intervals, counting overlaps once. */
function unionMinutes(intervals) {
  const list = intervals.map(([a, b]) => [a.getTime(), b.getTime()]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = null;
  let curEnd = null;
  for (const [a, b] of list) {
    if (curEnd == null || a > curEnd) {
      if (curEnd != null) total += curEnd - curStart;
      curStart = a; curEnd = b;
    } else if (b > curEnd) curEnd = b;
  }
  if (curEnd != null) total += curEnd - curStart;
  return Math.round(total / 60000);
}

/**
 * Sleep for the night that ended on `dateKey` (the morning you woke up).
 * Counts samples between 6 pm the evening before and 3 pm that day.
 * @returns {{asleepMin, awakeMin, deepMin, remMin, coreMin, bedtime, wake}|null}
 */
export function sleepSummary(samples, dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const from = new Date(y, m - 1, d - 1, 18, 0, 0);
  const to = new Date(y, m - 1, d, 15, 0, 0);
  const night = samples.filter((s) => s.start >= from && s.end <= to && s.end > s.start).map((s) => ({ ...s, stage: stageOf(s.text) }));
  const pick = (stages) => night.filter((s) => stages.includes(s.stage)).map((s) => [s.start, s.end]);
  const asleep = pick(['core', 'deep', 'rem', 'asleep']);
  if (!asleep.length) return null;
  const first = new Date(Math.min(...asleep.map((i) => i[0].getTime())));
  const last = new Date(Math.max(...asleep.map((i) => i[1].getTime())));
  const awake = pick(['awake']).filter(([a, b]) => a >= first && b <= last);
  return {
    asleepMin: unionMinutes(asleep),
    awakeMin: unionMinutes(awake),
    deepMin: unionMinutes(pick(['deep'])),
    remMin: unionMinutes(pick(['rem'])),
    coreMin: unionMinutes(pick(['core'])),
    bedtime: first.getTime(),
    wake: last.getTime(),
  };
}

/** "7 h 42" */
export const fmtHours = (min) => `${Math.floor(min / 60)} h ${pad(Math.round(min) % 60)}`;

// ---------- workouts from heart rate ----------

const GAP_MS = 120000;      // samples closer than this belong to one workout
const MIN_MINUTES = 10;
const MIN_SAMPLES = 60;     // background readings alone never get this dense

/** Distance in a window, converted to `want` ('km' or 'm'). */
function distanceIn(samples, start, end, want) {
  let total = 0;
  for (const s of samples || []) {
    if (s.value == null || s.start.getTime() < start - 60000 || s.start.getTime() > end + 60000) continue;
    let metres;
    if (s.unit === 'mi') metres = s.value * 1609.344;
    else if (s.unit === 'yd') metres = s.value * 0.9144;
    else if (s.unit === 'm') metres = s.value;
    else if (s.unit === 'km') metres = s.value * 1000;
    else metres = want === 'm' ? s.value : s.value * 1000; // no unit: metric defaults (km, or m for swimming)
    total += metres;
  }
  return want === 'm' ? Math.round(total) : Math.round(total / 10) / 100;
}

/**
 * @param {object[]} hr        parsed heart-rate samples
 * @param {object} [dist]      { cycling, running, swimming } parsed distance samples
 * @returns {object[]} workouts: { id, date, start, durationMin, avgHr, maxHr, sport, distance, unit }
 */
export function detectWorkouts(hr, dist = {}) {
  const pts = hr.filter((s) => s.value > 20 && s.value < 250);
  const groups = [];
  let cur = [];
  for (const p of pts) {
    if (cur.length && p.start - cur.at(-1).start > GAP_MS) { groups.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) groups.push(cur);

  const out = [];
  for (const g of groups) {
    const start = g[0].start.getTime();
    const end = g.at(-1).start.getTime();
    const minutes = (end - start) / 60000;
    if (minutes < MIN_MINUTES || g.length < MIN_SAMPLES) continue;
    const swim = distanceIn(dist.swimming, start, end, 'm');
    const bike = distanceIn(dist.cycling, start, end, 'km');
    const foot = distanceIn(dist.running, start, end, 'km');
    let sport = null;
    let distance = null;
    let unit = null;
    if (swim >= 50) { sport = 'swim'; distance = swim; unit = 'm'; }
    else if (bike >= 0.3) { sport = 'bike'; distance = bike; unit = 'km'; }
    else if (foot >= 0.5 && foot / (minutes / 60) >= 6.5) { sport = 'run'; distance = foot; unit = 'km'; } // faster than a walk
    out.push({
      id: g[0].start.toISOString(),
      date: localKey(g[0].start),
      start,
      durationMin: Math.round(minutes),
      avgHr: Math.round(g.reduce((sum, p) => sum + p.value, 0) / g.length),
      maxHr: Math.round(Math.max(...g.map((p) => p.value))),
      sport, distance, unit,
    });
  }
  return out;
}

/**
 * Everything derived from one upload.
 * @param {object} data  { sleep, heartRate, cycling, running, swimming } as text
 * @param {string[]} dates  local day keys to summarise sleep for
 */
export function digest(data, dates) {
  const sleepSamples = parseLines(data.sleep);
  const hr = parseLines(data.heartRate);
  const sleep = {};
  for (const d of dates) {
    const s = sleepSummary(sleepSamples, d);
    if (s) sleep[d] = s;
  }
  return {
    sleep,
    workouts: detectWorkouts(hr, { cycling: parseLines(data.cycling), running: parseLines(data.running), swimming: parseLines(data.swimming) }),
    counts: { sleep: sleepSamples.length, heartRate: hr.length, cycling: parseLines(data.cycling).length, running: parseLines(data.running).length, swimming: parseLines(data.swimming).length },
  };
}
