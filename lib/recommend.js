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

// Categories that make sense in a lifting plan (skips stretching, cardio, strongman, olympic lifts)
const PLAN_CATEGORIES = new Set(['strength', 'powerlifting']);
// Preferred when breaking ties, so loaded gym lifts win over bodyweight when both are available
const COMMON_EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine']);
// Well-known lifts (names as they appear in free-exercise-db), preferred over obscure variations
const STAPLES = new Set([
  // quadriceps
  'Barbell Squat', 'Barbell Full Squat', 'Leg Press', 'Goblet Squat', 'Dumbbell Squat', 'Dumbbell Lunges',
  'Split Squat with Dumbbells', 'Barbell Lunge', 'Dumbbell Step Ups', 'Bodyweight Squat', 'Leg Extensions',
  // hamstrings and glutes
  'Romanian Deadlift', 'Stiff-Legged Barbell Deadlift', 'Stiff-Legged Dumbbell Deadlift', 'Sumo Deadlift',
  'Glute Ham Raise', 'Lying Leg Curls', 'Seated Leg Curl', 'Barbell Hip Thrust', 'Barbell Glute Bridge',
  'Butt Lift (Bridge)',
  // chest
  'Barbell Bench Press - Medium Grip', 'Barbell Incline Bench Press - Medium Grip', 'Dumbbell Bench Press',
  'Incline Dumbbell Press', 'Pushups', 'Dips - Chest Version', 'Cable Crossover', 'Dumbbell Flyes',
  // back
  'Pullups', 'Chin-Up', 'Wide-Grip Lat Pulldown', 'Close-Grip Front Lat Pulldown', 'Weighted Pull Ups',
  'Bent Over Barbell Row', 'One-Arm Dumbbell Row', 'Seated Cable Rows', 'T-Bar Row with Handle',
  'Bent Over Two-Dumbbell Row', 'Dumbbell Incline Row',
  // shoulders and traps
  'Standing Military Press', 'Seated Barbell Military Press', 'Seated Dumbbell Press', 'Dumbbell Shoulder Press',
  'Arnold Dumbbell Press', 'Side Lateral Raise', 'Cable Seated Lateral Raise', 'Front Dumbbell Raise',
  'Reverse Flyes', 'Barbell Shrug', 'Dumbbell Shrug',
  // arms
  'Barbell Curl', 'Dumbbell Bicep Curl', 'Hammer Curls', 'EZ-Bar Curl', 'Preacher Curl', 'Incline Hammer Curls',
  'Triceps Pushdown', 'Cable Rope Overhead Triceps Extension', 'Lying Triceps Press', 'Tricep Dumbbell Kickback',
  'Dips - Triceps Version', 'Close-Grip Barbell Bench Press', 'Palms-Up Barbell Wrist Curl Over A Bench',
  // calves and core
  'Standing Calf Raises', 'Seated Calf Raise', 'Standing Dumbbell Calf Raise', 'Smith Machine Calf Raise',
  'Plank', 'Crunches', 'Cable Crunch', 'Hanging Leg Raise', 'Ab Roller',
]);

// Rough budget of 10 minutes per exercise, at least 3
const exercisesPerDay = (minutes) => Math.max(3, Math.floor(minutes / 10));

function isEligible(e, prefs) {
  return PLAN_CATEGORIES.has(e.category)
    && LEVELS.indexOf(e.level) <= LEVELS.indexOf(prefs.level)
    && (!prefs.equipment || prefs.equipment.includes(e.equipment));
}

// Picks one exercise for a slot. Falls back to any mechanic if none match exactly.
function pickExercise(s, pool, { dayUsed, planUsed, recent, rng }) {
  const forMuscle = pool.filter((e) => s.muscles.includes(e.primary_muscle) && !dayUsed.has(e.id));
  let candidates = s.mechanic ? forMuscle.filter((e) => e.mechanic === s.mechanic) : forMuscle;
  if (!candidates.length) candidates = forMuscle;
  if (!candidates.length) return null;

  const score = (e) => (planUsed.has(e.id) ? -10 : 0)
    + (recent.has(e.id) ? -3 : 0)
    + (STAPLES.has(e.name) ? 2 : 0)
    + (COMMON_EQUIPMENT.has(e.equipment) ? 1 : 0);
  const best = Math.max(...candidates.map(score));
  const top = candidates.filter((e) => score(e) === best);
  return top[Math.floor(rng() * top.length)];
}

function prescribe(e, s, goal) {
  const g = GOALS[goal];
  // Bodyweight moves can't be loaded heavier, so they get the higher isolation rep range
  const heavy = (e.mechanic ?? s.mechanic) === C && e.tracking_type !== 'reps_only';
  const rx = heavy ? g.compound : g.isolation;
  const timed = e.tracking_type === 'duration';
  return {
    sets: rx.sets,
    rep_min: timed ? null : rx.reps[0],
    rep_max: timed ? null : rx.reps[1],
    duration_secs: timed ? g.holdSecs : null,
  };
}

// Builds a weekly plan from validated prefs and exercise rows.
// options.recentExerciseIds: exercises to avoid when alternatives exist
// options.rng: random function, injectable for tests
function buildPlan(prefs, exercises, { recentExerciseIds = [], rng = Math.random } = {}) {
  const pool = exercises.filter((e) => isEligible(e, prefs));
  const split = SPLITS[prefs.daysPerWeek];
  const perDay = exercisesPerDay(prefs.minutesPerSession);
  const planUsed = new Set();
  const recent = new Set(recentExerciseIds);
  const seen = {};

  const days = split.days.map((type, i) => {
    const { label, slots } = DAY_TYPES[type];
    seen[type] = (seen[type] || 0) + 1;
    const repeats = split.days.filter((d) => d === type).length > 1;
    const dayUsed = new Set();
    const picked = [];

    for (const s of slots) {
      if (picked.length === perDay) break;
      const e = pickExercise(s, pool, { dayUsed, planUsed, recent, rng });
      if (!e) continue;
      dayUsed.add(e.id);
      planUsed.add(e.id);
      picked.push({
        exercise_id: e.id,
        name: e.name,
        primary_muscle: e.primary_muscle,
        equipment: e.equipment,
        mechanic: e.mechanic,
        tracking_type: e.tracking_type,
        ...prescribe(e, s, prefs.goal),
      });
    }

    return {
      day: i + 1,
      name: repeats ? `${label} ${String.fromCharCode(64 + seen[type])}` : label,
      focus: type,
      exercises: picked,
    };
  });

  return { ...prefs, split: split.name, days };
}

module.exports = { DAY_TYPES, SPLITS, GOALS, LEVELS, EQUIPMENT, parsePreferences, buildPlan };
