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
  plan: {
    startDate: '2026-11-16',
  },
  goals: [
    { id: 'g2027', type: 'half-ironman', name: 'Half Ironman 70.3', date: '2027-07-11' },
    { id: 'g2028', type: 'full-ironman', name: 'Full Ironman', date: '2028-07-09' },
  ],
};
