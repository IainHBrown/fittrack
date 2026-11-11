// Default starting values. Nothing in the app reads these directly: they are
// merged under whatever is saved in Settings, so every value here is editable.

export const DEFAULTS = {
  sleep: {
    goal: 85,        // a score at or above this is a "good night"
    lowBelow: 70,    // below this the app suggests an easy day
  },
  water: {
    goalMl: 2000,    // base daily goal
    longDayGoalMl: 3000, // used on long training days (from Stage 2)
    quickAdds: [
      { id: 'q1', label: '+250 ml', ml: 250 },
      { id: 'q2', label: '+500 ml', ml: 500 },
      { id: 'q3', label: '+1 bottle', ml: 500 },
    ],
  },
  supplements: [
    { id: 'creatine', name: 'Creatine', dose: '5 g' },
    { id: 'b12', name: 'B12', dose: '' },
    { id: 'omega3', name: 'Omega-3', dose: '' },
    { id: 'b2', name: 'B2', dose: '' },
  ],
  goals: [
    { id: 'g2027', type: 'half-ironman', name: 'Half Ironman 70.3', date: '2027-07-11' },
    { id: 'g2028', type: 'full-ironman', name: 'Full Ironman', date: '2028-07-09' },
  ],

  // ---------- training plan ----------
  plan: {
    startDate: '2026-11-16',
    restDow: 6,          // 0 = Sunday ... 6 = Saturday
    longRideDow: 0,
    longRunDow: 5,
    easyWeeks: 2,        // easy weeks before the first baseline test week
    recoveryEvery: 4,    // every 4th week is lighter
    recoveryFactor: 0.72,
    retestMinWeeks: 6,   // retest on the first recovery week at least this long after the last test
    maxWeeklyIncrease: 0.10,
    startHours: 5.5,
    peakHours: 9.5,
    peakBy: '2027-05-16',
    lifts: { before: 3, after: 2, switchDate: '2027-01-04', minutes: 45 },
    run: { startMin: 60, maxWeeklyIncrease: 0.07 },
    swim: { maxMinPerWeek: 105 },
    knee: { painThreshold: 4, reduceDays: 7, runFactor: 0.5 },
    easyDayFactor: 0.8,  // "make it easy" shortens the session to this fraction
  },

  // Event types: taper length and how endurance time is shared between sports.
  eventTypes: {
    'sprint-tri': { label: 'Sprint triathlon', taperWeeks: 1, shares: { swim: 0.20, bike: 0.45, run: 0.35 } },
    'olympic-tri': { label: 'Olympic triathlon', taperWeeks: 1, shares: { swim: 0.20, bike: 0.47, run: 0.33 } },
    'half-ironman': { label: 'Half Ironman', taperWeeks: 2, shares: { swim: 0.22, bike: 0.50, run: 0.28 } },
    'full-ironman': { label: 'Full Ironman', taperWeeks: 3, shares: { swim: 0.18, bike: 0.55, run: 0.27 } },
    'duathlon': { label: 'Duathlon', taperWeeks: 1, shares: { swim: 0, bike: 0.60, run: 0.40 } },
    'half-marathon': { label: 'Half marathon', taperWeeks: 1, shares: { swim: 0, bike: 0.40, run: 0.60 } },
    'marathon': { label: 'Marathon', taperWeeks: 2, shares: { swim: 0, bike: 0.35, run: 0.65 } },
    'custom': { label: 'Custom', taperWeeks: 2, shares: { swim: 0.22, bike: 0.50, run: 0.28 } },
  },

  // Effort wording used until a baseline test gives heart-rate or pace zones.
  zoneEffort: {
    z1: 'Effort 2-3 of 10, very easy',
    z2: 'Effort 3-4 of 10, conversational',
    z3: 'Effort 5-6 of 10, steady, short sentences',
    z4: 'Effort 7-8 of 10, hard',
    z5: 'Effort 9 of 10, very hard',
  },

  // Learn-to-swim progression. You move up a stage after a comfortable swim.
  swimStages: [
    { main: '8 x 25 m', rest: '45 s rest between', m: 200 },
    { main: '12 x 25 m', rest: '30 s rest between', m: 300 },
    { main: '8 x 50 m', rest: '30 s rest between', m: 400 },
    { main: '6 x 75 m', rest: '30 s rest between', m: 450 },
    { main: '5 x 100 m', rest: '30 s rest between', m: 500 },
    { main: '3 x 200 m', rest: '45 s rest between', m: 600 },
    { main: '400 m, then 4 x 100 m', rest: '60 s rest between', m: 800 },
    { main: '2 x 500 m', rest: '60 s rest between', m: 1000 },
    { main: '1,200 m continuous', rest: '', m: 1200 },
    { main: '1,500 m continuous', rest: '', m: 1500 },
    { main: '1,900 m continuous (70.3 race distance)', rest: '', m: 1900 },
  ],

  // Session names and instructions. {curly} parts are filled in by the plan.
  library: {
    'bike-long': { title: 'Long ride', zone: 'z2', desc: "Steady and conversational the whole way. Keep cadence at 85-95 rpm in a light gear: spin, don't grind, to keep load off your knees." },
    'bike-quality': { title: 'Aerobic ride', zone: 'z2', desc: 'Steady Zone 2. Add 4 x 1 minute of fast, light spinning (100+ rpm) spread through the ride.' },
    'bike-tempo': { title: 'Tempo intervals', zone: 'z3', desc: 'Warm up 10 min easy. {reps} x 8 min at Zone 3 with 3 min easy between. Cool down easy.' },
    'bike-race': { title: 'Race-pace ride', zone: 'z3', desc: 'Warm up 10 min easy. {reps} x 15 min at race effort with 5 min easy between. Cool down easy.' },
    'bike-easy': { title: 'Easy spin', zone: 'z1', desc: 'Very easy, high cadence, low resistance. This is recovery, not a workout.' },
    'bike-test': { title: '20-min bike test', zone: 'z4', desc: 'Warm up 10-15 min easy. Then ride 20 minutes as hard as you can hold evenly. Log the 20-minute distance and average heart rate. Cool down 10 min.' },
    'run-long': { title: 'Long run', zone: 'z2', desc: 'Easy, conversational pace, on a flat or soft surface if you can. Walk breaks are fine. Stop if knee pain reaches {knee}.' },
    'run-easy': { title: 'Easy run', zone: 'z2', desc: 'Short and relaxed with quick, light steps. Finish feeling you could do more.' },
    'run-test': { title: '30-min run test', zone: 'z3', desc: 'Warm up 5-10 min walking and jogging. Then run 30 minutes at a steady effort you can hold evenly. Log the 30-minute distance and average heart rate.' },
    'swim': { title: 'Swim', zone: 'z2', desc: 'Warm up {warm} easy. Main set: {main}{rest}. Stay relaxed: slow exhale under water, long strokes. Cool down 50 m easy.' },
    'swim-test': { title: 'Swim test', zone: 'z4', desc: "Warm up 100-200 m easy. Then swim 400 m without stopping and time it. If you can't make 400 m, swim as far as you can without stopping and log that distance and time." },
    'lift-A': { title: 'Full body A', zone: null, desc: 'Squat or trap-bar deadlift, bench press, rows, core. This is the heavy leg day.' },
    'lift-B': { title: 'Full body B', zone: null, desc: 'Romanian deadlift, single-leg work, overhead press, pull-ups, calves, core. Keep leg work moderate.' },
    'lift-C': { title: 'Upper body C', zone: null, desc: 'Upper body and core only: press, rows, pull-ups, core. No heavy leg work.' },
    'race': { title: 'Race day', zone: null, desc: 'This is what the training was for. Start easier than feels right.' },
  },
};
