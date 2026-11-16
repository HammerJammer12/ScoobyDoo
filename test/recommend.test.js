const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePreferences, buildPlan, SPLITS } = require('../lib/recommend');

// Small fixture library: several options for every muscle the day slots use
const MUSCLES = ['quadriceps', 'hamstrings', 'glutes', 'chest', 'lats', 'middle back', 'shoulders',
  'biceps', 'triceps', 'traps', 'forearms', 'calves', 'abdominals'];
const library = [];
for (const muscle of MUSCLES) {
  for (const mechanic of ['compound', 'isolation']) {
    for (const equipment of ['barbell', 'dumbbell', 'body only']) {
      for (const level of ['beginner', 'expert']) {
        library.push({
          id: library.length + 1,
          name: `${level} ${equipment} ${muscle} ${mechanic}`,
          primary_muscle: muscle,
          mechanic,
          equipment,
          level,
          category: 'strength',
          tracking_type: equipment === 'body only' ? 'reps_only' : 'weight_and_reps',
        });
      }
    }
  }
}
const byId = new Map(library.map((e) => [e.id, e]));

// Deterministic random numbers so plans are reproducible
function seededRng(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const prefsFor = (body) => {
  const { prefs, error } = parsePreferences(body);
  assert.equal(error, undefined);
  return prefs;
};
const allPicks = (plan) => plan.days.flatMap((d) => d.exercises);

test('parsePreferences fills in defaults', () => {
  assert.deepEqual(parsePreferences(undefined).prefs, {
    goal: 'hypertrophy', daysPerWeek: 3, minutesPerSession: 60, level: 'beginner', equipment: null,
  });
});

test('parsePreferences always allows bodyweight when equipment is given', () => {
  assert.deepEqual(prefsFor({ equipment: ['dumbbell'] }).equipment, ['dumbbell', 'body only']);
  assert.deepEqual(prefsFor({ equipment: [] }).equipment, ['body only']);
});

test('parsePreferences rejects bad input', () => {
  for (const body of [
    { goal: 'bulk' }, { goal: 'toString' }, { daysPerWeek: 0 }, { daysPerWeek: 7 }, { daysPerWeek: '3' },
    { minutesPerSession: 5 }, { minutesPerSession: 45.5 }, { level: 'pro' },
    { equipment: 'dumbbell' }, { equipment: ['rocks'] },
  ]) {
    assert.ok(parsePreferences(body).error, `expected an error for ${JSON.stringify(body)}`);
  }
});

test('buildPlan uses the split for each days-per-week value', () => {
  for (let days = 1; days <= 6; days++) {
    const plan = buildPlan(prefsFor({ daysPerWeek: days }), library, { rng: seededRng() });
    assert.equal(plan.split, SPLITS[days].name);
    assert.deepEqual(plan.days.map((d) => d.focus), SPLITS[days].days);
  }
});

test('buildPlan names repeated day types A, B, C', () => {
  const plan = buildPlan(prefsFor({ daysPerWeek: 6 }), library, { rng: seededRng() });
  assert.deepEqual(plan.days.map((d) => d.name), ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']);
});

test('buildPlan fits the number of exercises to the session length', () => {
  const short = buildPlan(prefsFor({ minutesPerSession: 30 }), library, { rng: seededRng() });
  const long = buildPlan(prefsFor({ minutesPerSession: 60 }), library, { rng: seededRng() });
  assert.ok(short.days.every((d) => d.exercises.length === 3));
  assert.ok(long.days.every((d) => d.exercises.length === 6));
});

test('buildPlan only uses equipment the user has', () => {
  const plan = buildPlan(prefsFor({ daysPerWeek: 4, equipment: ['dumbbell'] }), library, { rng: seededRng() });
  for (const e of allPicks(plan)) assert.ok(['dumbbell', 'body only'].includes(e.equipment), e.name);
});

test('buildPlan respects the user level', () => {
  const beginner = buildPlan(prefsFor({ daysPerWeek: 5, level: 'beginner' }), library, { rng: seededRng() });
  for (const e of allPicks(beginner)) assert.equal(byId.get(e.exercise_id).level, 'beginner', e.name);
});

test('buildPlan never repeats an exercise within a day and avoids repeats across the week', () => {
  const plan = buildPlan(prefsFor({ daysPerWeek: 3 }), library, { rng: seededRng() });
  for (const d of plan.days) {
    const ids = d.exercises.map((e) => e.exercise_id);
    assert.equal(new Set(ids).size, ids.length);
  }
  const ids = allPicks(plan).map((e) => e.exercise_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('buildPlan matches each slot to the right muscle and mechanic', () => {
  const plan = buildPlan(prefsFor({ daysPerWeek: 4 }), library, { rng: seededRng() });
  const [first, second] = plan.days[0].exercises; // Upper: chest compound, then back compound
  assert.equal(first.primary_muscle, 'chest');
  assert.equal(first.mechanic, 'compound');
  assert.ok(['lats', 'middle back'].includes(second.primary_muscle));
  assert.equal(second.mechanic, 'compound');
});

test('buildPlan falls back to any mechanic when none match exactly', () => {
  const onlyIsolation = library.filter((e) => e.mechanic === 'isolation');
  const plan = buildPlan(prefsFor({ daysPerWeek: 1 }), onlyIsolation, { rng: seededRng() });
  assert.equal(plan.days[0].exercises[0].primary_muscle, 'quadriceps');
});

test('buildPlan skips slots with no exercises and fills from later slots', () => {
  const noQuads = library.filter((e) => e.primary_muscle !== 'quadriceps');
  const plan = buildPlan(prefsFor({ daysPerWeek: 1 }), noQuads, { rng: seededRng() });
  const muscles = plan.days[0].exercises.map((e) => e.primary_muscle);
  assert.ok(!muscles.includes('quadriceps'));
  assert.equal(muscles.length, 6);
});

test('buildPlan avoids recently done exercises when there are alternatives', () => {
  const recentExerciseIds = library.filter((e) => e.primary_muscle === 'chest').slice(0, 4).map((e) => e.id);
  const plan = buildPlan(prefsFor({ daysPerWeek: 1 }), library, { rng: seededRng(), recentExerciseIds });
  for (const e of allPicks(plan)) assert.ok(!recentExerciseIds.includes(e.exercise_id), e.name);
});

test('buildPlan prefers loaded lifts over bodyweight when both are available', () => {
  const plan = buildPlan(prefsFor({ daysPerWeek: 1 }), library, { rng: seededRng() });
  for (const e of allPicks(plan)) assert.notEqual(e.equipment, 'body only', e.name);
});

test('buildPlan prescribes sets and reps by goal and tracking type', () => {
  const plank = {
    id: 999, name: 'Plank', primary_muscle: 'chest', mechanic: 'compound', equipment: 'body only',
    level: 'beginner', category: 'strength', tracking_type: 'duration',
  };
  const barbell = library.find((e) => e.primary_muscle === 'chest' && e.mechanic === 'compound'
    && e.equipment === 'barbell' && e.level === 'beginner');
  const pushup = library.find((e) => e.primary_muscle === 'chest' && e.mechanic === 'compound'
    && e.equipment === 'body only' && e.level === 'beginner');
  const firstPick = (ex) => buildPlan(prefsFor({ daysPerWeek: 4, goal: 'strength' }), [ex], { rng: seededRng() })
    .days[0].exercises[0];

  assert.deepEqual(
    { sets: 5, rep_min: 3, rep_max: 6, duration_secs: null },
    (({ sets, rep_min, rep_max, duration_secs }) => ({ sets, rep_min, rep_max, duration_secs }))(firstPick(barbell))
  );
  assert.equal(firstPick(pushup).rep_min, 6); // bodyweight gets the isolation range
  assert.equal(firstPick(plank).duration_secs, 30);
  assert.equal(firstPick(plank).rep_min, null);
});

test('buildPlan is reproducible with the same random seed', () => {
  const prefs = prefsFor({ daysPerWeek: 5 });
  assert.deepEqual(buildPlan(prefs, library, { rng: seededRng(7) }), buildPlan(prefs, library, { rng: seededRng(7) }));
});
