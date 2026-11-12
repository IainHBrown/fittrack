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

  // ---------- lifting ----------
  lifting: {
    incUpper: 5,     // lb added after hitting every rep, upper body and core
    incLower: 10,    // lb added, lower body
    deloadPct: 10,   // drop after missing the same weight twice
    round: 5,        // targets are rounded to this many lb
  },

  // Starting exercise library. Copied into storage on first run; after that,
  // edit it in the app (Train, then Lifting). Knee-friendly picks for a tall lifter.
  seedExercises: [
    { id: 'trapbar', name: 'Trap-bar deadlift', group: 'lower', type: 'weight' },
    { id: 'boxsquat', name: 'Box squat', group: 'lower', type: 'weight' },
    { id: 'bench', name: 'Bench press', group: 'upper', type: 'weight' },
    { id: 'csrow', name: 'Chest-supported row', group: 'upper', type: 'weight' },
    { id: 'pallof', name: 'Pallof press', group: 'core', type: 'weight' },
    { id: 'plank', name: 'Plank', group: 'core', type: 'bodyweight', repUnit: 'sec' },
    { id: 'rdl', name: 'Romanian deadlift', group: 'lower', type: 'weight' },
    { id: 'splitsquat', name: 'Split squat', group: 'lower', type: 'weight' },
    { id: 'stepup', name: 'Step-up (low box)', group: 'lower', type: 'weight' },
    { id: 'ohp', name: 'Overhead press', group: 'upper', type: 'weight' },
    { id: 'pullup', name: 'Pull-up', group: 'upper', type: 'bodyweight' },
    { id: 'calf', name: 'Calf raise', group: 'lower', type: 'weight' },
    { id: 'deadbug', name: 'Dead bug', group: 'core', type: 'bodyweight' },
    { id: 'inclinedb', name: 'Incline dumbbell press', group: 'upper', type: 'weight' },
    { id: 'pulldown', name: 'Lat pulldown', group: 'upper', type: 'weight' },
    { id: 'cablerow', name: 'Seated cable row', group: 'upper', type: 'weight' },
    { id: 'facepull', name: 'Face pull', group: 'upper', type: 'weight' },
    { id: 'sideplank', name: 'Side plank', group: 'core', type: 'bodyweight', repUnit: 'sec' },
    { id: 'hipthrust', name: 'Hip thrust', group: 'lower', type: 'weight' },
    { id: 'legcurl', name: 'Leg curl', group: 'lower', type: 'weight' },
    { id: 'landmine', name: 'Landmine press', group: 'upper', type: 'weight' },
    { id: 'dbrow', name: 'Dumbbell row', group: 'upper', type: 'weight' },
  ],
  seedRoutines: {
    A: { name: 'Full body A', items: [
      { exId: 'trapbar', sets: 3, reps: 5 },
      { exId: 'bench', sets: 3, reps: 6 },
      { exId: 'csrow', sets: 3, reps: 8 },
      { exId: 'pallof', sets: 3, reps: 10 },
      { exId: 'plank', sets: 3, reps: 45 },
    ] },
    B: { name: 'Full body B', items: [
      { exId: 'rdl', sets: 3, reps: 8 },
      { exId: 'splitsquat', sets: 3, reps: 8 },
      { exId: 'ohp', sets: 3, reps: 6 },
      { exId: 'pullup', sets: 3, reps: 6 },
      { exId: 'calf', sets: 3, reps: 12 },
      { exId: 'deadbug', sets: 3, reps: 10 },
    ] },
    C: { name: 'Upper body C', items: [
      { exId: 'inclinedb', sets: 3, reps: 8 },
      { exId: 'pulldown', sets: 3, reps: 10 },
      { exId: 'cablerow', sets: 3, reps: 10 },
      { exId: 'facepull', sets: 3, reps: 12 },
      { exId: 'sideplank', sets: 3, reps: 30 },
    ] },
  },

  // ---------- food ----------
  food: {
    // daily targets by day type (the plan decides which type each day is)
    targets: {
      rest: { cal: 2800, carbs: 350 },
      training: { cal: 3100, carbs: 425 },
      long: { cal: 3500, carbs: 500 },
    },
    protein: { min: 130, max: 160 }, // a range: "hit" once you are inside it
    fat: { min: 90, max: 100 },
    groups: ['Subway', 'Gzowski', 'Staples', 'My meals'],
  },

  // Starting quick-add list. Copied into storage on first run; after that it is
  // edited in the app. ALL VALUES ARE ESTIMATES.
  // Subway numbers are built from Subway Canada's published nutrition table
  // (June 2026): footlong = two 6-inch servings of each component.
  // Gzowski and staple items have no published nutrition, so they are rough
  // estimates from typical recipes and portions.
  seedFoods: [
    { id: 'sub-ccc', group: 'Subway', name: 'Footlong Cold Cut Combo, my usual', note: 'Italian Herbs & Cheese, lettuce, tomato, pickles, olives, mayo, chipotle. No cheese counted (+80 cal with it).', cal: 1220, protein: 38, carbs: 92, fat: 76 },
    { id: 'sub-rot', group: 'Subway', name: 'Footlong Rotisserie-Style Chicken', note: 'Standard build', cal: 900, protein: 56, carbs: 86, fat: 36 },
    { id: 'sub-turkey', group: 'Subway', name: 'Footlong Turkey Breast', note: 'Standard build', cal: 860, protein: 40, carbs: 92, fat: 36 },
    { id: 'sub-steak', group: 'Subway', name: 'Footlong Steak & Cheese', note: 'Standard build', cal: 940, protein: 50, carbs: 92, fat: 42 },
    { id: 'sub-teri', group: 'Subway', name: 'Footlong Sweet Onion Chicken Teriyaki', note: 'Standard build', cal: 820, protein: 52, carbs: 118, fat: 14 },
    { id: 'sub-bmt', group: 'Subway', name: 'Footlong Italian B.M.T.', note: 'Standard build', cal: 1100, protein: 46, carbs: 92, fat: 60 },
    { id: 'sub-6rot', group: 'Subway', name: '6-inch Rotisserie-Style Chicken', note: 'Standard build', cal: 450, protein: 28, carbs: 43, fat: 18 },
    { id: 'sub-cookie', group: 'Subway', name: 'Subway cookie', note: 'Chocolate chunk', cal: 210, protein: 2, carbs: 29, fat: 10 },

    { id: 'gz-smash', group: 'Gzowski', name: 'Smash burger', note: 'Double patty, cheese, bun, sauce', cal: 720, protein: 38, carbs: 42, fat: 42 },
    { id: 'gz-burrito', group: 'Gzowski', name: 'Burrito (Create station)', note: 'Chicken, rice, beans, cheese, salsa', cal: 900, protein: 45, carbs: 105, fat: 30 },
    { id: 'gz-teriyaki', group: 'Gzowski', name: 'Chicken teriyaki bowl (Create station)', note: 'Rice, chicken, vegetables, sauce', cal: 700, protein: 40, carbs: 100, fat: 14 },
    { id: 'gz-fries', group: 'Gzowski', name: 'Side of fries', note: '', cal: 400, protein: 5, carbs: 50, fat: 20 },
    { id: 'gz-flatbread', group: 'Gzowski', name: 'Flatbread (al forno or pesto bruschetta)', note: '', cal: 600, protein: 22, carbs: 70, fat: 24 },
    { id: 'gz-pasta', group: 'Gzowski', name: 'Pasta bowl with meat sauce', note: '', cal: 750, protein: 30, carbs: 100, fat: 22 },
    { id: 'gz-pizza', group: 'Gzowski', name: 'Pizza slice', note: '', cal: 300, protein: 13, carbs: 36, fat: 12 },
    { id: 'gz-wrap', group: 'Gzowski', name: 'Grilled chicken wrap', note: '', cal: 600, protein: 35, carbs: 55, fat: 25 },
    { id: 'gz-breakfast', group: 'Gzowski', name: 'Hot breakfast', note: '2 eggs, bacon, toast, potatoes', cal: 650, protein: 30, carbs: 50, fat: 36 },
    { id: 'gz-salad', group: 'Gzowski', name: 'Salad bar plate with chicken', note: '', cal: 400, protein: 30, carbs: 25, fat: 20 },

    { id: 'st-cereal', group: 'Staples', name: 'Cereal with a banana', note: '1.5 cups cereal, 1 cup 2% milk, 1 banana', cal: 450, protein: 14, carbs: 85, fat: 7 },
    { id: 'st-pbrice', group: 'Staples', name: 'Peanut butter on rice cakes', note: '2 rice cakes, 2 tbsp peanut butter', cal: 260, protein: 8, carbs: 20, fat: 17 },
    { id: 'st-banana', group: 'Staples', name: 'Banana', note: '', cal: 105, protein: 1, carbs: 27, fat: 0 },
    { id: 'st-shake', group: 'Staples', name: 'Protein shake', note: '1 scoop whey in water', cal: 120, protein: 24, carbs: 3, fat: 2 },
    { id: 'st-chocmilk', group: 'Staples', name: 'Chocolate milk, 500 ml', note: '', cal: 320, protein: 16, carbs: 52, fat: 5 },
    { id: 'st-yogurt', group: 'Staples', name: 'Greek yogurt cup', note: '', cal: 150, protein: 15, carbs: 12, fat: 4 },
    { id: 'st-bar', group: 'Staples', name: 'Granola bar', note: '', cal: 190, protein: 4, carbs: 29, fat: 7 },
    { id: 'st-coffee', group: 'Staples', name: 'Coffee, double double', note: 'Medium', cal: 190, protein: 3, carbs: 27, fat: 9 },
  ],

  // ---------- XP, levels and badges ----------
  xp: {
    session: 100,     // any completed planned session
    keySession: 150,  // long ride or long run
    test: 200,        // a baseline test
    race: 1000,       // race day
    other: 50,        // an "other activity"
    pr: 50,           // each lifting personal record
    sleep: 20,        // sleep score logged
    supps: 20,        // every supplement ticked
    water: 20,        // water goal hit
    badge: [50, 100, 200], // bronze, silver, gold
  },
  // Level names and the XP needed to reach each one.
  levels: [
    { name: 'Rookie', xp: 0 },
    { name: 'Trainee', xp: 1500 },
    { name: 'Amateur', xp: 5000 },
    { name: 'Athlete', xp: 10000 },
    { name: 'Competitor', xp: 18000 },
    { name: 'Contender', xp: 28000 },
    { name: 'Challenger', xp: 42000 },
    { name: 'Elite', xp: 60000 },
    { name: 'Pro', xp: 85000 },
    { name: 'Ironman', xp: 120000 },
  ],
  // Badges: each has three tiers (bronze, silver, gold) on one measured value.
  badges: [
    { id: 'sessions', name: 'Sessions', metric: 'sessions', unit: '', tiers: [25, 150, 500] },
    { id: 'swim-km', name: 'Swim distance', metric: 'swimKm', unit: 'km', tiers: [5, 30, 100] },
    { id: 'bike-km', name: 'Bike distance', metric: 'bikeKm', unit: 'km', tiers: [250, 1500, 5000] },
    { id: 'run-km', name: 'Run distance', metric: 'runKm', unit: 'km', tiers: [50, 300, 1000] },
    { id: 'long-swim', name: 'Longest swim', metric: 'longestSwimM', unit: 'm', tiers: [400, 1000, 1900] },
    { id: 'long-ride', name: 'Longest ride', metric: 'longestRideKm', unit: 'km', tiers: [30, 60, 90] },
    { id: 'long-run', name: 'Longest run', metric: 'longestRunKm', unit: 'km', tiers: [5, 10, 21.1] },
    { id: 'prs', name: 'Lifting PRs', metric: 'prs', unit: '', tiers: [5, 25, 75] },
    { id: 'tests', name: 'Baseline tests', metric: 'tests', unit: '', tiers: [3, 9, 15] },
    { id: 'good-nights', name: 'Good nights', metric: 'goodNights', unit: '', tiers: [10, 50, 200] },
    { id: 'sleep-streak', name: 'Sleep streak', metric: 'sleepStreak', unit: 'days', tiers: [7, 30, 100] },
    { id: 'supps-streak', name: 'Supplement streak', metric: 'suppsStreak', unit: 'days', tiers: [7, 30, 100] },
    { id: 'water-streak', name: 'Water streak', metric: 'waterStreak', unit: 'days', tiers: [7, 30, 100] },
  ],

  // ---------- cloud (Cloudflare Worker): photo estimates and backup ----------
  cloud: {
    url: 'https://fittrack.iainhbrown.workers.dev', // the Worker's address
    autoBackup: true,
    backupEveryHours: 6,  // at most one automatic backup per this many hours
  },

  // ---------- stretching ----------
  stretchCategories: ['Warm-up', 'Activation', 'Mobility', 'Recovery', 'Roller', 'Cool-down'],

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
