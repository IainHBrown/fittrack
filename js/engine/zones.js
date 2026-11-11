// Training zones. Before any baseline test, targets are described by effort.
// After a test is logged, heart-rate and pace ranges are estimated from it.
// These are estimates from simple field tests, not lab values.

/** Latest logged test per sport: { bike, run, swim } (each a log or undefined). */
export function latestTests(logs) {
  const out = {};
  for (const l of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (l.test) out[l.test] = l;
  }
  return out;
}

// Zone limits as fractions of threshold heart rate (Friel).
const BIKE_HR = { z1: [0.65, 0.81], z2: [0.81, 0.89], z3: [0.90, 0.93], z4: [0.94, 0.99], z5: [1.0, 1.06] };
const RUN_HR = { z1: [0.70, 0.85], z2: [0.85, 0.89], z3: [0.90, 0.94], z4: [0.95, 0.99], z5: [1.0, 1.06] };
// Run pace zones as multiples of the steady 30-minute test pace (bigger = slower).
const RUN_PACE = { z1: [1.15, 1.25], z2: [1.05, 1.15], z3: [0.98, 1.04], z4: [0.92, 0.97], z5: [0.86, 0.91] };
// Swim pace zones as seconds per 100 m added to the test pace.
const SWIM_PACE = { z1: [15, 25], z2: [8, 15], z3: [3, 7], z4: [-2, 2], z5: [-8, -3] };

const mapZones = (table, fn) => Object.fromEntries(Object.entries(table).map(([z, [a, b]]) => [z, fn(a, b)]));

export function computeZones(tests) {
  const zones = {};
  if (tests.bike && tests.bike.hr) {
    // threshold HR is about 95% of the 20-minute test average
    const lthr = tests.bike.hr * 0.95;
    zones.bike = { hr: mapZones(BIKE_HR, (a, b) => [Math.round(lthr * a), Math.round(lthr * b)]) };
  }
  if (tests.run) {
    const z = {};
    if (tests.run.hr) {
      // the run test is steady, not all-out: treat it as about 88% of threshold
      const lthr = tests.run.hr / 0.88;
      z.hr = mapZones(RUN_HR, (a, b) => [Math.round(lthr * a), Math.round(lthr * b)]);
    }
    if (tests.run.distance > 0 && tests.run.durationMin > 0) {
      const secPerKm = (tests.run.durationMin * 60) / tests.run.distance;
      z.pace = mapZones(RUN_PACE, (a, b) => [secPerKm * a, secPerKm * b]);
    }
    if (z.hr || z.pace) zones.run = z;
  }
  if (tests.swim && tests.swim.distance >= 100 && tests.swim.durationMin > 0) {
    const per100 = (tests.swim.durationMin * 60) / (tests.swim.distance / 100);
    zones.swim = { pace: mapZones(SWIM_PACE, (a, b) => [per100 + a, per100 + b]) };
  }
  return zones;
}

export const fmtClock = (sec) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * What to aim for in a session.
 * @returns {{label:string, detail:string}|null}  e.g. { label: 'Zone 2', detail: '128-141 bpm' }
 */
export function targetFor(sport, zone, zones, zoneEffort) {
  if (!zone) return null;
  const label = `Zone ${zone.slice(1)}`;
  const z = zones[sport];
  const parts = [];
  if (z && z.pace && z.pace[zone]) {
    const [fast, slow] = z.pace[zone].slice().sort((a, b) => a - b);
    parts.push(`${fmtClock(fast)}-${fmtClock(slow)} ${sport === 'swim' ? '/100 m' : '/km'}`);
  }
  if (z && z.hr && z.hr[zone]) parts.push(`${z.hr[zone][0]}-${z.hr[zone][1]} bpm`);
  return { label, detail: parts.length ? parts.join(' · ') : zoneEffort[zone] };
}

/** Auto-calculated pace or speed for a logged session, or '' if not enough data. */
export function paceText(sport, durationMin, distance) {
  if (!(durationMin > 0) || !(distance > 0)) return '';
  if (sport === 'run') return `${fmtClock((durationMin * 60) / distance)} /km`;
  if (sport === 'bike') return `${(distance / (durationMin / 60)).toFixed(1)} km/h`;
  if (sport === 'swim') return `${fmtClock((durationMin * 60) / (distance / 100))} /100 m`;
  return '';
}

/** Swim stage suggested by a swim test: the first stage whose longest repeat is beyond what was swum. */
export function stageFromSwimTest(distanceM) {
  if (distanceM >= 400) return 7;
  if (distanceM >= 200) return 6;
  if (distanceM >= 100) return 5;
  if (distanceM >= 75) return 4;
  if (distanceM >= 50) return 3;
  return 2;
}
