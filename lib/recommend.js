// Rule-based workout plan recommendations.
// Everything here is a pure function: callers pass in exercise rows from the database.

const C = 'compound';
const I = 'isolation';
const BACK = ['lats', 'middle back'];
const slot = (muscles, mechanic = null) => ({ muscles: [].concat(muscles), mechanic });

// Slots are in priority order; shorter sessions keep the first ones.
// mechanic null means either compound or isolation is fine.
const DAY_TYPES = {
  full: {
    label: 'Full Body',
    slots: [slot('quadriceps', C), slot('chest', C), slot(BACK, C), slot('hamstrings', C),
      slot('shoulders', C), slot('biceps', I), slot('triceps', I), slot('abdominals')],
  },
  upper: {
    label: 'Upper',
    slots: [slot('chest', C), slot(BACK, C), slot('shoulders', C), slot(BACK, C),
      slot('chest', I), slot('biceps', I), slot('triceps', I)],
  },
  lower: {
    label: 'Lower',
    slots: [slot('quadriceps', C), slot('hamstrings', C), slot('glutes'), slot('quadriceps', I),
      slot('hamstrings', I), slot('calves'), slot('abdominals')],
  },
  push: {
    label: 'Push',
    slots: [slot('chest', C), slot('shoulders', C), slot('chest', C), slot('shoulders', I),
      slot('triceps', I), slot('chest', I), slot('triceps', I)],
  },
  pull: {
    label: 'Pull',
    slots: [slot('lats', C), slot('middle back', C), slot(BACK, C), slot('biceps', I),
      slot('traps'), slot('biceps', I), slot('forearms')],
  },
  legs: {
    label: 'Legs',
    slots: [slot('quadriceps', C), slot('hamstrings', C), slot('quadriceps', I), slot('glutes'),
      slot('hamstrings', I), slot('calves'), slot('abdominals')],
  },
};

// Days per week -> weekly split
const SPLITS = {
  1: { name: 'full_body', days: ['full'] },
  2: { name: 'full_body', days: ['full', 'full'] },
  3: { name: 'full_body', days: ['full', 'full', 'full'] },
  4: { name: 'upper_lower', days: ['upper', 'lower', 'upper', 'lower'] },
  5: { name: 'ppl_upper_lower', days: ['push', 'pull', 'legs', 'upper', 'lower'] },
  6: { name: 'push_pull_legs', days: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] },
};

// Sets and rep ranges per goal; holdSecs is used for timed exercises like planks
const GOALS = {
  strength: { compound: { sets: 5, reps: [3, 6] }, isolation: { sets: 3, reps: [6, 10] }, holdSecs: 30 },
  hypertrophy: { compound: { sets: 4, reps: [6, 10] }, isolation: { sets: 3, reps: [10, 15] }, holdSecs: 45 },
  endurance: { compound: { sets: 3, reps: [12, 15] }, isolation: { sets: 2, reps: [15, 20] }, holdSecs: 60 },
};

const LEVELS = ['beginner', 'intermediate', 'expert'];

// Equipment values used by the exercise dataset
const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebells', 'bands', 'medicine ball',
  'exercise ball', 'e-z curl bar', 'foam roll', 'body only', 'other'];

const DEFAULTS = { goal: 'hypertrophy', daysPerWeek: 3, minutesPerSession: 60, level: 'beginner' };

// Validates a request body. Returns { prefs } or { error }.
// equipment omitted or null means a full gym; otherwise bodyweight is always allowed.
function parsePreferences(body) {
  const b = { ...DEFAULTS, ...(body && typeof body === 'object' ? body : {}) };

  if (!Object.hasOwn(GOALS, b.goal)) {
    return { error: `goal must be one of: ${Object.keys(GOALS).join(', ')}` };
  }
  if (!Number.isInteger(b.daysPerWeek) || !SPLITS[b.daysPerWeek]) {
    return { error: 'daysPerWeek must be a whole number from 1 to 6' };
  }
  if (!Number.isInteger(b.minutesPerSession) || b.minutesPerSession < 20 || b.minutesPerSession > 180) {
    return { error: 'minutesPerSession must be a whole number from 20 to 180' };
  }
  if (!LEVELS.includes(b.level)) {
    return { error: `level must be one of: ${LEVELS.join(', ')}` };
  }

  let equipment = null;
  if (b.equipment != null) {
    if (!Array.isArray(b.equipment) || !b.equipment.every((e) => EQUIPMENT.includes(e))) {
      return { error: `equipment must be an array of: ${EQUIPMENT.join(', ')}` };
    }
    equipment = [...new Set([...b.equipment, 'body only'])];
  }

  return {
    prefs: {
      goal: b.goal,
      daysPerWeek: b.daysPerWeek,
      minutesPerSession: b.minutesPerSession,
      level: b.level,
      equipment,
    },
  };
}

module.exports = { DAY_TYPES, SPLITS, GOALS, LEVELS, EQUIPMENT, parsePreferences };
